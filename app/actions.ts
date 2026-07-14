"use server";

import { initDb, sql } from "@/lib/db";
import type { Bank, Expense } from "./components/ExpenseTracker";

export interface User {
  id: string;
  code: string;
  email: string;
  name: string | null;
}

export async function setupDatabase() {
  await initDb();
}

export async function createUser(
  code: string,
  email: string,
  name: string
): Promise<User | null> {
  const id = Math.random().toString(36).slice(2, 10);
  try {
    await sql`
      INSERT INTO users (id, code, email, name)
      VALUES (${id}, ${code}, ${email}, ${name})
    `;
    return { id, code, email, name };
  } catch {
    return null;
  }
}

export async function login(code: string): Promise<User | null> {
  const rows = (await sql`
    SELECT id, code, email, name FROM users WHERE code = ${code}
  `) as {
    id: string;
    code: string;
    email: string;
    name: string | null;
  }[];
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    code: rows[0].code,
    email: rows[0].email,
    name: rows[0].name,
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = (await sql`
    SELECT id, code, email, name FROM users WHERE email = ${email}
  `) as {
    id: string;
    code: string;
    email: string;
    name: string | null;
  }[];
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    code: rows[0].code,
    email: rows[0].email,
    name: rows[0].name,
  };
}

export async function getBanks(userId: string): Promise<Bank[]> {
  const rows = (await sql`
    SELECT id, name, balance FROM banks WHERE user_id = ${userId} ORDER BY name
  `) as { id: string; name: string; balance: number }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    balance: Number(r.balance),
  }));
}

export async function getExpenses(userId: string): Promise<Expense[]> {
  const rows = (await sql`
    SELECT id, bank_id, amount, category, description, TO_CHAR(date, 'YYYY-MM-DD') as date, created_at
    FROM expenses
    WHERE user_id = ${userId}
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

export async function addBank(
  name: string,
  balance: number,
  userId: string
): Promise<Bank> {
  const id = Math.random().toString(36).slice(2, 10);
  await sql`
    INSERT INTO banks (id, user_id, name, balance)
    VALUES (${id}, ${userId}, ${name}, ${balance})
  `;
  return { id, name, balance };
}

export async function updateBank(
  id: string,
  name: string,
  balance: number,
  userId: string
): Promise<void> {
  await sql`
    UPDATE banks SET name = ${name}, balance = ${balance}
    WHERE id = ${id} AND user_id = ${userId}
  `;
}

export async function deleteBank(id: string, userId: string): Promise<void> {
  await sql`DELETE FROM banks WHERE id = ${id} AND user_id = ${userId}`;
}

export interface Deposit {
  id: string;
  bankId: string;
  amount: number;
  note: string;
  date: string;
  createdAt: string;
}

export async function addMoney(
  bankId: string,
  amount: number,
  note: string,
  date: string,
  userId: string
): Promise<void> {
  const id = Math.random().toString(36).slice(2, 10);
  await sql`
    INSERT INTO deposits (id, user_id, bank_id, amount, note, date, created_at)
    VALUES (${id}, ${userId}, ${bankId}, ${amount}, ${note}, ${date}, NOW())
  `;
  await sql`
    UPDATE banks SET balance = balance + ${amount}
    WHERE id = ${bankId} AND user_id = ${userId}
  `;
}

export interface BankHistoryItem {
  id: string;
  bankId: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  date: string;
  createdAt: string;
}

export async function getBankHistory(
  bankId: string,
  userId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<BankHistoryItem[]> {
  const deposits = (await sql`
    SELECT id, bank_id, amount, note, TO_CHAR(date, 'YYYY-MM-DD') as date, created_at
    FROM deposits
    WHERE bank_id = ${bankId} AND user_id = ${userId}
      AND (${dateFrom}::text IS NULL OR date >= ${dateFrom}::date)
      AND (${dateTo}::text IS NULL OR date <= ${dateTo}::date)
  `) as {
    id: string;
    bank_id: string;
    amount: number;
    note: string;
    date: string;
    created_at: string;
  }[];

  const expenses = (await sql`
    SELECT id, bank_id, amount, description, TO_CHAR(date, 'YYYY-MM-DD') as date, created_at
    FROM expenses
    WHERE bank_id = ${bankId} AND user_id = ${userId}
      AND (${dateFrom}::text IS NULL OR date >= ${dateFrom}::date)
      AND (${dateTo}::text IS NULL OR date <= ${dateTo}::date)
  `) as {
    id: string;
    bank_id: string;
    amount: number;
    description: string;
    date: string;
    created_at: string;
  }[];

  const items: BankHistoryItem[] = [
    ...deposits.map((d) => ({
      id: d.id,
      bankId: d.bank_id,
      type: "credit" as const,
      amount: Number(d.amount),
      description: d.note || "Money added",
      date: d.date,
      createdAt: d.created_at,
    })),
    ...expenses.map((e) => ({
      id: e.id,
      bankId: e.bank_id,
      type: "debit" as const,
      amount: Number(e.amount),
      description: e.description,
      date: e.date,
      createdAt: e.created_at,
    })),
  ];

  return items.sort(
    (a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime() ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function addExpense(
  expense: Expense,
  userId: string
): Promise<void> {
  await sql`
    INSERT INTO expenses (id, user_id, bank_id, amount, category, description, date, created_at)
    VALUES (
      ${expense.id},
      ${userId},
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
    WHERE id = ${expense.bankId} AND user_id = ${userId}
  `;
}

export async function deleteExpense(
  id: string,
  bankId: string,
  amount: number,
  userId: string
): Promise<void> {
  await sql`DELETE FROM expenses WHERE id = ${id} AND user_id = ${userId}`;
  await sql`
    UPDATE banks SET balance = balance + ${amount}
    WHERE id = ${bankId} AND user_id = ${userId}
  `;
}
