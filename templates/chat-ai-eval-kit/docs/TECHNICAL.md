# 知策评测框架 — 详细技术说明

面向实施工程师 / 测开。说明本套件的架构、组件、数据流、配置协议、API 与扩展方式。

---

## 1. 定位与边界

| 项 | 说明 |
|----|------|
| 目标产品 | 企业内部**文字对话知识助手**（制度 / HR / IT FAQ） |
| 框架角色 | 可回归的**离线评测与质量门禁**，不是线上网关、不是 RAG 引擎本身 |
| 评测引擎 | [promptfoo](https://www.promptfoo.dev/)（用例、断言、并发、结果落盘） |
| 运维界面 | 自研控制台（Express API + Vite/React）读写用例/提示词并触发评测 |
| 默认模型 | `providers/mock-chat.js`（确定性 mock，无 Key，可 CI） |
| 不负责 | 模型训练、向量库、生产流量限流、OA 业务功能开发 |

---

## 2. 总体架构

```text
┌─────────────────────────────────────────────────────────┐
│  控制台 UI (console/)  Vite + React                      │
│  概览 / 用例 / 评测 / 报告 / 配置 / 文档                  │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP JSON
┌───────────────────────────▼─────────────────────────────┐
│  控制台 API (server/index.mjs)  Express :8787            │
│  读写 cases/*.yaml、prompts/system.md、触发评测、汇总报告 │
└───────────────────────────┬─────────────────────────────┘
                            │ npx promptfoo eval
┌───────────────────────────▼─────────────────────────────┐
│  promptfoo                                               │
│  promptfooconfig.yaml → prompt + provider + tests/assert │
│  输出 reports/latest-raw.json                            │
└───────────────┬─────────────────────────┬───────────────┘
                │                         │
     ┌──────────▼──────────┐   ┌──────────▼──────────┐
     │ mock-chat.js / 真实  │   │ scripts/render-*.mjs │
     │ OpenAI/HTTP Provider │   │ → baseline Markdown │
     └─────────────────────┘   └─────────────────────┘
```

**CI 路径**：GitHub Actions 直接 `npm run eval:ci`，不依赖控制台进程。

---

## 3. 目录与模块职责

```text
chat-ai-eval-kit/
├── promptfooconfig.yaml     # 评测入口：prompt、provider、tests、全局断言
├── prompts/
│   ├── system.md            # 系统提示（含知识库摘要），变量 {{product_name}} {{query}}
│   └── judge-rubric.md      # 可选 LLM-as-judge 量表
├── providers/
│   └── mock-chat.js         # 自定义 Provider（CommonJS class + callApi）
├── cases/                   # 用例 YAML（按类别分子目录）
│   ├── smoke.yaml
│   ├── happy/faq.yaml
│   ├── edge/ambiguity.yaml
│   ├── adversarial/jailbreak.yaml
│   ├── refuse/out-of-scope.yaml
│   └── multi-turn/clarify.yaml
├── server/index.mjs         # 控制台后端
├── console/                 # 控制台前端源码；构建产物 console/dist
├── scripts/
│   ├── run-eval.sh
│   └── render-baseline-report.mjs
├── reports/                 # latest-raw.json、baseline-*.md（多数 gitignore）
└── docs/                    # 本技术说明、使用手册、D01–D09
```

| 模块 | 技术栈 | 职责 |
|------|--------|------|
| 评测核心 | Node ≥18、promptfoo | 跑用例、断言、写 raw JSON |
| 控制台 API | Express、js-yaml、cors | CRUD 用例、改提示词、异步评测任务 |
| 控制台 UI | React 19、Vite 6 | 运维界面；生产由 API 托管 `console/dist` |
| 报告 | 纯 Node 脚本 | 从 raw JSON 生成基线 Markdown 草稿 |

---

## 4. 评测数据流

1. **组装 Prompt**  
   `prompts/system.md` 中 `{{product_name}}`、`{{query}}` 由用例 `vars` 与 `defaultTest.vars` 填充。

2. **调用 Provider**  
   - 默认：`file://providers/mock-chat.js` → `callApi(prompt)` → `{ output }`  
   - 真实：OpenAI 兼容 chat 或 HTTP provider（见配置节）

3. **断言**  
   先跑 `defaultTest.assert`（全局卫生），再跑该用例 `assert[]`。任一失败则该用例失败。

4. **落盘**  
   `outputPath: reports/latest-raw.json`；控制台解析 `results.results[]` 汇总通过率。

5. **报告草稿**  
   `node scripts/render-baseline-report.mjs` 读取 raw，写出 `reports/baseline-*.md`。

### 4.1 冒烟 vs 全量

| 模式 | 过滤 | 用途 |
|------|------|------|
| smoke | `--filter-metadata suite=smoke` | 改提示词后的快速门禁 |
| full | 配置中全部 `tests` 文件 | 基线 / CI / 验收 |

---

## 5. 用例协议（YAML）

单文件为**数组**，每项：

```yaml
- description: happy-vpn          # 唯一短 ID；控制台主键一部分
  metadata:
    category: happy               # happy|edge|adversarial|refuse|multi-turn|smoke
    risk: medium                  # critical|high|medium|low
    suite: smoke                  # 可选；冒烟过滤用
  vars:
    query: 公司电脑怎么申请 VPN？
  assert:
    - type: contains
      value: 办公设备
    - type: not-contains
      value: 随便装一个就行
```

**控制台用例 ID**：`{相对路径}#{description}`，例如 `happy/faq.yaml#happy-vpn`。

### 5.1 断言类型（本套件常用）

| type | value | 含义 |
|------|-------|------|
| `contains` | string | 输出必须包含 |
| `contains-any` | string[] | 至少包含其一 |
| `not-contains` | string | 禁止包含 |
| `javascript` | 表达式字符串 | 可访问 `output`，返回 truthy 为过 |

全局断言见 `promptfooconfig.yaml` → `defaultTest.assert`（非空、长度、隐私正则）。

更多类型以 promptfoo 官方 Assert 文档为准；扩展后请同步改 D02。

### 5.2 风险与门禁建议

| risk | 建议策略 |
|------|----------|
| critical | 任一失败 → 门禁红（安全/泄密） |
| high | 计入总通过率；基线不建议带失败放量 |
| medium / low | 计入总通过率；可合同约定阈值 |

---

## 6. Provider 协议

自定义 Provider（mock）需导出 **class**，实现：

```js
class MockChatProvider {
  id() { return 'mock-chat'; }
  async callApi(prompt /*, context */) {
    return { output: '...', tokenUsage: { total: 0, prompt: 0, completion: 0 } };
  }
}
module.exports = MockChatProvider;
```

promptfoo 通过 `file://providers/mock-chat.js` 加载。请保持 **CommonJS**（`module.exports`），避免与 promptfoo 加载器冲突。

### 6.1 切换真实内部助手

编辑 `promptfooconfig.yaml`，例如：

```yaml
providers:
  - id: openai:chat:gpt-4o-mini
    # 需 OPENAI_API_KEY；可用 OPENAI_API_BASE 指到兼容网关
```

或 HTTP：

```yaml
providers:
  - id: https
    config:
      url: https://api.example.com/v1/chat
      method: POST
      headers:
        Authorization: "Bearer {{env.CLIENT_API_TOKEN}}"
        Content-Type: application/json
      body:
        message: "{{query}}"
      transformResponse: "json.reply"
```

注意：若系统提示已在服务端配置，可将 `prompts` 改为仅含 `{{query}}` 的短模板，避免双重 system。

---

## 7. 控制台 API 参考

Base：`http://127.0.0.1:8787`（`CONSOLE_PORT` 可改）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 探活 |
| GET | `/api/overview` | 用例规模、分类计数、最近一次汇总 |
| GET | `/api/cases` | 全部用例列表 |
| POST | `/api/cases` | 新建；body: description, category, risk, query, asserts, file? |
| PUT | `/api/cases/:id` | 更新；`:id` 需 `encodeURIComponent` |
| DELETE | `/api/cases/:id` | 删除 |
| GET | `/api/prompt` | 读 `prompts/system.md` |
| PUT | `/api/prompt` | body: `{ content }` |
| GET | `/api/guide` | 操作说明 Markdown（兼容） |
| GET | `/api/docs/:name` | 读 `docs/{name}.md`（白名单） |
| GET | `/api/docs` | 文档目录列表 |
| GET | `/api/report/latest` | 解析 latest-raw 的汇总 |
| POST | `/api/report/render` | 生成 baseline Markdown |
| POST | `/api/eval` | body: `{ mode: "smoke"\|"full" }` → `{ jobId }` |
| GET | `/api/eval/:jobId` | 任务状态与 summary |

### 7.1 评测任务状态机

`running` → `done`（含有失败用例时仍可能 `done`，因 promptfoo 非零退出会被捕获并读 raw）或 `error`（无结果文件）。

任务存在**进程内 Map**，重启 API 后历史 job 丢失；持久结果以 `reports/latest-raw.json` 为准。

### 7.2 安全注意

- 路径禁止 `..`；用例文件限制在 `cases/` 下  
- 控制台默认绑 `127.0.0.1`，勿直接对公网暴露  
- 不在仓库提交 `.env`、客户真实日志与密钥  

---

## 8. 前端说明

| 项 | 值 |
|----|-----|
| 入口 | `console/index.html` → `src/main.jsx` |
| 构建 | `npm run console:build` → `console/dist` |
| 开发 | `npm run console:dev`：API 8787 + Vite 5173（`/api` 代理） |
| 路由 | 单页内状态切换（无 React Router） |
| 接口封装 | `console/src/api.js` |

生产模式：`npm run console` = build + `node server/index.mjs`，由 Express `express.static(console/dist)` 托管。

---

## 9. NPM 脚本

| 脚本 | 作用 |
|------|------|
| `npm run smoke` | 冒烟评测 |
| `npm run eval` / `eval:ci` | 全量（ci 禁用 cache） |
| `npm run report` | 渲染基线草稿 |
| `npm run console` | 构建并启动控制台 |
| `npm run console:dev` | 前后端热更联调 |
| `npm run console:build` | 仅构建前端 |
| `npm run console:api` | 仅 API（需已 build 才有完整 UI） |

---

## 10. CI

仓库根 `.github/workflows/chat-ai-eval.yml`：

- 触发：`templates/chat-ai-eval-kit/**` 变更  
- 步骤：`npm install` → `eval:ci` → `report` → 上传 `reports/` artifact  
- Provider：mock（无密钥）

客户仓可复制 kit 内 `.github/workflows/chat-ai-eval.yml`，按路径调整 `working-directory`。

---

## 11. 扩展指南

| 需求 | 做法 |
|------|------|
| 加业务用例 | 控制台「用例」或编辑 `cases/**/*.yaml` |
| 改制度摘要 | 「配置」或 `prompts/system.md` |
| 新类别目录 | 新建 yaml，并在 `promptfooconfig.yaml` 的 `tests` 增加 `file://...` |
| LLM-as-judge | 用例 assert 使用 promptfoo model-graded 类型；量表见 `judge-rubric.md` |
| 真实多轮 | Provider 改为会话 API；`vars` 传 history；断言针对最终轮 |
| 多环境 | 多份 config 或 env 切换 provider；报告用 `EVAL_BASELINE_ID` 区分 |
| 换 UI 文案 | 改 `console/src/App.jsx` 后重新 `console:build` |

---

## 12. 依赖与运行环境

- Node.js **≥ 18**（推荐 20）  
- 主要依赖：`promptfoo`、`express`、`js-yaml`、`react`、`vite`  
- 无 Docker 要求；可在内网离线机使用 mock  

版本以 `package.json` / `package-lock.json` 为准。

---

## 13. 相关文档

| 文档 | 内容 |
|------|------|
| [USER-GUIDE.md](./USER-GUIDE.md) | 使用说明（业务/质量同学） |
| [ops-guide.md](./ops-guide.md) | 控制台短版操作说明（内嵌页同源可切换） |
| [02-scorer-and-assertions.md](./02-scorer-and-assertions.md) | 断言与风险策略 |
| [01-success-criteria.md](./01-success-criteria.md) | 过/不过与门槛 |
| [DELIVERABLE-INDEX.md](./DELIVERABLE-INDEX.md) | 交付物总表 |
