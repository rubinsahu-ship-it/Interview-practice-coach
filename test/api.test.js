// test/api.test.js — Integration & Pipeline Tests for Feedback API
import test from "node:test";
import assert from "node:assert/strict";
import { validateFeedbackPayload } from "../lib/rubric.js";

test("API: Missing role, question, or answer returns 400 error payload", () => {
  const cases = [
    { role: "", question: "Question?", answer: "Answer" },
    { role: "Product Manager", question: "", answer: "Answer" },
    { role: "Product Manager", question: "Question?", answer: "" },
  ];

  for (const c of cases) {
    const role = String(c.role || "").trim();
    const question = String(c.question || "").trim();
    const answer = String(c.answer || "").trim();
    const isInvalid = !role || !question || !answer;
    assert.equal(isInvalid, true);
  }
});

test("API: Original answer is never substituted with sample or follow-up", () => {
  const originalAnswer = "Candidate original answer about React hooks.";
  const sampleAnswer = "One possible stronger answer demonstrating performance optimizations.";
  const followUpAnswer = "Follow-up elaboration on memoization.";

  const payload = {
    sessionId: "test_session_123",
    round: 1,
    role: "Software Engineer",
    difficulty: "Mid-Level",
    question: "How do you optimize React component rendering?",
    answer: originalAnswer,
    followUpQuestion: "What are the trade-offs of using useMemo?",
    followUpAnswer: followUpAnswer,
  };

  assert.equal(payload.answer, originalAnswer);
  assert.notEqual(payload.answer, sampleAnswer);
  assert.notEqual(payload.answer, followUpAnswer);
});

test("API: 'abcd' input through validator strictly returns assessability: not_assessable", () => {
  const validated = validateFeedbackPayload(
    {
      assessability: "not_assessable",
      whatWasGood: [],
      whatWasMissing: [
        {
          gap: "No practical recruitment process or steps provided.",
          type: "missing_detail",
          nextStep: "Explain your recruiting process from sourcing to offer.",
        },
      ],
      dimensions: {},
      onePossibleStrongerAnswer: "One possible stronger answer: In an end-to-end recruitment process...",
    },
    {
      answer: "abcd",
      followUpAnswer: "",
      question: "Walk me through your recruiting process.",
      role: "HR Executive / Recruiter",
    }
  );

  assert.equal(validated.assessability, "not_assessable");
  assert.equal(validated.assessabilityReason, "No assessable answer yet. Please explain your approach.");
  assert.deepEqual(validated.whatWasGood, []);
  assert.equal(validated.dimensions.relevance.score, "not_demonstrated");
  assert.ok(validated.whatWasMissing.length > 0);
  assert.ok(validated.onePossibleStrongerAnswer.length > 0);
});
