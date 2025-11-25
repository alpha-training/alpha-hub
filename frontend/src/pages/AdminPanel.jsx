// src/pages/AdminPanel.jsx
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "../firebase";
import { isAdmin } from "../utils/admin";

// --- helpers ---
function toJsDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (value.seconds != null) {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function formatDuration(sec) {
  if (sec == null) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function getNameFromEmail(email) {
  if (!email) return email;

  const base = email.split("@")[0];
  const parts = base.split(".");
  if (parts.length < 2) return email;

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return parts.map(cap).join(" ");
}

function normalizeTopic(t) {
  if (!t) return "";
  return t.toLowerCase().trim();
}

export default function AdminPanel() {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  // filters
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  // sorting
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  // expanded row
  const [expandedId, setExpandedId] = useState(null);

  const user = auth.currentUser;

  // -------- LOAD RESULTS (admin only) ----------
  useEffect(() => {
    if (!user || !isAdmin(user)) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const snap = await getDocs(collection(db, "quizResults"));
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setResults(all);
      } catch (err) {
        console.error("Admin load error:", err);
        setError("Failed to load admin data.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  // -------- UNIQUE USERS LIST ----------
  const users = useMemo(() => {
    const list = Array.from(new Set(results.map((r) => r.email))).filter(Boolean);
    return list.sort();
  }, [results]);

  // -------- FILTER + SORT ----------
  const filteredResults = useMemo(() => {
    const now = new Date();

    const filtered = results.filter((r) => {
      if (selectedUser !== "all" && r.email !== selectedUser) return false;

      if (selectedTopic !== "all") {
        const topicsArr = Array.isArray(r.topics) ? r.topics : [];
        const normalized = topicsArr.map(normalizeTopic);
        if (!normalized.includes(selectedTopic)) return false;
      }

    // if (selectedTopic !== "all") {
    //     const topicsArr = Array.isArray(r.topics) ? r.topics : [];
      
    //     // SHOW ONLY results that have exactly ONE topic and it matches the selected one
    //     if (!(topicsArr.length === 1 && topicsArr[0] === selectedTopic)) {
    //       return false;
    //     }
    //   }
      

      if (dateFilter !== "all") {
        const d = toJsDate(r.finishedAt);
        if (!d) return false;

        if (dateFilter === "today") {
          if (d.toDateString() !== now.toDateString()) return false;
        } else {
          const diffDays = (now - d) / (1000 * 60 * 60 * 24);
          if (dateFilter === "week" && diffDays > 7) return false;
          if (dateFilter === "month" && diffDays > 30) return false;
        }
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let valA, valB;

      if (sortField === "score") {
        valA = a.score ?? 0;
        valB = b.score ?? 0;
      } else if (sortField === "user") {
        valA = a.email || "";
        valB = b.email || "";
        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      } else if (sortField === "duration") {
        valA = a.durationSeconds ?? 0;
        valB = b.durationSeconds ?? 0;
      } else {
        valA = toJsDate(a.finishedAt)?.getTime() ?? 0;
        valB = toJsDate(b.finishedAt)?.getTime() ?? 0;
      }

      return sortDir === "asc" ? valA - valB : valB - valA;
    });

    return sorted;
  }, [results, selectedUser, selectedTopic, dateFilter, sortField, sortDir]);

  // -------- SORT HANDLER ----------
  const toggleSort = (field) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevField;
      }
      setSortDir("desc");
      return field;
    });
  };

  // -------- RENDER --------
  if (loading) {
    return (
      <div className="pt-20 text-center text-gray-400">Loading admin data…</div>
    );
  }

  if (!user || !isAdmin(user)) {
    return (
      <div className="pt-20 text-center text-red-400">Access denied.</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-16 md:pt-24 pb-10 px-4 space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Admin Panel</h1>
      <p className="text-gray-400 text-sm">View and inspect all trainees' quiz results.</p>

      {error && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* FILTERS */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">

        {/* User */}
        <div>
          <label className="block text-xs md:text-sm font-medium text-gray-300">
            Filter by user
          </label>
          <div className="mt-2 grid grid-cols-1">
            <select
              className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 py-1.5 pr-8 pl-3 text-base text-white outline-1 -outline-offset-1 outline-white/10 *:bg-gray-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 sm:text-sm"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="all">All users</option>
              {users.map((u) => (
                <option key={u} value={u}>{getNameFromEmail(u)}</option>
              ))}
            </select>
            <svg viewBox="0 0 16 16" aria-hidden="true"
              className="pointer-events-none col-start-1 row-start-1 mr-2 h-4 w-4 self-center justify-self-end text-gray-400">
              <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </div>
        </div>

        {/* Topic buttons */}
        <div>
          <label className="block text-xs md:text-sm font-medium text-gray-300 pt-2">Filter by topic</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { label: "All", value: "all" },
              { label: "Git", value: "git" },
              { label: "Linux", value: "linux" },
              { label: "q / kdb+", value: "q" },
            ].map((btn) => (
              <button
                key={btn.value}
                type="button"
                onClick={() => setSelectedTopic(btn.value)}
                className={`text-xs md:text-sm px-3 py-1 rounded-md border transition ${
                  selectedTopic === btn.value
                    ? "border-blue-500 text-blue-400 bg-blue-500/10"
                    : "border-gray-700 text-gray-300 hover:border-gray-500"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
        {/* Date buttons */}
        <div>
        <label className="block text-xs md:text-sm font-medium text-gray-300 pt-2">
            Filter by date
        </label>

        <div className="mt-2 flex flex-wrap gap-2">
            {[
            { label: "All time", value: "all" },
            { label: "Today", value: "today" },
            { label: "Last week", value: "week" },
            { label: "Last month", value: "month" },
            ].map((btn) => (
            <button
                key={btn.value}
                type="button"
                onClick={() => setDateFilter(btn.value)}
                className={`text-xs md:text-sm px-3 py-1 rounded-md border transition
                ${
                    dateFilter === btn.value
                    ? "border-blue-500 text-blue-400 bg-blue-500/10"
                    : "border-gray-700 text-gray-300 hover:border-gray-500"
                }`}
            >
                {btn.label}
            </button>
            ))}
        </div>
        </div>

        {/* Sort controls */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800 mt-2">
          <span className="text-xs text-gray-300 mr-2 self-center">Sort by:</span>

          {[
            { field: "date", label: "Date" },
            { field: "score", label: "Score" },
            { field: "duration", label: "Time" },
            { field: "user", label: "User" },
          ].map((btn) => (
            <button
              key={btn.field}
              type="button"
              onClick={() => toggleSort(btn.field)}
              className={`text-xs px-2 py-1 rounded-md border ${
                sortField === btn.field
                  ? "border-blue-500 text-blue-400 bg-blue-500/10"
                  : "border-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              {btn.label} {sortField === btn.field ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
          ))}
        </div>
      </div>

      {/* RESULTS LIST */}
      <div className="space-y-3">
        {filteredResults.length === 0 && (
          <div className="text-gray-400 text-sm">No results found.</div>
        )}

        {filteredResults.map((r) => {
          const finishedAt = toJsDate(r.finishedAt);
          const startedAt = toJsDate(r.startedAt);
          const topicsArr = Array.isArray(r.topics) ? r.topics : [];
          const isExpanded = expandedId === r.id;

          let scoreColor = "text-gray-200";
          if (r.score >= 24) scoreColor = "text-green-400";
          else if (r.score >= 15) scoreColor = "text-blue-400";
          else if (r.score >= 8) scoreColor = "text-yellow-300";
          else scoreColor = "text-red-400";

          return (
            <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/70 transition"
              >
                <div className="flex items-center">
                  <div>
                    <div className="font-semibold text-sm md:text-base">
                      {getNameFromEmail(r.email)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {finishedAt ? finishedAt.toLocaleString() : "Date unavailable"}
                    </div>
                  </div>

                  {/* --- TOPICS ON CARD --- */}
                  <div className="text-xs md:text-base text-blue-300 font-medium ml-4 md:ml-20">
                    {topicsArr.length
                      ? topicsArr.map((t) => (t === "q" ? "q / kdb+" : t)).join(", ")
                      : "No topics"}
                  </div>
                </div>

                <div className="text-right text-xs md:text-sm">
                  <div className={`font-bold ${scoreColor}`}>
                    {r.score} / {r.totalQuestions}
                  </div>
                  <div className="text-gray-400 text-xs">
                    {formatDuration(r.durationSeconds)}
                  </div>
                </div>
              </button>

             {/* Animated expand/collapse */}
            <div
            className={`
            overflow-hidden transition-all duration-300 ease-out
            ${isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}
            `}
            >
            <div className="border-t border-gray-800 px-4 py-3 space-y-3 text-xs md:text-sm bg-gray-950/40">
            {/* --- SAME CONTENT AS BEFORE --- */}
            <div className="flex flex-wrap gap-4">
                <div>
                <span className="text-gray-400">Topics: </span>
                <span className="text-gray-200">
                    {topicsArr.length ? topicsArr.join(", ") : "—"}
                </span>
                </div>
                <div>
                <span className="text-gray-400">Started: </span>
                <span className="text-gray-200">
                    {startedAt ? startedAt.toLocaleString() : "—"}
                </span>
                </div>
            </div>

            <div className="flex flex-wrap gap-4">
                <div>
                <span className="text-gray-400">Correct: </span>
                <span className="text-green-400 font-semibold">
                    {r.correctCount}
                </span>
                </div>
                <div>
                <span className="text-gray-400">Wrong: </span>
                <span className="text-red-400 font-semibold">
                    {r.wrongCount}
                </span>
                </div>
                <div>
                <span className="text-gray-400">Skipped: </span>
                <span className="text-yellow-300 font-semibold">
                    {r.skippedCount}
                </span>
                </div>
            </div>

            {/* Question breakdown */}
            {Array.isArray(r.results) && r.results.length > 0 && (
                <div className="mt-2">
                <div className="text-gray-400 text-xs mb-1">
                    Question breakdown:
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                    {r.results.map((qRes, idx) => {
                    const status = qRes.isCorrect
                        ? "Correct"
                        : (qRes.selectedOptionIds || []).length === 0
                        ? "Skipped"
                        : "Wrong";

                    const statusColor = qRes.isCorrect
                        ? "text-green-400"
                        : (qRes.selectedOptionIds || []).length === 0
                        ? "text-yellow-300"
                        : "text-red-400";

                    return (
                        <div
                        key={qRes.questionId || idx}
                        className="border border-gray-800 rounded-md px-2 py-1"
                        >
                        <div className="flex justify-between gap-3">
                            <div className="text-[11px] md:text-xs text-gray-200 whitespace-pre-wrap">
                            {idx + 1}. {qRes.questionText}
                            </div>
                            <div
                            className={`text-[11px] md:text-xs font-semibold ${statusColor}`}
                            >
                            {status}
                            </div>
                        </div>
                        </div>
                    );
                    })}
                </div>
                </div>
            )}
            </div>
            </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
