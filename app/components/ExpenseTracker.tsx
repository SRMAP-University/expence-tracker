"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Calculator,
  Check,
  CreditCard,
  History,
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
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
  getBanks,
  getExpenses,
  addBank as addBankAction,
  updateBank as updateBankAction,
  deleteBank as deleteBankAction,
  addMoney as addMoneyAction,
  addExpense as addExpenseAction,
  deleteExpense as deleteExpenseAction,
  addLoan as addLoanAction,
  updateLoan as updateLoanAction,
  deleteLoan as deleteLoanAction,
  getLoans,
  login,
  createUser,
  getUserByEmail,
  getBankHistory,
  type BankHistoryItem,
  type User,
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

export interface Loan {
  id: string;
  name: string;
  amount: number;
  balanceRemaining: number;
  interestRate: number | null;
  dueDate: string | null;
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
  const [loans, setLoans] = useState<Loan[]>([]);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authTab, setAuthTab] = useState<"login" | "create" | "recover">(
    "login"
  );
  const [loginCode, setLoginCode] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoveredCode, setRecoveredCode] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<
    "expense" | "money" | "bank" | "loan"
  >("expense");
  const [editingBankId, setEditingBankId] = useState<string | null>(null);

  // Bank history state
  const [historyBankId, setHistoryBankId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<BankHistoryItem[]>([]);
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");

  // Bank form
  const [bankName, setBankName] = useState("");
  const [bankBalance, setBankBalance] = useState("");

  // Add money form
  const [moneyBankId, setMoneyBankId] = useState("");
  const [moneyAmount, setMoneyAmount] = useState("");
  const [moneyNote, setMoneyNote] = useState("");
  const [moneyDate, setMoneyDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Add expense form
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState(CATEGORIES[0]);
  const [expenseBankId, setExpenseBankId] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Loan form
  const [loanName, setLoanName] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanBalanceRemaining, setLoanBalanceRemaining] = useState("");
  const [loanInterestRate, setLoanInterestRate] = useState("");
  const [loanDueDate, setLoanDueDate] = useState("");
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBankId, setFilterBankId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function loadData(userId: string) {
    try {
      const [b, e, l] = await Promise.all([
        getBanks(userId),
        getExpenses(userId),
        getLoans(userId),
      ]);
      setBanks(b);
      setExpenses(e);
      setLoans(l);
    } catch (err) {
      console.error("Failed to load data:", err);
      window.alert("Could not load data. Please check your database connection.");
    } finally {
      setLoading(false);
    }
  }

  const AUTH_USER_KEY = "expense-tracker-user";

  async function initApp() {
    try {
      await setupDatabase();
      const saved = localStorage.getItem(AUTH_USER_KEY);
      if (saved) {
        const user = JSON.parse(saved) as User;
        setCurrentUser(user);
        setIsAuthenticated(true);
        await loadData(user.id);
      }
    } catch (err) {
      console.error("Failed to initialize app:", err);
      window.alert("Could not connect to the database.");
    } finally {
      setMounted(true);
      setLoading(false);
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

  function completeLogin(user: User) {
    setCurrentUser(user);
    setIsAuthenticated(true);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    loadData(user.id);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    try {
      const user = await login(loginCode);
      if (user) {
        completeLogin(user);
        setLoginCode("");
      } else {
        setAuthError("Code not found. Please check or create an account.");
      }
    } catch (err) {
      console.error("Login failed:", err);
      setAuthError("Could not log in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    const code = createCode.trim();
    const email = createEmail.trim();
    const name = createName.trim();
    if (!code || !email) {
      setAuthError("Code and email are required.");
      setLoading(false);
      return;
    }
    try {
      const user = await createUser(code, email, name || code);
      if (user) {
        completeLogin(user);
        setCreateCode("");
        setCreateEmail("");
        setCreateName("");
      } else {
        setAuthError("That code is already taken. Try another.");
      }
    } catch (err) {
      console.error("Create account failed:", err);
      setAuthError("Could not create account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    setRecoveredCode(null);
    const email = recoverEmail.trim();
    if (!email) {
      setAuthError("Please enter your email.");
      setLoading(false);
      return;
    }
    try {
      const user = await getUserByEmail(email);
      if (user) {
        setRecoveredCode(user.code);
      } else {
        setAuthError("No account found with that email.");
      }
    } catch (err) {
      console.error("Recover failed:", err);
      setAuthError("Could not recover account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setIsAuthenticated(false);
    setCurrentUser(null);
    localStorage.removeItem(AUTH_USER_KEY);
  }

  function openModal(tab: "expense" | "money" | "bank" | "loan") {
    if (tab !== "bank") setEditingBankId(null);
    if (tab !== "loan") setEditingLoanId(null);
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
    setEditingLoanId(null);
    setLoanName("");
    setLoanAmount("");
    setLoanBalanceRemaining("");
    setLoanInterestRate("");
    setLoanDueDate("");
  }

  async function handleBankSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    const name = bankName.trim();
    const balance = parseFloat(bankBalance);
    if (!name || Number.isNaN(balance)) return;

    setLoading(true);
    try {
      if (editingBankId) {
        await updateBankAction(editingBankId, name, balance, currentUser.id);
      } else {
        const newBank = await addBankAction(name, balance, currentUser.id);
        setMoneyBankId(newBank.id);
        setExpenseBankId(newBank.id);
      }
      await loadData(currentUser.id);
      setBankName("");
      setBankBalance("");
      setEditingBankId(null);
      closeModal();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteBank(id: string) {
    if (!currentUser) return;
    if (!window.confirm("Delete this bank and all its expenses?")) return;
    setLoading(true);
    try {
      await deleteBankAction(id, currentUser.id);
      if (filterBankId === id) setFilterBankId(null);
      await loadData(currentUser.id);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoanSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    const name = loanName.trim();
    const amount = parseFloat(loanAmount);
    const balanceRemaining = parseFloat(loanBalanceRemaining);
    const interestRate = loanInterestRate
      ? parseFloat(loanInterestRate)
      : null;
    const dueDate = loanDueDate || null;
    if (
      !name ||
      Number.isNaN(amount) ||
      amount <= 0 ||
      Number.isNaN(balanceRemaining) ||
      balanceRemaining < 0
    )
      return;

    setLoading(true);
    try {
      if (editingLoanId) {
        await updateLoanAction(
          editingLoanId,
          name,
          amount,
          balanceRemaining,
          interestRate,
          dueDate,
          currentUser.id
        );
      } else {
        await addLoanAction(
          name,
          amount,
          balanceRemaining,
          interestRate,
          dueDate,
          currentUser.id
        );
      }
      await loadData(currentUser.id);
      closeModal();
    } finally {
      setLoading(false);
    }
  }

  function startEditLoan(id: string) {
    const loan = loans.find((l) => l.id === id);
    if (!loan) return;
    setEditingLoanId(id);
    setLoanName(loan.name);
    setLoanAmount(loan.amount.toString());
    setLoanBalanceRemaining(loan.balanceRemaining.toString());
    setLoanInterestRate(
      loan.interestRate === null ? "" : loan.interestRate.toString()
    );
    setLoanDueDate(loan.dueDate ?? "");
    setModalTab("loan");
    setShowModal(true);
  }

  async function handleDeleteLoan(id: string) {
    if (!currentUser) return;
    if (!window.confirm("Delete this loan account?")) return;
    setLoading(true);
    try {
      await deleteLoanAction(id, currentUser.id);
      await loadData(currentUser.id);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMoney(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    const amount = parseFloat(moneyAmount);
    if (Number.isNaN(amount) || amount <= 0 || !moneyBankId) return;

    setLoading(true);
    try {
      await addMoneyAction(
        moneyBankId,
        amount,
        moneyNote,
        moneyDate,
        currentUser.id
      );
      await loadData(currentUser.id);
      setMoneyAmount("");
      setMoneyNote("");
      setMoneyDate(new Date().toISOString().split("T")[0]);
      closeModal();
    } finally {
      setLoading(false);
    }
  }

  async function openHistory(bankId: string) {
    if (!currentUser) return;
    setHistoryBankId(bankId);
    setHistoryDateFrom("");
    setHistoryDateTo("");
    await loadHistory(bankId, currentUser.id);
  }

  async function loadHistory(
    bankId: string,
    userId: string,
    from?: string,
    to?: string
  ) {
    setLoading(true);
    try {
      const items = await getBankHistory(bankId, userId, from, to);
      setHistoryItems(items);
    } catch (err) {
      console.error("Failed to load bank history:", err);
    } finally {
      setLoading(false);
    }
  }

  function closeHistory() {
    setHistoryBankId(null);
    setHistoryItems([]);
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
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
      await addExpenseAction(expense, currentUser.id);
      await loadData(currentUser.id);
      setExpenseDescription("");
      setExpenseAmount("");
      closeModal();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!currentUser) return;
    const expense = expenses.find((e) => e.id === id);
    if (!expense) return;
    if (!window.confirm("Delete this expense?")) return;

    setLoading(true);
    try {
      await deleteExpenseAction(id, expense.bankId, expense.amount, currentUser.id);
      await loadData(currentUser.id);
    } finally {
      setLoading(false);
    }
  }

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => (filterBankId ? e.bankId === filterBankId : true))
      .filter((e) => {
        if (dateFrom && e.date < dateFrom) return false;
        if (dateTo && e.date > dateTo) return false;
        return true;
      })
      .filter(
        (e) =>
          searchQuery.trim() === "" ||
          e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          formatDate(e.date).toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [expenses, filterBankId, searchQuery, dateFrom, dateTo]);

  const groupedExpenses = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    filteredExpenses.forEach((e) => {
      const key = String(e.date).slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    });
    return Array.from(groups.entries()).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
    );
  }, [filteredExpenses]);

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
              Sign in or create an account
            </p>
          </div>

          <div className="mb-6 flex rounded-xl bg-input p-1">
            <button
              onClick={() => {
                setAuthTab("login");
                setAuthError(null);
                setRecoveredCode(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                authTab === "login"
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => {
                setAuthTab("create");
                setAuthError(null);
                setRecoveredCode(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                authTab === "create"
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Create
            </button>
            <button
              onClick={() => {
                setAuthTab("recover");
                setAuthError(null);
                setRecoveredCode(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                authTab === "recover"
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Forgot
            </button>
          </div>

          {authTab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="text"
                placeholder="Your code"
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value)}
                className="form-input"
                autoFocus
              />
              {authError && (
                <p className="text-center text-sm text-danger">{authError}</p>
              )}
              <button
                type="submit"
                disabled={!loginCode || loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Login
              </button>
            </form>
          )}

          {authTab === "create" && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <input
                type="text"
                placeholder="Choose a login code"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                className="form-input"
              />
              <input
                type="email"
                placeholder="Email (for recovery)"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                className="form-input"
              />
              <input
                type="text"
                placeholder="Your name (optional)"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="form-input"
              />
              {authError && (
                <p className="text-center text-sm text-danger">{authError}</p>
              )}
              <button
                type="submit"
                disabled={!createCode || !createEmail || loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create Account
              </button>
            </form>
          )}

          {authTab === "recover" && (
            <form onSubmit={handleRecover} className="space-y-4">
              <input
                type="email"
                placeholder="Enter your email"
                value={recoverEmail}
                onChange={(e) => setRecoverEmail(e.target.value)}
                className="form-input"
              />
              {recoveredCode && (
                <div className="rounded-xl bg-success/10 p-3 text-center">
                  <p className="text-sm text-success">Your code is:</p>
                  <p className="mt-1 text-lg font-semibold text-success">
                    {recoveredCode}
                  </p>
                </div>
              )}
              {authError && (
                <p className="text-center text-sm text-danger">{authError}</p>
              )}
              <button
                type="submit"
                disabled={!recoverEmail || loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Find Code
              </button>
            </form>
          )}
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
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-accent">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
              Expense Tracker
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/planner"
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-input hover:text-foreground"
            >
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Planner</span>
            </Link>
            {currentUser && (
              <p className="hidden text-sm text-muted md:block">
                Hi, {currentUser.name || currentUser.email}
              </p>
            )}
            <button
              onClick={handleLogout}
              className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-input hover:text-foreground"
            >
              Log out
            </button>
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
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
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
                          openHistory(bank.id);
                        }}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                        aria-label="Bank history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
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

        {/* Loans */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              Loans
            </h2>
            <button
              onClick={() => {
                setEditingLoanId(null);
                setLoanName("");
                setLoanAmount("");
                setLoanBalanceRemaining("");
                setLoanInterestRate("");
                setLoanDueDate("");
                openModal("loan");
              }}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-input hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Loan
            </button>
          </div>

          {loans.length === 0 ? (
            <button
              onClick={() => {
                setEditingLoanId(null);
                setLoanName("");
                setLoanAmount("");
                setLoanBalanceRemaining("");
                setLoanInterestRate("");
                setLoanDueDate("");
                openModal("loan");
              }}
              className="w-full rounded-2xl border border-dashed border-border p-6 text-center transition-colors hover:bg-input/40"
            >
              <CreditCard className="mx-auto mb-2 h-8 w-8 text-muted" />
              <p className="text-sm text-muted">Add your first loan</p>
            </button>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {loans.map((loan) => {
                const progress =
                  loan.amount > 0
                    ? Math.min(
                        100,
                        Math.round(
                          ((loan.amount - loan.balanceRemaining) /
                            loan.amount) *
                            100
                        )
                      )
                    : 0;
                return (
                  <div
                    key={loan.id}
                    className="group relative rounded-2xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-input text-danger">
                          <CreditCard className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-card-foreground">
                            {loan.name}
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {formatCurrency(loan.balanceRemaining)} remaining
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => startEditLoan(loan.id)}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                          aria-label="Edit loan"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLoan(loan.id)}
                          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          aria-label="Delete loan"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted">
                        <span>{progress}% paid</span>
                        <span>of {formatCurrency(loan.amount)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-input">
                        <div
                          className="h-full rounded-full bg-success transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    {(loan.interestRate !== null || loan.dueDate) && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted">
                        {loan.interestRate !== null && (
                          <span className="rounded-md bg-input px-1.5 py-0.5">
                            {loan.interestRate}% interest
                          </span>
                        )}
                        {loan.dueDate && (
                          <span className="rounded-md bg-input px-1.5 py-0.5">
                            Due {new Date(loan.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-base font-semibold text-foreground">
              Transactions
              {filterBankId && bankMap.has(filterBankId) && (
                <span className="ml-2 text-sm font-normal text-muted">
                  · {bankMap.get(filterBankId)?.name}
                </span>
              )}
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="form-input h-9 px-3 py-0 text-xs"
                />
                <span className="text-xs text-muted">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="form-input h-9 px-3 py-0 text-xs"
                />
              </div>
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
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <TrendingDown className="mx-auto mb-3 h-10 w-10 text-muted" />
              <p className="text-muted">No transactions found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedExpenses.map(([date, group]) => (
                <div
                  key={date}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                >
                  <div className="flex items-center justify-between bg-input/50 px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-foreground">
                      {formatDate(date)}
                    </h3>
                    <span className="text-sm font-medium text-danger">
                      -{formatCurrency(group.reduce((s, e) => s + e.amount, 0))}
                    </span>
                  </div>
                  <table className="min-w-full divide-y divide-border">
                    <tbody className="divide-y divide-border">
                      {group.map((expense) => {
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
              ))}
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
                <TabButton
                  active={modalTab === "loan"}
                  onClick={() => setModalTab("loan")}
                  tone="dark"
                >
                  Loan
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
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Date">
                    <input
                      type="date"
                      value={moneyDate}
                      onChange={(e) => setMoneyDate(e.target.value)}
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
                </div>
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

            {modalTab === "loan" && (
              <form onSubmit={handleLoanSubmit} className="space-y-4">
                {editingLoanId && (
                  <p className="text-sm text-muted">
                    Editing{" "}
                    <span className="font-medium text-foreground">
                      {loans.find((l) => l.id === editingLoanId)?.name}
                    </span>
                  </p>
                )}
                <Input label="Loan Name">
                  <input
                    type="text"
                    placeholder="e.g. Business Loan"
                    value={loanName}
                    onChange={(e) => setLoanName(e.target.value)}
                    className="form-input"
                  />
                </Input>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={editingLoanId ? "Original Amount" : "Loan Amount"}
                  >
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      className="form-input"
                    />
                  </Input>
                  <Input label="Remaining Balance">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={loanBalanceRemaining}
                      onChange={(e) =>
                        setLoanBalanceRemaining(e.target.value)
                      }
                      className="form-input"
                    />
                  </Input>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Interest Rate (optional)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00%"
                      value={loanInterestRate}
                      onChange={(e) => setLoanInterestRate(e.target.value)}
                      className="form-input"
                    />
                  </Input>
                  <Input label="Due Date (optional)">
                    <input
                      type="date"
                      value={loanDueDate}
                      onChange={(e) => setLoanDueDate(e.target.value)}
                      className="form-input"
                    />
                  </Input>
                </div>
                <button
                  type="submit"
                  disabled={
                    !loanName.trim() ||
                    loanAmount === "" ||
                    loanBalanceRemaining === "" ||
                    loading
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editingLoanId ? (
                    <>
                      <Check className="h-4 w-4" />
                      Save Changes
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add Loan
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Bank History Modal */}
      {historyBankId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={(e) => {
            if (e.currentTarget === e.target) closeHistory();
          }}
        >
          <div className="flex h-[85vh] w-full max-w-2xl flex-col rounded-t-3xl bg-card p-6 shadow-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Bank History
                </h2>
                <p className="text-sm text-muted">
                  {banks.find((b) => b.id === historyBankId)?.name}
                </p>
              </div>
              <button
                onClick={closeHistory}
                className="rounded-lg p-2 text-muted hover:bg-input"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-2">
              <input
                type="date"
                value={historyDateFrom}
                onChange={(e) => {
                  setHistoryDateFrom(e.target.value);
                  if (historyBankId && currentUser) {
                    loadHistory(
                      historyBankId,
                      currentUser.id,
                      e.target.value,
                      historyDateTo
                    );
                  }
                }}
                className="form-input h-9 px-3 py-0 text-xs"
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="date"
                value={historyDateTo}
                onChange={(e) => {
                  setHistoryDateTo(e.target.value);
                  if (historyBankId && currentUser) {
                    loadHistory(
                      historyBankId,
                      currentUser.id,
                      historyDateFrom,
                      e.target.value
                    );
                  }
                }}
                className="form-input h-9 px-3 py-0 text-xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {historyItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="text-muted">No history found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyItems.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-center justify-between rounded-xl border border-border bg-input/30 p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-card-foreground">
                          {item.description}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(item.date)} ·{" "}
                          {item.type === "credit" ? "Money Added" : "Expense"}
                        </p>
                      </div>
                      <p
                        className={`text-sm font-semibold ${
                          item.type === "credit"
                            ? "text-success"
                            : "text-danger"
                        }`}
                      >
                        {item.type === "credit" ? "+" : "-"}
                        {formatCurrency(item.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
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

  const totalCategory = useMemo(
    () => categoryData.reduce((sum, d) => sum + d.value, 0),
    [categoryData]
  );

  const [expanded, setExpanded] = useState<"pie" | "bar" | null>(null);

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-1.5">
        <PieChartIcon className="h-3.5 w-3.5 text-muted" />
        <h2 className="text-sm font-semibold text-foreground">Insights</h2>
        {expanded && (
          <button
            onClick={() => setExpanded(null)}
            className="ml-auto rounded-md px-2 py-0.5 text-[10px] font-medium text-muted transition-colors hover:bg-input hover:text-foreground"
          >
            Show both
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Expenses by Category */}
        <div
          onClick={() => setExpanded((prev) => (prev === "pie" ? null : "pie"))}
          className={`cursor-pointer rounded-xl border border-border bg-card p-3 transition-all hover:border-accent/50 ${
            expanded === "bar"
              ? "hidden"
              : expanded === "pie"
                ? "col-span-2"
                : ""
          }`}
        >
          <h3 className="mb-1 text-xs font-medium text-muted">
            Expenses by Category
          </h3>
          <div className={`h-52 ${expanded === "pie" ? "h-72" : ""}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="55%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                  animationBegin={100}
                  animationDuration={700}
                  label={(entry) =>
                    `${Math.round((entry.value / totalCategory) * 100)}%`
                  }
                  labelLine={false}
                >
                  {categoryData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0];
                    const name = item.name ?? "";
                    const value = typeof item.value === "number" ? item.value : 0;
                    const percent =
                      totalCategory > 0
                        ? Math.round((value / totalCategory) * 100)
                        : 0;
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                        <p className="text-xs font-medium text-foreground">
                          {name}
                        </p>
                        <p className="text-xs text-muted">
                          {formatCurrency(value)} ({percent}%)
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="circle"
                  wrapperStyle={{ fontSize: "11px", color: "var(--muted)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bank Usage */}
        <div
          onClick={() => setExpanded((prev) => (prev === "bar" ? null : "bar"))}
          className={`cursor-pointer rounded-xl border border-border bg-card p-3 transition-all hover:border-accent/50 ${
            expanded === "pie"
              ? "hidden"
              : expanded === "bar"
                ? "col-span-2"
                : ""
          }`}
        >
          <h3 className="mb-1 text-xs font-medium text-muted">
            Bank Balance vs Spending
          </h3>
          <div className={`h-52 ${expanded === "bar" ? "h-72" : ""}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bankData}
                margin={{ top: 14, right: 6, left: -12, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload) return null;
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                        <p className="mb-1 text-xs font-medium text-foreground">
                          {label}
                        </p>
                        {payload.map((entry, idx) => (
                          <p
                            key={idx}
                            className="text-xs text-muted"
                            style={{ color: entry.color }}
                          >
                            {entry.name}: {formatCurrency(
                              typeof entry.value === "number" ? entry.value : 0
                            )}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={20}
                  iconType="circle"
                  wrapperStyle={{ fontSize: "11px", color: "var(--muted)" }}
                />
                <Bar
                  dataKey="spent"
                  name="Spent"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  animationDuration={700}
                >
                  <LabelList
                    dataKey="spent"
                    position="top"
                    formatter={(value) =>
                      typeof value === "number" && value > 0
                        ? `$${Math.round(value)}`
                        : ""
                    }
                    className="text-[10px] fill-muted"
                  />
                </Bar>
                <Bar
                  dataKey="remaining"
                  name="Remaining"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  animationDuration={700}
                >
                  <LabelList
                    dataKey="remaining"
                    position="top"
                    formatter={(value) =>
                      typeof value === "number" && value > 0
                        ? `$${Math.round(value)}`
                        : ""
                    }
                    className="text-[10px] fill-muted"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
