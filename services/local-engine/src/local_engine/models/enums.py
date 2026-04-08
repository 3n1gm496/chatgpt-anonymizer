from enum import Enum


class EntityType(str, Enum):
    # Network identifiers
    EMAIL = "EMAIL"
    IPV4 = "IPV4"
    IPV6 = "IPV6"
    URL = "URL"
    HOSTNAME = "HOSTNAME"

    # Identity
    PERSON = "PERSON"
    USERNAME = "USERNAME"
    PHONE = "PHONE"

    # Italian-specific structured identifiers
    CODICE_FISCALE = "CODICE_FISCALE"
    PARTITA_IVA = "PARTITA_IVA"

    # Financial
    IBAN = "IBAN"
    PAYMENT_CARD = "PAYMENT_CARD"

    # Secrets and credentials — developer/ops sensitive data
    SECRET = "SECRET"

    # Temporal / demographic
    DATE_OF_BIRTH = "DATE_OF_BIRTH"

    # Address
    ADDRESS = "ADDRESS"

    # Generic national identifiers (non-Italian)
    NATIONAL_ID = "NATIONAL_ID"

    # Custom / dictionary / catch-all
    CUSTOM = "CUSTOM"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
