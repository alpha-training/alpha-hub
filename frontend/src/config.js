// Global quiz configuration
export const QUIZ_CONFIG = {
    // How many questions per quiz (max; if JSON has fewer, we'll use all)
    QUESTIONS_PER_QUIZ: 30,
  
    // Seconds per question (N), total time = N * numberOfQuestions
    SECONDS_PER_QUESTION: 10,
  
    // Scoring scheme (can be changed later)
    SCORE_CORRECT: 1,
    SCORE_WRONG: -2,
  };
  