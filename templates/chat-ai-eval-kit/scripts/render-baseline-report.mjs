#!/usr/bin/env node
/**
 * 从 promptfoo 原始结果生成基线报告草稿（Markdown）。
 * 人工仍需补「结论摘要 / 归因 / 签字」——机器只填统计与失败列表。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const rawPath = path.join(root, 'reports', 'latest-raw.json');
const outDir = path.join(root, 'reports');

function loadResults() {
  if (!fs.existsSync(rawPath)) {
    console.error(`Missing ${rawPath}. Run: npm run eval`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  // promptfoo may write an array of eval results or an object with results
  if (Array.isArray(raw)) return raw;
  if (raw.results?.results) return raw.results.results;
  if (raw.results) return raw.results;
  return [];
}

function categoryOf(row) {
  return (
    row.testCase?.metadata?.category ||
    row.metadata?.category ||
    row.testCase?.vars?.category ||
    'unknown'
  );
}

function riskOf(row) {
  return row.testCase?.metadata?.risk || row.metadata?.risk || 'unset';
}

function descOf(row) {
  return row.testCase?.description || row.description || '(no description)';
}

function queryOf(row) {
  return row.testCase?.vars?.query || row.vars?.query || '';
}

function outputOf(row) {
  const r = row.response?.output ?? row.output ?? row.responses?.[0]?.output;
  return typeof r === 'string' ? r : JSON.stringify(r ?? '');
}

function passed(row) {
  if (typeof row.success === 'boolean') return row.success;
  if (typeof row.pass === 'boolean') return row.pass;
  if (row.gradingResult) return !!row.gradingResult.pass;
  return false;
}

function main() {
  const rows = loadResults();
  const total = rows.length;
  const passCount = rows.filter(passed).length;
  const failRows = rows.filter((r) => !passed(r));
  const rate = total ? ((passCount / total) * 100).toFixed(1) : '0.0';

  const byCat = {};
  for (const r of rows) {
    const c = categoryOf(r);
    byCat[c] ??= { total: 0, pass: 0 };
    byCat[c].total += 1;
    if (passed(r)) byCat[c].pass += 1;
  }

  const criticalFails = failRows.filter((r) => riskOf(r) === 'critical');
  const stamp = new Date().toISOString().slice(0, 10);
  const product = process.env.EVAL_PRODUCT_NAME || '知策';
  const baselineId = process.env.EVAL_BASELINE_ID || `BL-${stamp.replace(/-/g, '')}-draft`;

  let md = `# 基线报告草稿 — ${product}\n\n`;
  md += `**基线 ID**：\`${baselineId}\`  \n`;
  md += `**生成时间（UTC）**：${new Date().toISOString()}  \n`;
  md += `**原始数据**：\`reports/latest-raw.json\`  \n\n`;
  md += `> 本文件由 \`npm run report\` 自动生成统计段。请复制到正式基线并补齐结论、归因与签字（模板见 docs/04-baseline-report-template.md）。\n\n`;
  md += `## 1. 结论摘要（请人工填写）\n\n`;
  md += `| 项 | 结果 |\n|----|------|\n`;
  md += `| 总用例数 | ${total} |\n`;
  md += `| 通过 / 失败 | ${passCount} / ${total - passCount} |\n`;
  md += `| 总通过率 | ${rate}% |\n`;
  md += `| Critical 失败数 | ${criticalFails.length} |\n`;
  md += `| 是否建议进入放量 | ☐ 是　☐ 否　☐ 有条件 |\n`;
  md += `| 一句话结论 | |\n\n`;

  md += `## 2. 分项通过率\n\n`;
  md += `| 类别 | 总数 | 通过 | 通过率 |\n|------|------|------|--------|\n`;
  for (const [c, s] of Object.entries(byCat).sort()) {
    const pct = s.total ? ((s.pass / s.total) * 100).toFixed(1) : '0.0';
    md += `| ${c} | ${s.total} | ${s.pass} | ${pct}% |\n`;
  }
  md += `\n`;

  md += `## 3. 失败列表\n\n`;
  if (failRows.length === 0) {
    md += `无失败。\n`;
  } else {
    for (const r of failRows) {
      md += `### ${descOf(r)}\n\n`;
      md += `- **类别 / 风险**：${categoryOf(r)} / ${riskOf(r)}\n`;
      md += `- **用户输入**：${queryOf(r)}\n`;
      md += `- **模型输出**：\n\n\`\`\`\n${outputOf(r)}\n\`\`\`\n\n`;
      md += `- **归因模式（Fxx）**：\n`;
      md += `- **建议修复**：\n\n`;
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `baseline-${baselineId}.md`);
  fs.writeFileSync(outFile, md, 'utf8');
  fs.writeFileSync(path.join(outDir, 'baseline-latest.md'), md, 'utf8');
  console.log(`Wrote ${outFile}`);
  console.log(`Wrote ${path.join(outDir, 'baseline-latest.md')}`);
}

main();
