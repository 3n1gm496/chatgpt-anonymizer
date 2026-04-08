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


def test_engine_settings_heuristics_disabled_by_default(monkeypatch):
    monkeypatch.setenv("LOCAL_ENGINE_HOST", "127.0.0.1")
    monkeypatch.delenv("LOCAL_ENGINE_ENABLE_HEURISTICS", raising=False)
    monkeypatch.delenv("LOCAL_ENGINE_ENABLE_ML", raising=False)

    settings = EngineSettings.from_env()

    assert settings.heuristics_enabled is False


def test_engine_settings_heuristics_enabled_via_new_env_var(monkeypatch):
    monkeypatch.setenv("LOCAL_ENGINE_HOST", "127.0.0.1")
    monkeypatch.setenv("LOCAL_ENGINE_ENABLE_HEURISTICS", "true")
    monkeypatch.delenv("LOCAL_ENGINE_ENABLE_ML", raising=False)

    settings = EngineSettings.from_env()

    assert settings.heuristics_enabled is True


def test_engine_settings_heuristics_enabled_via_legacy_ml_env_var(monkeypatch):
    """LOCAL_ENGINE_ENABLE_ML is the legacy name; it must still work."""
    monkeypatch.setenv("LOCAL_ENGINE_HOST", "127.0.0.1")
    monkeypatch.delenv("LOCAL_ENGINE_ENABLE_HEURISTICS", raising=False)
    monkeypatch.setenv("LOCAL_ENGINE_ENABLE_ML", "true")

    settings = EngineSettings.from_env()

    assert settings.heuristics_enabled is True
