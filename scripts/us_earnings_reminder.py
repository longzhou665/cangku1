#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo


FINNHUB_API = "https://finnhub.io/api/v1/calendar/earnings"
ET_TZ = ZoneInfo("America/New_York")
BJ_TZ = ZoneInfo("Asia/Shanghai")


@dataclass
class EarningsEvent:
    symbol: str
    report_date_et: str
    session_cn: str
    report_date_bj: str
    eps_estimate: str
    revenue_estimate: str


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"缺少环境变量: {name}")
    return value


def _optional_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"环境变量 {name} 需要是整数, 当前值: {raw}") from exc


def _parse_watchlist(raw: str) -> set[str]:
    return {x.strip().upper() for x in raw.split(",") if x.strip()}


def _fetch_earnings(api_token: str, from_date: str, to_date: str) -> list[dict]:
    query = urllib.parse.urlencode(
        {"from": from_date, "to": to_date, "token": api_token}
    )
    url = f"{FINNHUB_API}?{query}"
    req = urllib.request.Request(url, method="GET")

    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8")
    data = json.loads(body)

    rows = data.get("earningsCalendar", [])
    if not isinstance(rows, list):
        raise RuntimeError("Finnhub 返回数据格式异常: earningsCalendar 非数组")
    return rows


def _hour_to_session(hour: str) -> tuple[str, time]:
    normalized = (hour or "").strip().lower()
    if normalized == "bmo":
        return "盘前", time(8, 0)
    if normalized == "amc":
        return "盘后", time(16, 30)
    if normalized == "dmh":
        return "盘中", time(12, 0)
    return "未知", time(9, 30)


def _fmt_number(value: object) -> str:
    if value is None:
        return "N/A"
    if isinstance(value, (int, float)):
        return f"{value}"
    return str(value)


def _fmt_revenue(value: object) -> str:
    if value is None:
        return "N/A"
    try:
        num = float(value)
    except (TypeError, ValueError):
        return str(value)

    abs_num = abs(num)
    if abs_num >= 1_000_000_000:
        return f"${num / 1_000_000_000:.2f}B ({num:,.0f})"
    if abs_num >= 1_000_000:
        return f"${num / 1_000_000:.2f}M ({num:,.0f})"
    if abs_num >= 1_000:
        return f"${num / 1_000:.2f}K ({num:,.0f})"
    return f"${num:,.0f}"


def _normalize_event(row: dict) -> EarningsEvent | None:
    symbol = str(row.get("symbol", "")).strip().upper()
    report_date_et = str(row.get("date", "")).strip()
    if not symbol or not report_date_et:
        return None

    hour = str(row.get("hour", "")).strip().lower()
    session_cn, event_time_et = _hour_to_session(hour)

    dt_et = datetime.combine(
        datetime.strptime(report_date_et, "%Y-%m-%d").date(),
        event_time_et,
        tzinfo=ET_TZ,
    )
    dt_bj = dt_et.astimezone(BJ_TZ)

    return EarningsEvent(
        symbol=symbol,
        report_date_et=report_date_et,
        session_cn=session_cn,
        report_date_bj=dt_bj.strftime("%Y-%m-%d"),
        eps_estimate=_fmt_number(row.get("epsEstimate")),
        revenue_estimate=_fmt_revenue(row.get("revenueEstimate")),
    )


def _build_message(events: list[EarningsEvent]) -> str:
    today_bj = datetime.now(BJ_TZ).strftime("%Y-%m-%d")
    lines = [f"【美股财报提醒】北京时间 {today_bj}", ""]
    for item in events:
        lines.append(
            f"- {item.symbol} | 财报日(北京时间): {item.report_date_bj} | {item.session_cn} | "
            f"财报日(美东): {item.report_date_et} | EPS预期: {item.eps_estimate} | 营收预期: {item.revenue_estimate}"
        )
    return "\n".join(lines)


def _read_http_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        raw = exc.read()
    except Exception:
        return ""
    if not raw:
        return ""
    return raw.decode("utf-8", errors="ignore")


def _push_webhook(webhook_url: str, events: list[EarningsEvent], message: str) -> None:
    # Whop feed webhook commonly accepts `content` (and optional `username`).
    # Keep backward-compatible payloads as fallback for other webhook providers.
    candidate_payloads = [
        {"content": message, "username": "财报提醒"},
        {"content": message},
        {
            "text": message,
            "markdown": message,
            "events": [event.__dict__ for event in events],
        },
    ]

    last_error: Exception | None = None
    for idx, payload in enumerate(candidate_payloads, start=1):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            webhook_url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                code = resp.getcode()
                resp_text = resp.read().decode("utf-8", errors="ignore")
            print(f"Webhook 推送完成, HTTP {code}, payload尝试={idx}")
            if resp_text:
                print(f"Webhook 返回: {resp_text[:500]}")
            return
        except urllib.error.HTTPError as exc:
            detail = _read_http_error_body(exc)
            print(
                f"Webhook 尝试失败, payload尝试={idx}, HTTPError: {exc.code} {exc.reason}"
            )
            if detail:
                print(f"Webhook 错误详情: {detail[:1000]}")
            last_error = exc
        except Exception as exc:
            print(f"Webhook 尝试失败, payload尝试={idx}, 错误: {exc}")
            last_error = exc
    if last_error:
        raise last_error


def main() -> int:
    try:
        token = _require_env("FINNHUB_API_TOKEN")
        webhook_url = _require_env("WEBHOOK_URL")
        watchlist_raw = _require_env("EARNINGS_WHITELIST")
        lookahead_days = _optional_int("LOOKAHEAD_DAYS", 1)
        lookback_days = _optional_int("LOOKBACK_DAYS", 0)
    except ValueError as exc:
        print(str(exc))
        return 2

    watchlist = _parse_watchlist(watchlist_raw)
    if not watchlist:
        print("EARNINGS_WHITELIST 为空, 无需处理")
        return 0

    now_et = datetime.now(ET_TZ).date()
    from_date = (now_et - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
    to_date = (now_et + timedelta(days=lookahead_days)).strftime("%Y-%m-%d")
    print(f"查询区间(美东): {from_date} -> {to_date}")
    print(f"白名单股票: {', '.join(sorted(watchlist))}")

    try:
        rows = _fetch_earnings(token, from_date=from_date, to_date=to_date)
    except urllib.error.HTTPError as exc:
        print(f"拉取财报日历失败, HTTPError: {exc.code} {exc.reason}")
        detail = _read_http_error_body(exc)
        if detail:
            print(f"拉取财报日历错误详情: {detail[:1000]}")
        return 1
    except urllib.error.URLError as exc:
        print(f"拉取财报日历失败, URLError: {exc.reason}")
        return 1
    except Exception as exc:
        print(f"拉取财报日历失败: {exc}")
        return 1

    matched: list[EarningsEvent] = []
    for row in rows:
        event = _normalize_event(row)
        if not event:
            continue
        if event.symbol in watchlist:
            matched.append(event)

    if not matched:
        print("本次无白名单股票财报事件, 不推送")
        return 0

    matched.sort(key=lambda x: (x.report_date_bj, x.symbol))
    message = _build_message(matched)
    print(message)

    try:
        _push_webhook(webhook_url=webhook_url, events=matched, message=message)
    except urllib.error.HTTPError as exc:
        print(f"Webhook 推送失败, HTTPError: {exc.code} {exc.reason}")
        return 1
    except urllib.error.URLError as exc:
        print(f"Webhook 推送失败, URLError: {exc.reason}")
        return 1
    except Exception as exc:
        print(f"Webhook 推送失败: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
