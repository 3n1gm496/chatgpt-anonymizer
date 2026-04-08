"""
Tests for SecretsDetector.

Covers: AWS keys, GitHub PATs, GitLab PATs, Stripe keys, npm tokens,
Google API keys, JWTs, PEM keys, bearer tokens, connection strings,
.env secrets, and false-positive rejection.
"""
from local_engine.detectors.secrets_detector import SecretsDetector
from local_engine.models.enums import EntityType


def _hits_for(text: str, detector_name: str | None = None):
    hits = SecretsDetector().detect(text)
    if detector_name:
        hits = [h for h in hits if h.detector == detector_name]
    return hits


def test_aws_access_key_id_detected():
    hits = _hits_for("Key: AKIAIOSFODNN7EXAMPLE rest of config", "secrets:aws-access-key-id")
    assert len(hits) == 1
    assert hits[0].entity_type is EntityType.SECRET
    assert hits[0].confidence >= 0.98


def test_github_pat_fine_grained_detected():
    pat = "github_pat_" + "A" * 82
    hits = _hits_for(f"token={pat}", "secrets:github-pat-fine-grained")
    assert len(hits) == 1


def test_github_classic_ghp_detected():
    hits = _hits_for("export GH_TOKEN=ghp_" + "a" * 36, "secrets:github-pat-classic")
    assert len(hits) == 1


def test_gitlab_pat_detected():
    hits = _hits_for("CI_JOB_TOKEN=glpat-abcdefghij1234567890", "secrets:gitlab-pat")
    assert len(hits) == 1


def test_stripe_live_key_detected():
    hits = _hits_for("STRIPE_SECRET=sk_live_" + "x" * 24, "secrets:stripe-secret-live")
    assert len(hits) == 1
    assert hits[0].confidence >= 0.99


def test_npm_token_detected():
    hits = _hits_for("NPM_TOKEN=npm_" + "A" * 36, "secrets:npm-auth-token")
    assert len(hits) == 1


def test_google_api_key_detected():
    # Google API keys are 39 chars: "AIza" prefix (4) + 35 alphanumeric chars.
    # Pattern: AIza[0-9A-Za-z_\-]{35} — total 39.
    key = "AIza" + "a" * 35  # 39 chars: AIza prefix + 35 alphanumeric
    assert len(key) == 39
    hits = _hits_for(f"key={key}", "secrets:google-api-key")
    assert len(hits) == 1


def test_jwt_detected():
    # A real-looking (but fake) JWT
    header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    payload = "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ"
    sig = "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    jwt = f"{header}.{payload}.{sig}"
    hits = _hits_for(f"Authorization: Bearer {jwt}", "secrets:jwt")
    assert len(hits) == 1
    assert hits[0].confidence >= 0.9


def test_pem_private_key_detected():
    pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
    hits = _hits_for(pem, "secrets:pem-private-key")
    assert len(hits) == 1
    assert hits[0].confidence == 0.99


def test_bearer_token_detected():
    token = "abcdefghijklmnopqrstuvwxyz0123456789"
    hits = _hits_for(f"Authorization: Bearer {token}", "secrets:bearer-token")
    assert len(hits) == 1


def test_connection_string_postgres_detected():
    hits = _hits_for(
        "DATABASE_URL=postgresql://user:password@localhost:5432/mydb",
        "secrets:connection-string",
    )
    assert len(hits) == 1
    assert "postgresql://" in hits[0].original_text


def test_env_secret_detected():
    hits = _hits_for("SECRET_KEY=supersecretvalue123\nOTHER=foo", "secrets:env-secret")
    assert len(hits) == 1
    assert hits[0].original_text == "supersecretvalue123"


def test_env_secret_rejects_boolean_values():
    hits = _hits_for("DEBUG=true\nENABLE_LOGGING=false", "secrets:env-secret")
    assert hits == []


def test_labeled_hex_secret_detected():
    hits = _hits_for("token=deadbeefcafebabedeadbeefcafebabe01234567", "secrets:labeled-hex")
    assert len(hits) == 1


def test_no_false_positive_on_normal_text():
    hits = SecretsDetector().detect("Il documento è stato inviato a Mario Rossi ieri mattina.")
    assert hits == []


def test_no_false_positive_on_email():
    """An email address must not be matched by the secrets detector."""
    hits = SecretsDetector().detect("user@example.com")
    assert hits == []
