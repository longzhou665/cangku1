# 知策评测套件 — 内部知识助手标准交付物

面向**企业内部知识助手**（制度 / IT / HR FAQ）的可回归评测包，并附带**可视化控制台**做全流程操作维护。

示例产品名：**知策**。换成客户助手后，复用同一套用例结构、门禁与控制台。

## 一分钟启动控制台

```bash
cd templates/chat-ai-eval-kit
npm install
npm run console
```

浏览器打开：**http://127.0.0.1:8787**

页面包含：概览 → 用例 → 评测 → 报告 → 配置 → **操作说明**。

开发热更新：

```bash
npm run console:dev
# UI http://127.0.0.1:5173  |  API http://127.0.0.1:8787
```

详细步骤见 [docs/ops-guide.md](./docs/ops-guide.md)（控制台内「操作说明」页同源）。

## 交付物一览（D01–D09）

见 [docs/DELIVERABLE-INDEX.md](./docs/DELIVERABLE-INDEX.md)。

| 编号 | 内容 |
|------|------|
| D01 | [成功标准](./docs/01-success-criteria.md) |
| D02 | [断言说明](./docs/02-scorer-and-assertions.md) |
| D03 | 用例集 `cases/**`（知识助手场景） |
| D04 | `promptfooconfig.yaml` + 提示词 + mock |
| D05 | CI workflow |
| D06 | 基线报告模板 + `npm run report` |
| D07 | [失败归因](./docs/03-failure-playbook.md) |
| D08 | 本 README + [交接](./docs/06-client-handoff.md) + **控制台操作说明** |
| D09 | [验收清单](./docs/05-acceptance-checklist.md) |
| **控制台** | `npm run console` 全流程可视化维护 |

## 命令行评测（无 UI）

```bash
npm run smoke
npm run eval:ci
npm run report
```

默认 `providers/mock-chat.js`，**无需 API Key**，本地与 CI 均可绿。

## 对接真实内部助手

1. `cp .env.example .env`  
2. 编辑 `promptfooconfig.yaml`：切换为 OpenAI 兼容或 HTTP provider  
3. 将 `prompts/system.md` 换成客户系统提示 / 知识库摘要  
4. 在控制台「配置」保存后跑冒烟 → 全量  

## 目录

```text
chat-ai-eval-kit/
├── console/          # 可视化前端（Vite React）
├── server/           # 控制台 API
├── cases/            # 用例
├── docs/             # D01–D09 + ops-guide
├── prompts/
├── providers/
├── reports/
└── promptfooconfig.yaml
```

## 验收演示（20 分钟）

1. 打开控制台概览，说明四类覆盖  
2. 「评测」跑全量，展示通过率  
3. 在「用例」临时加严一条对抗断言或改坏提示词 → 再跑变红  
4. 恢复后变绿  
5. 「报告」讲解失败样例与归因；「操作说明」交给客户接口人  
