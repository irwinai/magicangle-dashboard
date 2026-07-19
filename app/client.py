from __future__ import annotations

from typing import Any

import httpx
from .config import Settings

USER_API = "https://userapi.magicangle.cn"
USER_GW = "https://usergw.magicangle.cn"


class UpstreamRequestError(RuntimeError):
    pass


class MagicAngleClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def post(self, host: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        body = {**self.settings.base_payload(), **payload}
        try:
            async with httpx.AsyncClient(timeout=self.settings.timeout_seconds) as client:
                response = await client.post(f"{host}{path}", headers=self.settings.headers(), json=body)
                response.raise_for_status()
                data = response.json()
                # logger.debug("Upstream request to %s%s with payload %s returned %s", host, path, body, data)
        except (httpx.HTTPError, ValueError) as error:
            raise UpstreamRequestError(str(error)) from error
        if not isinstance(data, dict):
            raise UpstreamRequestError("Upstream response was not a JSON object")
        if str(data.get("errorCode", "0")) != "0":
            message = str(data.get("value") or "Upstream API returned a business error")
            raise UpstreamRequestError(message)
        return data

    async def recommendations(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.post(USER_GW, "/store/api/prescient-hall/order/recommend/list", payload)

    async def win_rate_rank(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.post(USER_GW, "/lottery_ranking_list/api/rank/findShenglvRankPage", payload)

    async def profit_rank(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.post(USER_GW, "/lottery_ranking_list/api/rank/findShouYiRankPage", payload)

    async def streak_rank(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.post(USER_GW, "/lottery_ranking_list/api/rank/findKeepHitRankPage", payload)

    async def search_starters(self, payload: dict[str, Any]) -> dict[str, Any]:
        search_payload = {**payload}
        if self.settings.user_id:
            search_payload.setdefault("loginUserId", self.settings.user_id)
        return await self.post(USER_GW, "/lottery_ranking_list/api/starter/findstarter", search_payload)

    async def buyers(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.post(
            USER_API,
            "/lottery-store/api/prescient-hall/order/info/buyer/list",
            {"pageNum": 1, "pageSize": 15, **payload},
        )

    async def starter_orders(self, starter_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        result_size = payload.get("resultSize") or payload.get("pageSize") or 10
        page_index = payload.get("pageIndex")
        if page_index is None:
            page_index = max(int(payload.get("pageNum") or 1) - 1, 0)
        return await self.post(
            USER_API,
            "/lottery-store/api/prescientOrder/getPrescientMilitaryList",
            {
                "resultSize": result_size,
                "pageIndex": page_index,
                "starterId": starter_id,
                "day": payload.get("day") or 30,
            },
        )

    async def military_detail(self, starter_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.post(
            USER_API,
            "/lottery-store/api/prescientOrder/getPrescientMilitaryDetail",
            {**payload, "userId": starter_id},
        )

    async def order_info(self, prescient_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.post(USER_API, "/lottery-store/api/prescient-hall/order/info", {**payload, "prescientId": prescient_id})
