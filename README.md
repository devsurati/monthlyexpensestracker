# VØLT — Personal Expense Tracker

A clean, dark-themed personal finance tracker built for daily use on both desktop and iPhone. Manually log transactions, track spending by category, set monthly budgets, and monitor recurring expenses — all in one place.

---

## Features

- **Dashboard** — Monthly overview with total spent, income, net savings, and transaction count
- **Spending by Category** — Donut chart with per-category breakdown and budget progress bars
- **Monthly Budget Caps** — Set a budget per category and track progress visually (turns red when over)
- **Recurring Expenses** — Mark transactions as recurring (monthly/weekly/yearly) and see them at a glance
- **Currency Toggle** — Switch between CA$ and US$ display instantly
- **Quick-Add FAB** — Floating button to add a transaction from any screen
- **Transactions** — Full list with search, category filter, and month navigation
- **Insights** — 6-month spending trend, month-over-month category comparison, and smart tips
- **CSV Export** — Download transactions for any month
- **Mobile Ready** — Installable on iPhone via Safari → Add to Home Screen

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express 4 (ES Modules) |
| Database | [Turso](https://turso.tech) (cloud SQLite via `@libsql/client`) |
| Frontend | Vanilla JS SPA (hash routing, no framework) |
| Charts | Chart.js 4 |
| Font | Space Grotesk (Google Fonts) |
| Deployment | Vercel (serverless) |

---

## Local Development

### Prerequisites
- Node.js 18+
- A [Turso](https://turso.tech) account (free tier works)

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install

Create a .env file in the root:
TURSO_DATABASE_URL=libsql://your-db-name-your-org.turso.io
TURSO_AUTH_TOKEN=your-auth-token-here


For local dev without Turso, skip the .env — the app automatically uses a local SQLite file at data/expenses.db.

Start the server: node server.js

Open http://localhost:3000

Deploying to Vercel
Push this repo to GitHub
Import the project at vercel.com/new
Go to Settings → Environment Variables and add:
TURSO_DATABASE_URL — your Turso database URL
TURSO_AUTH_TOKEN — your Turso auth token
Redeploy — the app will be live at your Vercel URL
iPhone Installation
Open your Vercel URL in Safari on iPhone
Tap the Share icon → Add to Home Screen
VØLT will appear as an app icon with full-screen experience

Project Structure:
├── server.js          # Express API + Vercel export
├── db.js              # Turso client, schema, all DB queries
├── public/
│   ├── index.html     # SPA shell
│   ├── app.js         # All frontend logic
│   └── style.css      # Dark theme styles
├── vercel.json        # Vercel routing config
└── package.json

Built with Claude Code
