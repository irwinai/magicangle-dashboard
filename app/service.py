from __future__ import annotations

from typing import Any, Iterator

from .decoder import decode_order


def walk_records(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for key in ("data", "list", "records", "rows", "recommendList", "rankList", "buyerList", "orderInfo"):
            child = value.get(key)
            if isinstance(child, (dict, list)):
                yield from walk_records(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_records(child)


def extract_orders(response: dict[str, Any]) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for record in walk_records(response):
        candidate = record.get("prescientInfo") if isinstance(record.get("prescientInfo"), dict) else record
        order_id = candidate.get("id") or candidate.get("prescientId")
        if not isinstance(order_id, str) or not order_id.startswith("P"):
            continue
        if not any(field in candidate for field in ("betCode", "betCodeForResult", "jingcaiResultList", "playType", "lotNo")):
            continue
        found[order_id] = decode_order(candidate)
    return list(found.values())


def extract_buyers(response: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize buyer-list rows without assuming one undocumented upstream shape."""
    found: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for record in walk_records(response):
        nickname = record.get("nickname") or record.get("nickName") or record.get("userName")
        amount = record.get("amount") or record.get("totalAmt") or record.get("joinAmt")
        if not isinstance(nickname, str) or amount is None:
            continue
        identity = str(record.get("userId") or record.get("userNo") or nickname)
        key = (identity, str(amount))
        if key in seen:
            continue
        seen.add(key)
        found.append(
            {
                "nickname": nickname,
                "avatar": record.get("headPic") or record.get("avatar") or record.get("headPhoto"),
                "amount": amount,
                "isStarter": bool(record.get("isStarter") or record.get("starterFlag") or record.get("starter")),
            }
        )
    return found


def extract_buyer_summary(response: dict[str, Any]) -> dict[str, Any] | None:
    data = response.get("data")
    order_info = data.get("orderInfo") if isinstance(data, dict) else None
    if not isinstance(order_info, dict):
        return None
    return {
        "totalNumber": order_info.get("totalNumber"),
        "totalAmount": order_info.get("totalAmt"),
        "totalPrizeAmount": order_info.get("totalPrizeAmt"),
        "totalCommission": order_info.get("totalCommission"),
    }


def aggregate_response(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "raw": raw,
        "orders": extract_orders(raw),
        "buyers": extract_buyers(raw),
        "buyerSummary": extract_buyer_summary(raw),
    }
