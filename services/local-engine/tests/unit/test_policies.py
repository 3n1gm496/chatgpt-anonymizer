import pytest

from local_engine.core.policies import EngineSettings


def test_engine_settings_reject_non_local_host(monkeypatch):
    monkeypatch.setenv("LOCAL_ENGINE_HOST", "0.0.0.0")

    with pytest.raises(ValueError):
        EngineSettings.from_env()


def test_engine_settings_reads_logging_configuration(monkeypatch):
    monkeypatch.setenv("LOCAL_ENGINE_HOST", "127.0.0.1")
    monkeypatch.setenv("LOCAL_ENGINE_LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("LOCAL_ENGINE_LOG_FORMAT", "text")

    settings = EngineSettings.from_env()

    assert settings.log_level == "DEBUG"
    assert settings.log_format == "text"
