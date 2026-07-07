"""Resolve free-text actor/target strings from claims to ontology entities.

Deterministic string matching only — no fuzzy scoring, no LLM. Matching order:
1. exact entity name match
2. exact alias match
3. case-insensitive name (or alias) match
4. unresolved
"""

from __future__ import annotations

import re

from ontology_schema import OntologyEntity, OntologyResolutionResult, OntologySnapshot

# Strings the extractor uses when it has no idea who acted; never resolvable.
_UNRESOLVABLE = frozenset({"", "unattributed", "unknown"})


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


class OntologyResolver:
    """Index of one snapshot's entities, queried by name or alias."""

    def __init__(self, snapshot: OntologySnapshot) -> None:
        self._by_name: dict[str, OntologyEntity] = {}
        self._by_alias: dict[str, OntologyEntity] = {}
        self._by_name_ci: dict[str, OntologyEntity] = {}
        # First entity wins on collisions so resolution is order-stable.
        for entity in snapshot.entities:
            name = _normalise(entity.name)
            if name:
                self._by_name.setdefault(name, entity)
                self._by_name_ci.setdefault(name.lower(), entity)
            for alias in entity.aliases:
                alias = _normalise(alias)
                if alias:
                    self._by_alias.setdefault(alias, entity)
                    self._by_name_ci.setdefault(alias.lower(), entity)

    def resolve(self, text: str) -> OntologyResolutionResult:
        """Resolve one actor/target string to an entity, or report unresolved."""
        cleaned = _normalise(text)
        if cleaned.lower() in _UNRESOLVABLE:
            return OntologyResolutionResult(
                input_text=text,
                notes="input is empty or a known unattributed placeholder",
            )

        entity = self._by_name.get(cleaned)
        if entity is not None:
            return self._hit(text, entity, "exact_name", 1.0)

        entity = self._by_alias.get(cleaned)
        if entity is not None:
            return self._hit(text, entity, "alias", 0.9)

        entity = self._by_name_ci.get(cleaned.lower())
        if entity is not None:
            return self._hit(text, entity, "name_case_insensitive", 0.8)

        return OntologyResolutionResult(
            input_text=text,
            notes="no entity name or alias matched",
        )

    @staticmethod
    def _hit(text: str, entity: OntologyEntity, method: str,
             confidence: float) -> OntologyResolutionResult:
        return OntologyResolutionResult(
            input_text=text,
            resolved_entity_id=entity.entity_id,
            resolved_entity_type=entity.entity_type,
            confidence=confidence,
            method=method,
            notes=f"matched entity {entity.name!r} via {method}",
        )
