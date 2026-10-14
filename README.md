# Interview Practice Coach — Interactive Mock Interview

An end-to-end interactive mock interview coach powered by Gemini with zero-dependency architecture.

**Live Production Demo**: [https://interview-practice-coach-kappa.vercel.app](https://interview-practice-coach-kappa.vercel.app)

---

## Key Features

1. **Setup Screen**:
   - Select job role (or input any custom title).
   - Select difficulty: **Entry-Level (0–2 yrs)**, **Mid-Level (2–5 yrs)**, or **Senior / Lead (5+ yrs)**.
   - Configured for a **5-question simulated mock interview**.

2. **One Question at a Time**:
   - Progressive interview flow with real-time progress bar (`Question X of 5`).
   - Calibrated to the chosen role and seniority level.

3. **30-Second Thinking Timer**:
   - Automatic 30-second countdown before each question to gather thoughts and structure responses (STAR method).
   - "Ready to Answer / Skip Timer" button to start immediately.

4. **Voice or Text Input**:
   - Speak directly into your microphone with real-time speech transcription (Web Speech API).
   - Graceful fallback: if microphone permissions or browser speech support fail, text input is always available and fully functional.
   - Live word counter and character feedback.

5. **Adaptive AI Follow-Up Question**:
   - After each answer, Gemini asks a realistic, targeted follow-up question probing trade-offs, metrics, or edge cases.

6. **3-Part Coaching Feedback**:
   - Evaluated after each follow-up:
     1. **What was good**: Key strengths and positive delivery points.
     2. **What was missing**: Gaps, omitted context, or missing metrics.
     3. **Stronger sample answer**: A gold-standard exemplar response.

7. **Comprehensive Final Summary**:
   - Delivered after completing 5 questions (or on early exit):
     - **Session Overview**
     - **Overall Strengths**
     - **Key Improvement Areas**
     - **Recommended Next Practice**
     - Complete Question-by-Question Review Accordion
   - **Strict coaching rule**: No hiring/rejection score or pass/fail verdict.

8. **Interview Controls**:
   - **Next**: Advance to next question or final summary.
   - **Retry**: Re-attempt the current question.
   - **End Interview**: Exit anytime to review feedback or start over.

---

## Local Setup

```bash
# 1. Clone & setup environment
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=your_key_here

# 2. Start local server
npm start
# or: node server.js
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
