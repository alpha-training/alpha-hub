// src/pages/History.jsx
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { TOPICS, QUIZ_CONFIG, LIVE_CHECKER_API } from "../config";
import { getDisplayBreakdown, formatPct } from "../utils/scoring";

function formatDuration(seconds) {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function toMillis(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return null;
}

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
    return { ok: data?.result === "Success", raw: data?.result };
  } catch {
    return { ok: false };
  }
}

function calcPointsFromBreakdown(breakdown, quizConfig) {
  const scoring = quizConfig?.scoring || {};
  const ptsCorrect = Number(scoring.correct ?? 1) || 1;
  const ptsWrong = Number(scoring.wrong ?? -1) || -1;
  const ptsSkipped = Number(scoring.skipped ?? 0) || 0;

  const c = Number(breakdown?.correct ?? 0) || 0;
  const w = Number(breakdown?.wrong ?? 0) || 0;
  const s = Number(breakdown?.skipped ?? 0) || 0;

  return c * ptsCorrect + w * ptsWrong + s * ptsSkipped;
}

function calcMaxPointsFromBreakdown(breakdown, quizConfig) {
  const ptsCorrect = Number(quizConfig?.scoring?.correct ?? 1) || 1;
  const attempted = Number(breakdown?.attempted ?? 0) || 0;
  return attempted * ptsCorrect;
}

export default function History({ user }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    let cancelled = false;

    const shouldRecheck = (q) => {
      if (q?.type !== "live") return false;
      if (!q?.apiId) return false;

      const st = q?.liveStatus?.status || "idle";
      if (st === "timeout" || st === "correct") return false;

      const attempt = String(q?.attempt || "").trim();
      if (!attempt) return false;

      return q?.isCorrect !== true; // only recheck "not correct"
    };

    const repairAttempt = async (attemptLike) => {
      const arr = Array.isArray(attemptLike?.results) ? attemptLike.results : [];
      if (!arr.length) return attemptLike;

      const next = [...arr];
      let changed = false;

      for (let i = 0; i < next.length; i++) {
        const q = next[i];
        if (!shouldRecheck(q)) continue;

        const check = await recheckLiveAttempt(q.apiId, q.attempt);
        if (cancelled) return attemptLike;

        if (check.ok) {
          next[i] = {
            ...q,
            isCorrect: true,
            liveStatus: { ...(q.liveStatus || {}), status: "correct" },
          };
          changed = true;
        }
      }

      return changed ? { ...attemptLike, results: next } : attemptLike;
    };

    const load = async () => {
      if (!user) return;

      setLoading(true);
      setRepairing(true);

      try {
        const q = query(
          collection(db, "quizResults"),
          where("uid", "==", user.uid),
          orderBy("startedAt", "desc")
        );

        const snap = await getDocs(q);
        const rawAttempts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Repair before showing, to avoid UI "jump"
        const repaired = [];
        for (const a of rawAttempts) {
          repaired.push(await repairAttempt(a));
          if (cancelled) return;
        }

        if (!cancelled) setAttempts(repaired);
      } catch (e) {
        console.error("History load error:", e);
        if (!cancelled) setAttempts([]);
      } finally {
        if (!cancelled) {
          setRepairing(false);
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 md:pt-24 pb-10 px-4 flex justify-center">
      <div className="w-full max-w-4xl">
        <h1 className="text-2xl font-bold mb-4">History</h1>
        <p className="text-sm text-gray-300 mb-6">
          All your quiz attempts are listed below.
        </p>

        {loading || repairing ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-gray-400">No attempts yet.</p>
        ) : (
          <div className="space-y-3">
            {attempts.map((a, i) => {
              const topicNames = (a.topics || [])
                .map((t) => TOPICS.find((x) => x.id === t)?.label || t)
                .join(", ");

              const startedAtMs = toMillis(a.startedAt);

              const breakdown = getDisplayBreakdown(a);
              const points = calcPointsFromBreakdown(breakdown, QUIZ_CONFIG);
              const maxPoints = calcMaxPointsFromBreakdown(breakdown, QUIZ_CONFIG);

              const accuracy =
                breakdown.attempted > 0
                  ? breakdown.correct / breakdown.attempted
                  : 0;

              return (
                <div
                  key={a.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm flex flex-col items-center text-center gap-2"
                >
                  <div>
                    <p className="font-medium text-sm md:text-base mb-1">
                      Attempt #{attempts.length - i}
                    </p>

                    <p className="text-xs text-blue-300">Topics: {topicNames}</p>

                    <p className="text-xs text-gray-400">
                      {startedAtMs
                        ? new Date(startedAtMs).toLocaleString()
                        : "Unknown date"}
                    </p>
                  </div>

                  <div className="text-xs md:text-sm text-gray-300 space-y-1 w-full max-w-md">
                    <p>
                      Score:{" "}
                      <span className="font-semibold text-white">{points}</span>{" "}
                      /{" "}
                      <span className="font-semibold text-white">{maxPoints}</span>{" "}
                      <span className="text-[11px] text-gray-400">pts</span>
                    </p>

                    <p className="text-[12px] text-gray-400">
                      Accuracy:{" "}
                      <span className="text-gray-300 font-semibold">
                        {formatPct(accuracy)}
                      </span>{" "}
                      · Correct:{" "}
                      <span className="text-green-400">{breakdown.correct}</span>{" "}
                      /{" "}
                      <span className="text-gray-300">{breakdown.attempted}</span>{" "}
                      <span className="text-[11px] text-gray-500">(attempted)</span>
                    </p>

                    <p>
                      Wrong: <span className="text-red-400">{breakdown.wrong}</span>
                      {" · "}
                      Timed out:{" "}
                      <span className="text-amber-300">{breakdown.timedOut}</span>
                      {" · "}
                      Skipped:{" "}
                      <span className="text-yellow-300">{breakdown.skipped}</span>
                    </p>

                    {a.durationSeconds != null && (
                      <p className="text-xs">
                        Duration: {formatDuration(a.durationSeconds)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
