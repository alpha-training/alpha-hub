// src/api/liveQuestions.js
import { LIVE_CHECKER_API } from "../config";

/**
 * Fetch live questions metadata from backend.
 *
 * Supports multiple backend shapes:
 * A) { result: { ids:[], tries:[], seconds:[] } }
 * B) { result: { result: { ids:[], tries:[], seconds:[] } } }   (double-wrapped)
 * C) { ids:[], tries:[], seconds:[] }
 * D) { result: [...] }   (array form)
 * E) [...]               (array form)
 */
export async function fetchLiveQuestions() {
  const res = await fetch(`${LIVE_CHECKER_API}/ids`, { method: "GET" });
  if (!res.ok) throw new Error(`LIVE questions fetch failed (${res.status})`);

  const data = await res.json();

  // unwrap result repeatedly (some backends wrap 2x)
  let raw = data;
  for (let i = 0; i < 3; i++) {
    if (raw && typeof raw === "object" && "result" in raw) raw = raw.result;
  }

  console.log("[LIVE /ids] final raw:", raw);

  // ---------- Case: array ----------
  if (Array.isArray(raw)) {
    // id-only: ["q1","q2",...]
    if (raw.length && typeof raw[0] === "string") {
      return raw.map((id) => ({
        type: "live",
        apiId: id,          // used for /format/:id and /check/:id
        id: `live_${id}`,   // unique frontend id
        question: "",       // ✅ don't show id as header (prompt comes from /format)
        options: [],
      }));
    }

    // full objects: [{id,prompt,tries,seconds,...}]
    return raw
      .filter((q) => q && typeof q === "object" && q.id)
      .map((q) => ({
        type: "live",
        apiId: q.id,
        id: `live_${q.id}`,
        question: q.prompt || q.question || "", // ✅ prefer real prompt; fallback blank
        tries: Number(q.tries ?? 0) || undefined,
        seconds: Number(q.seconds ?? 0) || undefined,
        source: q.source,
        display: q.display,
        options: [],
      }));
  }

  // ---------- Case: object with ids/tries/seconds arrays ----------
  const ids =
    (Array.isArray(raw?.ids) && raw.ids) ||
    (Array.isArray(raw?.id) && raw.id) ||
    [];

  const tries = Array.isArray(raw?.tries) ? raw.tries : [];
  const seconds = Array.isArray(raw?.seconds) ? raw.seconds : [];

  console.log(
    "[LIVE /ids] ids len:",
    ids.length,
    "tries len:",
    tries.length,
    "seconds len:",
    seconds.length
  );

  return ids.map((id, i) => ({
    type: "live",
    apiId: id,            // used for /format/:id and /check/:id
    id: `live_${id}`,     // unique frontend id
    question: "",         // ✅ don't show id as header (prompt comes from /format)
    tries: Number(tries[i] ?? 0) || undefined,
    seconds: Number(seconds[i] ?? 0) || undefined,
    options: [],
  }));
}
