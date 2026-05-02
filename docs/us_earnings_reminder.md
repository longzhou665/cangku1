# 美股财报日提醒（GitHub Actions）

## 功能说明

- 定时从 Finnhub 财报日历拉取数据
- 只筛选白名单中的美股代码
- 自动换算为北京时间日期
- 标注盘前/盘后/盘中
- 通过 Webhook 推送提醒
- 支持 GitHub `schedule` 抖动：同一美东盘前窗口内多次触发，但会对已推送事件去重
- 支持“每日 webhook 兜底”：若当天没有需要提醒的事件，也会发送一次健康检查消息，确保 webhook 至少成功一次（可关闭）

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
- `PREMARKET_ONLY`：是否仅在美东盘前开始（04:00 ET）执行，默认 `true`
- `DAILY_WEBHOOK_FALLBACK`：是否启用每日 webhook 兜底（无命中事件也去 webhook），默认 `true`
- `DEDUPE_WEBHOOKS`：是否启用推送去重（避免同一事件在同一天重复推送），默认 `true`
- `SENT_STATE_FILE`：去重状态文件路径（可选，默认 `.cache/earnings_sent_state.json`）
- `LOOKAHEAD_DAYS`：向后查询天数，默认 `1`
- `LOOKBACK_DAYS`：向前回看天数，默认 `0`

## 运行方式

- 自动：工作流在每个工作日于 `08/09 UTC` 的 `:00/:15/:30/:45` 触发，脚本会根据当天美东是否夏令时选择正确的一枪，并在美东 `04:00-04:59` 窗口内执行，可自动适配夏令时/冬令时
- 手动：在 GitHub Actions 页面使用 `workflow_dispatch` 触发

## 去重与状态

- 工作流使用 `actions/cache` 持久化 `.cache/earnings_sent_state.json`
- 同一天同一事件只会推送一次（除非关闭 `DEDUPE_WEBHOOKS`）

## 推送内容

推送包含以下信息：

- 股票代码
- 北京时间提示（前/后/左右）
