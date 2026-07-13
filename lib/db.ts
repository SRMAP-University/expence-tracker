import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = neon(process.env.DATABASE_URL);

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS banks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance NUMERIC(12, 2) NOT NULL DEFAULT 0
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      bank_id TEXT NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;
}

export interface BankRow {
  id: string;
  name: string;
  balance: number;
}

export interface ExpenseRow {
  id: string;
  bank_id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  created_at: string;
}
