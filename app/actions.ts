"use server";

import { initDb, sql } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { Bank, Expense } from "./components/ExpenseTracker";

const PASSWORD_KEY = "app_password";

export async function setupDatabase() {
  await initDb();
}

export async function getBanks(): Promise<Bank[]> {
  const rows = (await sql`
    SELECT id, name, balance FROM banks ORDER BY name
  `) as { id: string; name: string; balance: number }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    balance: Number(r.balance),
  }));
}

export async function getExpenses(): Promise<Expense[]> {
  const rows = (await sql`
    SELECT id, bank_id, amount, category, description, date, created_at
    FROM expenses
    ORDER BY date DESC, created_at DESC
  `) as {
    id: string;
    bank_id: string;
    amount: number;
    category: string;
    description: string;
    date: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    bankId: r.bank_id,
    amount: Number(r.amount),
    category: r.category,
    description: r.description,
    date: r.date,
    createdAt: r.created_at,
  }));
}

export async function addBank(name: string, balance: number): Promise<Bank> {
  const id = Math.random().toString(36).slice(2, 10);
  await sql`
    INSERT INTO banks (id, name, balance)
    VALUES (${id}, ${name}, ${balance})
  `;
  return { id, name, balance };
}

export async function updateBank(
  id: string,
  name: string,
  balance: number
): Promise<void> {
  await sql`
    UPDATE banks SET name = ${name}, balance = ${balance}
    WHERE id = ${id}
  `;
}

export async function deleteBank(id: string): Promise<void> {
  // Expenses are deleted automatically via ON DELETE CASCADE
  await sql`DELETE FROM banks WHERE id = ${id}`;
}

export async function addMoney(
  bankId: string,
  amount: number
): Promise<void> {
  await sql`
    UPDATE banks SET balance = balance + ${amount}
    WHERE id = ${bankId}
  `;
}

export async function addExpense(expense: Expense): Promise<void> {
  await sql`
    INSERT INTO expenses (id, bank_id, amount, category, description, date, created_at)
    VALUES (
      ${expense.id},
      ${expense.bankId},
      ${expense.amount},
      ${expense.category},
      ${expense.description},
      ${expense.date},
      ${expense.createdAt}
    )
  `;
  await sql`
    UPDATE banks SET balance = balance - ${expense.amount}
    WHERE id = ${expense.bankId}
  `;
}

export async function deleteExpense(
  id: string,
  bankId: string,
  amount: number
): Promise<void> {
  await sql`DELETE FROM expenses WHERE id = ${id}`;
  await sql`
    UPDATE banks SET balance = balance + ${amount}
    WHERE id = ${bankId}
  `;
}

export async function hasPassword(): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM app_settings WHERE key = ${PASSWORD_KEY}
  `) as { "?column?": number }[];
  return rows.length > 0;
}

export async function verifyPassword(password: string): Promise<boolean> {
  const rows = (await sql`
    SELECT value FROM app_settings WHERE key = ${PASSWORD_KEY}
  `) as { value: string }[];
  if (rows.length === 0) return true;
  return bcrypt.compare(password, rows[0].value);
}

export async function setPassword(password: string): Promise<void> {
  const hash = await bcrypt.hash(password, 10);
  await sql`
    INSERT INTO app_settings (key, value)
    VALUES (${PASSWORD_KEY}, ${hash})
    ON CONFLICT (key) DO UPDATE SET value = ${hash}
  `;
}

export async function seedDefaultPassword(): Promise<void> {
  const exists = await hasPassword();
  if (!exists) {
    const password = process.env.APP_PASSWORD;
    if (password) {
      await setPassword(password);
    }
  }
}

export async function initAuth(): Promise<{ needsPassword: boolean }> {
  await initDb();
  await seedDefaultPassword();
  const locked = await hasPassword();
  return { needsPassword: locked };
}
