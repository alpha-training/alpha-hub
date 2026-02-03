// src/pages/AdminPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { isAdmin } from "../utils/admin";
import { QUIZ_CONFIG, LIVE_CHECKER_API } from "../config";
import {
  getPoints,
  getMaxPointsForAttempt,
  getDisplayBreakdown,
  formatPct,
} from "../utils/scoring";

/* ---------------- helpers ---------------- */

function toJsDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (value.seconds != null) return new Date(value.seconds * 1000);
  return null;
}

function formatDuration(sec) {
  if (sec == null) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
}

function getNameFromEmail(email) {
  if (!email) return "Unknown";
  const base = email.split("@")[0] || "";
  const parts = base.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return parts.map(cap).join(" ");
  if (parts.length === 1) return cap(parts[0]);
  return email;
}

function normalizeTopic(t) {
  if (!t) return "";
  return t.toLowerCase().trim();
}

const TOPIC_LABELS = {
  git: "Git",
  linux: "Linux",
  q: "q / kdb+",
  live: "Live Checker",
  finance: "Finance",
  quant: "Quant / Stats",
  trading: "Trading",
};

function formatTopics(topicsArr) {
  const arr = Array.isArray(topicsArr) ? topicsArr : [];
  if (!arr.length) return "No topics";
  return arr.map((t) => TOPIC_LABELS[normalizeTopic(t)] || t).join(", ");
}

function getDisplayNameFromResult(r) {
  const first = (r.userFirstName || "").trim();
  const last = (r.userLastName || "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  return getNameFromEmail(r.email);
}

function getProfileDisplayName(uid, profilesByUid, fallbackResult) {
  const p = uid ? profilesByUid?.[uid] : null;
  const first = (p?.firstName || "").trim();
  const last = (p?.lastName || "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  return getDisplayNameFromResult(fallbackResult);
}

function looksLikeId(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (t.length <= 5) return true;
  if (/^[a-z]\d+$/i.test(t)) return true;
  return false;
}

// robust stringify for backend shapes
const toText = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(toText).join("");
  if (typeof v === "object") {
    if (typeof v.value === "string") return v.value;
    if (Array.isArray(v.values)) return v.values.map(toText).join("\n");
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
};

// unwrap { result: ... } a few times
function unwrapResult(data) {
  let raw = data;
  for (let i = 0; i < 3; i++) {
    if (raw && typeof raw === "object" && raw !== null && "result" in raw) {
      raw = raw.result;
    }
  }
  return raw;
}

// fetch prompt+alfs
async function fetchLiveFormat(apiId) {
  if (!apiId) return { prompt: "", alfs: "" };

  try {
    const res = await fetch(`${LIVE_CHECKER_API}/format/${apiId}`, {
      method: "POST",
    });
    if (!res.ok) return { prompt: "", alfs: "" };

    const data = await res.json().catch(() => null);
    const r = unwrapResult(data);

    const prompt = r?.prompt ?? r?.question ?? r?.title ?? r?.name ?? "";
    const alfs = r?.alfs ?? "";

    return {
      prompt: toText(prompt).trim(),
      alfs: toText(alfs).trim(),
    };
  } catch {
    return { prompt: "", alfs: "" };
  }
}

// ✅ re-check a previously saved live attempt against backend
async function recheckLiveAttempt(apiId, attempt) {
  if (!apiId) return { ok: false };
  const a = String(attempt || "").trim();
  if (!a) return { ok: false };

  try {
    const res = await fetch(`${LIVE_CHECKER_API}/check/${apiId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt: a }),
    });

    if (!res.ok) return { ok: false };

    const data = await res.json().catch(() => null);
    // backend returns { result: "Success" } or similar
    return { ok: data?.result === "Success", raw: data?.result };
  } catch {
    return { ok: false };
  }
}

// decide if a live question needs recheck
function shouldRecheckLive(q) {
  if (q?.type !== "live") return false;
  if (!q?.apiId) return false;

  const st = q?.liveStatus?.status || "idle";
  if (st === "timeout" || st === "correct") return false; // don't touch timeouts/correct

  const attempt = String(q?.attempt || "").trim();
  if (!attempt) return false; // skipped

  // if it's already correct, skip
  if (q?.isCorrect === true) return false;

  return true;
}

/* =================== ADMIN PANEL =================== */

export default function AdminPanel({ user }) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [profilesByUid, setProfilesByUid] = useState({});
  const [error, setError] = useState(null);

  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const [expandedId, setExpandedId] = useState(null);

  // background repair state (optional indicator)
  const [repairing, setRepairing] = useState(false);
  const repairedOnceRef = useRef(false);

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

        const userSnap = await getDocs(collection(db, "users"));
        const map = {};
        userSnap.docs.forEach((d) => {
          map[d.id] = d.data();
        });
        setProfilesByUid(map);
      } catch (err) {
        console.error("Admin load error:", err);
        setError("Failed to load admin data.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  const users = useMemo(() => {
    const list = Array.from(new Set(results.map((r) => r.uid))).filter(Boolean);
    return list.sort();
  }, [results]);

  const sampleResultByUid = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      if (r?.uid && !map.has(r.uid)) map.set(r.uid, r);
    }
    return map;
  }, [results]);

  // ✅ Background repair: recheck old live answers once after results load
  useEffect(() => {
    if (!results.length) return;
    if (repairedOnceRef.current) return;
    repairedOnceRef.current = true;

    let cancelled = false;

    const run = async () => {
      // Collect candidate jobs (only those that look wrong but have attempt & not timeout)
      const jobs = [];
      for (let ri = 0; ri < results.length; ri++) {
        const row = results[ri];
        const arr = Array.isArray(row?.results) ? row.results : [];
        for (let qi = 0; qi < arr.length; qi++) {
          const q = arr[qi];
          if (shouldRecheckLive(q)) {
            jobs.push({ ri, qi, apiId: q.apiId, attempt: q.attempt });
          }
        }
      }

      if (!jobs.length) return;

      setRepairing(true);

      // clone shallowly so we can patch in place
      const patched = results.map((r) => ({
        ...r,
        results: Array.isArray(r.results) ? [...r.results] : r.results,
      }));

      const CONCURRENCY = 4;
      let cursor = 0;

      const worker = async () => {
        while (cursor < jobs.length && !cancelled) {
          const job = jobs[cursor++];
          const check = await recheckLiveAttempt(job.apiId, job.attempt);
          if (cancelled) return;

          if (check.ok) {
            const row = patched[job.ri];
            const q = row?.results?.[job.qi];
            if (!q) continue;

            row.results[job.qi] = {
              ...q,
              isCorrect: true,
              liveStatus: { ...(q.liveStatus || {}), status: "correct" },
            };
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      if (cancelled) return;

      setResults(patched);
      setRepairing(false);
    };

    run().catch((e) => {
      console.error("Repair pass failed:", e);
      setRepairing(false);
    });

    return () => {
      cancelled = true;
    };
  }, [results]);

  // ✅ Hydrate prompts/alfs for expanded attempt only (no re-check here)
  useEffect(() => {
    let cancelled = false;

    const shouldHydrate = (q) => {
      if (q?.type !== "live") return false;
      if (!q?.apiId) return false;

      const qt = String(q?.questionText || "").trim();
      const apiId = String(q?.apiId || "").trim();

      const needPrompt = !qt || (apiId && qt === apiId) || looksLikeId(qt);
      const needAlfs = !(String(q?.alfs || "").trim());

      return needPrompt || needAlfs;
    };

    const run = async () => {
      if (!expandedId) return;

      const row = results.find((x) => x.id === expandedId);
      if (!row?.results?.length) return;

      const updatedRow = { ...row, results: [...row.results] };
      let changed = false;

      for (let idx = 0; idx < updatedRow.results.length; idx++) {
        const q = updatedRow.results[idx];
        if (!(q?.type === "live" && q?.apiId)) continue;
        if (!shouldHydrate(q)) continue;

        const { prompt, alfs } = await fetchLiveFormat(q.apiId);
        if (cancelled) return;

        const qt = String(q?.questionText || "").trim();
        const apiId = String(q?.apiId || "").trim();
        const needPrompt = !qt || (apiId && qt === apiId) || looksLikeId(qt);
        const needAlfs = !(String(q?.alfs || "").trim());

        updatedRow.results[idx] = {
          ...q,
          questionText: needPrompt && prompt ? prompt : q.questionText,
          alfs: needAlfs && alfs ? alfs : q.alfs || "",
        };
        changed = true;
      }

      if (!changed) return;

      setResults((prev) =>
        prev.map((x) => (x.id === expandedId ? updatedRow : x))
      );
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  const filteredResults = useMemo(() => {
    const now = new Date();

    const filtered = results.filter((r) => {
      if (selectedUser !== "all" && r.uid !== selectedUser) return false;

      if (selectedTopic !== "all") {
        const topicsArr = Array.isArray(r.topics) ? r.topics : [];
        const normalized = topicsArr.map(normalizeTopic);
        if (!normalized.includes(selectedTopic)) return false;
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
        const breakdownA = getDisplayBreakdown(a);
        const breakdownB = getDisplayBreakdown(b);

        const accA =
          breakdownA.attempted > 0 ? breakdownA.correct / breakdownA.attempted : 0;
        const accB =
          breakdownB.attempted > 0 ? breakdownB.correct / breakdownB.attempted : 0;

        valA = accA;
        valB = accB;
      } else if (sortField === "user") {
        const nameA = getProfileDisplayName(a.uid, profilesByUid, a);
        const nameB = getProfileDisplayName(b.uid, profilesByUid, b);
        if (nameA < nameB) return sortDir === "asc" ? -1 : 1;
        if (nameA > nameB) return sortDir === "asc" ? 1 : -1;
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
  }, [
    results,
    profilesByUid,
    selectedUser,
    selectedTopic,
    dateFilter,
    sortField,
    sortDir,
  ]);

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

  if (loading) {
    return (
      <div className="pt-20 text-center text-gray-400">
        Loading admin data…
      </div>
    );
  }

  if (!user || !isAdmin(user)) {
    return <div className="pt-20 text-center text-red-400">Access denied.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto pt-16 md:pt-24 pb-10 px-4 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Admin Panel</h1>
          <p className="text-gray-400 text-sm">
            View and inspect all trainees&apos; quiz results.
          </p>
        </div>

        {repairing ? (
          <div className="text-xs text-gray-500">Repairing old live results…</div>
        ) : null}
      </div>

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
              {users.map((uid) => (
                <option key={uid} value={uid}>
                  {getProfileDisplayName(
                    uid,
                    profilesByUid,
                    sampleResultByUid.get(uid)
                  )}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="pointer-events-none col-start-1 row-start-1 mr-2 h-4 w-4 self-center justify-self-end text-gray-400"
            >
              <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </div>
        </div>

        {/* Topic */}
        <div>
          <label className="block text-xs md:text-sm font-medium text-gray-300 pt-2">
            Filter by topic
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { label: "All", value: "all" },
              { label: TOPIC_LABELS.git, value: "git" },
              { label: TOPIC_LABELS.linux, value: "linux" },
              { label: TOPIC_LABELS.q, value: "q" },
              { label: TOPIC_LABELS.live, value: "live" },
              { label: TOPIC_LABELS.finance, value: "finance" },
              { label: TOPIC_LABELS.quant, value: "quant" },
              { label: TOPIC_LABELS.trading, value: "trading" },
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

        {/* Date */}
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
                className={`text-xs md:text-sm px-3 py-1 rounded-md border transition ${
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

        {/* Sort */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800 mt-2">
          <span className="text-xs text-gray-300 mr-2 self-center">Sort by:</span>
          {[
            { field: "date", label: "Date" },
            { field: "score", label: "Accuracy" },
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
              {btn.label}{" "}
              {sortField === btn.field ? (sortDir === "asc" ? "↑" : "↓") : ""}
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

          const topicLabel = formatTopics(topicsArr);
          const displayName = getProfileDisplayName(r.uid, profilesByUid, r);

          // ✅ scoring utils (derived logic from your scoring.js)
          const breakdown = getDisplayBreakdown(r);
          const points = getPoints(r, QUIZ_CONFIG);
          const maxPoints = getMaxPointsForAttempt(r, QUIZ_CONFIG);

          const accuracy =
            breakdown.attempted > 0 ? breakdown.correct / breakdown.attempted : 0;

          let scoreColor = "text-gray-300";
          if (accuracy >= 0.9) scoreColor = "text-green-400";
          else if (accuracy >= 0.7) scoreColor = "text-blue-400";
          else if (accuracy >= 0.4) scoreColor = "text-yellow-300";
          else scoreColor = "text-red-400";

          return (
            <div
              key={r.id}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedId((prev) => (prev === r.id ? null : r.id))
                }
                className="w-full cursor-pointer flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/70 transition"
              >
                <div className="flex items-center">
                  <div>
                    <div className="font-semibold text-sm md:text-base">
                      {displayName}
                    </div>
                    <div className="text-xs text-gray-400">
                      {finishedAt ? finishedAt.toLocaleString() : "Date unavailable"}
                    </div>
                  </div>

                  <div className="text-xs md:text-base text-blue-300 font-medium ml-4 md:ml-20">
                    {topicLabel}
                  </div>
                </div>

                <div className="text-right text-xs md:text-sm">
                  <div className={`font-bold ${scoreColor}`}>
                    {points} / {maxPoints}{" "}
                    <span className="text-[11px] text-gray-400 font-normal">
                      pts
                    </span>
                  </div>
                  <div className="text-gray-400 text-xs">
                    {formatDuration(r.durationSeconds)}
                  </div>
                </div>
              </button>

              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  isExpanded ? "max-h-[700px] opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="border-t border-gray-800 px-4 py-3 space-y-3 text-xs md:text-sm bg-gray-950/40">
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <span className="text-gray-400">Topics: </span>
                      <span className="text-gray-300">{topicLabel}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Started: </span>
                      <span className="text-gray-300">
                        {startedAt ? startedAt.toLocaleString() : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <div>
                      <span className="text-gray-400">Correct: </span>
                      <span className="text-green-400 font-semibold">
                        {breakdown.correct}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Wrong: </span>
                      <span className="text-red-400 font-semibold">
                        {breakdown.wrong}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Timed out: </span>
                      <span className="text-amber-300 font-semibold">
                        {breakdown.timedOut}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Skipped: </span>
                      <span className="text-yellow-300 font-semibold">
                        {breakdown.skipped}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Attempted: </span>
                      <span className="text-gray-300 font-semibold">
                        {breakdown.attempted}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-gray-400">
                    Points:{" "}
                    <span className="text-gray-300 font-semibold">{points}</span> /{" "}
                    {maxPoints}
                    <span className="text-gray-500"> (pts)</span>
                    {" · "}
                    Accuracy:{" "}
                    <span className="text-gray-300 font-semibold">
                      {formatPct(accuracy)}
                    </span>
                  </div>

                  {Array.isArray(r.results) && r.results.length > 0 && (
                    <div className="mt-2">
                      <div className="text-gray-400 text-xs mb-1">
                        Question breakdown:
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                        {r.results.map((qRes, idx2) => {
                          const type = qRes?.type || "mcq";

                          let status = "Wrong";
                          let statusColor = "text-red-400";

                          if (type === "live") {
                            const st = qRes?.liveStatus?.status || "idle";
                            const liveTimedOut = st === "timeout";
                            const hasAttempt =
                              (qRes?.attempt || "").trim().length > 0;
                            const liveIsCorrect =
                              st === "correct" || qRes?.isCorrect === true;

                            if (liveTimedOut) {
                              status = "Timed out";
                              statusColor = "text-amber-300";
                            } else if (!hasAttempt) {
                              status = "Skipped";
                              statusColor = "text-yellow-300";
                            } else if (liveIsCorrect) {
                              status = "Correct";
                              statusColor = "text-green-400";
                            } else {
                              status = "Wrong";
                              statusColor = "text-red-400";
                            }
                          } else {
                            // MCQ
                            const picked = Array.isArray(qRes?.selectedOptionIds)
                              ? qRes.selectedOptionIds
                              : [];

                            if (picked.length === 0) {
                              status = "Skipped";
                              statusColor = "text-yellow-300";
                            } else if (qRes?.isCorrect) {
                              status = "Correct";
                              statusColor = "text-green-400";
                            } else {
                              status = "Wrong";
                              statusColor = "text-red-400";
                            }
                          }

                          return (
                            <div
                              key={qRes.questionId || idx2}
                              className="border border-gray-800 rounded-md px-2 py-1"
                            >
                              <div className="flex justify-between gap-3">
                                <div className="text-[11px] md:text-xs text-gray-300 whitespace-pre-wrap">
                                  {idx2 + 1}.{" "}
                                  {qRes.questionText ||
                                    qRes.apiId ||
                                    qRes.questionId ||
                                    "(missing question)"}
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
