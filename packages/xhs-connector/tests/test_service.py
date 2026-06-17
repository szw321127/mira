import json
import os
import tempfile
import unittest
from unittest.mock import patch

from app.adapters import XhsAdapterError, XhsPcApiAdapter
from app.auth import ConnectorAuthError, verify_internal_api_key
from app.cookies import mask_cookie, parse_cookie
from app.normalizer import normalize_search_note
from app.service import ConnectorInputError, XhsConnectorService


class FakeAdapter:
    def __init__(self, cookie):
        self.cookie = cookie

    def get_self_info(self):
        return {
            "avatar": "https://example.com/avatar.jpg",
            "nickname": "xhs creator",
            "user_id": "xhs-user-1",
        }

    def search_notes(self, keyword, limit, sort):
        return [
            {
                "id": "note-a",
                "note_card": {
                    "desc": "A practical commuting outfit note.",
                    "display_title": "12 commuting outfit ideas",
                    "image_list": [
                        {"url_default": "https://example.com/a.jpg"},
                    ],
                    "interact_info": {
                        "collected_count": "1.2w",
                        "comment_count": 280,
                        "liked_count": "2.1w",
                        "share_count": 66,
                    },
                    "tag_list": [{"name": "commute"}, "budget"],
                    "user": {
                        "avatar": "https://example.com/author.jpg",
                        "nickname": "author",
                        "user_id": "author-1",
                    },
                },
            }
        ][:limit]


class XhsConnectorServiceTest(unittest.TestCase):
    def test_internal_api_key_is_required(self):
        with self.assertRaises(ConnectorAuthError):
            verify_internal_api_key(None, "connector-secret")

        with self.assertRaises(ConnectorAuthError):
            verify_internal_api_key("Bearer wrong", "connector-secret")

        verify_internal_api_key("Bearer connector-secret", "connector-secret")

    def test_cookie_validation_masks_sensitive_values(self):
        service = XhsConnectorService(adapter_factory=FakeAdapter)

        result = service.validate_cookie(
            "a1=abc; web_session=session-value; extra=secret-value",
            user_id="user-1",
        )

        self.assertTrue(result["valid"])
        self.assertEqual(result["account"]["user_id"], "xhs-user-1")
        self.assertNotIn("session-value", json.dumps(result))
        self.assertEqual(
            mask_cookie("a1=abc; web_session=session-value; extra=secret-value"),
            "a1=***; web_session=***; extra=***",
        )

    def test_search_normalizer_maps_raw_notes_into_stable_fields(self):
        post = normalize_search_note(FakeAdapter("a1=abc; web_session=s;").search_notes("commute", 1, "popular")[0])

        self.assertEqual(post["note_id"], "note-a")
        self.assertEqual(post["note_url"], "https://www.xiaohongshu.com/explore/note-a")
        self.assertEqual(post["title"], "12 commuting outfit ideas")
        self.assertEqual(post["content"], "A practical commuting outfit note.")
        self.assertEqual(post["author_id"], "author-1")
        self.assertEqual(post["likes"], 21000)
        self.assertEqual(post["collects"], 12000)
        self.assertEqual(post["comments"], 280)
        self.assertEqual(post["shares"], 66)
        self.assertEqual(post["tags"], ["commute", "budget"])
        self.assertEqual(post["image_urls"], ["https://example.com/a.jpg"])

    def test_search_rejects_empty_keyword(self):
        service = XhsConnectorService(adapter_factory=FakeAdapter)

        with self.assertRaises(ConnectorInputError):
            service.search_posts(
                authorization_id="auth-1",
                cookie="a1=abc; web_session=session-value",
                keyword=" ",
                limit=5,
                sort="popular",
            )

    def test_search_uses_cookie_and_returns_normalized_posts(self):
        service = XhsConnectorService(adapter_factory=FakeAdapter)

        result = service.search_posts(
            authorization_id="auth-1",
            cookie="a1=abc; web_session=session-value",
            keyword="commute",
            limit=5,
            sort="popular",
        )

        self.assertEqual(result["keyword"], "commute")
        self.assertEqual(result["posts"][0]["note_id"], "note-a")
        self.assertNotIn("session-value", json.dumps(result))

    def test_spider_sdk_missing_path_raises_clear_adapter_error(self):
        with patch.dict(os.environ, {"SPIDER_XHS_PATH": ""}, clear=False):
            with self.assertRaisesRegex(XhsAdapterError, "SPIDER_XHS_PATH"):
                XhsPcApiAdapter("a1=abc; web_session=session;").get_self_info()

    def test_spider_sdk_invalid_path_raises_clear_adapter_error(self):
        with tempfile.TemporaryDirectory() as sdk_path:
            with patch.dict(os.environ, {"SPIDER_XHS_PATH": sdk_path}, clear=False):
                with self.assertRaisesRegex(XhsAdapterError, "xhs_pc_apis.py"):
                    XhsPcApiAdapter("a1=abc; web_session=session;").get_self_info()


if __name__ == "__main__":
    unittest.main()
