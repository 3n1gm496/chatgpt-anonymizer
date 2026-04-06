from __future__ import annotations

from local_engine.models.domain_models import RawFinding, SessionRecord, make_lookup_key


class PseudonymizerEngine:
    PREFIXES = {
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
