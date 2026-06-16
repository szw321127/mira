from typing import Any, Callable, Dict, List

from .adapters import XhsAdapterError, XhsPcApiAdapter
from .cookies import has_required_cookie
from .normalizer import normalize_search_note


class ConnectorInputError(Exception):
    pass


class ConnectorUpstreamError(Exception):
    pass


AdapterFactory = Callable[[str], Any]


class XhsConnectorService:
    def __init__(self, adapter_factory: AdapterFactory = XhsPcApiAdapter) -> None:
        self.adapter_factory = adapter_factory

    def validate_cookie(self, cookie: str, user_id: str) -> Dict[str, Any]:
        self._validate_cookie_shape(cookie)

        try:
            account = self.adapter_factory(cookie).get_self_info()
        except XhsAdapterError as exc:
            return {"account": None, "expires_hint": None, "valid": False, "message": str(exc)}

        return {"account": account, "expires_hint": None, "valid": True}

    def search_posts(
        self,
        authorization_id: str,
        cookie: str,
        keyword: str,
        limit: int,
        sort: str,
    ) -> Dict[str, Any]:
        self._validate_cookie_shape(cookie)
        normalized_keyword = keyword.strip()

        if not authorization_id.strip():
            raise ConnectorInputError("authorizationId is required.")

        if not normalized_keyword:
            raise ConnectorInputError("keyword is required.")

        if limit < 1 or limit > 20:
            raise ConnectorInputError("limit must be between 1 and 20.")

        if sort != "popular":
            raise ConnectorInputError("sort must be popular.")

        try:
            raw_notes = self.adapter_factory(cookie).search_notes(
                normalized_keyword,
                limit,
                sort,
            )
        except XhsAdapterError as exc:
            raise ConnectorUpstreamError(str(exc)) from exc

        posts: List[Dict[str, Any]] = []
        seen = set()

        for raw_note in raw_notes:
            if not isinstance(raw_note, dict):
                continue

            post = normalize_search_note(raw_note)
            note_id = post.get("note_id") or post.get("note_url") or post.get("title")

            if not note_id or note_id in seen:
                continue

            seen.add(note_id)
            posts.append(post)

        return {"keyword": normalized_keyword, "posts": posts}

    @staticmethod
    def _validate_cookie_shape(cookie: str) -> None:
        if not cookie.strip():
            raise ConnectorInputError("cookie is required.")

        if not has_required_cookie(cookie):
            raise ConnectorInputError("cookie must include a1 and web_session.")
