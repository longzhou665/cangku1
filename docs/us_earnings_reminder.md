# 美股财报日提醒（GitHub Actions）

## 功能说明

- 定时从 Finnhub 财报日历拉取数据
- 只筛选白名单中的美股代码
- 自动换算为北京时间日期
- 标注盘前/盘后/盘中：`bmo`/`amc`/`dmh` 分别按美东 **09:30 / 16:00 / 12:00** 锚点换算为北京时间，推送形如 `2026-05-11 21:30前`、`2026-05-12 04:00后`（盘后常跨北京历日）；`hour` 为空时仅用美东财报日 0:00 锚出 **北京历日期**（无时分、无前/后）
- 通过 Webhook 推送提醒
- 支持 GitHub `schedule` 抖动：`schedule` 触发不再用“固定 UTC 小时”卡死执行；同一美东交易日最多成功跑一次，并对已推送事件去重
- 无推送时仅在 Actions 日志输出原因，不向 webhook 发送健康检查消息（避免打扰）

## 新增文件

- `scripts/us_earnings_reminder.py`
- `.github/workflows/us-earnings-reminder.yml`

## GitHub 配置

在仓库 `Settings -> Secrets and variables -> Actions` 中添加：

### Secrets

- `FINNHUB_API_TOKEN`：Finnhub API Token
- `WEBHOOK_URL`：你的 webhook 地址
- `EARNINGS_WHITELIST`：股票白名单，逗号分隔，例如 `AAPL,MSFT,NVDA,TSLA`

### Variables（可选）

- `REMINDER_OFFSETS`：北京时间提醒偏移天数，逗号分隔，默认 `0,1,7`
- `PREMARKET_ONLY`：是否启用“盘前模式”的门控，默认 `true`
  - 对 GitHub `schedule`：仅限制“美股工作日”，不在脚本里用固定 UTC 小时拒绝执行（避免 schedule 延迟导致整天不跑）
  - 对非 `schedule` 且非 `workflow_dispatch`：仍限制在美东 `04:00-04:59`（保持本地/其它触发方式更克制）
- `DEDUPE_WEBHOOKS`：是否启用推送去重（避免同一事件在同一天重复推送），默认 `true`
- `SENT_STATE_FILE`：去重状态文件路径（可选，默认 `.cache/earnings_sent_state.json`）
- `LOOKAHEAD_DAYS`：向后查询天数，默认 `1`
- `LOOKBACK_DAYS`：向前回看天数，默认 `0`
- `SKIP_WEBHOOK`：设为 `1`/`true` 时只打印待推送正文并**不**调用 webhook（本地核对解析用）

## 运行方式

- 自动：工作流在每个工作日于 `08/09 UTC` 的 `:00/:15/:30/:45` 触发（用于贴近美东早盘，并容忍 GitHub schedule 抖动）
- 脚本侧：`schedule` 触发只要落在美股工作日就会尝试执行；同一美东交易日成功执行后会写入 `premarket_day_success|et_day=...`，避免同一天因多 cron 重复跑
- 手动：在 GitHub Actions 页面使用 `workflow_dispatch` 触发

## 去重与状态

- 工作流使用 `actions/cache` 持久化 `.cache/earnings_sent_state.json`
- 同一天同一事件只会推送一次（除非关闭 `DEDUPE_WEBHOOKS`）

## 说明

- Finnhub 返回的 `hour` 可能为 JSON `null`（Python `None`）。脚本会按「未提供时段」处理；若接口实际给出了 `bmo`/`amc`/`dmh`，会正常拼接北京时间与前/后。

## 推送内容

推送包含以下信息：

- 股票代码
- 北京时间提示：有 `hour` 时为「日期 + 时分 + 前/后/左右」；无 `hour` 时仅为日期
