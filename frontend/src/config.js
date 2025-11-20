// src/config.js
import buildPool from "../../frontend/src/utils/mergeQuestions";
import git1 from "../../quiz/git1.json";
import git2 from "../../quiz/git2.json";
import linux1 from "../../quiz/linux1.json";
import linux2 from "../../quiz/linux2.json";
import q1 from "../../quiz/q1.json";

export const QUESTION_POOLS = {
  git: buildPool("git", [git1, git2]),
  linux: buildPool("linux", [linux1, linux2]),
  q: buildPool("q", [q1]),
};

export const TOPICS = [
  { id: "git", label: "Git" },
  { id: "linux", label: "Linux" },
  { id: "q", label: "q / kdb+" },
];

export const QUIZ_CONFIG = {
  questionsPerAttempt: 30,
  timePerQuestionSeconds: 10,
  scoring: {
    correct: 1,
    wrong: -2,
    skipped: 0,
  },
};
