import { useLocation, useNavigate } from "react-router-dom";
import { QUIZ_CONFIG, TOPICS } from "../config";

export default function Results() {
  const navigate = useNavigate();
  const { state } = useLocation();

  if (!state) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center text-gray-200 pt-24">
        <p className="mb-4 text-sm">No result data available.</p>
        <button
          onClick={() => navigate("/home")}
          className="px-4 py-2 rounded-md bg-white text-black text-sm"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const {
    score,
    totalQuestions,
    correctCount,
    wrongCount,
    skippedCount,
    results,
    startedAtLocal,
    finishedAtLocal,
    durationSeconds,
    topics = [],
  } = state;

  const topicNames = topics
    .map((t) => TOPICS.find((x) => x.id === t)?.label || t)
    .join(", ");

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-24 pb-10 px-4 flex justify-center">
      <div className="w-full max-w-4xl space-y-6">

        {/* SUMMARY */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1">
              Quiz Results
            </h1>

            <p className="text-sm text-gray-300">
              Score:{" "}
              <span className="font-semibold text-white">{score}</span>
              {" / "}
              {totalQuestions * QUIZ_CONFIG.scoring.correct}
            </p>

            <p className="text-xs text-gray-400 mt-1">
              Topics:{" "}
              <span className="font-semibold text-blue-300">{topicNames}</span>
            </p>

            <p className="text-xs text-gray-400 mt-1">
              Correct: <span className="text-green-400">{correctCount}</span> ·
              Wrong: <span className="text-red-400">{wrongCount}</span> ·
              Skipped: <span className="text-yellow-300">{skippedCount}</span>
            </p>
          </div>

          <div className="text-xs text-gray-400 space-y-1 md:text-right">
            {startedAtLocal && (
              <p>Started: {new Date(startedAtLocal).toLocaleString()}</p>
            )}
            {finishedAtLocal && (
              <p>Finished: {new Date(finishedAtLocal).toLocaleString()}</p>
            )}
            {durationSeconds != null && <p>Duration: {durationSeconds}s</p>}
          </div>
        </div>

        {/* REVIEW SECTION */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">Review your answers</h2>

          <p className="text-xs text-gray-400 mb-2">
            Green = correct answer. Red = wrong. Grey = not selected.
          </p>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {results.map((q, idx) => {
              const selectedSet = new Set(q.selectedOptionIds || []);
              const correctSet = new Set(q.correctOptionIds || []);

              return (
                <div
                  key={q.questionId}
                  className="border border-gray-800 rounded-lg p-3 text-sm bg-gray-950/60"
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <p className="font-medium">
                      {idx + 1}. {q.questionText}
                    </p>

                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        q.isCorrect
                          ? "bg-green-500/10 text-green-400 border border-green-500/40"
                          : selectedSet.size === 0
                          ? "bg-yellow-500/10 text-yellow-300 border border-yellow-500/40"
                          : "bg-red-500/10 text-red-400 border border-red-500/40"
                      }`}
                    >
                      {q.isCorrect
                        ? "Correct"
                        : selectedSet.size === 0
                        ? "Skipped"
                        : "Wrong"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {q.options.map((opt) => {
                      const isSelected = selectedSet.has(opt.id);
                      const isCorrect = correctSet.has(opt.id);

                      let css =
                        "rounded-md px-3 py-1.5 border text-xs flex items-center gap-2";

                      if (isCorrect) {
                        css +=
                          " border-green-500/60 bg-green-500/10 text-green-200";
                      } else if (isSelected) {
                        css +=
                          " border-red-500/60 bg-red-500/10 text-red-200";
                      } else {
                        css += " border-gray-700 bg-gray-900 text-gray-200";
                      }

                      return (
                        <div key={opt.id} className={css}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          <span>{opt.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-3">

          <button
            onClick={() => navigate("/quiz", { state: { topics } })}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm"
          >
            Retake with same topics
          </button>

          <button
            onClick={() => navigate("/home")}
            className="px-4 py-2 rounded-md bg-white text-black text-sm"
          >
            Back to Home
          </button>

        </div>
      </div>
    </div>
  );
}
