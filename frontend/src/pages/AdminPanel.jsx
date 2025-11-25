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
    // Firestore Timestamp
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
  if (!email || typeof email !== "string") return email;

  const base = email.split("@")[0];
  const parts = base.split(".");
  if (parts.length < 2) return email;

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return parts.map(cap).join(" ");
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
        if (!topicsArr.includes(selectedTopic)) return false;
      }

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
        // date
        valA = toJsDate(a.finishedAt)?.getTime() ?? 0;
        valB = toJsDate(b.finishedAt)?.getTime() ?? 0;
      }

      return sortDir === "asc" ? valA - valB : valB - valA;
    });

    return sorted;
  }, [results, selectedUser, selectedTopic, dateFilter, sortField, sortDir]);

  // -------- SUMMARY STATS ----------
  const stats = useMemo(() => {
    if (!results.length) return null;

    const total = results.length;
    const avg =
      results.reduce((sum, r) => sum + (r.score ?? 0), 0) / total;

    const fastest = Math.min(
      ...results.map((r) => r.durationSeconds ?? Infinity)
    );
    const slowest = Math.max(
      ...results.map((r) => r.durationSeconds ?? 0)
    );

    return {
      total,
      avg: avg.toFixed(1),
      fastest,
      slowest,
    };
  }, [results]);

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
      <div className="pt-20 text-center text-gray-400">
        Loading admin data…
      </div>
    );
  }

  if (!user || !isAdmin(user)) {
    return (
      <div className="pt-20 text-center text-red-400">
        Access denied.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-16 md:pt-24 pb-10 px-4 space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Admin Panel</h1>
      <p className="text-gray-400 text-sm">
        View and inspect all trainees&apos; quiz results.
      </p>

      {error && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* FILTERS */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        {/* User */}
        <div>
          <label
            htmlFor="admin-user-filter"
            className="block text-xs font-medium text-gray-300"
          >
            Filter by user
          </label>
          <div className="mt-2 grid grid-cols-1">
            <select
              id="admin-user-filter"
              className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 py-1.5 pr-8 pl-3 text-base text-white outline-1 -outline-offset-1 outline-white/10 *:bg-gray-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 sm:text-sm"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="all">All users</option>
              {users.map((u) => (
                <option key={u} value={u}>
                  {getNameFromEmail(u)}
                </option>
              ))}              
            </select>
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="pointer-events-none col-start-1 row-start-1 mr-2 h-4 w-4 self-center justify-self-end text-gray-400"
            >
              <path
                d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        {/* Topic */}
        <div>
          <label
            htmlFor="admin-topic-filter"
            className="block text-xs font-medium text-gray-300"
          >
            Filter by topic
          </label>
          <div className="mt-2 grid grid-cols-1">
            <select
              id="admin-topic-filter"
              className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 py-1.5 pr-8 pl-3 text-base text-white outline-1 -outline-offset-1 outline-white/10 *:bg-gray-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 sm:text-sm"
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
            >
              <option value="all">All topics</option>
              <option value="git">Git</option>
              <option value="linux">Linux</option>
              <option value="q">q / kdb+</option>
            </select>
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="pointer-events-none col-start-1 row-start-1 mr-2 h-4 w-4 self-center justify-self-end text-gray-400"
            >
              <path
                d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        {/* Date */}
        <div>
          <label
            htmlFor="admin-date-filter"
            className="block text-xs font-medium text-gray-300"
          >
            Filter by date
          </label>
          <div className="mt-2 grid grid-cols-1">
            <select
              id="admin-date-filter"
              className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 py-1.5 pr-8 pl-3 text-base text-white outline-1 -outline-offset-1 outline-white/10 *:bg-gray-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 sm:text-sm"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">Last week</option>
              <option value="month">Last month</option>
            </select>
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="pointer-events-none col-start-1 row-start-1 mr-2 h-4 w-4 self-center justify-self-end text-gray-400"
            >
              <path
                d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        {/* Sort controls */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800 mt-2">
          <span className="text-xs text-gray-400 mr-2 self-center">
            Sort by:
          </span>
          <button
            type="button"
            onClick={() => toggleSort("date")}
            className={`text-xs px-2 py-1 rounded-md border ${
              sortField === "date"
                ? "border-blue-500 text-blue-400 bg-blue-500/10"
                : "border-gray-700 text-gray-300 hover:border-gray-500"
            }`}
          >
            Date {sortField === "date" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
          <button
            type="button"
            onClick={() => toggleSort("score")}
            className={`text-xs px-2 py-1 rounded-md border ${
              sortField === "score"
                ? "border-blue-500 text-blue-400 bg-blue-500/10"
                : "border-gray-700 text-gray-300 hover:border-gray-500"
            }`}
          >
            Score {sortField === "score" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
          <button
            type="button"
            onClick={() => toggleSort("duration")}
            className={`text-xs px-2 py-1 rounded-md border ${
              sortField === "duration"
                ? "border-blue-500 text-blue-400 bg-blue-500/10"
                : "border-gray-700 text-gray-300 hover:border-gray-500"
            }`}
          >
            Time {sortField === "duration" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
          <button
            type="button"
            onClick={() => toggleSort("user")}
            className={`text-xs px-2 py-1 rounded-md border ${
              sortField === "user"
                ? "border-blue-500 text-blue-400 bg-blue-500/10"
                : "border-gray-700 text-gray-300 hover:border-gray-500"
            }`}
          >
            User {sortField === "user" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
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
            <div
              key={r.id}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
            >
              {/* clickable header */}
              <button
                type="button"
                onClick={() =>
                  setExpandedId((prev) => (prev === r.id ? null : r.id))
                }
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/70 transition"
              >
                <div>
                  <div className="font-semibold text-sm md:text-base">
                  {getNameFromEmail(r.email)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {finishedAt
                      ? finishedAt.toLocaleString()
                      : "Date unavailable"}
                  </div>
                </div>

                <div className="text-right text-xs md:text-sm">
                  <div className={`font-bold ${scoreColor}`}>
                    {r.score} / {r.totalQuestions}
                  </div>
                  {/* <div className="text-gray-400">
                    {formatDuration(r.durationSeconds)}
                  </div> */}
                  
                </div>
              </button>

              {/* expanded details */}
              {isExpanded && (
                <div className="border-t border-gray-800 px-4 py-3 space-y-3 text-xs md:text-sm bg-gray-950/40">
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

                  {/* per-question breakdown */}
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
