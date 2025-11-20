// src/utils/mergeQuestions.js
export default function buildPool(topic, files) {
  const result = [];

  files.forEach((file, fIndex) => {
    const questions = file.questions || [];

    questions.forEach((q, qIndex) => {
      const questionId = `${topic}_${fIndex}_${qIndex}`;

      const normalizedOptions = (q.options || []).map((opt, optIndex) => ({
        id: `${questionId}_opt_${optIndex}`,
        text: opt.text ?? opt.label ?? opt.value ?? "",
        isCorrect: Boolean(opt.isCorrect),
      }));

      result.push({
        id: questionId,
        topic,
        question: q.question || "",
        options: normalizedOptions,
      });
    });
  });

  return result;
}
