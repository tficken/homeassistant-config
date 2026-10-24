"""Handler-level test for the budget statement upload endpoint.

Uses real aiohttp (web.json_response), stubbed HA modules, and a fake
request/hass. Verifies: oversized multipart bodies are rejected BEFORE any
body read, a normal multipart upload parses and stores, and the raw path
stays capped.
"""
import asyncio
import json
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock

from ha_stubs import install_ha_stubs

install_ha_stubs()

from ai_dashboard_proxy import http as proxy_http  # noqa: E402
from ai_dashboard_proxy.statement_parser import MAX_PDF_BYTES  # noqa: E402


class FakeHass:
    def __init__(self, config_dir):
        self.config = MagicMock()
        self.config.config_dir = config_dir

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


class FakePart:
    def __init__(self, name, filename, data):
        self.name = name
        self.filename = filename
        self._buf = BytesIO(data)

    async def read_chunk(self, size):
        return self._buf.read(size)

    async def release(self):
        pass


class FakeMultipartReader:
    def __init__(self, parts):
        self._parts = parts

    def __aiter__(self):
        self._it = iter(self._parts)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class FakeUpload:
    def __init__(self, data, filename):
        self.file = BytesIO(data)
        self.filename = filename


class FakeRequest:
    def __init__(self, config_dir, *, content_type, body=b"", filename="stmt.pdf",
                 content_length=None):
        self.remote = "192.168.1.10"
        self.headers = {}
        self.content_type = content_type
        self.content_length = content_length if content_length is not None else len(body)
        self.app = {"ai_dashboard_secret": None, "hass": FakeHass(config_dir)}
        self._body = body
        self._filename = filename
        self.content = MagicMock()
        self.content.read = self._read

    async def _read(self, n=-1):
        return self._body[:n] if n >= 0 else self._body

    def get(self, _key, default=None):
        return default

    async def post(self):
        raise AssertionError("post() must not be called — use the streaming multipart API")

    async def multipart(self):
        return FakeMultipartReader([FakePart("file", self._filename, self._body)])


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# The original script read tmp/statement-2026-09.pdf relative to the repo
# root; resolve it relative to this file so any pytest cwd works.
PDF = (Path(__file__).resolve().parents[3] / "tmp" / "statement-2026-09.pdf").read_bytes()


def test_oversized_multipart_rejected_before_any_read(tmp_path):
    # 1. Oversized multipart body is rejected before any read (400, no post()).
    config = str(tmp_path)
    big = FakeRequest(config, content_type="multipart/form-data", body=b"x",
                      content_length=MAX_PDF_BYTES + 200_000)
    res = run(proxy_http.budget_statement_upload_handler(big))
    assert res.status == 400, res.status
    print("oversized multipart rejected pre-read: OK")


def test_multipart_upload_parses_and_stores(tmp_path):
    # 2. Normal multipart upload parses and stores.
    config = str(tmp_path)
    ok = FakeRequest(config, content_type="multipart/form-data", body=PDF,
                     filename="september.pdf")
    res = run(proxy_http.budget_statement_upload_handler(ok))
    assert res.status == 200, res.text
    payload = json.loads(res.text)
    assert payload["ok"] is True and payload["record"]["month"] == "2026-09", payload
    assert payload["record"]["deposits"] == 5168.80, payload
    print("multipart upload stores month: OK")


def test_raw_body_over_cap_rejected(tmp_path):
    # 3. Raw body over the cap is rejected.
    config = str(tmp_path)
    raw = FakeRequest(config, content_type="application/pdf",
                      body=b"%PDF" + b" " * (MAX_PDF_BYTES + 10))
    res = run(proxy_http.budget_statement_upload_handler(raw))
    assert res.status == 400, res.status
    print("raw oversized rejected: OK")
