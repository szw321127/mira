from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .auth import ConnectorAuthError, verify_internal_api_key
from .service import ConnectorInputError, ConnectorUpstreamError, XhsConnectorService


app = FastAPI(title="RedNote XHS Connector", version="0.1.0")
service = XhsConnectorService()


class ValidateCookieBody(BaseModel):
    cookie: str = Field(min_length=1)
    userId: str = Field(min_length=1)


class SearchPostsBody(BaseModel):
    authorizationId: str = Field(min_length=1)
    cookie: str = Field(min_length=1)
    keyword: str = Field(min_length=1)
    limit: int = Field(default=5, ge=1, le=20)
    sort: str = "popular"


def ok(data: Dict[str, Any]) -> Dict[str, Any]:
    return {"data": data}


def require_internal_auth(authorization: Optional[str]) -> None:
    try:
        verify_internal_api_key(authorization)
    except ConnectorAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.get("/health")
def health() -> Dict[str, Any]:
    return ok({"status": "ok"})


@app.post("/xhs/auth/validate")
def validate_cookie(
    body: ValidateCookieBody,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    require_internal_auth(authorization)

    try:
        return ok(service.validate_cookie(body.cookie, body.userId))
    except ConnectorInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/xhs/posts/search")
def search_posts(
    body: SearchPostsBody,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    require_internal_auth(authorization)

    try:
        return ok(
            service.search_posts(
                authorization_id=body.authorizationId,
                cookie=body.cookie,
                keyword=body.keyword,
                limit=body.limit,
                sort=body.sort,
            ),
        )
    except ConnectorInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConnectorUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
