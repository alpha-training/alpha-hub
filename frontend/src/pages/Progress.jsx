// src/pages/Progress.jsx
import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { isAdmin } from "../utils/admin";
import {
  fetchProgress,
  fetchAllProgress,
  revealSolution,
  fetchSolution,
} from "../api/feedback";

const COURSE_LABELS = {
  fundamentals: "Fundamentals",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const STATUS_STYLES = {
  todo: "bg-gray-800 text-gray-300",
  incorrect: "bg-red-900/60 text-red-300",
  correct: "bg-green-900/60 text-green-300",
};

const readingUrl = (course, id) =>
  `https://github.com/alpha-training/${course}/blob/main/reading/${id}.md`;

const shortSha = (sha) => (sha ? sha.slice(0, 7) : "");

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

/* ---------------- modals ---------------- */

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-4xl" : "max-w-md"} max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-lg`}
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

function ConfirmReveal({ exercise, commit, busy, error, onConfirm, onClose }) {
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
              {" "}(currently <code className="text-blue-300">{shortSha(commit)}</code>)
            </>
          ) : null}
          . If you have local changes, push them first.
        </p>
        {error && <p className="text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Revealing…" : "Show solution"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SolutionViewer({ exercise, files, onClose }) {
  return (
    <Modal title={`Alf's solution: ${exercise.title}`} onClose={onClose} wide>
      <div className="space-y-4">
        {files.map((f) => (
          <div key={f.path}>
            <p className="text-xs text-blue-300 font-mono mb-1">{f.path}</p>
            <pre className="bg-[#03080B] border border-gray-800 rounded p-3 overflow-auto text-xs font-mono text-gray-100 whitespace-pre">
              {f.content}
            </pre>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------- exercise list ---------------- */

function SolutionCell({ ex, onReveal, onView, canView }) {
  const base = "px-2.5 py-1 rounded text-xs whitespace-nowrap";

  if (ex.solution === "revealed" || canView) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <button type="button" onClick={onView} className={`${base} bg-gray-800 hover:bg-gray-700`}>
          View solution
        </button>
        {ex.revealedAt && (
          <span className="text-[11px] text-amber-300">
            Revealed {formatDate(ex.revealedAt)} at {shortSha(ex.revealCommit)}
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

function CourseSection({ course, onReveal, onView, adminView }) {
  // Only exercises the trainee has pushed an attempt at
  const attempted = course.exercises.filter((e) => e.files.length);
  const revealed = attempted.filter((e) => e.revealedAt).length;

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 border-b border-gray-800">
        <h2 className="font-semibold">{COURSE_LABELS[course.course] || course.course}</h2>
        <p className="text-xs text-gray-400">
          {attempted.length} / {course.exercises.length} attempted · {revealed} revealed · latest push{" "}
          <code className="text-blue-300">{shortSha(course.commit)}</code>
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
              <span className={`px-2 py-0.5 rounded text-xs capitalize ${STATUS_STYLES[ex.status] || STATUS_STYLES.todo}`}>
                {ex.status}
              </span>
              <SolutionCell
                ex={ex}
                canView={adminView && ex.solution !== "unavailable"}
                onReveal={() => onReveal(course, ex)}
                onView={() => onView(course, ex)}
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
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [confirm, setConfirm] = useState(null);   // { course, ex }
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState(null);
  const [viewing, setViewing] = useState(null);   // { ex, files }

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

  const handleReveal = async () => {
    setRevealing(true);
    setRevealError(null);
    try {
      const res = await revealSolution(confirm.course.course, confirm.ex.id);
      setViewing({ ex: confirm.ex, files: res.files });
      setConfirm(null);
      load();
    } catch (e) {
      setRevealError(e.message);
    } finally {
      setRevealing(false);
    }
  };

  const handleView = async (course, ex) => {
    try {
      const res = await fetchSolution(course.course, ex.id);
      setViewing({ ex, files: res.files });
    } catch (e) {
      setError(e.message);
    }
  };

  const shown = admin ? all?.find((t) => t.username === selected) : data;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 md:pt-24 pb-10 px-4 flex justify-center">
      <div className="w-full max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold">Training progress</h1>
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
              of your work as it was when you revealed.
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
          <div className="space-y-6">
            {shown.courses.map((c) => (
              <CourseSection
                key={c.course}
                course={c}
                adminView={admin}
                onReveal={(course, ex) => {
                  setRevealError(null);
                  setConfirm({ course, ex });
                }}
                onView={handleView}
              />
            ))}
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmReveal
          exercise={confirm.ex}
          commit={confirm.course.commit}
          busy={revealing}
          error={revealError}
          onConfirm={handleReveal}
          onClose={() => setConfirm(null)}
        />
      )}
      {viewing && (
        <SolutionViewer exercise={viewing.ex} files={viewing.files} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
