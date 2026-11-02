# DBMS Field Guide

This is the existing static DBMS study site with the Qno tutor. Unit and lesson pages are generated from `src/content/`; the site remains usable without Gemini.

## Qno question lists

The generated question index contains only these two study sources:

- `DBMS IMPORTANT QUESTIONS-UNI TWISE(1-6).pdf` — the original Part A and Part B question wording, Unit, question number, and PDF page.
- `DBMS-1 (1).PNG` — the official unit syllabus image and its OCR text.

Qno bundles the question list into the static site. Requests such as “Unit 1 important”, “Unit 1 IMP”, “Unit 2 Part A”, and “all Part B questions from Unit 3” are filtered in the browser and make no Gemini/API request. The complete Unit 1 source list has 29 Part A and 17 Part B entries. Selecting a question sends its exact source wording and Unit/Part/number metadata to Gemini for an explanation.

Lecture-note PDFs and previous-paper PDFs are not in the generated DBMS question index. The source PDF files remain in the project folder and are not copied into the deployable `public/` directory.

## Local preview

1. Install Node.js 18+ and Python 3.
2. Add `GEMINI_API_KEY=your-key` to the ignored project-root `.env` file to enable AI answers.
3. Run `npm run build` and `npm start`.
4. Open `http://127.0.0.1:5173`.

The local Node process serves the static preview and shares the same Qno handler used by the Vercel Function. The browser never receives the API key.

## Index regeneration

Install the source-index dependencies with `python -m pip install -r requirements-indexing.txt`, then run `npm run index:dbms` after either indexed source changes. This reads the Important Questions PDF and OCRs only the syllabus image. It regenerates `knowledge/dbms/`; it does not process the lecture notes or past-paper PDFs. These indexing-only packages are kept out of Vercel's automatically detected `requirements.txt` so deploys do not install them unnecessarily.

`npm run build` regenerates the existing pages, bundles the static question list into `assets/bot-knowledge.js`, and stages the site in `public/` for Vercel. The deployment output includes the site and generated question data, not the original source PDFs, `.env`, or source-index script.

## Vercel setup

Deploy with the project root as the Vercel project root. Add `GEMINI_API_KEY` as a server-side Vercel environment variable and redeploy. `api/qno.js` is the single Gemini Function endpoint; GET reports connection status and POST streams tutor answers. `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`.

Run `npm run test:qno` for the conversation and streaming checks. It reports browser-style TTFT, total time, server overhead, Gemini generation time, and model request count. Provider and network latency vary by request.
