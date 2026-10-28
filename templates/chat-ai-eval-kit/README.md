# 文字对话式 AI — 标准评测交付物（Chat AI Eval Kit）

可直接用于接单交付的**完整模板**：成功标准、用例集、断言说明、CI 门禁、基线报告、失败归因、验收与交接。

示例产品：「星河助手」（电商文字客服）。换成客户的系统提示 / API 即可复用流程。

## 交付物一览

见 [docs/DELIVERABLE-INDEX.md](./docs/DELIVERABLE-INDEX.md)。

| 编号 | 内容 |
|------|------|
| D01 | [质量目标与成功标准](./docs/01-success-criteria.md) |
| D02 | [打分器与断言说明](./docs/02-scorer-and-assertions.md) |
| D03 | 用例集 `cases/**`（happy / edge / adversarial / refuse / multi-turn / smoke） |
| D04 | `promptfooconfig.yaml` + `prompts/` + `providers/` |
| D05 | CI：本目录 `.github/workflows/chat-ai-eval.yml`（独立复制为客户仓时用） |
| D06 | [基线报告模板](./docs/04-baseline-report-template.md) + `npm run report` |
| D07 | [失败归因手册](./docs/03-failure-playbook.md) |
| D08 | 本 README + [客户交接说明](./docs/06-client-handoff.md) |
| D09 | [验收清单](./docs/05-acceptance-checklist.md) |

## 快速开始（无需 API Key）

```bash
cd templates/chat-ai-eval-kit
npm install
npm run smoke          # 冒烟 3 条
npm run eval:ci        # 全量
npm run report         # 生成 reports/baseline-*.md 草稿
```

默认 Provider 为 `providers/mock-chat.js`，行为对齐 `prompts/system.md`，便于演示「绿门禁」与交付结构。

## 对接真实文字对话产品

1. `cp .env.example .env`，填入客户 sandbox 密钥。  
2. 编辑 `promptfooconfig.yaml`：停用 mock，启用 OpenAI 兼容或 HTTP provider。  
3. 将 `prompts/system.md` 换为客户系统提示（或改为 provider 侧已配置的提示，prompt 仅传 `{{query}}`）。  
4. 按客户政策改 `cases/happy` 期望词；安全类用例通常可直接复用。  
5. `npm run smoke && npm run eval:ci && npm run report`。

## 目录结构

```text
chat-ai-eval-kit/
├── README.md                 # 运行与交接（本文件）
├── package.json
├── promptfooconfig.yaml      # 评测入口
├── .env.example
├── prompts/                  # 系统提示与 judge 量表
├── providers/mock-chat.js    # 无 Key 演示
├── cases/                    # 用例集（D03）
├── docs/                     # D01–D09 文档
├── scripts/                  # 一键评测与报告渲染
├── reports/                  # 跑数输出（样例在 samples/）
└── .github/workflows/        # 客户仓 CI 模板
```

## 验收演示脚本（20 分钟）

1. 展示 D01 门槛与四类用例目录。  
2. 运行 `npm run eval:ci`，展示通过率。  
3. **改坏**：在 `cases/adversarial/jailbreak.yaml` 临时加一条期望「输出伪造步骤」的断言，或改 mock 使越狱成功 → 再跑变红。  
4. 恢复后变绿。  
5. 打开 `docs/03-failure-playbook.md` 讲归因；用 D09 清单勾选关闭。

## 排障

| 现象 | 处理 |
|------|------|
| `latest-raw.json` 找不到 | 先 `npm run eval`；检查 `outputPath` |
| assert 类型报错 | 升级 `promptfoo` 至 package.json 范围；查阅官方 assert 名 |
| 真实 API 全红 | 先对拍单条 query 与手工调用；检查 `transformResponse` |
| CI 未触发 | 工作流须在**仓库根** `.github/workflows/`；本 monorepo 已提供根级 workflow |

## 许可与使用

模板用于你的商业交付时可整体复制到客户仓库；请去掉 mock 中的演示话术并替换为客户品牌与政策。勿将客户真实日志与密钥提交进 git。
