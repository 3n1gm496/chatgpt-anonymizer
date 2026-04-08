from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from local_engine.core.policies import EngineSettings
from local_engine.main import create_app


@pytest.mark.anyio
async def test_health_sanitize_revert_and_reset_roundtrip(tmp_path):
    settings = EngineSettings(data_dir=Path(tmp_path), session_ttl_minutes=30)
    app = create_app(settings)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://127.0.0.1:8765",
    ) as client:
        health = await client.get("/health")
        assert health.status_code == 200
        assert health.json()["bind"] == "127.0.0.1"

        sanitize = await client.post(
            "/sanitize",
            json={
                "protocolVersion": "v1",
                "conversationId": "tab:3:chat:new",
                "text": "Email user@example.com on api.internal.example.com",
                "detectedContentType": "paste",
                "exclusions": [],
                "options": {"enableHeuristics": False},
            },
        )
        assert sanitize.status_code == 200
        sanitize_payload = sanitize.json()
        assert "[EMAIL_001]" in sanitize_payload["sanitizedText"]
        assert all(
            "rationale" not in finding or isinstance(finding["rationale"], str)
            for finding in sanitize_payload["findings"]
        )
        session_id = sanitize_payload["sessionId"]

        revert = await client.post(
            "/revert",
            json={
                "protocolVersion": "v1",
                "sessionId": session_id,
                "text": sanitize_payload["sanitizedText"],
            },
        )
        assert revert.status_code == 200
        assert "user@example.com" in revert.json()["revertedText"]

        session = await client.get(f"/sessions/{session_id}")
        assert session.status_code == 200
        assert session.json()["mappingCount"] >= 1

        reset = await client.post(
            "/sessions/reset",
            json={
                "protocolVersion": "v1",
                "sessionId": session_id,
            },
        )
        assert reset.status_code == 200
        assert reset.json()["reset"] is True


@pytest.mark.anyio
async def test_sanitize_preflight_allows_chatgpt_origin_and_private_network(tmp_path):
    settings = EngineSettings(data_dir=Path(tmp_path), session_ttl_minutes=30)
    app = create_app(settings)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://127.0.0.1:8765",
    ) as client:
        response = await client.options(
            "/sanitize",
            headers={
                "Origin": "https://chatgpt.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
                "Access-Control-Request-Private-Network": "true",
            },
        )

        assert response.status_code == 200
        assert response.headers["Access-Control-Allow-Origin"] == "https://chatgpt.com"
        assert "POST" in response.headers["Access-Control-Allow-Methods"]
        assert response.headers["Access-Control-Allow-Private-Network"] == "true"


@pytest.mark.anyio
async def test_sanitize_preflight_rejects_untrusted_origin(tmp_path):
    settings = EngineSettings(data_dir=Path(tmp_path), session_ttl_minutes=30)
    app = create_app(settings)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://127.0.0.1:8765",
    ) as client:
        response = await client.options(
            "/sanitize",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

        assert response.status_code == 400
