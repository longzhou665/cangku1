# 文字对话式 AI — 标准交付物总索引

> 面向客户验收与内部交接。实施时复制本目录为项目空间，替换「星河助手」为真实产品名。

| 编号 | 交付物 | 路径 | 验收标志 |
|------|--------|------|----------|
| D01 | 质量目标与成功标准 | [01-success-criteria.md](./01-success-criteria.md) | 双方签字确认「过/不过」 |
| D02 | 打分器与断言说明 | [02-scorer-and-assertions.md](./02-scorer-and-assertions.md) | 指标列表与判定规则无歧义 |
| D03 | 评测用例集 | `../cases/**` + 本说明中的覆盖表 | 四类覆盖达标，数量符合合同 |
| D04 | 评测运行配置 | `../promptfooconfig.yaml`、`../providers/`、`../prompts/` | 可一键复跑 |
| D05 | CI 门禁 | `../.github/workflows/chat-ai-eval.yml` | PR/主分支跑通且失败可拦 |
| D06 | 基线报告 | [04-baseline-report-template.md](./04-baseline-report-template.md) + `../reports/` | 含通过率与失败样例 |
| D07 | 失败归因手册 | [03-failure-playbook.md](./03-failure-playbook.md) | Top 失败模式可指导修复 |
| D08 | 运行与交接手册 | [../README.md](../README.md) + [06-client-handoff.md](./06-client-handoff.md) | 客户能独立加用例并回归 |
| D09 | 验收清单 | [05-acceptance-checklist.md](./05-acceptance-checklist.md) | 勾选后关闭实施包 |

## 用例覆盖（本模板默认）

| 类别 | 文件 | 条数（约） | 目的 |
|------|------|------------|------|
| 冒烟 | `cases/smoke.yaml` | 3 | 改配置后的快速门禁 |
| 正常 happy | `cases/happy/faq.yaml` | 6 | 政策 FAQ 正确、不编造 |
| 边界 edge | `cases/edge/ambiguity.yaml` | 5 | 缺信息、易幻觉、隐私 |
| 对抗 adversarial | `cases/adversarial/jailbreak.yaml` | 5 | 越狱、欺诈、隐私窃取 |
| 拒答 refuse | `cases/refuse/out-of-scope.yaml` | 4 | 超范围礼貌拒绝 |
| 多轮 multi-turn | `cases/multi-turn/clarify.yaml` | 3 | 澄清与转人工（简化） |
| **合计** | | **~26** | 入门实施可扩到 40–80 |

合同若约定更多条数：在对应目录追加 YAML，并更新本表与基线报告。

## 推荐客户可见物打包方式

```text
交付包/
  README.md                 # 怎么跑
  docs/                     # D01–D09 文档
  cases/                    # 用例集
  prompts/                  # 系统提示（或对接说明）
  promptfooconfig.yaml
  reports/
    baseline-BL-xxxx.md     # 签字版基线
    latest-raw.json         # 原始跑数（可选脱敏）
```
