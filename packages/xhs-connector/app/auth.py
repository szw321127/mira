import hmac
import os
from typing import Optional


class ConnectorAuthError(Exception):
    pass


def get_internal_api_key() -> str:
    return os.getenv("XHS_CONNECTOR_API_KEY", "rednote-local-xhs-connector-key")


def verify_internal_api_key(
    authorization_header: Optional[str],
    expected_key: Optional[str] = None,
) -> None:
    expected = (expected_key or get_internal_api_key()).strip()

    if not expected:
        raise ConnectorAuthError("Connector API key is not configured.")

    if not authorization_header or not authorization_header.startswith("Bearer "):
        raise ConnectorAuthError("Connector API key is required.")

    provided = authorization_header.removeprefix("Bearer ").strip()

    if not hmac.compare_digest(provided, expected):
        raise ConnectorAuthError("Connector API key is invalid.")
