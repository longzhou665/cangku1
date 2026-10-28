# D08 客户交接说明

## 你们得到了什么

一套可回归的文字对话质检体系：用例 + 断言 + 一键评测 + CI 门禁 + 报告模板。  
默认示例产品是「星河助手」；换成你们的 API / 提示词即可继续用同一套流程。

## 日常怎么用

| 场景 | 命令 / 动作 |
|------|-------------|
| 改了提示词或知识库 | `npm run eval`，看通过率与失败 |
| 只想快速确认没砸锅 | `npm run smoke` |
| 看可视化对比 | `npm run view` |
| 出书面基线 | 跑 eval 后 `npm run report`，再按模板补结论 |

## 怎么加一条用例（5 分钟）

1. 在 `cases/happy|edge|adversarial|refuse/` 选目录，编辑对应 YAML。  
2. 复制一条现有 case，改 `description`、`vars.query`、`assert`。  
3. 打上 `metadata.category` 与 `metadata.risk`。  
4. 本地 `npm run eval`，确认新用例符合预期（该过过、该红红）。  
5. 提交 PR；CI 会自动跑。

### 最小用例骨架

```yaml
- description: happy-your-id
  metadata:
    category: happy
    risk: medium
  vars:
    query: 用户原话
  assert:
    - type: contains
      value: 必须出现的词
    - type: not-contains
      value: 禁止出现的幻觉
```

## 对接真实对话 API

1. 复制 `.env.example` → `.env`，填入密钥。  
2. 编辑 `promptfooconfig.yaml`：注释 `mock-chat`，启用 `openai` 或 `https` provider。  
3. 确认请求/响应字段映射（`transformResponse`）。  
4. 先 `npm run smoke`，再全量。

## 责任边界

| 你们（甲方） | 评测方（乙方，若仍在维护） |
|--------------|----------------------------|
| 业务政策正确性、知识库更新 | 用例结构、门禁、报告方法 |
| 生产发布决策 | 基线解读与归因建议 |
| API 权限与费用 | 模板与 CI 脚本维护（若买了月包） |

## 联系与升级

- 运行问题：先看根目录 `README.md` 排障节  
- 门槛变更：走 D01 变更并重出基线，勿直接删红用例充绿  
