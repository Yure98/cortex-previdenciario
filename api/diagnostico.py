"""Função Python interna da Vercel para diagnóstico estrutural de CNIS."""

from __future__ import annotations

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from scripts.cnis_diagnostico import diagnose_pdf


MAX_PDF_BYTES = 12 * 1024 * 1024
MAX_REQUEST_BYTES = 8 * 1024


def _validated_storage_url(value: str) -> str:
    expected = urlparse(os.environ["SUPABASE_URL"])
    candidate = urlparse(value)
    expected_prefix = "/storage/v1/object/sign/cnis/"

    if (
        candidate.scheme != "https"
        or candidate.netloc != expected.netloc
        or not candidate.path.startswith(expected_prefix)
        or not candidate.query
    ):
        raise ValueError("URL_STORAGE_INVALIDA")
    return value


def _download_pdf(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "cortex-previdenciario/1.0"})
    with urlopen(request, timeout=20) as response:  # nosec B310: host/path validated above
        length = response.headers.get("Content-Length")
        if length and int(length) > MAX_PDF_BYTES:
            raise ValueError("PDF_MUITO_GRANDE")
        payload = response.read(MAX_PDF_BYTES + 1)

    if len(payload) > MAX_PDF_BYTES:
        raise ValueError("PDF_MUITO_GRANDE")
    if not payload.startswith(b"%PDF"):
        raise ValueError("ARQUIVO_NAO_PDF")
    return payload


class handler(BaseHTTPRequestHandler):
    server_version = "CortexInternal"

    def log_message(self, _format: str, *args: object) -> None:
        # Nunca registrar URL assinada, CNIS ou corpo da requisição.
        return

    def _json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 - interface BaseHTTPRequestHandler
        expected_token = os.environ.get("INTERNAL_PYTHON_TOKEN", "")
        supplied_token = self.headers.get("x-cortex-internal-token", "")
        if not expected_token or not hmac.compare_digest(expected_token, supplied_token):
            self._json(401, {"erro": "NAO_AUTORIZADO"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
                raise ValueError("REQUISICAO_INVALIDA")
            payload = json.loads(self.rfile.read(content_length))
            signed_url = _validated_storage_url(str(payload["arquivo_url"]))
            result = diagnose_pdf(_download_pdf(signed_url))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            self._json(422, {"erro": "CNIS_INVALIDO"})
            return
        except Exception:
            self._json(503, {"erro": "DIAGNOSTICO_INDISPONIVEL"})
            return

        self._json(200, result)
