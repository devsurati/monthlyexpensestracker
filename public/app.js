// ── State ────────────────────────────────────────────────────────────────────
const state = {
  view: 'dashboard',
  dashMonth: todayYM(),
  txMonth: todayYM(),
  txSearch: '',
  txCategory: '',
  txOffset: 0,
  txLimit: 20,
  txTotal: 0,
  txRows: [],
  editingId: null,
  txType: 'expense',
  categories: [],
  charts: {}
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function todayYM() {
  return new Date().toISOString().slice(0, 7);
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.toISOString().slice(0, 7);
}

function fmt$(n) {
  if (n == null) return '$0.00';
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
}

// ── API Client ───────────────────────────────────────────────────────────────
const api = {
  get:  (url)        => fetch(url).then(r => r.json()),
  post: (url, body)  => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  put:  (url, body)  => fetch(url, { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  del:  (url)        => fetch(url, { method: 'DELETE' }).then(r => r.json())
};

// ── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── Router ───────────────────────────────────────────────────────────────────
function navigate(view) {
  if (!['dashboard', 'transactions', 'insights'].includes(view)) view = 'dashboard';
  state.view = view;

  document.querySelectorAll('.view').forEach(s => s.classList.add('hidden'));
  const section = document.getElementById('view-' + view);
  if (section) section.classList.remove('hidden');

  document.querySelectorAll('.nav-link, .bnav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });

  if (view === 'dashboard')    renderDashboard();
  if (view === 'transactions') renderTransactions();
  if (view === 'insights')     renderInsights();
}

window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));

document.addEventListener('click', e => {
  const el = e.target.closest('[data-view]');
  if (el) {
    e.preventDefault();
    const v = el.dataset.view;
    location.hash = v;
    navigate(v);
  }
});

// ── Dashboard ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  document.getElementById('dash-month-label').textContent = fmtMonth(state.dashMonth);
  document.getElementById('dash-stats').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const data = await api.get(`/api/dashboard?month=${state.dashMonth}`);

  const net = data.net;
  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon" style="background:#FFE5E5">💸</div>
      <div class="stat-label">Total Spent</div>
      <div class="stat-value expense">${fmt$(data.total_spent)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:#D6F5F3">💵</div>
      <div class="stat-label">Total Income</div>
      <div class="stat-value income">${fmt$(data.total_income)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:${net >= 0 ? '#D6F5F3' : '#FFE5E5'}">${net >= 0 ? '📈' : '📉'}</div>
      <div class="stat-label">Net Savings</div>
      <div class="stat-value ${net >= 0 ? 'positive' : 'negative'}">${net < 0 ? '-' : ''}${fmt$(net)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:#FFFBE0">📊</div>
      <div class="stat-label">Transactions</div>
      <div class="stat-value">${data.transaction_count}</div>
    </div>
  `;

  // Donut chart
  destroyChart('donut');
  const donutCtx = document.getElementById('chart-donut');
  const legend = document.getElementById('category-legend');
  const dcCenter = document.getElementById('donut-center');

  if (!data.by_category.length) {
    donutCtx.style.display = 'none';
    dcCenter.innerHTML = '';
    legend.innerHTML = `<div class="empty-state"><p>No expense data yet.<br>Add your first transaction.</p></div>`;
  } else {
    donutCtx.style.display = '';
    state.charts.donut = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: data.by_category.map(c => c.name),
        datasets: [{ data: data.by_category.map(c => c.amount), backgroundColor: data.by_category.map(c => c.color), borderWidth: 3, borderColor: '#fff' }]
      },
      options: {
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt$(ctx.parsed)}` } }
        }
      }
    });

    dcCenter.innerHTML = `<div class="dc-amount">${fmt$(data.total_spent)}</div><div class="dc-label">spent</div>`;

    legend.innerHTML = data.by_category.slice(0, 6).map(c => `
      <div class="legend-item">
        <div class="legend-left">
          <span class="legend-dot" style="background:${escHtml(c.color)}"></span>
          <span class="legend-name">${escHtml(c.icon)} ${escHtml(c.name)}</span>
          <span class="legend-pct">${c.percentage}%</span>
        </div>
        <span class="legend-amount">${fmt$(c.amount)}</span>
      </div>`).join('');
  }

  // Top merchants
  const merchantsEl = document.getElementById('top-merchants');
  if (!data.top_merchants.length) {
    merchantsEl.innerHTML = `<div class="empty-state"><p>No data yet.</p></div>`;
  } else {
    merchantsEl.innerHTML = data.top_merchants.map(m => `
      <div class="merchant-item">
        <span class="merchant-name">${escHtml(m.description)}</span>
        <span class="merchant-count">${m.count}x</span>
        <span class="merchant-amount">${fmt$(m.amount)}</span>
      </div>`).join('');
  }

  renderTxList('recent-transactions', data.recent_transactions, false);
}

// ── Transactions ─────────────────────────────────────────────────────────────
async function renderTransactions() {
  document.getElementById('tx-month-label').textContent = fmtMonth(state.txMonth);

  if (state.categories.length) {
    const sel = document.getElementById('tx-cat-filter');
    sel.innerHTML = `<option value="">All categories</option>` +
      state.categories.map(c => `<option value="${c.id}">${escHtml(c.icon)} ${escHtml(c.name)}</option>`).join('');
    sel.value = state.txCategory;
  }

  document.getElementById('tx-table-wrap').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const params = new URLSearchParams({ month: state.txMonth, limit: state.txLimit, offset: state.txOffset });
  if (state.txSearch)   params.set('search', state.txSearch);
  if (state.txCategory) params.set('category', state.txCategory);

  const data = await api.get(`/api/transactions?${params}`);
  state.txTotal = data.total;
  state.txRows  = data.transactions;

  renderTxList('tx-table-wrap', data.transactions, true);
  renderPagination();
}

function renderTxList(containerId, txs, withActions) {
  const el = document.getElementById(containerId);
  if (!txs.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌊</div>
        <p><strong>No transactions here yet.</strong><br>Tap + Add to record your first expense.</p>
      </div>`;
    return;
  }

  const rows = txs.map(tx => {
    const isExpense = tx.amount < 0;
    const catBg    = tx.category_color ? tx.category_color + '22' : '#F0F0F0';
    const catColor = tx.category_color || '#888';
    const actions  = withActions ? `
      <td class="tx-actions">
        <button class="btn-icon" onclick="openEditModal(${tx.id})" title="Edit">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon danger" onclick="deleteTransaction(${tx.id})" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </td>` : '';

    return `
      <tr>
        <td class="tx-date">${fmtDate(tx.date)}</td>
        <td>
          <div class="tx-desc" title="${escHtml(tx.description)}">${escHtml(tx.description)}</div>
          ${tx.account ? `<div class="text-sm text-muted">${escHtml(tx.account)}</div>` : ''}
        </td>
        <td>
          <span class="cat-badge" style="background:${catBg};color:${catColor}">
            ${escHtml(tx.category_icon || '📦')} ${escHtml(tx.category_name || 'Other')}
          </span>
        </td>
        <td class="${isExpense ? 'tx-amount-expense' : 'tx-amount-income'}">
          ${isExpense ? '-' : '+'}${fmt$(tx.amount)}
        </td>
        ${actions}
      </tr>`;
  }).join('');

  const actionsHeader = withActions ? '<th></th>' : '';
  el.innerHTML = `
    <table class="tx-table">
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th>${actionsHeader}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderPagination() {
  const el = document.getElementById('tx-pagination');
  const page  = Math.floor(state.txOffset / state.txLimit) + 1;
  const pages = Math.ceil(state.txTotal / state.txLimit);
  if (pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn-icon" onclick="txPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <span class="page-info">Page ${page} of ${pages}</span>
    <button class="btn-icon" onclick="txPage(${page + 1})" ${page >= pages ? 'disabled' : ''}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`;
}

window.txPage = (page) => {
  const pages = Math.ceil(state.txTotal / state.txLimit);
  if (page < 1 || page > pages) return;
  state.txOffset = (page - 1) * state.txLimit;
  renderTransactions();
};

window.deleteTransaction = async (id) => {
  if (!confirm('Delete this transaction?')) return;
  await api.del(`/api/transactions/${id}`);
  toast('Transaction deleted');
  if (state.view === 'dashboard') renderDashboard();
  else renderTransactions();
};

window.openEditModal = (id) => {
  const tx = state.txRows.find(t => t.id === id);
  if (!tx) return;
  state.editingId = id;
  openModal(tx);
};

// ── Insights ─────────────────────────────────────────────────────────────────
async function renderInsights() {
  const tipsEl = document.getElementById('insights-tips');
  tipsEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const data = await api.get('/api/insights?months=6');

  const tipIcons = { success: '🌟', warning: '⚠️', info: '💡' };
  tipsEl.innerHTML = data.tips.map(t => `
    <div class="tip-card ${t.type}">
      <span class="tip-icon">${tipIcons[t.type] || '💡'}</span>
      <span>${escHtml(t.message)}</span>
    </div>`).join('');

  // Trend chart
  destroyChart('trend');
  const trendCtx = document.getElementById('chart-trend');
  if (data.monthly_trend.length) {
    state.charts.trend = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: data.monthly_trend.map(m => fmtMonth(m.month).split(' ').slice(0, 2).join(' ')),
        datasets: [
          { label: 'Spent',  data: data.monthly_trend.map(m => m.spent),  borderColor: '#FF6B6B', backgroundColor: 'rgba(255,107,107,0.1)', fill: true, tension: 0.4, pointRadius: 5, pointHoverRadius: 7 },
          { label: 'Income', data: data.monthly_trend.map(m => m.income), borderColor: '#00B894', backgroundColor: 'rgba(0,184,148,0.08)',    fill: true, tension: 0.4, pointRadius: 5, pointHoverRadius: 7 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'Poppins', size: 12 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` } }
        },
        scales: {
          y: { ticks: { callback: v => '$' + v.toLocaleString() }, grid: { color: '#EDE0CC' } },
          x: { grid: { display: false } }
        }
      }
    });
  } else {
    trendCtx.parentElement.innerHTML = `<div class="empty-state"><p>No trend data yet.<br>Add transactions across multiple months.</p></div>`;
  }

  // Category comparison chart
  destroyChart('compare');
  const compareCtx = document.getElementById('chart-compare');
  const curr = data.category_comparison.current;
  const last = data.category_comparison.last;
  const allCats = [...new Set([...curr.map(c => c.name), ...last.map(c => c.name)])];

  if (curr.length || last.length) {
    const currMap = Object.fromEntries(curr.map(c => [c.name, c.amount]));
    const lastMap = Object.fromEntries(last.map(c => [c.name, c.amount]));
    state.charts.compare = new Chart(compareCtx, {
      type: 'bar',
      data: {
        labels: allCats,
        datasets: [
          { label: 'This Month', data: allCats.map(n => currMap[n] || 0), backgroundColor: 'rgba(255,107,107,0.75)', borderRadius: 6 },
          { label: 'Last Month', data: allCats.map(n => lastMap[n] || 0), backgroundColor: 'rgba(78,205,196,0.65)',  borderRadius: 6 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'Poppins', size: 12 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` } }
        },
        scales: {
          y: { ticks: { callback: v => '$' + v.toLocaleString() }, grid: { color: '#EDE0CC' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  } else {
    compareCtx.parentElement.innerHTML = `<div class="empty-state"><p>Not enough data to compare months yet.</p></div>`;
  }
}

// ── Modal ────────────────────────────────────────────────────────────────────
function openModal(tx = null) {
  state.editingId = tx?.id ?? null;
  document.getElementById('modal-title').textContent = tx ? 'Edit Transaction' : 'Add Transaction';

  const catSel = document.getElementById('form-category');
  catSel.innerHTML = state.categories.map(c =>
    `<option value="${c.id}">${escHtml(c.icon)} ${escHtml(c.name)}</option>`).join('');

  const isIncome = tx ? tx.amount > 0 : false;
  state.txType = isIncome ? 'income' : 'expense';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === state.txType));

  document.getElementById('form-desc').value    = tx?.description ?? '';
  document.getElementById('form-amount').value  = tx ? Math.abs(tx.amount) : '';
  document.getElementById('form-date').value    = tx?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  document.getElementById('form-account').value = tx?.account ?? '';
  document.getElementById('form-notes').value   = tx?.notes ?? '';
  if (tx?.category_id) catSel.value = tx.category_id;

  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('form-desc').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('tx-form').reset();
  state.editingId = null;
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.txType = btn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
});

document.getElementById('tx-form').addEventListener('submit', async e => {
  e.preventDefault();
  const desc    = document.getElementById('form-desc').value.trim();
  const amount  = parseFloat(document.getElementById('form-amount').value);
  const date    = document.getElementById('form-date').value;
  const catId   = document.getElementById('form-category').value;
  const account = document.getElementById('form-account').value.trim();
  const notes   = document.getElementById('form-notes').value.trim();
  if (!desc || !amount || !date) return;

  const finalAmount = state.txType === 'expense' ? -Math.abs(amount) : Math.abs(amount);
  const body = { date, description: desc, amount: finalAmount, category_id: catId || null, account, notes };

  if (state.editingId) {
    await api.put(`/api/transactions/${state.editingId}`, body);
    toast('Transaction updated');
  } else {
    await api.post('/api/transactions', body);
    toast('Transaction added', 'success');
  }

  closeModal();
  if (state.view === 'dashboard') renderDashboard();
  else renderTransactions();
});

document.getElementById('add-tx-btn').addEventListener('click', () => openModal());

// ── Month pickers ────────────────────────────────────────────────────────────
document.getElementById('dash-prev').addEventListener('click', () => { state.dashMonth = shiftMonth(state.dashMonth, -1); renderDashboard(); });
document.getElementById('dash-next').addEventListener('click', () => { state.dashMonth = shiftMonth(state.dashMonth, +1); renderDashboard(); });
document.getElementById('tx-prev').addEventListener('click',   () => { state.txMonth = shiftMonth(state.txMonth, -1); state.txOffset = 0; renderTransactions(); });
document.getElementById('tx-next').addEventListener('click',   () => { state.txMonth = shiftMonth(state.txMonth, +1); state.txOffset = 0; renderTransactions(); });

// ── Search & filter ───────────────────────────────────────────────────────────
let searchTimer;
document.getElementById('tx-search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.txSearch = e.target.value.trim(); state.txOffset = 0; renderTransactions(); }, 350);
});
document.getElementById('tx-cat-filter').addEventListener('change', e => {
  state.txCategory = e.target.value; state.txOffset = 0; renderTransactions();
});

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  state.categories = await api.get('/api/categories');
  navigate(location.hash.slice(1) || 'dashboard');
}

init();
