from enum import Enum


class EntityType(str, Enum):
    EMAIL = "EMAIL"
    IPV4 = "IPV4"
    IPV6 = "IPV6"
    URL = "URL"
    HOSTNAME = "HOSTNAME"
    PERSON = "PERSON"
    USERNAME = "USERNAME"
    PHONE = "PHONE"
    CODICE_FISCALE = "CODICE_FISCALE"
    PARTITA_IVA = "PARTITA_IVA"
    CUSTOM = "CUSTOM"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
