import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getCategories, updateCategory,
  getTransactions, addTransaction, updateTransaction, deleteTransaction,
  getDashboard, getInsights, recategorizeAll,
  getRecurring, getAnnual, exportTransactions, resetTransactions
} from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/api/transactions', async (req, res) => {
  try {
    const { month, category, search, limit, offset } = req.query;
    res.json(await getTransactions({ month, category, search, limit, offset }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const { date, description, amount, currency, category_id, account, notes } = req.body;
    if (!date || !description || amount === undefined)
      return res.status(400).json({ error: 'date, description, and amount are required' });
    const tx = await addTransaction({ date, description, amount, currency, category_id, account, notes });
    res.status(201).json(tx);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/transactions/:id', async (req, res) => {
  try {
    const tx = await updateTransaction(Number(req.params.id), req.body);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json(tx);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await deleteTransaction(Number(req.params.id));
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Categories ────────────────────────────────────────────────────────────────

app.get('/api/categories', async (req, res) => {
  try { res.json(await getCategories()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const cat = await updateCategory(Number(req.params.id), req.body);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    res.json(cat);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categories/recategorize', async (req, res) => {
  try { res.json({ updated: await recategorizeAll() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Recurring ─────────────────────────────────────────────────────────────────

app.get('/api/recurring', async (req, res) => {
  try { res.json(await getRecurring()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard & Insights ──────────────────────────────────────────────────────

app.get('/api/dashboard', async (req, res) => {
  try { res.json(await getDashboard(req.query.month || null)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/insights', async (req, res) => {
  try { res.json(await getInsights(Number(req.query.months) || 6)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/annual', async (req, res) => {
  try { res.json(await getAnnual(req.query.year || null)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Export ────────────────────────────────────────────────────────────────────

app.get('/api/export/csv', async (req, res) => {
  try {
    const txs = await exportTransactions(req.query.month || null);
    const cols = ['id','date','description','amount','currency','category_name','account','source','notes'];
    const csv = [
      cols.join(','),
      ...txs.map(t => cols.map(c => `"${String(t[c] ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    const fname = req.query.month ? `transactions-${req.query.month}.csv` : 'transactions.csv';
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reset ─────────────────────────────────────────────────────────────────────

app.delete('/api/data/reset', async (req, res) => {
  try {
    if (req.query.confirm !== 'true')
      return res.status(400).json({ error: 'Pass ?confirm=true to confirm reset' });
    await resetTransactions();
    res.json({ reset: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start / Export ────────────────────────────────────────────────────────────

// Export for Vercel (serverless)
export default app;

// Only bind a port when running locally
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🌊  Expenses Tracker  →  http://localhost:${PORT}\n`);
    console.log(`   iPhone (same WiFi): http://<your-laptop-ip>:${PORT}\n`);
  });
}
