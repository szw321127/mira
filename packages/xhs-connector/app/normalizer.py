from typing import Any, Dict, List, Optional


def normalize_metric(value: Any) -> int:
    if value is None:
        return 0

    if isinstance(value, bool):
        return 0

    if isinstance(value, (int, float)):
        return int(value)

    if not isinstance(value, str):
        return 0

    text = value.strip().lower().replace(",", "")
    if not text:
        return 0

    multiplier = 1
    if text.endswith(("w", "万")):
        multiplier = 10000
        text = text[:-1]
    elif text.endswith("k"):
        multiplier = 1000
        text = text[:-1]

    try:
        return int(float(text) * multiplier)
    except ValueError:
        return 0


def normalize_search_note(raw: Dict[str, Any]) -> Dict[str, Any]:
    note_card = as_dict(raw.get("note_card")) or raw
    user = as_dict(note_card.get("user")) or as_dict(note_card.get("user_info")) or {}
    interact = as_dict(note_card.get("interact_info")) or {}
    note_id = pick_string(
        raw.get("id"),
        raw.get("note_id"),
        note_card.get("note_id"),
        note_card.get("id"),
    )
    url = pick_string(
        note_card.get("note_url"),
        note_card.get("url"),
        raw.get("note_url"),
        raw.get("url"),
    ) or (f"https://www.xiaohongshu.com/explore/{note_id}" if note_id else "")

    return {
        "note_id": note_id,
        "note_url": url,
        "url": url,
        "title": pick_string(
            note_card.get("title"),
            note_card.get("display_title"),
            raw.get("title"),
        )
        or "",
        "content": pick_string(
            note_card.get("content"),
            note_card.get("desc"),
            note_card.get("description"),
            raw.get("content"),
            raw.get("desc"),
        )
        or "",
        "author_id": pick_string(user.get("user_id"), user.get("id")) or "",
        "author_name": pick_string(user.get("nickname"), user.get("name")) or "",
        "author_avatar": pick_string(user.get("avatar"), user.get("image")) or "",
        "cover_url": first_image_url(note_card.get("cover")),
        "image_urls": normalize_image_urls(
            note_card.get("image_list"),
            note_card.get("images"),
            note_card.get("image_urls"),
        ),
        "video_url": pick_string(note_card.get("video_url"), raw.get("video_url")) or "",
        "likes": normalize_metric(
            first_present(
                interact.get("liked_count"),
                interact.get("likes"),
                note_card.get("likes"),
                raw.get("likes"),
            ),
        ),
        "collects": normalize_metric(
            first_present(
                interact.get("collected_count"),
                interact.get("collect_count"),
                interact.get("collects"),
                note_card.get("collects"),
                raw.get("collects"),
            ),
        ),
        "comments": normalize_metric(
            first_present(
                interact.get("comment_count"),
                interact.get("comments"),
                note_card.get("comments"),
                raw.get("comments"),
            ),
        ),
        "shares": normalize_metric(
            first_present(
                interact.get("share_count"),
                interact.get("shares"),
                note_card.get("shares"),
                raw.get("shares"),
            ),
        ),
        "tags": normalize_tags(note_card.get("tag_list") or raw.get("tag_list")),
        "raw": raw,
    }


def as_dict(value: Any) -> Optional[Dict[str, Any]]:
    return value if isinstance(value, dict) else None


def pick_string(*values: Any) -> Optional[str]:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def first_present(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def first_image_url(value: Any) -> str:
    urls = normalize_image_urls(value)
    return urls[0] if urls else ""


def normalize_image_urls(*values: Any) -> List[str]:
    urls: List[str] = []

    for value in values:
        if isinstance(value, str) and value.strip():
            urls.append(value.strip())
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    urls.append(item.strip())
                elif isinstance(item, dict):
                    url = pick_string(
                        item.get("url_default"),
                        item.get("url"),
                        item.get("src"),
                    )
                    if url:
                        urls.append(url)
        elif isinstance(value, dict):
            url = pick_string(value.get("url_default"), value.get("url"), value.get("src"))
            if url:
                urls.append(url)

    return list(dict.fromkeys(urls))


def normalize_tags(value: Any) -> List[str]:
    tags: List[str] = []

    if not isinstance(value, list):
        return tags

    for item in value:
        if isinstance(item, str) and item.strip():
            tags.append(item.strip())
        elif isinstance(item, dict):
            tag = pick_string(item.get("name"), item.get("tag_name"), item.get("text"))
            if tag:
                tags.append(tag)

    return list(dict.fromkeys(tags))
