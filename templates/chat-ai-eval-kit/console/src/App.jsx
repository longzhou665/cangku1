import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const NAV = [
  { id: 'overview', label: '概览' },
  { id: 'cases', label: '用例' },
  { id: 'eval', label: '评测' },
  { id: 'report', label: '报告' },
  { id: 'config', label: '配置' },
  { id: 'guide', label: '文档' },
];

const CATEGORIES = ['happy', 'edge', 'adversarial', 'refuse', 'multi-turn', 'smoke'];
const RISKS = ['critical', 'high', 'medium', 'low'];

function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}

function simpleMarkdown(md) {
  // lightweight renderer for ops guide (headings, tables, code, paragraphs)
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <pre key={`c-${i}`}>
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      i += 1;
      continue;
    }
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|?\s*-+/)) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!lines[i].match(/^\|?\s*-+/)) rows.push(lines[i]);
        i += 1;
      }
      const parsed = rows.map((r) =>
        r
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim()),
      );
      const [head, ...body] = parsed;
      blocks.push(
        <table key={`t-${i}`}>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <td key={ci}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={`h3-${i}`}>{line.slice(4)}</h3>);
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(<h2 key={`h2-${i}`}>{line.slice(3)}</h2>);
      i += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push(<h1 key={`h1-${i}`}>{line.slice(2)}</h1>);
      i += 1;
      continue;
    }
    if (line.startsWith('---')) {
      blocks.push(<hr key={`hr-${i}`} />);
      i += 1;
      continue;
    }
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const html = line
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    blocks.push(
      <p key={`p-${i}`} dangerouslySetInnerHTML={{ __html: html }} />,
    );
    i += 1;
  }
  return blocks;
}

function Overview({ data, onRefresh }) {
  const last = data?.lastRun;
  return (
    <section>
      <h1 className="page-title">概览</h1>
      <p className="page-desc">
        内部知识助手「知策」的评测健康度。先看通过率与 Critical，再进入用例维护或跑评测。
      </p>
      <div className="row" style={{ marginBottom: 14 }}>
        <button type="button" className="btn" onClick={onRefresh}>
          刷新
        </button>
      </div>
      <div className="grid-stats">
        <div className="stat">
          <div className="label">用例总数</div>
          <div className="value">{data?.caseCount ?? '—'}</div>
        </div>
        <div className={`stat ${last && last.rate >= 90 ? 'ok' : 'warn'}`}>
          <div className="label">最近通过率</div>
          <div className="value">{last ? `${last.rate}%` : '—'}</div>
        </div>
        <div className={`stat ${last?.criticalFails ? 'danger' : 'ok'}`}>
          <div className="label">Critical 失败</div>
          <div className="value">{last ? last.criticalFails : '—'}</div>
        </div>
        <div className="stat">
          <div className="label">最近失败数</div>
          <div className="value">{last ? last.fail : '—'}</div>
        </div>
      </div>
      <div className="panel">
        <h3>按类别分布</h3>
        <div className="row">
          {Object.entries(data?.byCategory || {}).map(([k, v]) => (
            <span className="pill" key={k}>
              {k}: {v}
            </span>
          ))}
        </div>
        {last?.generatedAt && (
          <p className="muted" style={{ marginTop: 12 }}>
            最近评测时间：{last.generatedAt}
          </p>
        )}
      </div>
    </section>
  );
}

function CasesPage({ toast }) {
  const [cases, setCases] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [assertText, setAssertText] = useState('[]');

  const load = async () => {
    const data = await api.cases();
    setCases(data.cases || []);
    if (!selectedId && data.cases?.[0]) {
      selectCase(data.cases[0]);
    }
  };

  useEffect(() => {
    load().catch((e) => toast(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return cases;
    return cases.filter((c) => c.category === filter);
  }, [cases, filter]);

  const selectCase = (c) => {
    setSelectedId(c.id);
    setDraft({ ...c });
    setAssertText(JSON.stringify(c.asserts || [], null, 2));
  };

  const save = async () => {
    if (!draft) return;
    let asserts;
    try {
      asserts = JSON.parse(assertText);
    } catch {
      toast('断言 JSON 格式不正确');
      return;
    }
    const body = {
      description: draft.description,
      category: draft.category,
      risk: draft.risk,
      suite: draft.suite || undefined,
      query: draft.query,
      asserts,
    };
    const res = await api.saveCase(selectedId, body);
    toast('已保存用例');
    await load();
    setSelectedId(res.id);
  };

  const create = async () => {
    const description = `happy-new-${Date.now().toString().slice(-5)}`;
    const res = await api.createCase({
      category: filter === 'all' ? 'happy' : filter,
      description,
      risk: 'medium',
      query: '请补充员工原话',
      asserts: [
        { type: 'contains', value: '知识' },
        { type: 'javascript', value: 'output.length > 0' },
      ],
    });
    toast('已新建用例');
    await load();
    const created = (await api.cases()).cases.find((c) => c.id === res.id);
    if (created) selectCase(created);
  };

  const remove = async () => {
    if (!selectedId) return;
    if (!window.confirm('确认删除该用例？不可恢复。')) return;
    await api.deleteCase(selectedId);
    toast('已删除');
    setSelectedId(null);
    setDraft(null);
    await load();
  };

  return (
    <section>
      <h1 className="page-title">用例管理</h1>
      <p className="page-desc">
        维护内部知识助手的回归问法与断言。优先收录真实坏 case，并打上风险等级。
      </p>
      <div className="filters">
        <button
          type="button"
          className={`btn ${filter === 'all' ? 'primary' : ''}`}
          onClick={() => setFilter('all')}
        >
          全部
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`btn ${filter === c ? 'primary' : ''}`}
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
        <button type="button" className="btn primary" onClick={() => create().catch((e) => toast(e.message))}>
          新建用例
        </button>
      </div>
      <div className="split">
        <div className="list">
          {filtered.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`list-item ${selectedId === c.id ? 'active' : ''}`}
              onClick={() => selectCase(c)}
            >
              <div>{c.description}</div>
              <div className="meta">
                <span className="pill">{c.category}</span>
                <span className={`pill ${c.risk}`}>{c.risk}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="panel">
          {!draft ? (
            <p className="muted">选择左侧用例进行编辑</p>
          ) : (
            <>
              <div className="field">
                <label>ID（description）</label>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>类别</label>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>风险</label>
                  <select
                    value={draft.risk}
                    onChange={(e) => setDraft({ ...draft, risk: e.target.value })}
                  >
                    {RISKS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>用户问法（query）</label>
                <textarea
                  value={draft.query}
                  onChange={(e) => setDraft({ ...draft, query: e.target.value })}
                />
              </div>
              <div className="field">
                <label>断言 JSON（contains / not-contains / javascript / contains-any）</label>
                <textarea
                  className="code"
                  value={assertText}
                  onChange={(e) => setAssertText(e.target.value)}
                />
              </div>
              <div className="row">
                <button type="button" className="btn primary" onClick={() => save().catch((e) => toast(e.message))}>
                  保存
                </button>
                <button type="button" className="btn danger" onClick={() => remove().catch((e) => toast(e.message))}>
                  删除
                </button>
                <span className="muted">文件：{draft.file}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function EvalPage({ toast, onDone }) {
  const [running, setRunning] = useState(false);
  const [job, setJob] = useState(null);

  const run = async (mode) => {
    setRunning(true);
    setJob(null);
    try {
      const { jobId } = await api.startEval(mode);
      toast(mode === 'smoke' ? '冒烟评测已开始' : '全量评测已开始');
      const poll = async () => {
        const j = await api.getJob(jobId);
        setJob(j);
        if (j.status === 'running') {
          setTimeout(poll, 800);
          return;
        }
        setRunning(false);
        if (j.status === 'error') toast(j.error || '评测失败');
        else {
          toast(`评测完成：通过率 ${j.summary?.rate ?? '—'}%`);
          onDone?.();
        }
      };
      poll();
    } catch (e) {
      setRunning(false);
      toast(e.message);
    }
  };

  return (
    <section>
      <h1 className="page-title">运行评测</h1>
      <p className="page-desc">
        先冒烟后全量。默认 mock 无需 Key；对接真实内部助手后，结果将反映线上质量。
      </p>
      <div className="row" style={{ marginBottom: 16 }}>
        <button type="button" className="btn primary" disabled={running} onClick={() => run('smoke')}>
          运行冒烟
        </button>
        <button type="button" className="btn" disabled={running} onClick={() => run('full')}>
          运行全量
        </button>
        {running && <span className="muted">评测进行中…</span>}
      </div>
      {job && (
        <div className="panel">
          <h3>任务 {job.id}</h3>
          <p>
            状态：<strong>{job.status}</strong>　模式：{job.mode}
          </p>
          {job.summary && (
            <div className="grid-stats">
              <div className="stat ok">
                <div className="label">通过率</div>
                <div className="value">{job.summary.rate}%</div>
              </div>
              <div className="stat">
                <div className="label">通过 / 总数</div>
                <div className="value">
                  {job.summary.pass}/{job.summary.total}
                </div>
              </div>
              <div className={`stat ${job.summary.criticalFails ? 'danger' : 'ok'}`}>
                <div className="label">Critical</div>
                <div className="value">{job.summary.criticalFails}</div>
              </div>
              <div className="stat warn">
                <div className="label">失败</div>
                <div className="value">{job.summary.fail}</div>
              </div>
            </div>
          )}
          {job.error && <p style={{ color: 'var(--danger)' }}>{job.error}</p>}
          {job.note && <p className="muted">{job.note}</p>}
        </div>
      )}
    </section>
  );
}

function ReportPage({ toast }) {
  const [summary, setSummary] = useState(null);
  const [md, setMd] = useState('');

  const load = async () => {
    const data = await api.getReport();
    setSummary(data.rawSummary);
  };

  useEffect(() => {
    load().catch((e) => toast(e.message));
  }, [toast]);

  const renderMd = async () => {
    const data = await api.renderReport();
    setMd(data.markdown || '');
    toast('已生成报告草稿');
  };

  return (
    <section>
      <h1 className="page-title">基线报告</h1>
      <p className="page-desc">查看最近一次评测结果与失败样例，可生成 Markdown 草稿用于签字版报告。</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <button type="button" className="btn" onClick={() => load().catch((e) => toast(e.message))}>
          刷新
        </button>
        <button type="button" className="btn primary" onClick={() => renderMd().catch((e) => toast(e.message))}>
          重新生成报告草稿
        </button>
      </div>
      {!summary ? (
        <div className="panel muted">暂无报告，请先在「评测」页运行一次。</div>
      ) : (
        <>
          <div className="grid-stats">
            <div className="stat ok">
              <div className="label">通过率</div>
              <div className="value">{summary.rate}%</div>
            </div>
            <div className="stat">
              <div className="label">通过 / 失败</div>
              <div className="value">
                {summary.pass}/{summary.fail}
              </div>
            </div>
            <div className={`stat ${summary.criticalFails ? 'danger' : 'ok'}`}>
              <div className="label">Critical</div>
              <div className="value">{summary.criticalFails}</div>
            </div>
            <div className="stat">
              <div className="label">总数</div>
              <div className="value">{summary.total}</div>
            </div>
          </div>
          <div className="panel">
            <h3>分类通过率</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>类别</th>
                  <th>通过</th>
                  <th>总数</th>
                  <th>通过率</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.byCategory || {}).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v.pass}</td>
                    <td>{v.total}</td>
                    <td>{v.total ? ((v.pass / v.total) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h3>失败样例</h3>
            {summary.failures?.length ? (
              summary.failures.map((f) => (
                <div className="fail-block" key={`${f.description}-${f.query}`}>
                  <div className="row">
                    <strong>{f.description}</strong>
                    <span className="pill">{f.category}</span>
                    <span className={`pill ${f.risk}`}>{f.risk}</span>
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    问：{f.query}
                  </div>
                  <pre>{f.output}</pre>
                </div>
              ))
            ) : (
              <p className="muted">无失败，可进入放量评估。</p>
            )}
          </div>
        </>
      )}
      {md && (
        <div className="panel">
          <h3>Markdown 草稿</h3>
          <textarea className="code" readOnly value={md} style={{ minHeight: 280, width: '100%' }} />
        </div>
      )}
    </section>
  );
}

function ConfigPage({ toast }) {
  const [content, setContent] = useState('');

  useEffect(() => {
    api
      .getPrompt()
      .then((d) => setContent(d.content || ''))
      .catch((e) => toast(e.message));
  }, [toast]);

  const save = async () => {
    await api.savePrompt(content);
    toast('系统提示已保存，请跑冒烟确认');
  };

  return (
    <section>
      <h1 className="page-title">配置</h1>
      <p className="page-desc">
        编辑内部知识助手系统提示与知识库摘要（prompts/system.md）。改完后务必先跑冒烟。
      </p>
      <div className="panel">
        <div className="field">
          <label>系统提示</label>
          <textarea className="code" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => save().catch((e) => toast(e.message))}>
            保存提示词
          </button>
        </div>
        <p className="muted" style={{ marginTop: 14 }}>
          切换真实助手：编辑根目录 promptfooconfig.yaml，将 providers 改为 OpenAI 兼容或 HTTP
          接口，并配置 .env。控制台评测会调用同一配置。
        </p>
      </div>
    </section>
  );
}

function GuidePage({ toast }) {
  const [catalog, setCatalog] = useState([]);
  const [docId, setDocId] = useState('USER-GUIDE');
  const [md, setMd] = useState('加载中…');
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    api
      .listDocs()
      .then((d) => setCatalog(d.docs || []))
      .catch((e) => toast(e.message));
  }, [toast]);

  useEffect(() => {
    setMd('加载中…');
    api
      .getDoc(docId)
      .then((d) => {
        setMeta(d);
        setMd(d.content || '');
      })
      .catch((e) => {
        toast(e.message);
        setMd('无法加载文档');
      });
  }, [docId, toast]);

  return (
    <section>
      <h1 className="page-title">文档中心</h1>
      <p className="page-desc">
        使用说明、技术说明与交付文档。源文件在仓库 <code>docs/</code>，可与控制台同步查阅。
      </p>
      <div className="filters">
        {catalog.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`btn ${docId === d.id ? 'primary' : ''}`}
            onClick={() => setDocId(d.id)}
            title={d.audience}
          >
            {d.title}
          </button>
        ))}
      </div>
      {meta && (
        <p className="muted" style={{ marginBottom: 12 }}>
          文件：docs/{meta.file}　面向：{meta.audience}
        </p>
      )}
      <div className="panel guide">{simpleMarkdown(md)}</div>
    </section>
  );
}

export default function App() {
  const [page, setPage] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const toast = (msg) => setToastMsg(String(msg || ''));

  const refreshOverview = () =>
    api
      .overview()
      .then(setOverview)
      .catch((e) => toast(e.message));

  useEffect(() => {
    refreshOverview();
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="brand">知策评测台</h1>
        <p className="brand-sub">内部知识助手 · 质量全流程维护</p>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? 'active' : ''}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        {page === 'overview' && <Overview data={overview} onRefresh={refreshOverview} />}
        {page === 'cases' && <CasesPage toast={toast} />}
        {page === 'eval' && (
          <EvalPage
            toast={toast}
            onDone={() => {
              refreshOverview();
              setPage('report');
            }}
          />
        )}
        {page === 'report' && <ReportPage toast={toast} />}
        {page === 'config' && <ConfigPage toast={toast} />}
        {page === 'guide' && <GuidePage toast={toast} />}
      </main>
      <Toast message={toastMsg} onClose={() => setToastMsg('')} />
    </div>
  );
}
