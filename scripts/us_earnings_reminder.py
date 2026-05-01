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
    event_time_bj: str
    bj_time_hint: str
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


def _optional_offsets(name: str, default: tuple[int, ...]) -> tuple[int, ...]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    parts = [x.strip() for x in raw.split(",") if x.strip()]
    try:
        offsets = tuple(sorted({int(x) for x in parts}))
    except ValueError as exc:
        raise ValueError(
            f"环境变量 {name} 需要是逗号分隔整数, 当前值: {raw}"
        ) from exc
    if not offsets:
        raise ValueError(f"环境变量 {name} 不能为空")
    if any(x < 0 for x in offsets):
        raise ValueError(f"环境变量 {name} 不能包含负数, 当前值: {raw}")
    return offsets


def _optional_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "y", "on"}:
        return True
    if raw in {"0", "false", "no", "n", "off"}:
        return False
    raise ValueError(f"环境变量 {name} 需要是布尔值, 当前值: {raw}")


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
        # 按美股正式开盘时刻(09:30 ET)给出盘前提醒时间锚点
        return "盘前", time(9, 30)
    if normalized == "amc":
        # 按美股收盘时刻(16:00 ET)给出提醒时间锚点
        return "盘后", time(16, 0)
    if normalized == "dmh":
        return "盘中", time(12, 0)
    return "未知", time(9, 30)


def _build_bj_time_hint(session_cn: str, dt_bj: datetime) -> str:
    dt_text = dt_bj.strftime("%Y-%m-%d %H:%M")
    if session_cn == "盘前":
        return f"{dt_text}前"
    if session_cn == "盘后":
        return f"{dt_text}后"
    if session_cn == "盘中":
        return f"{dt_text}左右"
    return dt_text


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
    sign = "-" if num < 0 else ""
    if abs_num >= 100_000_000:
        return f"{sign}约 {abs_num / 100_000_000:.2f} 亿美元"
    if abs_num >= 10_000:
        return f"{sign}约 {abs_num / 10_000:.2f} 万美元"
    return f"{sign}约 {abs_num:.0f} 美元"


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
        event_time_bj=dt_bj.strftime("%H:%M"),
        bj_time_hint=_build_bj_time_hint(session_cn, dt_bj),
        eps_estimate=_fmt_number(row.get("epsEstimate")),
        revenue_estimate=_fmt_revenue(row.get("revenueEstimate")),
    )


def _build_message(events: list[EarningsEvent]) -> str:
    today_bj = datetime.now(BJ_TZ).strftime("%Y-%m-%d")
    lines = [f"【美股财报提醒】北京时间 {today_bj}", ""]
    for _, item in events:
        bj_time_label = f"{item.report_date_bj} {item.event_time_bj}"
        if item.session_cn == "盘后":
            bj_time_label += "后"
        elif item.session_cn == "盘前":
            bj_time_label += "前"
        elif item.session_cn == "盘中":
            bj_time_label += "左右"
        lines.append(
            f"- {item.symbol} | 财报日(北京时间): {bj_time_label} | "
            f"EPS预期: {item.eps_estimate} | 营收预期: {item.revenue_estimate}"
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
        reminder_offsets = _optional_offsets("REMINDER_OFFSETS", (0, 1, 7))
        lookahead_days = _optional_int("LOOKAHEAD_DAYS", 1)
        lookback_days = _optional_int("LOOKBACK_DAYS", 0)
        premarket_only = _optional_bool("PREMARKET_ONLY", True)
    except ValueError as exc:
        print(str(exc))
        return 2

    watchlist = _parse_watchlist(watchlist_raw)
    if not watchlist:
        print("EARNINGS_WHITELIST 为空, 无需处理")
        return 0

    now_et_dt = datetime.now(ET_TZ)
    if premarket_only and now_et_dt.hour != 4:
        print(
            f"当前美东时间 {now_et_dt.strftime('%Y-%m-%d %H:%M:%S')}, 非盘前开始时刻(04点), 跳过执行"
        )
        return 0

    now_et = datetime.now(ET_TZ).date()
    today_bj = datetime.now(BJ_TZ).date()
    max_reminder_offset = max(reminder_offsets)
    effective_lookahead = max(lookahead_days, max_reminder_offset + 1)
    from_date = (now_et - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
    to_date = (now_et + timedelta(days=effective_lookahead)).strftime("%Y-%m-%d")
    print(f"查询区间(美东): {from_date} -> {to_date}")
    print(f"白名单股票: {', '.join(sorted(watchlist))}")
    print(f"提醒偏移天数(北京时间): {reminder_offsets}")

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

    matched: list[tuple[int, EarningsEvent]] = []
    for row in rows:
        event = _normalize_event(row)
        if not event:
            continue
        if event.symbol not in watchlist:
            continue
        event_bj_date = datetime.strptime(event.report_date_bj, "%Y-%m-%d").date()
        days_until = (event_bj_date - today_bj).days
        if days_until in reminder_offsets:
            matched.append((days_until, event))

    if not matched:
        print("本次无白名单股票财报事件, 不推送")
        return 0

    # 二次白名单过滤（发送前双保险）
    before_second_filter = len(matched)
    matched = [x for x in matched if x[1].symbol in watchlist]
    dropped = before_second_filter - len(matched)
    if dropped > 0:
        print(f"二次白名单过滤已丢弃 {dropped} 条非白名单事件")
    if not matched:
        print("二次白名单过滤后无可推送事件")
        return 0

    matched.sort(key=lambda x: (x[0], x[1].report_date_bj, x[1].symbol))
    message = _build_message(matched)
    print(message)

    try:
        _push_webhook(
            webhook_url=webhook_url,
            events=[item[1] for item in matched],
            message=message,
        )
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
