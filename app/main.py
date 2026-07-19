from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .client import MagicAngleClient, UpstreamRequestError
from .config import Settings
from .service import aggregate_response

settings = Settings.from_environment()
client = MagicAngleClient(settings)

app = FastAPI(title="MagicAngle API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class UpstreamQuery(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def handle(coroutine: Any) -> dict[str, Any]:
    try:
        return aggregate_response(await coroutine)
    except UpstreamRequestError as error:
        raise HTTPException(status_code=502, detail="Upstream API request failed") from error


def rank_rows(response: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    data = response.get("data")
    rows = data.get("list") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return []

    normalized: list[dict[str, Any]] = []
    for value in rows:
        if not isinstance(value, dict):
            continue
        row = {
            **value,
            "nickname": value.get("nickName") or value.get("nickname"),
            "headPic": value.get("headPicture") or value.get("headPic"),
            "storeId": f"ds{value['adminId']}" if value.get("adminId") is not None else value.get("storeId"),
        }
        number = value.get("number")
        if kind == "streak":
            row["keepHitNum"] = number
        elif kind == "winRate" and number is not None:
            row["hitRate"] = f"{float(number) / 100:.2f}%"
        elif kind == "profit" and number is not None:
            row["earningsRate"] = f"{float(number) / 100:.2f}%"
        normalized.append(row)
    return normalized


def recommendation_rows(response: dict[str, Any] | BaseException) -> list[Any]:
    if not isinstance(response, dict):
        return []
    data = response.get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        recommended = data.get("recommendList") if isinstance(data.get("recommendList"), list) else []
        ranked = data.get("rankList") if isinstance(data.get("rankList"), list) else []
        if recommended or ranked:
            unique: dict[str, Any] = {}
            for row in [*recommended, *ranked]:
                if isinstance(row, dict):
                    unique[str(row.get("id") or len(unique))] = row
            return list(unique.values())
        for key in ("list", "records", "rows"):
            rows = data.get(key)
            if isinstance(rows, list):
                return rows
    return []


@app.post("/api/v1/home")
async def home(query: UpstreamQuery) -> dict[str, Any]:
    payload = {"pageNum": 1, "pageSize": 20, **query.payload}
    recommendation_payload = {
        "pageNum": 1,
        "pageSize": 10,
        "state": "1",
        "lotNo": "",
        "sort": 7,
        "currentUserId": settings.user_id or "",
        **query.payload,
    }
    win_rate, profit, streak, recommendations_result = await asyncio.gather(
        client.win_rate_rank(payload),
        client.profit_rank(payload),
        client.streak_rank(payload),
        client.recommendations(recommendation_payload),
        return_exceptions=True,
    )

    rank_results = [win_rate, profit, streak]
    if not any(isinstance(result, dict) for result in rank_results):
        raise HTTPException(status_code=502, detail="Unable to load leaderboard data")

    raw = {
        "errorCode": "0",
        "value": "成功",
        "data": {
            "winRateList": rank_rows(win_rate, "winRate") if isinstance(win_rate, dict) else [],
            "profitList": rank_rows(profit, "profit") if isinstance(profit, dict) else [],
            "streakList": rank_rows(streak, "streak") if isinstance(streak, dict) else [],
            "recommendList": recommendation_rows(recommendations_result),
        },
    }
    return aggregate_response(raw)


@app.post("/api/v1/recommendations")
async def recommendations(query: UpstreamQuery) -> dict[str, Any]:
    return await handle(client.recommendations(query.payload))


@app.post("/api/v1/starters/search")
async def search_starters(query: UpstreamQuery) -> dict[str, Any]:
    return await handle(client.search_starters(query.payload))


@app.post("/api/v1/buyers")
async def buyers(query: UpstreamQuery) -> dict[str, Any]:
    return await handle(client.buyers(query.payload))


@app.post("/api/v1/starters/{starter_id}/orders")
async def starter_orders(starter_id: str, query: UpstreamQuery) -> dict[str, Any]:
    return await handle(client.starter_orders(starter_id, query.payload))


@app.post("/api/v1/starters/{starter_id}/military")
async def military_detail(starter_id: str, query: UpstreamQuery) -> dict[str, Any]:
    payload = {"day": 7, **query.payload}
    return await handle(client.military_detail(starter_id, payload))


@app.post("/api/v1/orders/batch")
async def order_batch(query: UpstreamQuery) -> dict[str, Any]:
    identifiers = query.payload.get("prescientIds")
    if not isinstance(identifiers, list):
        raise HTTPException(status_code=422, detail="prescientIds must be an array")
    order_ids = [item for item in identifiers if isinstance(item, str) and item.startswith("P")][:10]
    if not order_ids:
        raise HTTPException(status_code=422, detail="No valid prescient IDs were provided")

    upstream_payload = {key: value for key, value in query.payload.items() if key != "prescientIds"}
    semaphore = asyncio.Semaphore(3)

    async def fetch(order_id: str) -> dict[str, Any] | None:
        async with semaphore:
            try:
                return await client.order_info(order_id, upstream_payload)
            except UpstreamRequestError:
                return None

    responses = [response for response in await asyncio.gather(*(fetch(order_id) for order_id in order_ids)) if response]
    if not responses:
        raise HTTPException(status_code=502, detail="Unable to load historical orders")
    return aggregate_response({"data": responses})


@app.post("/api/v1/orders/{prescient_id}")
async def order_info(prescient_id: str, query: UpstreamQuery) -> dict[str, Any]:
    return await handle(client.order_info(prescient_id, query.payload))


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = PROJECT_ROOT / "web"


@app.get("/{path:path}", include_in_schema=False)
async def frontend(path: str) -> FileResponse:
    """Serve the built React application from the same process as the API."""
    target = (WEB_ROOT / path).resolve()
    if path and WEB_ROOT in target.parents and target.is_file():
        return FileResponse(target)
    index = WEB_ROOT / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(status_code=503, detail="Frontend build is missing. Run npm run build first.")
