# Interview Practice Coach

A clean, focused web app to practice interview questions with AI feedback:
- **Choose a Job Role**: Select from common roles or enter any custom role.
- **One Interview Question**: Gemini generates a realistic, role-specific question.
- **Type Your Answer**: Write your response at your own pace with a live word counter.
- **Visible Rubric Feedback**: Evaluated on four core dimensions:
  1. **Clarity**: Easy to follow, crisp expression.
  2. **Structure**: Logical organization (e.g. Situation, Action, Result).
  3. **Relevance**: Directly answers the question for the chosen role.
  4. **Examples**: Concrete details, metrics, and real scenarios.
- **Pure Coaching**: No hiring score, no pass/fail verdict, no voice.

---

## Getting Started

### 1. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set your Gemini API key in `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

> **Note**: `.env` is excluded in `.gitignore` to protect your API key.

### 2. Run the App

```bash
node server.js
```

Or using npm:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
