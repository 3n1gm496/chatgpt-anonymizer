from __future__ import annotations

import argparse
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from local_engine import __version__
from local_engine.api.health import router as health_router
from local_engine.api.revert import router as revert_router
from local_engine.api.sanitize import router as sanitize_router
from local_engine.api.sessions import router as sessions_router
from local_engine.core.policies import EngineSettings
from local_engine.core.service import LocalAnonymizationService
from local_engine.utils.logging import configure_logging, get_logger, log_event

logger = get_logger(__name__)

TRUSTED_WEB_ORIGINS = (
    "https://chatgpt.com",
    "https://chat.openai.com",
)

# Extension pages and service-worker contexts fetch from the local engine too.
TRUSTED_EXTENSION_ORIGIN_REGEX = (
    r"^(chrome-extension://[a-p]{32}|edge-extension://[a-p]{32}|moz-extension://[0-9a-f-]+)$"
)


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
) -> FastAPI:
    resolved_settings = settings or EngineSettings.from_env()
    configure_logging(
        level_name=resolved_settings.log_level,
        log_format=resolved_settings.log_format,
    )

    app = FastAPI(
        title="ChatGPT Anonymizer Local Engine",
        version=__version__,
        lifespan=_engine_lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=TRUSTED_WEB_ORIGINS,
        allow_origin_regex=TRUSTED_EXTENSION_ORIGIN_REGEX,
        allow_methods=("GET", "POST"),
        allow_headers=("Content-Type",),
        allow_private_network=True,
        max_age=600,
    )
    app.state.settings = resolved_settings
    app.state.service = LocalAnonymizationService(
        resolved_settings,
        acquire_process_lock=acquire_process_lock,
    )
    app.include_router(health_router)
    app.include_router(sanitize_router)
    app.include_router(revert_router)
    app.include_router(sessions_router)

    log_event(
        logger,
        logging.INFO,
        "engine_app_ready",
        bind=resolved_settings.host,
        port=resolved_settings.port,
        data_dir=str(resolved_settings.data_dir.resolve()),
        ml_enabled=resolved_settings.ml_enabled,
        log_format=resolved_settings.log_format,
        version=__version__,
    )
    return app


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="chatgpt-anonymizer-engine",
        description="Run the localhost-only engine for ChatGPT Anonymizer.",
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
        help="Default mapping session TTL in minutes.",
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
        "--enable-ml",
        action="store_true",
        help="Enable the optional local ML detector if implemented.",
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
        ml_enabled=args.enable_ml or settings.ml_enabled,
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
