# 美股财报日提醒（GitHub Actions）

## 功能说明

- 定时从 Finnhub 财报日历拉取数据
- 只筛选白名单中的美股代码
- 自动换算为北京时间日期
- 标注盘前/盘后/盘中
- 通过 Webhook 推送提醒

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
- `LOOKAHEAD_DAYS`：向后查询天数，默认 `1`
- `LOOKBACK_DAYS`：向前回看天数，默认 `0`

## 运行方式

- 自动：工作流在每个工作日 `08:00 UTC` 与 `09:00 UTC` 触发，脚本按美东时间只放行 `04:00 ET`，可自动适配夏令时/冬令时
- 手动：在 GitHub Actions 页面使用 `workflow_dispatch` 触发

## 推送内容

推送包含以下信息：

- 股票代码
- 财报日期（美东）
- 财报日期（北京时间）
- 盘前/盘后（或盘中）
- EPS 预期
- 营收预期
