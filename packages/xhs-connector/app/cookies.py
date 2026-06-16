from typing import Dict


def parse_cookie(cookie: str) -> Dict[str, str]:
    pairs: Dict[str, str] = {}

    for part in cookie.split(";"):
        item = part.strip()
        if not item or "=" not in item:
            continue

        key, value = item.split("=", 1)
        key = key.strip()
        if key:
            pairs[key] = value.strip()

    return pairs


def mask_cookie(cookie: str) -> str:
    pairs = parse_cookie(cookie)
    return "; ".join(f"{key}=***" for key in pairs)


def has_required_cookie(cookie: str) -> bool:
    pairs = parse_cookie(cookie)
    return bool(pairs.get("a1") and pairs.get("web_session"))
