import { createClient } from '@libsql/client';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// For local dev, use a local SQLite file. In production, use Turso cloud URL.
const LOCAL_URL = `file:${join(__dirname, 'data', 'expenses.db')}`;
if (!process.env.TURSO_DATABASE_URL) {
  mkdirSync(join(__dirname, 'data'), { recursive: true });
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? LOCAL_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// ── Schema ────────────────────────────────────────────────────────────────────
async function initSchema() {
  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS categories (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT    NOT NULL UNIQUE,
        icon     TEXT    NOT NULL DEFAULT '📦',
        color    TEXT    NOT NULL DEFAULT '#B2BEC3',
        budget   REAL,
        keywords TEXT    NOT NULL DEFAULT '[]'
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS transactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT    NOT NULL,
        description TEXT    NOT NULL,
        amount      REAL    NOT NULL,
        currency    TEXT    NOT NULL DEFAULT 'USD',
        category_id INTEGER REFERENCES categories(id),
        account     TEXT,
        source      TEXT    NOT NULL DEFAULT 'manual',
        import_hash TEXT    UNIQUE,
        notes       TEXT,
        created_at  TEXT    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      args: []
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions(date)`,      args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id)`, args: [] }
  ], 'write');
}

// ── Seed Categories ───────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  {
    name: 'Food & Dining', icon: '🍜', color: '#FF6B6B',
    keywords: ['mcdonald','starbucks','uber eats','doordash','grubhub','chipotle',
      'restaurant','cafe','coffee','pizza','sushi','grocery','whole foods',
      'trader joe','safeway','kroger','food','dining','chick-fil','taco bell',
      'subway','wendy','burger king','domino','panera','shake shack','panda express']
  },
  {
    name: 'Transport', icon: '🚗', color: '#4ECDC4',
    keywords: ['uber','lyft','taxi','transit','metro','bus','train','amtrak',
      'parking','toll','shell','bp','chevron','exxon','mobil','fuel','gas station',
      'transportation','mta','bart','cta','septa']
  },
  {
    name: 'Shopping', icon: '🛍️', color: '#FFE66D',
    keywords: ['amazon','ebay','walmart','target','costco','best buy','apple store',
      'nike','zara','h&m','etsy','shopify','macys','nordstrom','gap','uniqlo',
      'asos','shein','sephora','ulta','home depot','ikea','wayfair']
  },
  {
    name: 'Entertainment', icon: '🎬', color: '#A29BFE',
    keywords: ['netflix','spotify','hulu','disney','apple tv','youtube premium',
      'steam','playstation','xbox','nintendo','cinema','movie','concert','ticket',
      'twitch','hbo','peacock','paramount','amc','regal','fandango']
  },
  {
    name: 'Health & Wellness', icon: '💊', color: '#55EFC4',
    keywords: ['cvs','walgreens','pharmacy','hospital','clinic','doctor','dental',
      'gym','fitness','yoga','peloton','health','medical','rx','prescription',
      'planet fitness','la fitness','24 hour fitness','equinox','urgent care']
  },
  {
    name: 'Bills & Utilities', icon: '🔌', color: '#FDCB6E',
    keywords: ['electric','water','gas bill','internet','phone','at&t','verizon',
      'comcast','xfinity','utility','insurance','rent','mortgage','t-mobile',
      'sprint','subscription','annual fee','service fee','spectrum']
  },
  {
    name: 'Travel', icon: '✈️', color: '#74B9FF',
    keywords: ['airbnb','hotel','expedia','booking.com','airlines','delta','united',
      'southwest','marriott','hilton','hyatt','flight','travel','airfare',
      'kayak','priceline','trivago','doubletree','hampton inn','motel']
  },
  {
    name: 'Income', icon: '💵', color: '#00B894',
    keywords: ['payroll','direct deposit','salary','zelle received','venmo received',
      'interest','dividend','refund','cashback','deposit','paycheck','transfer in',
      'reimbursement','credit adjustment']
  },
  {
    name: 'Other', icon: '📦', color: '#B2BEC3',
    keywords: []
  }
];

async function seedCategories() {
  const result = await db.execute({ sql: 'SELECT COUNT(*) AS c FROM categories', args: [] });
  if (Number(result.rows[0].c) > 0) return;
  const tx = await db.transaction('write');
  try {
    for (const c of DEFAULT_CATEGORIES) {
      await tx.execute({
        sql: 'INSERT INTO categories (name,icon,color,keywords) VALUES (?,?,?,?)',
        args: [c.name, c.icon, c.color, JSON.stringify(c.keywords)]
      });
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ── Category Updates (idempotent — runs every start) ──────────────────────────
const NEW_CATEGORIES = [
  {
    name: 'Groceries', icon: '🛒', color: '#20BF6B',
    keywords: ['grocery','sobeys','loblaws','metro','food basics','no frills','whole foods',
      'trader joe','safeway','kroger','walmart grocery','costco','superstore','freshco',
      'farm boy','t&t','produce','supermarket']
  },
  {
    name: 'Restaurants', icon: '🍽️', color: '#FF6B6B',
    keywords: ['mcdonald','starbucks','uber eats','doordash','grubhub','chipotle',
      'restaurant','cafe','coffee','pizza','sushi','chick-fil','taco bell',
      'subway','wendy','burger king','domino','panera','shake shack','tim horton',
      'harvey','a&w','panda express','dining','takeout','dine in','diner','bistro','grill']
  },
  {
    name: 'Subscriptions', icon: '📱', color: '#A29BFE',
    keywords: ['netflix','spotify','hulu','disney','apple tv','youtube premium',
      'amazon prime','prime video','annual fee','membership','adobe','microsoft 365',
      'icloud','google one','dropbox','crunchyroll','paramount+','apple one','duolingo']
  },
  {
    name: 'Personal Care', icon: '🧴', color: '#FD79A8',
    keywords: ['shampoo','conditioner','serum','moisturizer','lotion','skincare',
      'cerave','the ordinary','neutrogena','head & shoulders','dove','pantene',
      'shoppers drug','rexall','body wash','deodorant','toothpaste','hygiene',
      'manicure','pedicure','haircut','salon','barbershop']
  },
  {
    name: 'Wearables & Fashion', icon: '👔', color: '#FDCB6E',
    keywords: ['zara','h&m','nike','adidas','uniqlo','gap','forever 21','aritzia',
      'lululemon','aldo','sephora','ulta','perfume','cologne','shoes','clothes',
      'jacket','dress','shirt','pants','accessories','watch','jewellery','sunglasses',
      'nordstrom','winners','marshalls','tj maxx','old navy','urban outfitters']
  },
  {
    name: 'Home & Living', icon: '🏠', color: '#74B9FF',
    keywords: ['ikea','wayfair','home depot','canadian tire','bed bath','lamp',
      'furniture','decor','steel','organizer','storage','cushion','curtain',
      'kitchenware','appliance','toolbox','hardware','lightbulb','candle','plant pot']
  }
];

async function seedCategoryUpdates() {
  // Rename Shopping → Wearables & Fashion (preserves April data under the new name)
  await db.execute({
    sql: `UPDATE categories SET name=?,icon=?,color=?,keywords=? WHERE name=?`,
    args: [
      'Wearables & Fashion', '👔', '#FDCB6E',
      JSON.stringify(['zara','h&m','nike','adidas','uniqlo','gap','forever 21','aritzia',
        'lululemon','aldo','sephora','ulta','perfume','cologne','shoes','clothes',
        'jacket','dress','accessories','watch','jewellery','nordstrom','winners','marshalls','old navy']),
      'Shopping'
    ]
  });
  // Insert new categories (skips if name already exists)
  for (const c of NEW_CATEGORIES) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO categories (name,icon,color,keywords) VALUES (?,?,?,?)',
      args: [c.name, c.icon, c.color, JSON.stringify(c.keywords)]
    });
  }
}

// ── Migrations ────────────────────────────────────────────────────────────────
async function migrateSchema() {
  const migrations = [
    `ALTER TABLE transactions ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN recurrence_frequency TEXT`
  ];
  for (const sql of migrations) {
    try { await db.execute({ sql, args: [] }); } catch (_) { /* column already exists */ }
  }
}

// Run initialization
await initSchema();
await migrateSchema();
await seedCategories();
await seedCategoryUpdates();

// ── Helpers ───────────────────────────────────────────────────────────────────
export function makeHash(date, description, amount) {
  return createHash('sha256').update(`${date}|${description}|${amount}`).digest('hex');
}

function parseKeywords(raw) {
  try { return Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch { return []; }
}

function rowToPlain(row) {
  // @libsql/client rows support column-name access; convert to plain object
  if (!row) return null;
  const obj = {};
  for (const key of Object.keys(row)) obj[key] = row[key];
  return obj;
}

function rowsToPlain(rows) {
  return rows.map(rowToPlain);
}

export async function getCategoryByName(name) {
  const r = await db.execute({ sql: 'SELECT * FROM categories WHERE name = ?', args: [name] });
  return r.rows[0] ? rowToPlain(r.rows[0]) : null;
}

export async function categorizeDescription(description, categories) {
  const lower = description.toLowerCase();
  for (const cat of categories) {
    if (cat.name === 'Other') continue;
    const kws = parseKeywords(cat.keywords);
    for (const kw of kws) {
      if (lower.includes(kw.toLowerCase())) return cat.id;
    }
  }
  const other = await getCategoryByName('Other');
  return other?.id ?? null;
}

// ── Categories ────────────────────────────────────────────────────────────────
export async function getCategories() {
  const r = await db.execute({ sql: 'SELECT * FROM categories ORDER BY id', args: [] });
  return rowsToPlain(r.rows).map(c => ({ ...c, keywords: parseKeywords(c.keywords) }));
}

export async function updateCategory(id, fields) {
  const allowed = ['name', 'icon', 'color', 'budget', 'keywords'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.includes(k)) continue;
    updates.push(`${k} = ?`);
    values.push(k === 'keywords' ? JSON.stringify(v) : v);
  }
  if (!updates.length) return null;
  values.push(id);
  await db.execute({ sql: `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, args: values });
  const r = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
  const row = rowToPlain(r.rows[0]);
  return row ? { ...row, keywords: parseKeywords(row.keywords) } : null;
}

// ── Transactions ──────────────────────────────────────────────────────────────
export async function getTransactions({ month, category, search, limit = 50, offset = 0 } = {}) {
  const where = [], params = [];
  if (month)    { where.push("strftime('%Y-%m', t.date) = ?"); params.push(month); }
  if (category) { where.push('t.category_id = ?');             params.push(Number(category)); }
  if (search)   { where.push('LOWER(t.description) LIKE ?');   params.push(`%${search.toLowerCase()}%`); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const [rowsResult, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
            FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
            ${clause} ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`,
      args: [...params, Number(limit), Number(offset)]
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS c FROM transactions t ${clause}`,
      args: params
    })
  ]);

  return {
    transactions: rowsToPlain(rowsResult.rows),
    total: Number(countResult.rows[0].c)
  };
}

export async function addTransaction(tx) {
  const result = await db.execute({
    sql: `INSERT INTO transactions (date,description,amount,currency,category_id,account,source,import_hash,notes,is_recurring,recurrence_frequency)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      tx.date, tx.description, Number(tx.amount),
      tx.currency || 'CAD', tx.category_id ?? null,
      tx.account || null, tx.source || 'manual',
      tx.import_hash || null, tx.notes || null,
      tx.is_recurring ? 1 : 0, tx.recurrence_frequency || null
    ]
  });
  const id = Number(result.lastInsertRowid);
  const r = await db.execute({
    sql: `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = ?`,
    args: [id]
  });
  return rowToPlain(r.rows[0]);
}

export async function updateTransaction(id, fields) {
  const allowed = ['date','description','amount','currency','category_id','account','notes','is_recurring','recurrence_frequency'];
  const updates = [], values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.includes(k)) continue;
    updates.push(`${k} = ?`);
    values.push(v);
  }
  if (!updates.length) return null;
  values.push(id);
  await db.execute({ sql: `UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, args: values });
  const r = await db.execute({
    sql: `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = ?`,
    args: [id]
  });
  return rowToPlain(r.rows[0]);
}

export async function deleteTransaction(id) {
  return db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [id] });
}

export async function bulkInsertTransactions(txList) {
  let imported = 0;
  const tx = await db.transaction('write');
  try {
    for (const item of txList) {
      const r = await tx.execute({
        sql: `INSERT OR IGNORE INTO transactions (date,description,amount,currency,category_id,account,source,import_hash,notes)
              VALUES (?,?,?,?,?,?,?,?,?)`,
        args: [
          item.date, item.description, Number(item.amount),
          item.currency || 'USD', item.category_id ?? null,
          item.account || null, item.source || 'manual',
          item.import_hash || null, item.notes || null
        ]
      });
      if (r.rowsAffected > 0) imported++;
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  return imported;
}

export async function recategorizeAll() {
  const categories = await getCategories();
  const r = await db.execute({ sql: 'SELECT id, description FROM transactions', args: [] });
  const txs = rowsToPlain(r.rows);
  let updated = 0;
  const transaction = await db.transaction('write');
  try {
    for (const item of txs) {
      const catId = await categorizeDescription(item.description, categories);
      await transaction.execute({ sql: 'UPDATE transactions SET category_id = ? WHERE id = ?', args: [catId, item.id] });
      updated++;
    }
    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
  return updated;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function getDashboard(month) {
  const currentMonth = month || new Date().toISOString().slice(0, 7);
  const filter = `strftime('%Y-%m', t.date) = ?`;

  const [totalsRes, byCatRes, dailyRes, merchantsRes, recentRes] = await Promise.all([
    db.execute({
      sql: `SELECT
              COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_spent,
              COALESCE(SUM(CASE WHEN amount > 0 THEN amount        ELSE 0 END), 0) AS total_income,
              COUNT(*) AS transaction_count
            FROM transactions t WHERE ${filter}`,
      args: [currentMonth]
    }),
    db.execute({
      sql: `SELECT c.id, c.name, c.icon, c.color, c.budget,
                   ROUND(SUM(ABS(t.amount)), 2) AS amount, COUNT(*) AS count
            FROM transactions t JOIN categories c ON t.category_id = c.id
            WHERE ${filter} AND t.amount < 0
            GROUP BY c.id ORDER BY amount DESC`,
      args: [currentMonth]
    }),
    db.execute({
      sql: `SELECT date, ROUND(SUM(ABS(amount)), 2) AS amount
            FROM transactions t WHERE ${filter} AND amount < 0
            GROUP BY date ORDER BY date`,
      args: [currentMonth]
    }),
    db.execute({
      sql: `SELECT description, ROUND(SUM(ABS(amount)), 2) AS amount, COUNT(*) AS count
            FROM transactions t WHERE ${filter} AND amount < 0
            GROUP BY LOWER(description) ORDER BY amount DESC LIMIT 6`,
      args: [currentMonth]
    }),
    db.execute({
      sql: `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
            FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
            WHERE ${filter} ORDER BY t.date DESC, t.id DESC LIMIT 10`,
      args: [currentMonth]
    })
  ]);

  const totals = rowToPlain(totalsRes.rows[0]);
  const totalSpent = Number(totals.total_spent) || 0;
  const byCategory = rowsToPlain(byCatRes.rows).map(c => ({
    ...c,
    amount: Number(c.amount),
    budget: c.budget ? Number(c.budget) : null,
    percentage: totalSpent > 0 ? Math.round((Number(c.amount) / totalSpent) * 100) : 0,
    over_budget: c.budget ? Number(c.amount) > Number(c.budget) : false
  }));

  return {
    month: currentMonth,
    total_spent: totalSpent,
    total_income: Number(totals.total_income) || 0,
    net: (Number(totals.total_income) || 0) - totalSpent,
    transaction_count: Number(totals.transaction_count) || 0,
    by_category: byCategory,
    daily_totals: rowsToPlain(dailyRes.rows).map(r => ({ ...r, amount: Number(r.amount) })),
    top_merchants: rowsToPlain(merchantsRes.rows).map(r => ({ ...r, amount: Number(r.amount), count: Number(r.count) })),
    recent_transactions: rowsToPlain(recentRes.rows)
  };
}

// ── Insights ──────────────────────────────────────────────────────────────────
export async function getInsights(months = 6) {
  const lastDate = new Date(); lastDate.setMonth(lastDate.getMonth() - 1);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = lastDate.toISOString().slice(0, 7);

  const [trendRes, currentCatRes, lastCatRes] = await Promise.all([
    db.execute({
      sql: `SELECT strftime('%Y-%m', date) AS month,
                   ROUND(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 2) AS spent,
                   ROUND(SUM(CASE WHEN amount > 0 THEN amount        ELSE 0 END), 2) AS income
            FROM transactions
            WHERE date >= date('now', '-${Number(months)} months')
            GROUP BY month ORDER BY month`,
      args: []
    }),
    db.execute({
      sql: `SELECT c.name, ROUND(SUM(ABS(t.amount)), 2) AS amount
            FROM transactions t JOIN categories c ON t.category_id = c.id
            WHERE strftime('%Y-%m', t.date) = ? AND t.amount < 0
            GROUP BY c.id ORDER BY amount DESC`,
      args: [currentMonth]
    }),
    db.execute({
      sql: `SELECT c.name, ROUND(SUM(ABS(t.amount)), 2) AS amount
            FROM transactions t JOIN categories c ON t.category_id = c.id
            WHERE strftime('%Y-%m', t.date) = ? AND t.amount < 0
            GROUP BY c.id ORDER BY amount DESC`,
      args: [lastMonth]
    })
  ]);

  const monthlyTrend = rowsToPlain(trendRes.rows).map(r => ({
    month: r.month,
    spent: Number(r.spent),
    income: Number(r.income)
  }));
  const avgMonthlySpend = monthlyTrend.length
    ? monthlyTrend.reduce((s, m) => s + m.spent, 0) / monthlyTrend.length : 0;

  const currentCats = rowsToPlain(currentCatRes.rows).map(r => ({ name: r.name, amount: Number(r.amount) }));
  const lastCats    = rowsToPlain(lastCatRes.rows).map(r => ({ name: r.name, amount: Number(r.amount) }));
  const lastMap     = Object.fromEntries(lastCats.map(c => [c.name, c.amount]));

  let biggestChange = null;
  for (const cat of currentCats) {
    const prev = lastMap[cat.name] || 0;
    if (prev > 0) {
      const deltaPct = ((cat.amount - prev) / prev) * 100;
      if (!biggestChange || Math.abs(deltaPct) > Math.abs(biggestChange.delta_pct)) {
        biggestChange = { category: cat.name, delta_pct: deltaPct, direction: deltaPct > 0 ? 'up' : 'down' };
      }
    }
  }

  // Tips
  const dash = await getDashboard(null);
  const tips = [];
  if (dash.total_income > 0 && dash.net > 0)
    tips.push({ type: 'success', message: `You spent less than you earned this month — great job!` });
  if (dash.total_income > 0 && dash.net < 0)
    tips.push({ type: 'warning', message: `You spent $${Math.abs(dash.net).toFixed(2)} more than you earned this month.` });
  if (biggestChange && biggestChange.delta_pct > 20)
    tips.push({ type: 'warning', message: `${biggestChange.category} spending is up ${Math.round(biggestChange.delta_pct)}% vs last month.` });
  if (biggestChange && biggestChange.delta_pct < -15)
    tips.push({ type: 'success', message: `You cut ${biggestChange.category} by ${Math.round(Math.abs(biggestChange.delta_pct))}% vs last month!` });
  const overBudget = dash.by_category.filter(c => c.over_budget);
  if (overBudget.length)
    tips.push({ type: 'warning', message: `Over budget in: ${overBudget.map(c => c.name).join(', ')}.` });
  const noBudget = dash.by_category.filter(c => !c.budget && c.amount > 50).slice(0, 3);
  if (noBudget.length)
    tips.push({ type: 'info', message: `Consider setting budgets for ${noBudget.map(c => c.name).join(', ')}.` });
  if (avgMonthlySpend > 0 && dash.total_spent > avgMonthlySpend * 1.2)
    tips.push({ type: 'warning', message: `This month is ${Math.round(((dash.total_spent / avgMonthlySpend) - 1) * 100)}% above your average.` });
  if (!tips.length)
    tips.push({ type: 'info', message: 'Keep adding transactions to unlock personalized insights.' });

  return {
    monthly_trend: monthlyTrend,
    avg_monthly_spend: avgMonthlySpend,
    biggest_change: biggestChange,
    category_comparison: { current: currentCats, last: lastCats },
    tips
  };
}

// ── Recurring ─────────────────────────────────────────────────────────────────
export async function getRecurring() {
  const r = await db.execute({
    sql: `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.is_recurring = 1
          ORDER BY t.recurrence_frequency, t.description`,
    args: []
  });
  return rowsToPlain(r.rows);
}

// ── Annual Report ─────────────────────────────────────────────────────────────
export async function getAnnual(year) {
  const y = String(year || new Date().getFullYear());

  const [totalsRes, byCatRes, monthlyRes] = await Promise.all([
    db.execute({
      sql: `SELECT
              COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_spent,
              COALESCE(SUM(CASE WHEN amount > 0 THEN amount        ELSE 0 END), 0) AS total_income,
              COUNT(DISTINCT strftime('%Y-%m', date)) AS months_active,
              COUNT(*) AS transaction_count
            FROM transactions WHERE strftime('%Y', date) = ?`,
      args: [y]
    }),
    db.execute({
      sql: `SELECT c.id, c.name, c.icon, c.color,
                   ROUND(SUM(ABS(t.amount)), 2) AS amount, COUNT(*) AS count
            FROM transactions t JOIN categories c ON t.category_id = c.id
            WHERE strftime('%Y', t.date) = ? AND t.amount < 0
            GROUP BY c.id ORDER BY amount DESC`,
      args: [y]
    }),
    db.execute({
      sql: `SELECT strftime('%Y-%m', date) AS month,
                   ROUND(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 2) AS spent,
                   ROUND(SUM(CASE WHEN amount > 0 THEN amount        ELSE 0 END), 2) AS income
            FROM transactions WHERE strftime('%Y', date) = ?
            GROUP BY month ORDER BY month`,
      args: [y]
    })
  ]);

  const totals = rowToPlain(totalsRes.rows[0]);
  const totalSpent = Number(totals.total_spent) || 0;
  const byCategory = rowsToPlain(byCatRes.rows).map(c => ({
    ...c,
    amount: Number(c.amount),
    count: Number(c.count),
    percentage: totalSpent > 0 ? Math.round((Number(c.amount) / totalSpent) * 100) : 0
  }));

  return {
    year: y,
    total_spent: totalSpent,
    total_income: Number(totals.total_income) || 0,
    net: (Number(totals.total_income) || 0) - totalSpent,
    months_active: Number(totals.months_active) || 0,
    transaction_count: Number(totals.transaction_count) || 0,
    by_category: byCategory,
    monthly_trend: rowsToPlain(monthlyRes.rows).map(r => ({
      month: r.month,
      spent: Number(r.spent),
      income: Number(r.income)
    }))
  };
}

// ── Export / Reset ────────────────────────────────────────────────────────────
export async function exportTransactions(month) {
  const { transactions } = await getTransactions({ month, limit: 999999 });
  return transactions;
}

export async function resetTransactions() {
  return db.execute({ sql: 'DELETE FROM transactions', args: [] });
}

export default db;
