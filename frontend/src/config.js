// src/config.js

import buildPool from "../../frontend/src/utils/mergeQuestions";

// --- RAW QUESTION SOURCES ---
import git1 from "../../quiz/git1.json";
import git2 from "../../quiz/git2.json";

import linux1 from "../../quiz/linux1.json";
import linux2 from "../../quiz/linux2.json";

import q1 from "../../quiz/q1.json";

// --- QUESTION POOLS ---
export const QUESTION_POOLS = {
  git: buildPool("git", [git1, git2]),
  linux: buildPool("linux", [linux1, linux2]),
  q: buildPool("q", [q1]),
};

// --- TOPICS SHOWN ON HOME PAGE ---
export const TOPICS = [
  { id: "git", label: "Git" },
  { id: "linux", label: "Linux" },
  { id: "q", label: "q / kdb+" },
];

// --- QUIZ CONFIG (Boss-adjustable) ---
export const QUIZ_CONFIG = {
  // Number of questions per quiz
  questionsPerAttempt: 30,

  // NEW global timer parameter: 15s per question
  // GLOBAL_TIME = 15 × 30 = 450 seconds total
  timePerQuestionSeconds: 15,

  // Scoring rules
  scoring: {
    correct: 1,  // +1 point for correct
    wrong: -1,   // -1 point for wrong
    skipped: 0,  // 0 for skipped
  },
};
