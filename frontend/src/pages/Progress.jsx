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

// The trainee's repo on GitHub as it was at that commit
const commitUrl = (course, username, sha) =>
  `https://github.com/alpha-training/${course}-${username}/tree/${sha}`;

// plain: show the id without a link (trainees can't open colleagues' repos on GitHub)
function CommitLink({ course, username, sha, plain }) {
  if (!sha) return null;
  if (plain) return <code className="text-blue-300">{shortSha(sha)}</code>;
  return (
    <a
      href={commitUrl(course, username, sha)}
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
              {" "}(currently <CommitLink course={course} username={username} sha={commit} />)
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


const pencilsDown = (revealedAt, revealCommit, course, username, plain) => (
  <>
    Pencils down {formatDate(revealedAt)} at{" "}
    <CommitLink course={course} username={username} sha={revealCommit} plain={plain} />
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
      {pencilsDown(c.revealedAt, c.revealCommit, course, c.username, !linkCommit)} · not checked, so it may not
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
      subtitle: res.mine ? pencilsDown(res.mine.revealedAt, res.mine.revealCommit, course, username) : null,
      files: res.mine?.files ?? [],
    },
    options: [alfOption(res.files), ...(res.colleagues ?? []).map(colleagueOption(course, false))],
  };
}

// Admin: from /admin/compare
function adminComparison(ex, c, course) {
  return {
    ex,
    left: {
      title: c.trainee.name,
      subtitle: c.pencilsDown ? (
        pencilsDown(c.revealedAt, c.revealCommit, course, c.trainee.username)
      ) : (
        <>
          Latest push <CommitLink course={course} username={c.trainee.username} sha={c.commit} /> · not
          pencils down yet
        </>
      ),
      files: c.attempt,
    },
    options: [alfOption(c.alf), ...(c.colleagues ?? []).map(colleagueOption(course, true))],
  };
}

function FileList({ files, empty }) {
  return files.length ? (
    files.map((f) => <CodeFile key={f.path} file={f} />)
  ) : (
    <p className="text-xs text-gray-500">{empty}</p>
  );
}

// Left: the trainee's pencils-down attempt. Right: Alf or a pencils-down colleague, picked from a dropdown.
function CompareViewer({ comparison, onClose }) {
  const { ex, left, options } = comparison;
  const [pick, setPick] = useState(options[0].key);
  const right = options.find((o) => o.key === pick) ?? options[0];

  return (
    <Modal title={`Compare solutions: ${ex.title}`} onClose={onClose} extraWide>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="min-w-0 space-y-3">
          <div className="min-h-[3rem]">
            <p className="font-semibold">{left.title}</p>
            {left.subtitle && <p className="text-[11px] text-gray-400">{left.subtitle}</p>}
          </div>
          <FileList files={left.files} empty="No attempt found." />
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
          Compare solutions
        </button>
        {ex.revealedAt && (
          <span className="text-[11px] text-amber-300">
            Revealed {formatDate(ex.revealedAt)} at{" "}
            <CommitLink course={course} username={username} sha={ex.revealCommit} />
          </span>
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

function CourseSection({ course, username, onReveal, onCompare, adminView }) {
  // Only exercises the trainee has pushed an attempt at
  const attempted = course.exercises.filter((e) => e.files.length);
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
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {STATUS_STYLES[ex.status] && (
                <span className={`px-2 py-0.5 rounded text-xs capitalize ${STATUS_STYLES[ex.status]}`}>
                  {ex.status}
                </span>
              )}
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
              Exercises appear here once you've pushed an attempt. Name each solution file after the
              exercise (e.g. <code className="text-blue-300">myAbs.q</code>). Any folder in your repo
              is fine and case doesn't matter, but don't use a folder called{" "}
              <code className="text-blue-300">alf</code>: files there are treated as copies of Alf's.
              If something you've pushed doesn't show up, check the file name.
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
      {comparing && (
        <CompareViewer comparison={comparing} onClose={() => setComparing(null)} />
      )}
    </div>
  );
}
