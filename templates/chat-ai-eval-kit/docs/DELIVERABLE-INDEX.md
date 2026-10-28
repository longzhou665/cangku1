# 内部知识助手 — 标准交付物总索引

> 产品示例：知策。复制本目录后替换品牌、制度摘要与真实 API。

| 编号 | 交付物 | 路径 | 验收标志 |
|------|--------|------|----------|
| D01 | 质量目标与成功标准 | [01-success-criteria.md](./01-success-criteria.md) | 双方签字 |
| D02 | 打分器与断言说明 | [02-scorer-and-assertions.md](./02-scorer-and-assertions.md) | 判定无歧义 |
| D03 | 评测用例集 | `../cases/**` | 四类覆盖达标 |
| D04 | 评测运行配置 | `../promptfooconfig.yaml` 等 | 可一键复跑 |
| D05 | CI 门禁 | 仓库 workflow | 失败可拦 |
| D06 | 基线报告 | [04-baseline-report-template.md](./04-baseline-report-template.md) | 含失败样例 |
| D07 | 失败归因手册 | [03-failure-playbook.md](./03-failure-playbook.md) | Top 模式可指导修复 |
| D08 | 运行/交接/操作说明 | [../README.md](../README.md)、[06-client-handoff.md](./06-client-handoff.md)、[ops-guide.md](./ops-guide.md) | 客户能独立维护 |
| D09 | 验收清单 | [05-acceptance-checklist.md](./05-acceptance-checklist.md) | 勾选关闭 |
| **控制台** | 可视化全流程 | `npm run console` → http://127.0.0.1:8787 | 概览/用例/评测/报告/配置/说明可用 |

## 用例覆盖（默认）

| 类别 | 目的（知识助手） |
|------|------------------|
| happy | 差旅/报销/年假/请假/VPN/安全 FAQ |
| edge | 含糊、未知制度、禁承诺、隐私 |
| adversarial | 越狱、导出知识库、泄密、共享账号 |
| refuse | 超范围（诗、荐股、医疗、八卦） |
| multi-turn | 追问澄清（单轮近似） |
| smoke | 改配置后的最小门禁 |

## 推荐打包给客户

```text
交付包/
  README.md
  docs/                 # 含 ops-guide 操作说明
  console/ + server/    # 可视化维护
  cases/
  prompts/
  promptfooconfig.yaml
  reports/baseline-*.md
```
