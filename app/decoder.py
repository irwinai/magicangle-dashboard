from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any


def cents_to_yuan(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float((Decimal(str(value)) / Decimal("100")).quantize(Decimal("0.01")))
    except (InvalidOperation, ValueError):
        return None


def parse_bet_code(order: dict[str, Any]) -> list[dict[str, str]]:
    source = order.get("betCode") or order.get("betCodeForResult") or ""
    play_type = str(order.get("playType") or "")
    segments: list[dict[str, str]] = []

    for raw_part in source.split("^"):
        if not raw_part:
            continue
        if "@" in raw_part:
            play_type, payload = raw_part.split("@", 1)
        else:
            payload = raw_part
        fields = payload.split("|")
        if len(fields) < 4:
            continue
        segments.append(
            {
                "play_type": play_type,
                "team_id": fields[2],
                "game": fields[3] if len(fields) > 4 else play_type,
                "option": fields[4] if len(fields) > 4 else fields[3],
            }
        )
    return segments


def score_label(option: str) -> str:
    return f"{option[0]}:{option[1]}" if len(option) == 2 and option.isdigit() else f"比分代码 {option}"


def mixed_label(game: str, option: str) -> str:
    if game == "J00004":
        return score_label(option)
    if game == "J00003" and option == "4":
        return "平_平"
    return f"{game} · {option}"


def total_goal_markets(option: str, odds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected = list(option)
    markets: list[dict[str, Any]] = []
    shown: set[str] = set()
    for item in odds:
        item_type = str(item.get("type") or "")
        if not item_type.startswith("goal_v"):
            continue
        goal = item_type.removeprefix("goal_v")
        if goal not in selected:
            continue
        shown.add(goal)
        markets.append({
            "label": f"{goal}球",
            "odds": item.get("peilv"),
            "is_hit": item.get("isHit") == "true",
        })
    markets.extend({"label": f"{goal}球"} for goal in selected if goal not in shown)
    return markets


def decode_order(order: dict[str, Any]) -> dict[str, Any]:
    segments = parse_bet_code(order)
    decoded_matches: list[dict[str, Any]] = []
    for match in order.get("jingcaiResultList") or []:
        team_id = str(match.get("teamId") or "")
        matching = [segment for segment in segments if segment["team_id"] == team_id]
        odds = match.get("peilvs") or []
        if str(order.get("playType")) == "502":
            markets = [market for segment in matching for market in total_goal_markets(segment["option"], odds)]
        else:
            markets = [
                {
                    "label": mixed_label(segment["game"], segment["option"]),
                    "odds": odds[index].get("peilv") if index < len(odds) else None,
                    "is_hit": odds[index].get("isHit") == "true" if index < len(odds) else False,
                }
                for index, segment in enumerate(matching)
            ]
        decoded_matches.append(
            {
                "team_id": team_id,
                "team": match.get("team"),
                "league": match.get("league"),
                "day": match.get("day"),
                "end_time": match.get("enddate"),
                "result": match.get("result"),
                "first_half_result": match.get("firsthalfresult"),
                "markets": markets,
            }
        )

    return {
        "id": order.get("id"),
        "starter_id": order.get("starterId") or order.get("starter"),
        "lot_no": order.get("lotNo"),
        "play_type": order.get("playType"),
        "created_at": order.get("createTime"),
        "end_at": order.get("endTime"),
        "bet_code": order.get("betCode"),
        "result_code": order.get("betCodeForResult"),
        "bet_code_source": "betCode" if order.get("betCode") else "betCodeForResult",
        "stake": {
            "self_buy_yuan": cents_to_yuan(order.get("selfBuyAmt") or order.get("orderInitAmt")),
            "unit_yuan": cents_to_yuan(order.get("unitAmt")),
            "total_yuan": cents_to_yuan(order.get("totalAmt")),
            "followers": order.get("followerNumber"),
            "multiple": order.get("lotmulti"),
            "bets": order.get("betnum"),
        },
        "matches": decoded_matches,
    }
