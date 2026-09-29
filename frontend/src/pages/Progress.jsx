// src/pages/Progress.jsx
import { useEffect, useRef, useState } from "react";
import {
  XMarkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowTopRightOnSquareIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { isAdmin } from "../utils/admin";
import {
  fetchProgress,
  fetchAllProgress,
  revealSolution,
  fetchSolution,
  fetchComparison,
  fetchFeedback,
  saveFeedback,
  fetchTests,
  fetchMyTests,
} from "../api/feedback";

const COURSE_LABELS = {
  fundamentals: "Fundamentals",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// Only graded statuses get a badge; "todo" (not graded yet) shows nothing
const STATUS_STYLES = {
  incorrect: "bg-red-900/60 text-red-300",
  correct: "bg-green-900/60 text-green-300",
};

const courseUrl = (course) => `https://github.com/alpha-training/${course}`;

const readingUrl = (course, id) =>
  `https://github.com/alpha-training/${course}/blob/main/reading/${id}.md`;

const shortSha = (sha) => (sha ? sha.slice(0, 7) : "");

// The folder all these files are in: ["solutions/pubsub/pubsub1.q", "solutions/pubsub/client1.q"] -> "solutions/pubsub"
function commonDir(paths = []) {
  const dirs = paths.map((p) => p.split("/").slice(0, -1));
  if (!dirs.length) return "";
  const common = [];
  for (let i = 0; dirs.every((d) => i < d.length && d[i] === dirs[0][i]); i++) common.push(dirs[0][i]);
  return common.join("/");
}

// The trainee's repo on GitHub as it was at that commit, opened at the folder holding `files`
const commitUrl = (course, username, sha, files) => {
  const dir = commonDir(files);
  const tail = dir ? `/${dir.split("/").map(encodeURIComponent).join("/")}` : "";
  return `https://github.com/alpha-training/${course}-${username}/tree/${sha}${tail}`;
};

const paths = (files) => (files ?? []).map((f) => (typeof f === "string" ? f : f.path));

// plain: show the id without a link (trainees can't open colleagues' repos on GitHub)
// files: the attempt's files (paths or { path }), so the link opens their folder
function CommitLink({ course, username, sha, plain, files }) {
  if (!sha) return null;
  if (plain) return <code className="text-blue-300">{shortSha(sha)}</code>;
  return (
    <a
      href={commitUrl(course, username, sha, paths(files))}
      target="_blank"
      rel="noreferrer"
      title="Open this version on GitHub"
      className="font-mono text-blue-300 hover:text-blue-400 hover:underline"
    >
      {shortSha(sha)}
    </a>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

// "Today 14:32", "Yesterday 09:05", "Mon 22 Sep 16:10" (local time)
function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((day(new Date()) - day(d)) / 86_400_000);
  if (daysAgo === 0) return `Today ${time}`;
  if (daysAgo === 1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

// "Don't show this explanation again": later reveals get the short confirmation instead.
// Per user, per browser.
// v2: choices saved before the short confirmation existed meant "reveal in one click", so they are ignored
const skipConfirmKey = (uid) => `alphahub.skipRevealExplanation.v2.${uid}`;

function loadSkipConfirm(uid) {
  try {
    return localStorage.getItem(skipConfirmKey(uid)) === "1";
  } catch {
    return false;
  }
}

function saveSkipConfirm(uid, skip = true) {
  try {
    if (skip) localStorage.setItem(skipConfirmKey(uid), "1");
    else localStorage.removeItem(skipConfirmKey(uid));
  } catch {
    // storage unavailable (e.g. private mode): the confirmation just shows again next time
  }
}

/* ---------------- modals ---------------- */

function Modal({ title, onClose, children, wide, extraWide }) {
  return (
    <div
      className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${extraWide ? "max-w-7xl" : wide ? "max-w-4xl" : "max-w-md"} max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="bg-transparent p-0" aria-label="Close">
            <XMarkIcon className="w-5 h-5 text-gray-400 hover:text-white" />
          </button>
        </div>
        <div className="p-4 overflow-auto text-sm">{children}</div>
      </div>
    </div>
  );
}

function ConfirmReveal({ exercise, commit, course, username, short, busy, error, onConfirm, onClose }) {
  const [dontAsk, setDontAsk] = useState(false);

  const buttons = (
    <div className="flex justify-end gap-2 pt-2">
      {/* Cancel has focus, so a reflex Enter doesn't reveal */}
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        autoFocus
        className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => onConfirm(dontAsk)}
        disabled={busy}
        className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
      >
        {busy ? "Revealing…" : "Show solution"}
      </button>
    </div>
  );

  if (short) {
    return (
      <Modal title="Show solution?" onClose={busy ? () => {} : onClose}>
        <div className="space-y-3 text-gray-300">
          <p>
            Are you sure you want to see the solution for{" "}
            <span className="font-semibold text-white">{exercise.title}</span>? This can't be undone.
          </p>
          {error && <p className="text-red-400">{error}</p>}
          {buttons}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Show solution: ${exercise.title}`} onClose={busy ? () => {} : onClose}>
      <div className="space-y-3 text-gray-300">
        <p>
          <span className="font-semibold text-white">This can't be undone.</span> Once you've
          seen Alf's solution, this exercise will be marked as revealed.
        </p>
        <p>
          We'll keep a copy of your work as of your latest push
          {commit ? (
            <>
              {" "}(currently <CommitLink course={course} username={username} sha={commit} files={exercise.files} />)
            </>
          ) : null}
          . If you have local changes, push them first.
        </p>
        {error && <p className="text-red-400">{error}</p>}
        <label className="flex items-center gap-2 text-xs text-gray-400 select-none">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            disabled={busy}
            className="accent-blue-600"
          />
          Don't show this explanation again
        </label>
        {buttons}
      </div>
    </Modal>
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers without clipboard API access
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied" : "Copy"}
      aria-label="Copy code"
      className="absolute top-2 right-2 p-1.5 rounded bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white"
    >
      {copied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
    </button>
  );
}

function CodeFile({ file }) {
  return (
    <div>
      <p className="text-xs text-blue-300 font-mono mb-1 break-all">{file.path}</p>
      {file.content == null ? (
        <p className="text-xs text-gray-500">File not found in the snapshot.</p>
      ) : (
        <div className="relative">
          <pre className="bg-[#03080B] border border-gray-800 rounded p-3 pr-12 overflow-auto text-xs font-mono text-gray-100 whitespace-pre">
            {file.content}
          </pre>
          <CopyButton text={file.content} />
        </div>
      )}
    </div>
  );
}


const pencilsDown = (revealedAt, revealCommit, course, username, plain, files) => (
  <>
    Pencils down {formatDate(revealedAt)} at{" "}
    <CommitLink course={course} username={username} sha={revealCommit} plain={plain} files={files} />
  </>
);

// "Naman Jain" -> "Naman J"
function shortName(name) {
  const parts = (name || "").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}` : parts[0] || "";
}

const alfOption = (files) => ({ key: "alf", label: "Alf", subtitle: "Alf's solution", files });

// linkCommit: admins can open any trainee's repo; trainees only their own
const colleagueOption = (course, linkCommit) => (c) => ({
  key: c.username,
  label: shortName(c.name),
  subtitle: (
    <>
      {pencilsDown(c.revealedAt, c.revealCommit, course, c.username, !linkCommit, c.files)} · not checked, so it may not
      be correct
    </>
  ),
  files: c.files,
});

// Trainee: from /reveal or /solution
function traineeComparison(ex, res, course, username) {
  return {
    ex,
    left: {
      title: "Mine",
      subtitle: res.mine ? pencilsDown(res.mine.revealedAt, res.mine.revealCommit, course, username, false, res.mine.files) : null,
      files: res.mine?.files ?? [],
      commit: res.mine?.revealCommit,
    },
    options: [alfOption(res.files), ...(res.colleagues ?? []).map(colleagueOption(course, false))],
    feedback: res.mine && { data: res.mine.feedback, status: res.mine.status, course, username },
  };
}

// Admin: from /admin/compare
function adminComparison(ex, c, course) {
  const { username } = c.trainee;
  return {
    ex,
    left: {
      title: c.trainee.name,
      subtitle: c.pencilsDown ? (
        pencilsDown(c.revealedAt, c.revealCommit, course, username, false, c.attempt)
      ) : (
        <>
          Latest push <CommitLink course={course} username={username} sha={c.commit} files={c.attempt} /> · not
          pencils down yet
        </>
      ),
      files: c.attempt,
      commit: c.commit,
    },
    options: [alfOption(c.alf), ...(c.colleagues ?? []).map(colleagueOption(course, true))],
    feedback: {
      data: c.feedback,
      status: c.status,
      commit: c.commit,
      course,
      username,
      save: (body) => saveFeedback(username, course, ex.id, body),
    },
  };
}

// Trainee: from /feedback. Just their attempt at the commit the feedback was on.
function feedbackComparison(ex, res, course, username) {
  return {
    ex,
    title: "Feedback",
    left: {
      title: "Mine",
      subtitle: (
        <>
          Feedback on <CommitLink course={course} username={username} sha={res.feedback.commit} files={res.files} /> ·{" "}
          {formatDate(res.feedback.at)}
        </>
      ),
      files: res.files,
      commit: res.feedback.commit,
    },
    options: [alfOption([])],
    feedback: { data: res.feedback, status: res.status, course, username },
  };
}

function FileList({ files, empty }) {
  return files.length ? (
    files.map((f) => <CodeFile key={f.path} file={f} />)
  ) : (
    <p className="text-xs text-gray-500">{empty}</p>
  );
}

/* ---------------- tests ---------------- */

// Admin row: "Tests 6/9" (or pending / error), which opens the results
function TestsButton({ tests, onClick }) {
  if (!tests) return null;
  if (tests.none) return <span className="px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-800 text-gray-400">No tests</span>;
  const base = "px-2 py-0.5 rounded text-xs whitespace-nowrap hover:brightness-125";
  const [style, label, title] = tests.pending
    ? ["bg-gray-800 text-gray-400", "Testing…", "Not tested yet: click to run the tests now"]
    : tests.error
      ? ["bg-amber-900/60 text-amber-300", "Tests error", tests.error]
      : [
          tests.passed === tests.total ? "bg-green-900/60 text-green-300" : "bg-red-900/60 text-red-300",
          `Tests ${tests.passed}/${tests.total}`,
          tests.stale ? "For an earlier push: click for the latest" : `At ${shortSha(tests.commit)}`,
        ];
  return (
    <button type="button" onClick={onClick} title={title} className={`${base} ${style} ${tests.stale ? "opacity-60" : ""}`}>
      {label}
    </button>
  );
}

// Performance figures are hidden for now (still measured by the feedback API): set to true to show them
const SHOW_PERF = false;

// "2.5x": how many times slower than Alf's solution; "<1x" beats it. Only when every test passes.
const perfLabel = (r) => `${r < 1 ? "<1" : r.toFixed(1)}x`;
const perfStyle = (r) =>
  r < 1 ? "bg-green-900/60 text-green-300"
  : r < 1.5 ? "bg-gray-800 text-gray-300"
  : r < 3 ? "bg-amber-900/60 text-amber-300"
  : "bg-red-900/60 text-red-300";

// Admin row: a fixed-width slot, so the figures line up like a column
function PerfBadge({ tests }) {
  const r = tests?.perf;
  return (
    <span className="w-12 flex justify-end">
      {r != null && (
        <span
          className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${perfStyle(r)} ${tests.stale ? "opacity-60" : ""}`}
          title={r < 1 ? `Faster than Alf's (${r.toFixed(2)}x his time)` : `${r.toFixed(2)} times slower than Alf's`}
        >
          {perfLabel(r)}
        </span>
      )}
    </span>
  );
}

// The results for the trainee's latest push. data: from /admin/tests, or null while loading
function TestsViewer({ ex, course, data, error, onClose, mine }) {
  return (
    <Modal title={`Tests: ${ex.title}`} onClose={onClose} extraWide>
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !data ? (
        <p className="text-sm text-gray-400">Running the tests…</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="font-semibold">{mine ? "Mine" : data.trainee.name}</p>
            <p className="text-[11px] text-gray-400">
              Latest push{" "}
              <CommitLink course={course} username={data.trainee.username} sha={data.commit} files={data.files} /> ·
              tested {formatWhen(data.at)}
            </p>
          </div>
          {SHOW_PERF && <p className="text-xs text-gray-300">
            Performance:{" "}
            {data.perf == null ? (
              <span className="text-gray-500">{data.perfNote ?? "only timed once every test passes"}</span>
            ) : (
              <>
                <span className={`px-1.5 py-0.5 rounded ${perfStyle(data.perf)}`}>{perfLabel(data.perf)}</span>{" "}
                <span className="text-gray-500">
                  Alf's time, per call ({(data.perfDetail ?? []).map((p) => `${p.name}: ${p.ratio.toFixed(2)}x`).join("; ")})
                </span>
              </>
            )}
          </p>}
          <TestResults tests={data} who={mine ? "Mine" : shortName(data.trainee.name)} />
        </div>
      )}
    </Modal>
  );
}

// A q session, e.g. "q)removeAD \"\"\n'length"
function Terminal({ label, text }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">{label}</p>
      <pre className="font-mono text-[11px] text-gray-200 whitespace-pre-wrap break-all bg-[#03080B] border border-gray-800 rounded px-2 py-1.5 h-full">
        {text}
      </pre>
    </div>
  );
}

// Every check, failures first. A failure shows the trainee's session next to Alf's.
function TestResults({ tests, who = "Theirs" }) {
  if (!tests) return null;
  const rows = [...tests.results].sort((a, b) => a.pass - b.pass);
  return (
    <div className="border border-gray-800 rounded p-3 space-y-1.5">
      <p className="font-semibold text-xs">
        Tests: {tests.passed}/{tests.total} passed
      </p>
      {tests.error && <p className="text-xs text-amber-300 whitespace-pre-wrap">{tests.error}</p>}
      <ul className="space-y-1">
        {rows.map((t, i) => (
          <li key={i} className="text-xs">
            <span className={t.pass ? "text-green-400" : "text-red-400"}>{t.pass ? "✓" : "✗"}</span> {t.name}
            {!t.pass && (t.mine || t.alf) && (
              <div className="ml-4 mt-1 grid sm:grid-cols-2 gap-2">
                <Terminal label={who} text={t.mine || "(nothing)"} />
                <Terminal label="Alf" text={t.alf || "(not compared)"} />
              </div>
            )}
            {t.message && (
              <p className={`ml-4 mt-0.5 text-[11px] text-gray-400 ${t.mine || t.alf ? "" : "font-mono whitespace-pre-wrap break-all"}`}>
                {t.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- feedback ---------------- */

const STATUS_LABELS = { todo: "Not graded", incorrect: "Incorrect", correct: "Correct" };

function StatusBadge({ status }) {
  if (!STATUS_STYLES[status]) return null;
  return <span className={`px-2 py-0.5 rounded text-xs capitalize ${STATUS_STYLES[status]}`}>{status}</span>;
}

function FeedbackNote({ text, label }) {
  if (!text) return null;
  return (
    <div className="mt-1.5 border-l-2 border-amber-500 bg-amber-950/20 rounded-r px-3 py-2 text-xs text-gray-200 whitespace-pre-wrap">
      {label && <p className="text-[11px] text-amber-300 font-mono mb-1 break-all">{label}</p>}
      {text}
    </div>
  );
}

const inputClass =
  "w-full bg-[#03080B] border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500";

// feedback: { data, status, commit, course, username }, plus save() for admins
function FeedbackEditor({ files, feedback, onSaved }) {
  const initial = Object.fromEntries((feedback.data?.files ?? []).map((f) => [f.path, f.comment]));
  const [comments, setComments] = useState(initial);
  const [overall, setOverall] = useState(feedback.data?.overall ?? "");
  const [status, setStatus] = useState(feedback.status ?? "todo");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);   // { ok, text }

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await feedback.save({
        commit: feedback.commit,
        status,
        overall,
        files: files.map((f) => ({ path: f.path, comment: comments[f.path] ?? "" })),
      });
      setMessage({ ok: true, text: "Saved" });
      onSaved?.();
    } catch (e) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const moved = feedback.data && feedback.data.commit !== feedback.commit;

  return (
    <>
      {files.map((f) => (
        <div key={f.path}>
          <CodeFile file={f} />
          <textarea
            value={comments[f.path] ?? ""}
            onChange={(e) => setComments((c) => ({ ...c, [f.path]: e.target.value }))}
            placeholder={`Feedback on ${f.path.split("/").pop()}`}
            rows={2}
            className={`${inputClass} mt-1.5`}
          />
        </div>
      ))}
      <div className="space-y-2 pt-2 border-t border-gray-800">
        <p className="font-semibold text-xs">Overall feedback</p>
        <textarea
          value={overall}
          onChange={(e) => setOverall(e.target.value)}
          rows={3}
          className={inputClass}
        />
        {moved && (
          <p className="text-[11px] text-amber-300">
            The last feedback was on{" "}
            <CommitLink course={feedback.course} username={feedback.username} sha={feedback.data.commit} files={files} />.
            Saving attaches it to{" "}
            <CommitLink course={feedback.course} username={feedback.username} sha={feedback.commit} files={files} />.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {message && (
            <span className={`text-xs ${message.ok ? "text-green-400" : "text-red-400"}`}>{message.text}</span>
          )}
          {feedback.data && (
            <span className="text-[11px] text-gray-500 mr-auto">
              Last saved {formatDate(feedback.data.at)} by {feedback.data.by}
            </span>
          )}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
            aria-label="Status"
          >
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save feedback"}
          </button>
        </div>
      </div>
    </>
  );
}

// Trainee: comments under each file they apply to, then the overall comment
function FeedbackView({ files, feedback, shownCommit }) {
  const fb = feedback.data;
  const byPath = Object.fromEntries((fb?.files ?? []).filter((f) => f.comment).map((f) => [f.path, f.comment]));
  // Comments on files that aren't shown here (e.g. feedback on a different push)
  const elsewhere = (fb?.files ?? []).filter((f) => f.comment && !files.some((s) => s.path === f.path));
  const hasAny = fb && (fb.overall || Object.keys(byPath).length);

  return (
    <>
      {files.length ? (
        files.map((f) => (
          <div key={f.path}>
            <CodeFile file={f} />
            <FeedbackNote text={byPath[f.path]} />
          </div>
        ))
      ) : (
        <p className="text-xs text-gray-500">No attempt found.</p>
      )}
      {hasAny && (
        <div className="space-y-1 pt-2 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-xs">Feedback</p>
            <StatusBadge status={feedback.status} />
            <span className="text-[11px] text-gray-500">{formatDate(fb.at)}</span>
          </div>
          {shownCommit && fb.commit !== shownCommit && (
            <p className="text-[11px] text-amber-300">
              Given on an earlier push,{" "}
              <CommitLink course={feedback.course} username={feedback.username} sha={fb.commit} files={files} />.
            </p>
          )}
          <FeedbackNote text={fb.overall} />
          {elsewhere.map((f) => (
            <FeedbackNote key={f.path} label={f.path} text={f.comment} />
          ))}
        </div>
      )}
    </>
  );
}

// The left column's files: with feedback boxes for admins, feedback notes for trainees
function AttemptFiles({ left, feedback, onSaved }) {
  if (feedback?.save) return <FeedbackEditor files={left.files} feedback={feedback} onSaved={onSaved} />;
  if (feedback?.data) return <FeedbackView files={left.files} feedback={feedback} shownCommit={left.commit} />;
  return <FileList files={left.files} empty="No attempt found." />;
}

// Left: the trainee's pencils-down attempt. Right: Alf or a pencils-down colleague, picked from a dropdown.
function CompareViewer({ comparison, onClose, onSaved }) {
  const { ex, left, options, feedback } = comparison;
  const [pick, setPick] = useState(options[0].key);
  const right = options.find((o) => o.key === pick) ?? options[0];

  // Nothing to compare against (no Alf solution, no pencils-down colleagues): just the attempt
  if (options.length === 1 && !right.files.length) {
    return (
      <Modal title={`${comparison.title ?? "Attempt"}: ${ex.title}`} onClose={onClose} wide>
        <div className="space-y-3">
          <div>
            <p className="font-semibold">{left.title}</p>
            {left.subtitle && <p className="text-[11px] text-gray-400">{left.subtitle}</p>}
          </div>
          <AttemptFiles left={left} feedback={feedback} onSaved={onSaved} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Compare solutions: ${ex.title}`} onClose={onClose} extraWide>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="min-w-0 space-y-3">
          <div className="min-h-[3rem]">
            <p className="font-semibold">{left.title}</p>
            {left.subtitle && <p className="text-[11px] text-gray-400">{left.subtitle}</p>}
          </div>
          <AttemptFiles left={left} feedback={feedback} onSaved={onSaved} />
        </div>

        <div className="min-w-0 space-y-3">
          <div className="min-h-[3rem]">
            {options.length > 1 ? (
              <select
                value={right.key}
                onChange={(e) => setPick(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm font-semibold"
                aria-label="Compare with"
              >
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-semibold">{right.label}</p>
            )}
            <p className="text-[11px] text-gray-400 mt-1">{right.subtitle}</p>
          </div>
          <FileList files={right.files} empty="Not available." />
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- exercise list ---------------- */

// Admins can compare any attempted exercise; trainees once they've revealed
function SolutionCell({ ex, course, username, onReveal, onCompare, adminView }) {
  const base = "px-2.5 py-1 rounded text-xs whitespace-nowrap";

  if (adminView || ex.solution === "revealed") {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <button type="button" onClick={onCompare} className={`${base} bg-gray-800 hover:bg-gray-700`}>
          {ex.solution === "unavailable" ? "View attempt" : "Compare solutions"}
        </button>
        {ex.revealedAt && (
          <span className="text-[11px] text-amber-300">
            Revealed {formatDate(ex.revealedAt)} at{" "}
            <CommitLink course={course} username={username} sha={ex.revealCommit} files={ex.files} />
          </span>
        )}
        {adminView && ex.feedbackAt && (
          <span className="text-[11px] text-gray-400">Feedback given {formatDate(ex.feedbackAt)}</span>
        )}
      </div>
    );
  }
  if (ex.solution === "available") {
    return (
      <button type="button" onClick={onReveal} className={`${base} bg-blue-600 hover:bg-blue-500`}>
        Show solution
      </button>
    );
  }
  return (
    <span className={`${base} text-gray-500`}>
      {ex.solution === "push_first" ? "Push an attempt first" : "Unavailable"}
    </span>
  );
}

function FeedbackButton({ ex, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative px-2.5 py-1 rounded text-xs whitespace-nowrap bg-amber-900/50 hover:bg-amber-900/80 text-amber-200"
    >
      Feedback
      {ex.feedbackNew && (
        <span className="absolute -top-1.5 -right-1.5 px-1 rounded bg-amber-500 text-[10px] font-semibold text-black">
          New
        </span>
      )}
    </button>
  );
}

function CourseSection({ course, username, onReveal, onCompare, onFeedback, onTests, adminView }) {
  // Only exercises the trainee has pushed an attempt at (or has a problem to fix)
  const attempted = course.exercises.filter((e) => e.files.length || e.problem);
  const revealed = attempted.filter((e) => e.revealedAt).length;

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 border-b border-gray-800">
        <a
          href={courseUrl(course.course)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-sm text-blue-300 hover:text-blue-400"
        >
          {COURSE_LABELS[course.course] || course.course} course material
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </a>
        <p className="text-xs text-gray-400">
          {attempted.length} / {course.exercises.length} attempted · {revealed} revealed · latest push{" "}
          <CommitLink course={course.course} username={username} sha={course.commit} />
        </p>
      </div>

      {attempted.length === 0 && (
        <p className="px-4 py-3 text-sm text-gray-400">No attempts pushed yet.</p>
      )}

      <ul className="divide-y divide-gray-800">
        {attempted.map((ex) => (
          <li key={ex.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <a
                href={readingUrl(course.course, ex.id)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-blue-400"
              >
                {ex.title}
              </a>
              <p className="text-[11px] text-gray-500 truncate">{ex.files.join(", ")}</p>
              {adminView && ex.lastCommitAt && (
                <p className="text-[11px] text-gray-400" title={new Date(ex.lastCommitAt).toLocaleString()}>
                  Last commit {formatWhen(ex.lastCommitAt)}
                </p>
              )}
              {ex.problem && <p className="text-[11px] text-red-400">{ex.problem}</p>}
              {ex.missing?.length > 0 && (
                <p className="text-[11px] text-amber-300 truncate" title={ex.missing.join("\n")}>
                  Missing: {ex.missing.join(", ")}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {adminView && SHOW_PERF && <PerfBadge tests={ex.tests} />}
              <TestsButton tests={ex.tests} onClick={() => onTests(course, ex)} />
              <StatusBadge status={ex.status} />
              {!adminView && ex.feedbackAt && <FeedbackButton ex={ex} onClick={() => onFeedback(course, ex)} />}
              <SolutionCell
                ex={ex}
                course={course.course}
                username={username}
                adminView={adminView}
                onReveal={() => onReveal(course, ex)}
                onCompare={() => onCompare(course, ex)}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- page ---------------- */

export default function Progress({ user }) {
  const admin = isAdmin(user);

  const [data, setData] = useState(null);         // trainee: { name, username, courses }
  const [all, setAll] = useState(null);           // admin: [{ name, username, courses }]
  const [selected, setSelected] = useState("");   // admin: username being viewed
  const [tab, setTab] = useState("");             // course tab
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [confirm, setConfirm] = useState(null);   // { course, ex }
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState(null);
  const [skipConfirm, setSkipConfirm] = useState(() => loadSkipConfirm(user.uid));
  const [notice, setNotice] = useState(null);     // reveal/view error shown above the tabs
  const [comparing, setComparing] = useState(null); // { ex, left, options }
  const [testing, setTesting] = useState(null);     // admin: { ex, course, data, error }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  // Close the settings box on a click outside it or on Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (e) => {
      if (!settingsRef.current?.contains(e.target)) setSettingsOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  const setShowExplanation = (show) => {
    saveSkipConfirm(user.uid, !show);
    setSkipConfirm(!show);
  };

  const load = async () => {
    setError(null);
    try {
      if (admin) {
        const res = await fetchAllProgress();
        setAll(res.trainees);
        setSelected((s) => s || res.trainees[0]?.username || "");
      } else {
        setData(await fetchProgress());
      }
    } catch (e) {
      setError(e.code === "not_trainee" ? "You're not enrolled in the training course." : e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  // From the confirmation modal
  const handleConfirmReveal = async (dontAsk) => {
    setRevealing(true);
    setRevealError(null);
    try {
      const res = await revealSolution(confirm.course.course, confirm.ex.id);
      if (dontAsk) {
        saveSkipConfirm(user.uid);
        setSkipConfirm(true);
      }
      setComparing(traineeComparison(confirm.ex, res, confirm.course.course, data?.username));
      setConfirm(null);
      load();
    } catch (e) {
      setRevealError(e.message);
    } finally {
      setRevealing(false);
    }
  };

  // Full explanation first; the short "Are you sure?" once they've opted out of it
  const handleRevealClick = (course, ex) => {
    setRevealError(null);
    setConfirm({ course, ex, short: skipConfirm });
  };

  const handleCompare = async (course, ex) => {
    try {
      setComparing(
        admin
          ? adminComparison(ex, await fetchComparison(selected, course.course, ex.id), course.course)
          : traineeComparison(ex, await fetchSolution(course.course, ex.id), course.course, data?.username)
      );
      if (!admin && ex.feedbackNew) load();
    } catch (e) {
      setNotice(`${ex.title}: ${e.message}`);
    }
  };

  // A trainee's test results: admins any trainee's, trainees their own (may run them, if the latest push
  // isn't tested yet)
  const handleTests = async (course, ex) => {
    setTesting({ ex, course: course.course, data: null, error: null, mine: !admin });
    try {
      const data = admin ? await fetchTests(selected, course.course, ex.id) : await fetchMyTests(course.course, ex.id);
      setTesting((t) => t && t.ex === ex && { ...t, data });
      if (ex.tests?.pending || ex.tests?.stale) load();
    } catch (e) {
      setTesting((t) => t && t.ex === ex && { ...t, error: e.message });
    }
  };

  // Opening it marks it seen, so reload to clear "New"
  const handleFeedback = async (course, ex) => {
    try {
      setComparing(feedbackComparison(ex, await fetchFeedback(course.course, ex.id), course.course, data?.username));
      if (ex.feedbackNew) load();
    } catch (e) {
      setNotice(`${ex.title}: ${e.message}`);
    }
  };

  const shown = admin ? all?.find((t) => t.username === selected) : data;
  // Tabs are the courses the trainee has a repo for; fall back to the first if the selected one isn't there
  const activeCourse = shown?.courses.find((c) => c.course === tab) ?? shown?.courses[0];

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 md:pt-24 pb-10 px-4 flex justify-center">
      <div className="w-full max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Training progress</h1>
            {!admin && (
              <div className="relative" ref={settingsRef}>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((v) => !v)}
                  className="p-1 rounded bg-transparent text-gray-400 hover:text-white"
                  aria-label="Settings"
                  aria-expanded={settingsOpen}
                  title="Settings"
                >
                  <Cog6ToothIcon className="w-5 h-5" />
                </button>
                {settingsOpen && (
                  <div className="absolute left-0 top-full mt-2 z-20 w-72 p-3 rounded-lg border border-gray-700 bg-gray-900 shadow-lg text-sm">
                    <label className="flex items-start gap-2 text-gray-300 select-none">
                      <input
                        type="checkbox"
                        checked={!skipConfirm}
                        onChange={(e) => setShowExplanation(e.target.checked)}
                        className="accent-blue-600 mt-0.5"
                      />
                      <span>
                        Show the full explanation before revealing a solution
                        <span className="block text-xs text-gray-500 mt-0.5">
                          You'll always be asked "Are you sure?" either way.
                        </span>
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
          {admin && all?.length > 0 && (
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
            >
              {all.map((t) => (
                <option key={t.username} value={t.username}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-sm text-gray-300 mb-6">
          {admin
            ? "Each trainee's exercises, their latest pushed attempts and any solutions they've revealed."
            : "Your exercises, based on what you've pushed to your training repos. Click an exercise to open its instructions."}
        </p>

        {!admin && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6 text-xs text-gray-300 space-y-1.5">
            <p className="font-semibold text-white text-sm">How your work is picked up</p>
            <p>
              Exercises appear here once you've pushed an attempt, and each one has to be in exactly
              the right place. In Fundamentals, every standalone exercise gets its own folder under{" "}
              <code className="text-blue-300">solutions/</code> (e.g.{" "}
              <code className="text-blue-300">solutions/myAbs/myAbs.q</code>), and the stack exercises
              are all done in <code className="text-blue-300">stack1/</code> (e.g.{" "}
              <code className="text-blue-300">stack1/proc/hdb.q</code>). Your course README explains
              where solutions go. If something you've pushed doesn't show up, check its path.
            </p>
            <p>
              Where an exercise asks for a function, use exactly the name it gives. Alf's versions end
              in <code className="text-blue-300">2</code> (e.g.{" "}
              <code className="text-blue-300">myAbs2</code>), so you can load both into one session and
              compare.
            </p>
            <p>
              Once you've pushed an attempt, you can reveal Alf's solution. That's final: we keep a copy
              of your work as it was when you revealed ("pencils down"). You'll also see the attempts of
              colleagues who have revealed it, and yours will be shown to colleagues who reveal it after
              you.
            </p>
            <p>
              Most exercises have automated tests, which run each time you push:{" "}
              <span className="text-green-300">Tests 7/7</span> means every check passed. Click it to
              see each check, and for a failure, what your code did next to what Alf's does, so you
              can try it yourself.
            </p>
            <p>
              When a trainer has looked at your attempt, a{" "}
              <span className="text-amber-200">Feedback</span> button appears next to the exercise, with
              comments on each file. This can happen before or after you reveal.
            </p>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !shown?.courses.length ? (
          <p className="text-sm text-gray-400">No training repos found yet.</p>
        ) : (
          <div>
            {notice && (
              <div className="flex items-start justify-between gap-3 mb-4 px-3 py-2 rounded border border-red-900 bg-red-950/40 text-sm text-red-300">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice(null)} className="bg-transparent p-0" aria-label="Dismiss">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex gap-1 border-b border-gray-800 mb-4">
              {shown.courses.map((c) => (
                <button
                  key={c.course}
                  type="button"
                  onClick={() => setTab(c.course)}
                  className={`px-4 py-2 text-sm bg-transparent rounded-none border-b-2 -mb-px ${
                    c.course === activeCourse.course
                      ? "border-blue-500 text-white"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  {COURSE_LABELS[c.course] || c.course}
                </button>
              ))}
            </div>

            <CourseSection
              username={shown.username}
              key={activeCourse.course}
              course={activeCourse}
              adminView={admin}
              onReveal={handleRevealClick}
              onCompare={handleCompare}
              onFeedback={handleFeedback}
              onTests={handleTests}
            />
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmReveal
          exercise={confirm.ex}
          commit={confirm.course.commit}
          course={confirm.course.course}
          username={data?.username}
          short={confirm.short}
          busy={revealing}
          error={revealError}
          onConfirm={handleConfirmReveal}
          onClose={() => setConfirm(null)}
        />
      )}
      {testing && (
        <TestsViewer
          mine={testing.mine}
          ex={testing.ex}
          course={testing.course}
          data={testing.data}
          error={testing.error}
          onClose={() => setTesting(null)}
        />
      )}
      {comparing && (
        <CompareViewer comparison={comparing} onClose={() => setComparing(null)} onSaved={load} />
      )}
    </div>
  );
}
