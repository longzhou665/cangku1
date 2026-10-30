#!/usr/bin/env node
/**
 * 知策评测控制台 API + 静态资源服务
 * 默认 http://127.0.0.1:8787
 */
import cors from 'cors';
import { execFile } from 'node:child_process';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import yaml from 'js-yaml';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CASES_DIR = path.join(ROOT, 'cases');
const PROMPT_PATH = path.join(ROOT, 'prompts', 'system.md');
const DOCS_DIR = path.join(ROOT, 'docs');
const GUIDE_PATH = path.join(DOCS_DIR, 'ops-guide.md');
const RAW_REPORT = path.join(ROOT, 'reports', 'latest-raw.json');
const PORT = Number(process.env.CONSOLE_PORT || 8787);

/** 控制台可展示的文档白名单（不含路径穿越） */
const DOC_CATALOG = [
  {
    id: 'USER-GUIDE',
    title: '使用说明',
    file: 'USER-GUIDE.md',
    audience: '质量 / 业务',
  },
  {
    id: 'TECHNICAL',
    title: '技术说明',
    file: 'TECHNICAL.md',
    audience: '实施 / 测开',
  },
  {
    id: 'ops-guide',
    title: '控制台速查',
    file: 'ops-guide.md',
    audience: '日常操作',
  },
  {
    id: 'DELIVERABLE-INDEX',
    title: '交付物索引',
    file: 'DELIVERABLE-INDEX.md',
    audience: '验收',
  },
  {
    id: '01-success-criteria',
    title: '成功标准 (D01)',
    file: '01-success-criteria.md',
    audience: '验收',
  },
  {
    id: '02-scorer-and-assertions',
    title: '断言说明 (D02)',
    file: '02-scorer-and-assertions.md',
    audience: '质量',
  },
  {
    id: '03-failure-playbook',
    title: '失败归因 (D07)',
    file: '03-failure-playbook.md',
    audience: '质量',
  },
];

const jobs = new Map();

async function walkYamlFiles(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const ent of entries) {
    const rel = path.join(base, ent.name);
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      files.push(...(await walkYamlFiles(abs, rel)));
    } else if (ent.name.endsWith('.yaml') || ent.name.endsWith('.yml')) {
      files.push(rel.replace(/\\/g, '/'));
    }
  }
  return files.sort();
}

function normalizeAsserts(asserts = []) {
  return asserts.map((a) => {
    if (a.type === 'contains-any' && Array.isArray(a.value)) {
      return { type: a.type, value: a.value };
    }
    if (typeof a.value === 'string') {
      return { type: a.type, value: a.value };
    }
    return { type: a.type || 'contains', value: String(a.value ?? '') };
  });
}

async function loadAllCases() {
  const files = await walkYamlFiles(CASES_DIR);
  const cases = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(CASES_DIR, file), 'utf8');
    const list = yaml.load(raw) || [];
    if (!Array.isArray(list)) continue;
    list.forEach((item, index) => {
      const description = item.description || `case-${index}`;
      cases.push({
        id: `${file}#${description}`,
        file,
        index,
        description,
        category: item.metadata?.category || 'unknown',
        suite: item.metadata?.suite || null,
        risk: item.metadata?.risk || 'medium',
        query: item.vars?.query || '',
        product_name: item.vars?.product_name,
        asserts: normalizeAsserts(item.assert || []),
        raw: item,
      });
    });
  }
  return cases;
}

async function writeCasesFile(file, casesForFile) {
  const abs = path.join(CASES_DIR, file);
  const dump = yaml.dump(casesForFile, {
    lineWidth: 100,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, dump, 'utf8');
}

function parseRawReport(raw) {
  const rows = raw?.results?.results || [];
  const total = rows.length;
  let pass = 0;
  const byCat = {};
  const failures = [];
  for (const row of rows) {
    const ok = !!row.success;
    if (ok) pass += 1;
    const cat =
      row.testCase?.metadata?.category ||
      row.metadata?.category ||
      'unknown';
    byCat[cat] ??= { total: 0, pass: 0 };
    byCat[cat].total += 1;
    if (ok) byCat[cat].pass += 1;
    if (!ok) {
      failures.push({
        description: row.testCase?.description || '',
        category: cat,
        risk: row.testCase?.metadata?.risk || 'unset',
        query: row.testCase?.vars?.query || '',
        output: row.response?.output || row.output || '',
      });
    }
  }
  return {
    total,
    pass,
    fail: total - pass,
    rate: total ? Number(((pass / total) * 100).toFixed(1)) : 0,
    criticalFails: failures.filter((f) => f.risk === 'critical').length,
    byCategory: byCat,
    failures,
    evalId: raw?.evalId || null,
    generatedAt: raw?.results?.timestamp || null,
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, product: '知策评测控制台', root: ROOT });
});

app.get('/api/overview', async (_req, res) => {
  try {
    const cases = await loadAllCases();
    const byCategory = {};
    for (const c of cases) {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    }
    let lastRun = null;
    try {
      const raw = JSON.parse(await fs.readFile(RAW_REPORT, 'utf8'));
      lastRun = parseRawReport(raw);
    } catch {
      /* no report yet */
    }
    res.json({
      productName: '知策',
      caseCount: cases.length,
      byCategory,
      lastRun,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/cases', async (_req, res) => {
  try {
    res.json({ cases: await loadAllCases() });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.put('/api/cases/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const [file, description] = id.split('#');
    if (!file || !description) {
      return res.status(400).json({ error: '无效 id' });
    }
    if (file.includes('..')) {
      return res.status(400).json({ error: '非法路径' });
    }
    const abs = path.join(CASES_DIR, file);
    const list = yaml.load(await fs.readFile(abs, 'utf8')) || [];
    const idx = list.findIndex((c) => c.description === description);
    if (idx < 0) return res.status(404).json({ error: '用例不存在' });

    const body = req.body || {};
    const nextDesc = (body.description || description).trim();
    list[idx] = {
      description: nextDesc,
      metadata: {
        ...(list[idx].metadata || {}),
        category: body.category || list[idx].metadata?.category || 'happy',
        risk: body.risk || list[idx].metadata?.risk || 'medium',
        ...(body.suite || list[idx].metadata?.suite
          ? { suite: body.suite || list[idx].metadata?.suite }
          : {}),
      },
      vars: {
        ...(list[idx].vars || {}),
        query: body.query ?? list[idx].vars?.query ?? '',
      },
      assert: Array.isArray(body.asserts) ? body.asserts : list[idx].assert || [],
    };
    await writeCasesFile(file, list);
    res.json({ ok: true, id: `${file}#${nextDesc}` });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/cases', async (req, res) => {
  try {
    const body = req.body || {};
    const category = body.category || 'happy';
    const fileMap = {
      happy: 'happy/faq.yaml',
      edge: 'edge/ambiguity.yaml',
      adversarial: 'adversarial/jailbreak.yaml',
      refuse: 'refuse/out-of-scope.yaml',
      'multi-turn': 'multi-turn/clarify.yaml',
      smoke: 'smoke.yaml',
    };
    const file = body.file || fileMap[category] || 'happy/faq.yaml';
    if (file.includes('..')) {
      return res.status(400).json({ error: '非法路径' });
    }
    const description = (body.description || `case-${Date.now()}`).trim();
    const abs = path.join(CASES_DIR, file);
    let list = [];
    try {
      list = yaml.load(await fs.readFile(abs, 'utf8')) || [];
    } catch {
      list = [];
    }
    if (!Array.isArray(list)) list = [];
    if (list.some((c) => c.description === description)) {
      return res.status(409).json({ error: 'description 已存在' });
    }
    list.push({
      description,
      metadata: {
        category,
        risk: body.risk || 'medium',
        ...(body.suite ? { suite: body.suite } : {}),
      },
      vars: { query: body.query || '' },
      assert: Array.isArray(body.asserts)
        ? body.asserts
        : [
            { type: 'contains', value: '知识' },
            { type: 'javascript', value: 'output.length > 0' },
          ],
    });
    await writeCasesFile(file, list);
    res.json({ ok: true, id: `${file}#${description}` });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.delete('/api/cases/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const [file, description] = id.split('#');
    if (!file || file.includes('..')) {
      return res.status(400).json({ error: '非法 id' });
    }
    const abs = path.join(CASES_DIR, file);
    const list = yaml.load(await fs.readFile(abs, 'utf8')) || [];
    const next = list.filter((c) => c.description !== description);
    if (next.length === list.length) {
      return res.status(404).json({ error: '用例不存在' });
    }
    await writeCasesFile(file, next);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/prompt', async (_req, res) => {
  try {
    const content = await fs.readFile(PROMPT_PATH, 'utf8');
    res.json({ path: 'prompts/system.md', content });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.put('/api/prompt', async (req, res) => {
  try {
    const content = req.body?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content 不能为空' });
    }
    await fs.writeFile(PROMPT_PATH, content, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/guide', async (_req, res) => {
  try {
    const content = await fs.readFile(GUIDE_PATH, 'utf8');
    res.type('text/markdown').send(content);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/docs', (_req, res) => {
  res.json({ docs: DOC_CATALOG });
});

app.get('/api/docs/:id', async (req, res) => {
  try {
    const entry = DOC_CATALOG.find((d) => d.id === req.params.id);
    if (!entry) {
      return res.status(404).json({ error: '文档不存在' });
    }
    const abs = path.join(DOCS_DIR, entry.file);
    if (!abs.startsWith(DOCS_DIR)) {
      return res.status(400).json({ error: '非法路径' });
    }
    const content = await fs.readFile(abs, 'utf8');
    res.json({ ...entry, content });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/report/latest', async (_req, res) => {
  try {
    const raw = JSON.parse(await fs.readFile(RAW_REPORT, 'utf8'));
    res.json({ rawSummary: parseRawReport(raw), hasRaw: true });
  } catch {
    res.json({ rawSummary: null, hasRaw: false });
  }
});

app.post('/api/report/render', async (_req, res) => {
  try {
    await execFileAsync('node', ['scripts/render-baseline-report.mjs'], {
      cwd: ROOT,
      env: process.env,
      timeout: 60_000,
    });
    const latest = await fs.readFile(
      path.join(ROOT, 'reports', 'baseline-latest.md'),
      'utf8',
    );
    res.json({ ok: true, markdown: latest });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/eval', async (req, res) => {
  const mode = req.body?.mode === 'smoke' ? 'smoke' : 'full';
  const jobId = `job-${Date.now()}`;
  const job = {
    id: jobId,
    mode,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    summary: null,
  };
  jobs.set(jobId, job);
  res.json({ jobId, status: 'running' });

  const args =
    mode === 'smoke'
      ? [
          'promptfoo',
          'eval',
          '-c',
          'promptfooconfig.yaml',
          '--filter-metadata',
          'suite=smoke',
          '--no-cache',
          '-j',
          '4',
        ]
      : [
          'promptfoo',
          'eval',
          '-c',
          'promptfooconfig.yaml',
          '--no-cache',
          '-j',
          '4',
        ];

  try {
    await execFileAsync('npx', args, {
      cwd: ROOT,
      env: process.env,
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    try {
      await execFileAsync('node', ['scripts/render-baseline-report.mjs'], {
        cwd: ROOT,
        timeout: 60_000,
      });
    } catch {
      /* report optional */
    }
    const raw = JSON.parse(await fs.readFile(RAW_REPORT, 'utf8'));
    job.status = 'done';
    job.finishedAt = new Date().toISOString();
    job.summary = parseRawReport(raw);
  } catch (err) {
    // promptfoo exits non-zero on failed asserts — still may have written report
    try {
      const raw = JSON.parse(await fs.readFile(RAW_REPORT, 'utf8'));
      job.status = 'done';
      job.finishedAt = new Date().toISOString();
      job.summary = parseRawReport(raw);
      job.note = '评测完成（存在失败用例或非零退出）';
    } catch {
      job.status = 'error';
      job.finishedAt = new Date().toISOString();
      job.error = String(err.message || err);
    }
  }
});

app.get('/api/eval/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: '任务不存在' });
  res.json(job);
});

const distDir = path.join(ROOT, 'console', 'dist');
app.use(express.static(distDir));
app.get('*', async (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  try {
    await fs.access(path.join(distDir, 'index.html'));
    res.sendFile(path.join(distDir, 'index.html'));
  } catch {
    res
      .status(503)
      .type('html')
      .send(
        `<h1>控制台前端尚未构建</h1><p>请执行 <code>npm run console:build</code> 后重试，或使用 <code>npm run console:dev</code>。</p>`,
      );
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`知策评测控制台 http://127.0.0.1:${PORT}`);
});
