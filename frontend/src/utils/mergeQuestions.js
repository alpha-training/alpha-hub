// src/utils/mergeQuestions.js
export default function buildPool(topic, files) {
  const result = [];

  files.forEach((file, fIndex) => {
    const questions = file.questions || [];

    questions.forEach((q, qIndex) => {
      const questionId = `${topic}_${fIndex}_${qIndex}`;
      const type = q.type || "mcq";

      // --- LIVE QUESTION ---
      if (type === "live") {
        result.push({
          id: questionId,
          topic,
          type: "live",

          // backend id like "q3"
          apiId: q.apiId || q.id || "",
          source: q.source || null,
          display: q.display || [],

          // allow explicit parts if provided (preferred)
          // (frontend should render q.promptParts ?? q.questionParts ?? q.question)
          promptParts: Array.isArray(q.promptParts)
            ? q.promptParts
            : Array.isArray(q.questionParts)
            ? q.questionParts
            : null,

          // plain string fallback
          question: q.question || q.prompt || "",

          options: [],
        });

        return;
      }

      // --- MCQ QUESTION ---
      const normalizedOptions = (q.options || []).map((opt, optIndex) => ({
        id: `${questionId}_opt_${optIndex}`,
        text: opt.text ?? opt.label ?? opt.value ?? "",
        parts: Array.isArray(opt.parts) ? opt.parts : null,
        isCorrect: Boolean(opt.isCorrect),
      }));

      result.push({
        id: questionId,
        topic,
        type: "mcq",

        // allow explicit parts if provided (preferred)
        questionParts: Array.isArray(q.questionParts) ? q.questionParts : null,

        // plain string fallback
        question: q.question || "",

        options: normalizedOptions,
      });
    });
  });

  return result;
}
