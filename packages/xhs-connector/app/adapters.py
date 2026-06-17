import os
import sys
from pathlib import Path
from typing import Any, Dict, List


class XhsAdapterError(Exception):
    pass


class XhsPcApiAdapter:
    def __init__(self, cookie: str) -> None:
        self.cookie = cookie

    def get_self_info(self) -> Dict[str, Any]:
        api = self._create_spider_api()
        success, message, payload = api.get_user_self_info(cookies_str=self.cookie)

        if not success or not payload:
            raise XhsAdapterError(message or "XHS cookie validation failed.")

        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            raise XhsAdapterError("XHS self profile response is invalid.")

        return {
            "avatar": data.get("image") or data.get("avatar"),
            "nickname": data.get("nickname") or data.get("name"),
            "user_id": data.get("user_id") or data.get("userid") or data.get("id"),
        }

    def search_notes(self, keyword: str, limit: int, sort: str) -> List[Dict[str, Any]]:
        api = self._create_spider_api()
        sort_type_choice = 2 if sort == "popular" else 0
        success, message, notes = api.search_some_note(
            query=keyword,
            require_num=limit,
            cookies_str=self.cookie,
            sort_type_choice=sort_type_choice,
        )

        if not success:
            raise XhsAdapterError(message or "XHS search failed.")

        return notes if isinstance(notes, list) else []

    def _create_spider_api(self) -> Any:
        self._ensure_spider_path()

        try:
            from apis.xhs_pc_apis import XHS_Apis  # type: ignore
        except ModuleNotFoundError as exc:
            if exc.name == "apis":
                raise XhsAdapterError(
                    "SPIDER_XHS_PATH is invalid: cannot import apis.xhs_pc_apis."
                ) from exc
            raise

        return XHS_Apis()

    @staticmethod
    def _ensure_spider_path() -> None:
        sdk_path = os.getenv("SPIDER_XHS_PATH", "").strip()
        if not sdk_path:
            raise XhsAdapterError(
                "SPIDER_XHS_PATH is required. Set it to the local Spider_XHS repo path."
            )

        path = Path(sdk_path).expanduser().resolve()
        api_file = path / "apis" / "xhs_pc_apis.py"

        if not api_file.exists():
            raise XhsAdapterError(
                f"SPIDER_XHS_PATH is invalid: missing {api_file}."
            )

        if str(path) not in sys.path:
            sys.path.insert(0, str(path))
