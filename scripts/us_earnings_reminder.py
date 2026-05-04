#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, time, timezone
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


def _state_file_path() -> str:
    raw = os.getenv("SENT_STATE_FILE", "").strip()
    if raw:
        return raw
    return os.path.join(".cache", "earnings_sent_state.json")


def _load_sent_state(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            return data
    except FileNotFoundError:
        return {}
    except Exception:
        return {}
    return {}


def _save_sent_state(path: str, state: dict) -> None:
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(state, handle, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(tmp_path, path)


def _schedule_day_success_key(et_day: str) -> str:
    return f"premarket_day_success|et_day={et_day}"


def _mark_schedule_day_success(state_path: str, et_day: str | None = None) -> None:
    state = _load_sent_state(state_path)
    sent_map = state.get("sent", {}) if isinstance(state, dict) else {}
    day = et_day or datetime.now(ET_TZ).strftime("%Y-%m-%d")
    sent_map[_schedule_day_success_key(day)] = {
        "ts_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    state["sent"] = sent_map
    _save_sent_state(state_path, state)


def _event_key(event: EarningsEvent, days_until: int) -> str:
    return f"{event.symbol}|bj={event.report_date_bj}|et={event.report_date_et}|session={event.session_cn}|d={days_until}"


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


def _normalize_finnhub_hour(raw: object) -> str:
    """Finnhub JSON 里 `hour` 常为 null；`dict.get('hour','')` 在键存在且值为 null 时仍得到 None。"""
    if raw is None:
        return ""
    token = str(raw).strip().lower()
    if token in {"", "null", "none", "n/a", "na", "-"}:
        return ""
    return token


def _hour_to_session(hour: str) -> tuple[str, time | None]:
    """解析 Finnhub `hour` 字段。

    - `bmo`/`amc`/`dmh`：用 Finnhub 惯例锚点换算为北京时间后展示「日期 + 时分 + 前/后/左右」
      （bmo=美东 09:30，amc=美东 16:00，dmh=美东 12:00；盘后常跨到北京次日清晨）。
    - `hour` 为空：不猜盘前/盘后，仅用美东财报日 0:00 锚出北京历日期（无时分、无前/后）。
    """
    normalized = (hour or "").strip().lower()
    if not normalized:
        return "", None
    if normalized == "bmo":
        return "盘前", time(9, 30)
    if normalized == "amc":
        return "盘后", time(16, 0)
    if normalized == "dmh":
        return "盘中", time(12, 0)
    return "未知", None


def _build_bj_time_hint(session_cn: str, dt_bj: datetime) -> str:
    if not (session_cn or "").strip():
        return dt_bj.strftime("%Y-%m-%d")
    dt_clock = dt_bj.strftime("%Y-%m-%d %H:%M")
    if session_cn == "盘前":
        return f"{dt_clock}前"
    if session_cn == "盘后":
        return f"{dt_clock}后"
    if session_cn == "盘中":
        return f"{dt_clock}左右"
    return dt_bj.strftime("%Y-%m-%d")


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

    hour = _normalize_finnhub_hour(row.get("hour"))
    session_cn, event_time_et = _hour_to_session(hour)

    et_date = datetime.strptime(report_date_et, "%Y-%m-%d").date()
    if event_time_et is None:
        # 无具体钟点：用「美东日历日」的 0:00 锚到北京时间日期。
        # 不能用正午：例如美东 5/11 12:00 对应北京已是 5/12 00:00，会把财报日错推一天。
        dt_et = datetime.combine(et_date, time(0, 0), tzinfo=ET_TZ)
    else:
        dt_et = datetime.combine(et_date, event_time_et, tzinfo=ET_TZ)
    dt_bj = dt_et.astimezone(BJ_TZ)

    return EarningsEvent(
        symbol=symbol,
        report_date_et=report_date_et,
        session_cn=session_cn,
        report_date_bj=dt_bj.strftime("%Y-%m-%d"),
        event_time_bj=(
            dt_bj.strftime("%H:%M") if event_time_et is not None else ""
        ),
        bj_time_hint=_build_bj_time_hint(session_cn, dt_bj),
        eps_estimate=_fmt_number(row.get("epsEstimate")),
        revenue_estimate=_fmt_revenue(row.get("revenueEstimate")),
    )


def _build_message(events: list[EarningsEvent]) -> str:
    today_bj = datetime.now(BJ_TZ).strftime("%Y-%m-%d")
    lines = [f"【美股财报提醒】北京时间 {today_bj}", ""]
    for _, item in events:
        # `bj_time_hint` 已含完整展示：如 `2026-05-11 21:30前`、纯日期、或 `2026-05-12 04:00后`
        bj_time_label = (item.bj_time_hint or "").strip()
        if not bj_time_label:
            parts = [item.report_date_bj]
            et_t = (item.event_time_bj or "").strip()
            if et_t:
                parts.append(et_t)
            bj_time_label = " ".join(parts)
        lines.append(
            f"- {item.symbol} | 北京时间: {bj_time_label}"
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


def _push_webhook(
    webhook_url: str,
    events: list[EarningsEvent],
    message: str,
    *,
    username: str = "财报提醒",
) -> None:
    # Whop feed webhook commonly accepts `content` (and optional `username`).
    # Keep backward-compatible payloads as fallback for other webhook providers.
    candidate_payloads = [
        {"content": message, "username": username},
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
        dedupe_webhooks = _optional_bool("DEDUPE_WEBHOOKS", True)
    except ValueError as exc:
        print(str(exc))
        return 2

    watchlist = _parse_watchlist(watchlist_raw)
    if not watchlist:
        print("EARNINGS_WHITELIST 为空, 无需处理")
        return 0

    now_et_dt = datetime.now(ET_TZ)
    event_name = os.getenv("GITHUB_EVENT_NAME", "").strip()
    is_manual_dispatch = event_name == "workflow_dispatch"
    is_scheduled = event_name == "schedule"

    if premarket_only and not is_manual_dispatch:
        if is_scheduled:
            et_weekday = now_et_dt.weekday()  # Mon=0 ... Sun=6

            # 只在美股工作日尝试执行（避免周末无意义跑）
            if et_weekday >= 5:
                print(
                    f"当前美东时间 {now_et_dt.strftime('%Y-%m-%d %H:%M:%S')} 为周末, 跳过执行 | github_event={event_name}"
                )
                return 0

            # GitHub `schedule` 派发时间可能大幅抖动/跨小时；不要用“固定 UTC 小时”去卡死执行。
            # 同一美东交易日最多成功执行一次：由 `premarket_day_success|et_day=...` 控制（见成功路径写入）。
        elif now_et_dt.hour != 4:
            print(
                f"当前美东时间 {now_et_dt.strftime('%Y-%m-%d %H:%M:%S')}, 非盘前窗口(04:00-04:59 ET), 跳过执行"
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

    state_path = _state_file_path()
    et_day_run = now_et_dt.strftime("%Y-%m-%d")
    if premarket_only and is_scheduled and not is_manual_dispatch:
        state = _load_sent_state(state_path)
        sent_map = state.get("sent", {}) if isinstance(state, dict) else {}
        day_success_key = _schedule_day_success_key(et_day_run)
        if day_success_key in sent_map:
            print(
                f"本交易日盘前已成功执行过一次, 跳过重复运行 | key={day_success_key} | github_event={event_name}"
            )
            return 0

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
        print(
            "未推送原因: 在查询区间内未找到满足提醒偏移的白名单财报事件"
            f" (偏移={reminder_offsets}, 查询区间(美东)={from_date}->{to_date})"
        )
        if premarket_only and is_scheduled and not is_manual_dispatch:
            _mark_schedule_day_success(state_path, et_day_run)
        return 0

    # 二次白名单过滤（发送前双保险）
    before_second_filter = len(matched)
    matched = [x for x in matched if x[1].symbol in watchlist]
    dropped = before_second_filter - len(matched)
    if dropped > 0:
        print(f"二次白名单过滤已丢弃 {dropped} 条非白名单事件")
    if not matched:
        print("二次白名单过滤后无可推送事件")
        if premarket_only and is_scheduled and not is_manual_dispatch:
            _mark_schedule_day_success(state_path, et_day_run)
        return 0

    matched.sort(key=lambda x: (x[0], x[1].report_date_bj, x[1].symbol))

    state = _load_sent_state(state_path) if dedupe_webhooks else {}
    sent_map = state.get("sent", {}) if isinstance(state, dict) else {}

    pending: list[tuple[int, EarningsEvent]] = []
    if dedupe_webhooks:
        for days_until, event in matched:
            key = _event_key(event, days_until)
            if key in sent_map:
                print(f"跳过重复推送: {key}")
                continue
            pending.append((days_until, event))
    else:
        pending = matched

    if not pending:
        print(
            "未推送原因: 本次命中事件均已推送过(去重命中), 为避免重复打扰已跳过 webhook 推送"
        )
        if premarket_only and is_scheduled and not is_manual_dispatch:
            _mark_schedule_day_success(state_path, et_day_run)
        return 0

    message = _build_message(pending)
    print(message)

    if _optional_bool("SKIP_WEBHOOK", False):
        print("SKIP_WEBHOOK=1, 已跳过 webhook 推送（仅本地/调试）")
        return 0

    try:
        _push_webhook(
            webhook_url=webhook_url,
            events=[item[1] for item in pending],
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

    if dedupe_webhooks:
        for days_until, event in pending:
            key = _event_key(event, days_until)
            sent_map[key] = {
                "ts_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        state["sent"] = sent_map
        _save_sent_state(state_path, state)
    if premarket_only and is_scheduled and not is_manual_dispatch:
        _mark_schedule_day_success(state_path, et_day_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
