import buildPool from "../../frontend/src/utils/mergeQuestions";

// --- RAW QUESTION SOURCES ---
import git1 from "../../quiz/git1.json";
//import git2 from "../../quiz/git2.json";

import linux1 from "../../quiz/linux1.json";
import linux2 from "../../quiz/linux2.json";

import q1 from "../../quiz/q1.json";
import live1 from "../../quiz/live1.json";
import finance1 from "../../quiz/finance1.json";
import quant1 from "../../quiz/quant1.json";
import quant2 from "../../quiz/quant2.json";
import trading1 from "../../quiz/trading1.json";

// Set VITE_LIVE_CHECKER_API in .env for prod (Linux box), defaults to localhost for dev.
export const LIVE_CHECKER_API =
  import.meta.env.VITE_LIVE_CHECKER_API || "/live";


// --- QUESTION POOLS ---
export const QUESTION_POOLS = {
  git: buildPool("git", [git1,]),
  linux: buildPool("linux", [linux1, linux2]),
  q: buildPool("q", [q1]),

  live: buildPool("live", [live1]),
  finance: buildPool("finance", [finance1]),
  quant: buildPool("quant", [quant1, quant2]),
  trading: buildPool("trading", [trading1]),
};

// --- TOPICS SHOWN ON HOME PAGE ---
export const TOPICS = [
  { id: "git", label: "Git" },
  { id: "linux", label: "Linux" },
  { id: "q", label: "q / kdb+" },
  { id: "live", label: "Live Checker" },
  { id: "finance", label: "Finance" },
  { id: "quant", label: "Quant / Stats" },
  { id: "trading", label: "Trading" },
];

// --- QUIZ CONFIG ---
export const QUIZ_CONFIG = {
  questionsPerAttempt: 30,

  // per-type seconds (configurable)
  timePerQuestionSecondsByType: {
    mcq: 15,
    live: 20,
  },

  // attempt limits per type
  attemptsLimitByType: {
    live: 2,
  },

  scoring: {
    correct: 1,
    wrong: -1,
    skipped: 0,
  },
};
