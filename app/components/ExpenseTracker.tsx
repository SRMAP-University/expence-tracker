"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Check,
  CreditCard,
  Loader2,
  Lock,
  Pencil,
  PieChart as PieChartIcon,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  Wallet,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  setupDatabase,
  seedDefaultPassword,
  getBanks,
  getExpenses,
  addBank as addBankAction,
  updateBank as updateBankAction,
  deleteBank as deleteBankAction,
  addMoney as addMoneyAction,
  addExpense as addExpenseAction,
  deleteExpense as deleteExpenseAction,
  hasPassword,
  verifyPassword,
} from "@/app/actions";

export interface Bank {
  id: string;
  name: string;
  balance: number;
}

export interface Expense {
  id: string;
  bankId: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  createdAt: string;
}

const CATEGORIES = [
  "Office",
  "Travel",
  "Meals",
  "Software",
  "Marketing",
  "Salaries",
  "Utilities",
  "Equipment",
  "Other",
];

const CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#64748b",
  "#10b981",
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ExpenseTracker() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Auth state
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<"expense" | "money" | "bank">(
    "expense"
  );
  const [editingBankId, setEditingBankId] = useState<string | null>(null);

  // Bank form
  const [bankName, setBankName] = useState("");
  const [bankBalance, setBankBalance] = useState("");

  // Add money form
  const [moneyBankId, setMoneyBankId] = useState("");
  const [moneyAmount, setMoneyAmount] = useState("");
  const [moneyNote, setMoneyNote] = useState("");

  // Add expense form
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState(CATEGORIES[0]);
  const [expenseBankId, setExpenseBankId] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBankId, setFilterBankId] = useState<string | null>(null);

  async function loadData() {
    try {
      const [b, e] = await Promise.all([getBanks(), getExpenses()]);
      setBanks(b);
      setExpenses(e);
    } catch (err) {
      console.error("Failed to load data:", err);
      window.alert("Could not load data. Please check your database connection.");
    } finally {
      setLoading(false);
    }
  }

  const AUTH_KEY = "expense-tracker-auth";

  async function initApp() {
    try {
      await setupDatabase();
      await seedDefaultPassword();
      const locked = await hasPassword();
      if (!locked) {
        setIsAuthenticated(true);
        await loadData();
      } else if (localStorage.getItem(AUTH_KEY) === "true") {
        setIsAuthenticated(true);
        await loadData();
      }
    } catch (err) {
      console.error("Failed to initialize app:", err);
      window.alert("Could not connect to the database.");
    } finally {
      setMounted(true);
      setCheckingAuth(false);
    }
  }

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    if (banks.length > 0) {
      if (!moneyBankId || !banks.find((b) => b.id === moneyBankId)) {
        setMoneyBankId(banks[0].id);
      }
      if (!expenseBankId || !banks.find((b) => b.id === expenseBankId)) {
        setExpenseBankId(banks[0].id);
      }
    }
  }, [banks, moneyBankId, expenseBankId]);

  const totalBalance = useMemo(
    () => banks.reduce((sum, b) => sum + b.balance, 0),
    [banks]
  );

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses]
  );

  const totalDeposited = useMemo(
    () => totalBalance + totalExpenses,
    [totalBalance, totalExpenses]
  );

  function openModal(tab: "expense" | "money" | "bank") {
    if (tab !== "bank") setEditingBankId(null);
    setModalTab(tab);
    setShowModal(true);
  }

  function startEditBank(id: string) {
    const bank = banks.find((b) => b.id === id);
    if (!bank) return;
    setEditingBankId(id);
    setBankName(bank.name);
    setBankBalance(bank.balance.toString());
    setModalTab("bank");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingBankId(null);
    setBankName("");
    setBankBalance("");
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    try {
      const valid = await verifyPassword(passwordInput);
      if (valid) {
        setIsAuthenticated(true);
        localStorage.setItem(AUTH_KEY, "true");
        await loadData();
      } else {
        setAuthError("Incorrect password");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleBankSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = bankName.trim();
    const balance = parseFloat(bankBalance);
    if (!name || Number.isNaN(balance)) return;

    setLoading(true);
    try {
      if (editingBankId) {
        await updateBankAction(editingBankId, name, balance);
      } else {
        const newBank = await addBankAction(name, balance);
        setMoneyBankId(newBank.id);
        setExpenseBankId(newBank.id);
      }
      await loadData();
      setBankName("");
      setBankBalance("");
      setEditingBankId(null);
      closeModal();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteBank(id: string) {
    if (!window.confirm("Delete this bank and all its expenses?")) return;
    setLoading(true);
    try {
      await deleteBankAction(id);
      if (filterBankId === id) setFilterBankId(null);
      await loadData();
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMoney(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(moneyAmount);
    if (Number.isNaN(amount) || amount <= 0 || !moneyBankId) return;

    setLoading(true);
    try {
      await addMoneyAction(moneyBankId, amount);
      await loadData();
      setMoneyAmount("");
      setMoneyNote("");
      closeModal();
    } finally {
      setLoading(false);
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    const description = expenseDescription.trim();
    const amount = parseFloat(expenseAmount);
    if (!description || Number.isNaN(amount) || amount <= 0 || !expenseBankId)
      return;

    const bank = banks.find((b) => b.id === expenseBankId);
    if (!bank) return;
    if (bank.balance < amount) {
      window.alert("Insufficient balance in this bank.");
      return;
    }

    setLoading(true);
    try {
      const expense: Expense = {
        id: generateId(),
        bankId: expenseBankId,
        amount,
        category: expenseCategory,
        description,
        date: expenseDate,
        createdAt: new Date().toISOString(),
      };
      await addExpenseAction(expense);
      await loadData();
      setExpenseDescription("");
      setExpenseAmount("");
      closeModal();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExpense(id: string) {
    const expense = expenses.find((e) => e.id === id);
    if (!expense) return;
    if (!window.confirm("Delete this expense?")) return;

    setLoading(true);
    try {
      await deleteExpenseAction(id, expense.bankId, expense.amount);
      await loadData();
    } finally {
      setLoading(false);
    }
  }

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => (filterBankId ? e.bankId === filterBankId : true))
      .filter(
        (e) =>
          searchQuery.trim() === "" ||
          e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          formatDate(e.date).toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [expenses, filterBankId, searchQuery]);

  const bankMap = useMemo(() => {
    const map = new Map<string, Bank>();
    banks.forEach((b) => map.set(b.id, b));
    return map;
  }, [banks]);

  if (!mounted) return null;

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-input text-accent">
              <Lock className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Expense Tracker
            </h1>
            <p className="mt-1 text-sm text-muted">
              Enter the password to continue
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <input
              type="password"
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="form-input"
              autoFocus
            />
            {authError && (
              <p className="text-center text-sm text-danger">{authError}</p>
            )}
            <button
              type="submit"
              disabled={!passwordInput || loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-background px-4 pb-28 pt-8 sm:px-6 lg:px-8">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span className="text-sm text-muted">Saving...</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Expense Tracker
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </header>

        {/* Summary Cards */}
        <section className="mb-6 grid grid-cols-3 gap-3">
          <MiniStat
            label="Balance"
            value={formatCurrency(totalBalance)}
            icon={<Wallet className="h-4 w-4 text-accent" />}
          />
          <MiniStat
            label="Spent"
            value={formatCurrency(totalExpenses)}
            icon={<TrendingDown className="h-4 w-4 text-danger" />}
            tone="danger"
          />
          <MiniStat
            label="Deposited"
            value={formatCurrency(totalDeposited)}
            icon={<Banknote className="h-4 w-4 text-success" />}
            tone="success"
          />
        </section>

        {/* Banks */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Banks</h2>
            {filterBankId && (
              <button
                onClick={() => setFilterBankId(null)}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:bg-input"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          {banks.length === 0 ? (
            <button
              onClick={() => {
                setEditingBankId(null);
                setBankName("");
                setBankBalance("");
                openModal("bank");
              }}
              className="w-full rounded-2xl border border-dashed border-border p-6 text-center transition-colors hover:bg-input/40"
            >
              <Plus className="mx-auto mb-2 h-8 w-8 text-muted" />
              <p className="text-sm text-muted">Add your first bank</p>
            </button>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {banks.map((bank) => (
                <div
                  key={bank.id}
                  onClick={() =>
                    setFilterBankId((prev) =>
                      prev === bank.id ? null : bank.id
                    )
                  }
                  className={`group relative shrink-0 cursor-pointer rounded-2xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    filterBankId === bank.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-input text-accent">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-[6rem]">
                      <p className="truncate text-sm font-medium text-card-foreground">
                        {bank.name}
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(bank.balance)}
                      </p>
                    </div>
                    <div className="ml-2 flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditBank(bank.id);
                        }}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                        aria-label="Edit bank"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBank(bank.id);
                        }}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        aria-label="Delete bank"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Bank Plus Box */}
              <button
                onClick={() => {
                  setEditingBankId(null);
                  setBankName("");
                  setBankBalance("");
                  openModal("bank");
                }}
                className="flex h-[58px] shrink-0 items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-4 text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-input">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium">Add Bank</span>
              </button>
            </div>
          )}
        </section>

        {/* Charts */}
        <ChartsSection
          expenses={expenses}
          banks={banks}
          bankMap={bankMap}
        />

        {/* Transactions */}
        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-foreground">
              Transactions
              {filterBankId && bankMap.has(filterBankId) && (
                <span className="ml-2 text-sm font-normal text-muted">
                  · {bankMap.get(filterBankId)?.name}
                </span>
              )}
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-input py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:w-56"
              />
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <TrendingDown className="mx-auto mb-3 h-10 w-10 text-muted" />
              <p className="text-muted">No transactions yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-input/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted">
                      Description
                    </th>
                    <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted sm:table-cell">
                      Category
                    </th>
                    <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted md:table-cell">
                      Bank
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted">
                      Date
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted">
                      Amount
                    </th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredExpenses.map((expense) => {
                    const bank = bankMap.get(expense.bankId);
                    return (
                      <tr
                        key={expense.id}
                        className="group transition-colors hover:bg-input/40"
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-card-foreground">
                            {expense.description}
                          </p>
                          <span className="mt-0.5 inline-flex rounded-full bg-input px-2 py-0.5 text-xs font-medium text-muted sm:hidden">
                            {expense.category}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          <span className="inline-flex rounded-full bg-input px-2 py-0.5 text-xs font-medium text-muted">
                            {expense.category}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-sm text-muted md:table-cell">
                          {bank ? bank.name : "Deleted bank"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted">
                          {formatDate(expense.date)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-danger">
                          -{formatCurrency(expense.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="inline-flex items-center justify-center rounded-lg p-2 text-muted opacity-100 transition-colors hover:bg-danger/10 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label="Delete expense"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
        <button
          onClick={() => openModal("money")}
          className="flex h-11 items-center gap-2 rounded-full bg-success px-4 py-2 text-sm font-medium text-white shadow-lg shadow-success/25 transition-transform hover:-translate-y-0.5 hover:bg-success/90"
        >
          <ArrowDownLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Add Money</span>
        </button>
        <button
          onClick={() => openModal("expense")}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl"
          aria-label="Add expense"
        >
          <Plus className="h-7 w-7" />
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={(e) => {
            if (e.currentTarget === e.target) closeModal();
          }}
        >
          <div className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-2xl sm:rounded-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex gap-1 rounded-xl bg-input p-1">
                <TabButton
                  active={modalTab === "expense"}
                  onClick={() => setModalTab("expense")}
                  tone="dark"
                >
                  Expense
                </TabButton>
                <TabButton
                  active={modalTab === "money"}
                  onClick={() => setModalTab("money")}
                  tone="success"
                >
                  Add Money
                </TabButton>
                <TabButton
                  active={modalTab === "bank"}
                  onClick={() => setModalTab("bank")}
                  tone="dark"
                >
                  Bank
                </TabButton>
              </div>
              <button
                onClick={closeModal}
                className="rounded-lg p-2 text-muted hover:bg-input"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalTab === "expense" && (
              <form onSubmit={handleAddExpense} className="space-y-4">
                <Input label="Description">
                  <input
                    type="text"
                    placeholder="What did you pay for?"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    className="form-input"
                  />
                </Input>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Amount">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      className="form-input"
                    />
                  </Input>
                  <Input label="Date">
                    <input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="form-input"
                    />
                  </Input>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Category">
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className="form-input"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Input>
                  <Input label="Bank">
                    <select
                      value={expenseBankId}
                      onChange={(e) => setExpenseBankId(e.target.value)}
                      disabled={banks.length === 0}
                      className="form-input disabled:opacity-50"
                    >
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </Input>
                </div>
                <button
                  type="submit"
                  disabled={
                    !expenseDescription.trim() ||
                    !expenseAmount ||
                    banks.length === 0 ||
                    loading
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Record Expense
                </button>
              </form>
            )}

            {modalTab === "money" && (
              <form onSubmit={handleAddMoney} className="space-y-4">
                <Input label="Bank">
                  <select
                    value={moneyBankId}
                    onChange={(e) => setMoneyBankId(e.target.value)}
                    disabled={banks.length === 0}
                    className="form-input disabled:opacity-50"
                  >
                    {banks.length === 0 ? (
                      <option>Add a bank first</option>
                    ) : (
                      banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))
                    )}
                  </select>
                </Input>
                <Input label="Amount">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={moneyAmount}
                    onChange={(e) => setMoneyAmount(e.target.value)}
                    className="form-input"
                  />
                </Input>
                <Input label="Note (optional)">
                  <input
                    type="text"
                    placeholder="e.g. Invoice payment"
                    value={moneyNote}
                    onChange={(e) => setMoneyNote(e.target.value)}
                    className="form-input"
                  />
                </Input>
                <button
                  type="submit"
                  disabled={!moneyAmount || banks.length === 0 || loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-medium text-white hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowDownLeft className="h-4 w-4" />
                  Add Money
                </button>
              </form>
            )}

            {modalTab === "bank" && (
              <form onSubmit={handleBankSubmit} className="space-y-4">
                {editingBankId && (
                  <p className="text-sm text-muted">
                    Editing{" "}
                    <span className="font-medium text-foreground">
                      {banks.find((b) => b.id === editingBankId)?.name}
                    </span>
                  </p>
                )}
                <Input label="Bank Name">
                  <input
                    type="text"
                    placeholder="e.g. Business Checking"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="form-input"
                  />
                </Input>
                <Input
                  label={
                    editingBankId ? "Current Balance" : "Starting Balance"
                  }
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={bankBalance}
                    onChange={(e) => setBankBalance(e.target.value)}
                    className="form-input"
                  />
                </Input>
                <button
                  type="submit"
                  disabled={
                    !bankName.trim() || bankBalance === "" || loading
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editingBankId ? (
                    <>
                      <Check className="h-4 w-4" />
                      Save Changes
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add Bank
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function TabButton({
  children,
  active,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone: "dark" | "success";
}) {
  const activeClasses =
    tone === "success"
      ? "bg-success text-white"
      : "bg-foreground text-background";
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
        active ? activeClasses : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Input({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "danger" | "success";
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md ${
        tone === "danger"
          ? "hover:border-danger/30"
          : tone === "success"
          ? "hover:border-success/30"
          : "hover:border-accent/30"
      }`}
    >
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-input">
        {icon}
      </div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

function ChartsSection({
  expenses,
  banks,
  bankMap,
}: {
  expenses: Expense[];
  banks: Bank[];
  bankMap: Map<string, Bank>;
}) {
  if (expenses.length === 0) return null;

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => {
      map.set(e.category, (map.get(e.category) || 0) + e.amount);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const bankData = useMemo(() => {
    return banks
      .map((bank) => {
        const spent = expenses
          .filter((e) => e.bankId === bank.id)
          .reduce((sum, e) => sum + e.amount, 0);
        return {
          name: bank.name,
          spent,
          remaining: Math.max(bank.balance, 0),
        };
      })
      .filter((d) => d.spent > 0 || d.remaining > 0);
  }, [expenses, banks]);

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <PieChartIcon className="h-4 w-4 text-muted" />
        <h2 className="text-base font-semibold text-foreground">Insights</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Expenses by Category */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-medium text-muted">
            Expenses by Category
          </h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="55%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {categoryData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) =>
                    formatCurrency(typeof value === "number" ? value : 0)
                  }
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--foreground)",
                  }}
                />
                <Legend verticalAlign="top" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bank Usage */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-medium text-muted">
            Bank Balance vs Spending
          </h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bankData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip
                  formatter={(value) =>
                    formatCurrency(typeof value === "number" ? value : 0)
                  }
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--foreground)",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="spent"
                  name="Spent"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="remaining"
                  name="Remaining"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
