async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.error || res.statusText || '请求失败';
    throw new Error(msg);
  }
  return data;
}

export const api = {
  overview: () => request('/api/overview'),
  cases: () => request('/api/cases'),
  saveCase: (id, body) =>
    request(`/api/cases/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  createCase: (body) =>
    request('/api/cases', { method: 'POST', body: JSON.stringify(body) }),
  deleteCase: (id) =>
    request(`/api/cases/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getPrompt: () => request('/api/prompt'),
  savePrompt: (content) =>
    request('/api/prompt', { method: 'PUT', body: JSON.stringify({ content }) }),
  getGuide: async () => {
    const res = await fetch('/api/guide');
    if (!res.ok) throw new Error('无法加载操作说明');
    return res.text();
  },
  getReport: () => request('/api/report/latest'),
  renderReport: () => request('/api/report/render', { method: 'POST' }),
  startEval: (mode) =>
    request('/api/eval', { method: 'POST', body: JSON.stringify({ mode }) }),
  getJob: (jobId) => request(`/api/eval/${jobId}`),
};
