"""
Backwards-compatibility shim.

The class previously named OptionalMlDetector has been renamed to
ContextualHeuristicDetector in heuristic_detector.py because it does not
perform any machine-learning inference. Import from heuristic_detector directly
for new code.
"""
from local_engine.detectors.heuristic_detector import ContextualHeuristicDetector

# Legacy alias preserved so that existing test imports continue to work
# during migration. Remove after all references are updated.
OptionalMlDetector = ContextualHeuristicDetector

__all__ = ["ContextualHeuristicDetector", "OptionalMlDetector"]
