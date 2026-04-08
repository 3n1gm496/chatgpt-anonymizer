"""
Local pseudonymisation engine — FastAPI application entry point.

This module creates the ASGI application, configures CORS, manages the engine
lifetime, wires up the request-authentication token, and provides the CLI
entry point.

The engine binds exclusively to 127.0.0.1.  No remote service receives any
user data.  All pseudonymisation is performed locally.
"""
from __future__ import annotations

import argparse
import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from local_engine import __version__
from local_engine.api.health import router as health_router
from local_engine.api.revert import router as revert_router
from local_engine.api.sanitize import router as sanitize_router
from local_engine.api.sessions import router as sessions_router
from local_engine.core.policies import EngineSettings
from local_engine.core.service import LocalPseudonymisationService
from local_engine.models.api_models import EngineTokenResponseModel, RotateKeyResponseModel
from local_engine.utils.logging import configure_logging, get_logger, log_event

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# CORS — trusted origins only
# ---------------------------------------------------------------------------
TRUSTED_WEB_ORIGINS = (
    "https://chatgpt.com",
    "https://chat.openai.com",
)

# Browser extension service-worker and page contexts
TRUSTED_EXTENSION_ORIGIN_REGEX = (
    r"^(chrome-extension://[a-p]{32}|edge-extension://[a-p]{32}|moz-extension://[0-9a-f-]+)$"
)

# ---------------------------------------------------------------------------
# Per-startup engine auth token
#
# The token is generated fresh on each engine startup (it is not persisted to
# disk).  The extension retrieves it once via GET /engine-token, which is
# accessible only to trusted extension origins via CORS.  All subsequent
# mutation requests must include it as the X-Cga-Token header.
#
# This provides anti-confused-deputy protection: any local process can connect
# to 127.0.0.1, but without the token its mutating requests are rejected.
# ---------------------------------------------------------------------------
_ENGINE_AUTH_TOKEN: str = secrets.token_urlsafe(32)


def _require_auth_token(request: Request) -> None:
    """FastAPI dependency: reject requests that lack the correct engine token."""
    provided = request.headers.get("X-Cga-Token", "")
    if not secrets.compare_digest(provided, _ENGINE_AUTH_TOKEN):
        raise HTTPException(status_code=401, detail="Missing or invalid engine token.")


@asynccontextmanager
async def _engine_lifespan(app: FastAPI):
    try:
        yield
    finally:
        app.state.service.close()


def create_app(
    settings: EngineSettings | None = None,
    *,
    acquire_process_lock: bool = False,
    auth_token: str | None = None,
) -> FastAPI:
    """
    Create the FastAPI application.

    Parameters
    ----------
    settings:
        Engine settings.  Defaults to ``EngineSettings.from_env()``.
    acquire_process_lock:
        Whether to acquire the single-instance process lock.  Set to True
        when running via the CLI; False for tests.
    auth_token:
        Override the engine auth token (used in tests).  Production code
        should leave this as None so the random per-startup token is used.
    """
    resolved_settings = settings or EngineSettings.from_env()
    configure_logging(
        level_name=resolved_settings.log_level,
        log_format=resolved_settings.log_format,
    )

    global _ENGINE_AUTH_TOKEN
    if auth_token is not None:
        _ENGINE_AUTH_TOKEN = auth_token

    app = FastAPI(
        title="ChatGPT Pseudonymiser Local Engine",
        description=(
            "Local-only pseudonymisation engine for ChatGPT and similar LLM frontends. "
            "All processing occurs on the user's machine; no data leaves the local boundary."
        ),
        version=__version__,
        lifespan=_engine_lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=TRUSTED_WEB_ORIGINS,
        allow_origin_regex=TRUSTED_EXTENSION_ORIGIN_REGEX,
        allow_methods=("GET", "POST"),
        allow_headers=("Content-Type", "X-Cga-Token"),
        allow_private_network=True,
        max_age=600,
    )
    app.state.settings = resolved_settings
    app.state.service = LocalPseudonymisationService(
        resolved_settings,
        acquire_process_lock=acquire_process_lock,
    )
    app.include_router(health_router)
    app.include_router(sanitize_router)
    app.include_router(revert_router)
    app.include_router(sessions_router)

    # -----------------------------------------------------------------
    # Engine token endpoint — used by the extension to bootstrap auth
    # -----------------------------------------------------------------
    @app.get(
        "/engine-token",
        response_model=EngineTokenResponseModel,
        summary="Bootstrap extension authentication token",
        description=(
            "Returns the per-startup engine authentication token. "
            "Only accessible from trusted extension or web origins via CORS. "
            "The extension must send this token as X-Cga-Token on all subsequent "
            "mutation requests."
        ),
    )
    async def get_engine_token() -> EngineTokenResponseModel:
        return EngineTokenResponseModel(token=_ENGINE_AUTH_TOKEN)

    # -----------------------------------------------------------------
    # Key rotation endpoint — administrative, requires auth token
    # -----------------------------------------------------------------
    @app.post(
        "/admin/rotate-key",
        response_model=RotateKeyResponseModel,
        summary="Rotate the installation encryption key",
        description=(
            "Generates a new installation secret, re-encrypts all live sessions, "
            "and overwrites the old secret.  After rotation, any backup containing "
            "the old secret cannot decrypt the new session blobs."
        ),
        dependencies=[Depends(_require_auth_token)],
    )
    async def rotate_key() -> RotateKeyResponseModel:
        return app.state.service.rotate_installation_key()

    log_event(
        logger,
        logging.INFO,
        "engine_app_ready",
        bind=resolved_settings.host,
        port=resolved_settings.port,
        data_dir=str(resolved_settings.data_dir.resolve()),
        heuristics_enabled=resolved_settings.heuristics_enabled,
        log_format=resolved_settings.log_format,
        version=__version__,
    )
    return app


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="chatgpt-anonymizer-engine",
        description="Run the local pseudonymisation engine for ChatGPT Pseudonymiser.",
    )
    parser.add_argument("--port", type=int, help="TCP port for the local engine.")
    parser.add_argument(
        "--data-dir",
        type=Path,
        help="Directory for encrypted session state and installation secret.",
    )
    parser.add_argument(
        "--session-ttl-minutes",
        type=int,
        help="Default pseudonymisation session TTL in minutes.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable DEBUG log level for local diagnostics.",
    )
    parser.add_argument(
        "--log-format",
        choices=("json", "text"),
        help="Local log output format.",
    )
    parser.add_argument(
        "--enable-heuristics",
        action="store_true",
        help="Enable contextual heuristic detectors (regex-based, not ML).",
    )
    return parser.parse_args(argv)


def build_cli_settings(args: argparse.Namespace) -> EngineSettings:
    settings = EngineSettings.from_env()
    return EngineSettings(
        host="127.0.0.1",
        port=args.port or settings.port,
        data_dir=args.data_dir or settings.data_dir,
        session_ttl_minutes=args.session_ttl_minutes or settings.session_ttl_minutes,
        review_threshold=settings.review_threshold,
        heuristics_enabled=args.enable_heuristics or settings.heuristics_enabled,
        max_text_chars=settings.max_text_chars,
        log_level="DEBUG" if args.debug else settings.log_level,
        log_format=args.log_format or settings.log_format,
        dictionary_terms=settings.dictionary_terms,
    )


def main(argv: list[str] | None = None) -> int:
    settings = build_cli_settings(parse_args(argv))
    uvicorn.run(
        create_app(settings, acquire_process_lock=True),
        host=settings.host,
        port=settings.port,
    )
    return 0


app = create_app() if __name__ != "__main__" else None


if __name__ == "__main__":
    raise SystemExit(main())
