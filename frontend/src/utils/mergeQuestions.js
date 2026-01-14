// src/utils/mergeQuestions.js
export default function buildPool(topic, files) {
  const result = [];

  files.forEach((file, fIndex) => {
    const questions = file.questions || [];

    questions.forEach((q, qIndex) => {
      const questionId = `${topic}_${fIndex}_${qIndex}`;

      const type = q.type || "mcq";

      // --- LIVE QUESTION (no MCQ options) ---
      if (type === "live") {
        result.push({
          id: questionId,        // internal quiz id (unique)
          topic,
          type: "live",

          // fields used by live-checker UI/API
          apiId: q.apiId || q.id || "",      // backend id like "q3"
          source: q.source || null,
          display: q.display || [],

          // text shown to user
          question: q.question || q.prompt || "",

          // keep shape stable
          options: [],
        });

        return;
      }

      // --- MCQ QUESTION (existing behavior) ---
      const normalizedOptions = (q.options || []).map((opt, optIndex) => ({
        id: `${questionId}_opt_${optIndex}`,
        text: opt.text ?? opt.label ?? opt.value ?? "",
        isCorrect: Boolean(opt.isCorrect),
      }));

      result.push({
        id: questionId,
        topic,
        type: "mcq",
        question: q.question || "",
        options: normalizedOptions,
      });
    });
  });

  return result;
}
