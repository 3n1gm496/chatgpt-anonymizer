from __future__ import annotations

from local_engine.models.domain_models import RawFinding, SessionRecord, make_lookup_key


class PseudonymizerEngine:
    """
    Assigns deterministic placeholder tokens to detected entities.

    Placeholders have the form ``[PREFIX_NNN]`` where PREFIX is a short
    mnemonic for the entity type and NNN is a zero-padded counter that
    increments per session per prefix.  The same entity value always maps
    to the same placeholder within a session (via the reverse-lookup index).

    This produces reversible pseudonymisation, not anonymisation.  The
    original-to-placeholder mapping is stored in the ``SessionRecord`` and
    persisted encrypted to disk by ``EncryptedSessionStore``.
    """

    PREFIXES: dict[str, str] = {
        "EMAIL": "EMAIL",
        "IPV4": "IPV4",
        "IPV6": "IPV6",
        "URL": "URL",
        "HOSTNAME": "HOST",
        "PERSON": "PERSON",
        "USERNAME": "USER",
        "PHONE": "PHONE",
        "CODICE_FISCALE": "CF",
        "PARTITA_IVA": "VAT",
        "IBAN": "IBAN",
        "PAYMENT_CARD": "CARD",
        "SECRET": "SECRET",
        "DATE_OF_BIRTH": "DOB",
        "ADDRESS": "ADDR",
        "NATIONAL_ID": "NID",
        "CUSTOM": "TOKEN",
    }

    def get_or_create_placeholder(self, session: SessionRecord, finding: RawFinding) -> str:
        key = make_lookup_key(finding.entity_type, finding.canonical_text)
        existing = session.reverse_lookup.get(key)
        if existing:
            return existing

        prefix = self.PREFIXES.get(finding.entity_type.value, finding.entity_type.value)
        next_counter = session.counters.get(prefix, 0) + 1
        session.counters[prefix] = next_counter
        placeholder = f"[{prefix}_{next_counter:03d}]"
        session.reverse_lookup[key] = placeholder
        session.mapping[placeholder] = finding.original_text
        return placeholder
