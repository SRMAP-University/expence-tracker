"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calculator,
  Save,
  Loader2,
} from "lucide-react";
import {
  getPlannerData,
  savePlannerData,
  setupDatabase,
} from "@/app/actions";
import type { User } from "@/app/actions";

interface PlannedExpense {
  id: string;
  name: string;
  amount: number;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const AUTH_USER_KEY = "expense-tracker-user";

const DEFAULT_ITEMS: PlannedExpense[] = [
  { id: generateId(), name: "Rent", amount: 0 },
  { id: generateId(), name: "Utilities", amount: 0 },
  { id: generateId(), name: "Groceries", amount: 0 },
  { id: generateId(), name: "Transport", amount: 0 },
];

export default function MonthlyPlannerPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [income, setIncome] = useState("");
  const [expenses, setExpenses] = useState<PlannedExpense[]>(DEFAULT_ITEMS);

  useEffect(() => {
    async function init() {
      const saved = localStorage.getItem(AUTH_USER_KEY);
      if (!saved) {
        router.replace("/");
        return;
      }
      const user = JSON.parse(saved) as User;
      setCurrentUser(user);
      try {
        await setupDatabase();
        const data = await getPlannerData(user.id);
        setIncome(data.income > 0 ? data.income.toString() : "");
        setExpenses(data.items.length > 0 ? data.items : DEFAULT_ITEMS);
      } catch (err) {
        console.error("Failed to load planner data:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  const incomeValue = useMemo(() => {
    const value = parseFloat(income);
    return Number.isNaN(value) ? 0 : value;
  }, [income]);

  const totalExpenses = useMemo(
    () =>
      expenses.reduce(
        (sum, e) => sum + (Number.isNaN(e.amount) ? 0 : e.amount),
        0
      ),
    [expenses]
  );

  const remaining = incomeValue - totalExpenses;

  function updateExpense(
    id: string,
    field: "name" | "amount",
    value: string
  ) {
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              [field]:
                field === "amount" ? parseFloat(value) || 0 : value,
            }
          : e
      )
    );
  }

  function addExpense() {
    setExpenses((prev) => [
      ...prev,
      { id: generateId(), name: "", amount: 0 },
    ]);
  }

  function removeExpense(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleSave() {
    if (!currentUser) return;
    setSaving(true);
    try {
      await savePlannerData(
        currentUser.id,
        incomeValue,
        expenses.map(({ id, name, amount }) => ({ id, name, amount }))
      );
    } catch (err) {
      console.error("Failed to save planner data:", err);
      window.alert("Could not save your plan. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-background px-4 pb-28 pt-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to tracker
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Monthly Expense Calculator
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Plan your future monthly budget
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-input text-accent">
            <Calculator className="h-5 w-5" />
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Expected Monthly Income
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted">
              $
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              className="form-input pl-8"
            />
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              Planned Expenses
            </h2>
            <button
              onClick={addExpense}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-input hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </button>
          </div>

          <div className="space-y-3">
            {expenses.map((expense) => (
              <div key={expense.id} className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Expense name"
                  value={expense.name}
                  onChange={(e) =>
                    updateExpense(expense.id, "name", e.target.value)
                  }
                  className="form-input flex-1"
                />
                <div className="relative w-32 sm:w-40">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={expense.amount === 0 ? "" : expense.amount}
                    onChange={(e) =>
                      updateExpense(expense.id, "amount", e.target.value)
                    }
                    className="form-input pl-7"
                  />
                </div>
                <button
                  onClick={() => removeExpense(expense.id)}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  aria-label="Remove expense"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Summary
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Income</span>
              <span className="font-medium text-foreground">
                {formatCurrency(incomeValue)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Total Expenses</span>
              <span className="font-medium text-danger">
                {formatCurrency(totalExpenses)}
              </span>
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between text-base font-semibold">
                <span className="text-foreground">Remaining</span>
                <span
                  className={
                    remaining >= 0 ? "text-success" : "text-danger"
                  }
                >
                  {formatCurrency(remaining)}
                </span>
              </div>
            </div>
          </div>

          {incomeValue > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>Budget used</span>
                <span>
                  {Math.min(
                    100,
                    Math.round((totalExpenses / incomeValue) * 100)
                  )}
                  %
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-input">
                <div
                  className={`h-full rounded-full transition-all ${
                    totalExpenses > incomeValue ? "bg-danger" : "bg-success"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      (totalExpenses / incomeValue) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : "Save Plan"}
        </button>
      </div>
    </main>
  );
}
