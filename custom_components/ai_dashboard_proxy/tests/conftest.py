import sys
from pathlib import Path

# Tests import proxy modules (statement_parser, history_store, http) as
# top-level modules so the package __init__ (which needs homeassistant) is
# never imported.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
