import sys
from pathlib import Path

# Pin the real aiohttp/aiohttp.web before any test module installs stubs:
# the stub installer uses sys.modules.setdefault, so pre-imported real
# modules always win. Pinning only the top package is not enough — aiohttp
# 3.9+ lazy-loads submodules through a module __getattr__ that consults
# sys.modules, so a pre-existing "aiohttp.web" entry would shadow it.
import aiohttp.web  # noqa: F401

# Tests import proxy modules (statement_parser, history_store, http) as
# top-level modules so the package __init__ (which needs homeassistant) is
# never imported. Appended, not prepended: prepending the integration dir
# would shadow the stdlib "http" package (aiohttp does
# `from http import HTTPStatus`) with this integration's own http.py.
sys.path.append(str(Path(__file__).resolve().parents[1]))

# Endpoint tests import the ai_dashboard_proxy package itself (http.py uses
# relative imports), so the repo's custom_components dir must be on the path.
sys.path.append(str(Path(__file__).resolve().parents[2]))
