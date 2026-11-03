const fs = require("node:fs");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const BASE_URL = process.env.QNO_URL || "http://127.0.0.1:5173";
const timingSamples = [];
let testSession = null;
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync("assets/bot-knowledge.js", "utf8"), sandbox);
const questionBank = sandbox.window.QNO_DBMS_KNOWLEDGE?.questionBank;

function verifyLocalQuestionLists() {
  if (!questionBank?.items?.length) throw new Error("The static site bundle has no local question bank.");
  const unit1 = questionBank.items.filter((item) => item.unit === 1);
  const unit1a = unit1.filter((item) => item.part === "A");
  const unit1b = unit1.filter((item) => item.part === "B");
  const unit2a = questionBank.items.filter((item) => item.unit === 2 && item.part === "A");
  if (unit1.length !== 46 || unit1a.length !== 29 || unit1b.length !== 17 || unit2a.length !== 31) {
    throw new Error(`Local question list count mismatch: Unit1 ${unit1a.length}/${unit1b.length}, Unit2 Part A ${unit2a.length}.`);
  }
  if (unit1a.some((item) => !item.text || !item.page) || unit1b.some((item) => !item.text || !item.page)) {
    throw new Error("One or more source questions are missing wording or PDF page metadata.");
  }
  console.log(JSON.stringify({ test: "LOCAL · Unit shorthand and complete parts", result: "PASS", modelRequests: 0, unit1PartA: unit1a.length, unit1PartB: unit1b.length, unit2PartA: unit2a.length, source: questionBank.source }));
  return { unit1, unit1a, unit1b, unit2a };
}

async function ask(question, history, options = {}) {
  if (!testSession) {
    const sessionResponse = await fetch(`${BASE_URL}/api/qno`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "session-create" }),
    });
    testSession = await sessionResponse.json().catch(() => null);
    if (!sessionResponse.ok || !testSession?.sessionId || !testSession?.sessionToken) throw new Error("Qno could not create a secure test session.");
  }
  const startedAt = performance.now();
  let firstTextAt = null;
  let textChunks = 0;
  let answer = "";
  let serverMetrics = null;
  let streamError = "";
  const response = await fetch(`${BASE_URL}/api/qno`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Qno-Session-ID": testSession.sessionId,
      "X-Qno-Session-Token": testSession.sessionToken,
    },
    body: JSON.stringify({
      question,
      intent: options.followup ? "followup" : "answer",
      history,
      questionContext: options.questionContext || null,
    }),
  });
  const refreshedToken = response.headers.get("X-Qno-Session-Token");
  if (refreshedToken) testSession.sessionToken = refreshedToken;
  if (!response.ok) throw new Error(`Qno API returned HTTP ${response.status}: ${await response.text()}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  function readEvent(eventText) {
    const data = eventText.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    const payload = JSON.parse(data);
    if (payload.metrics) serverMetrics = payload.metrics;
    if (payload.error) {
      streamError = payload.error;
      return;
    }
    if (typeof payload.text === "string" && payload.text) {
      if (firstTextAt === null) firstTextAt = performance.now();
      textChunks += 1;
      answer += payload.text;
    }
  }
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    events.forEach(readEvent);
    if (done) break;
  }
  if (buffer.trim()) readEvent(buffer);
  if (!answer.trim()) throw new Error(streamError || "Qno returned an empty answer.");
  const timing = {
    answer: answer.trim(),
    timing: {
      clientTotalMs: Math.round(performance.now() - startedAt),
      clientTtftMs: firstTextAt === null ? null : Math.round(firstTextAt - startedAt),
      clientTextChunks: textChunks,
      progressiveText: textChunks > 1,
      server: serverMetrics,
      streamError,
    },
  };
  timingSamples.push(timing.timing);
  return timing;
}

const scenarios = [
  {
    name: "TEST 1 · SQL simplification retains SQL",
    turns: ["What is SQL?", "I don't understand."],
    verify: (answer) => /\bsql\b|structured query language/i.test(answer.split(/\r?\n/).slice(0, 4).join(" ")) && /query|command|language|select/i.test(answer),
  },
  {
    name: "TEST 2 · Detailed SQL includes a usable example",
    turns: ["Explain SQL in detail."],
    verify: (answer) => /\bsql\b/i.test(answer) && /select|query/i.test(answer) && answer.length > 260,
  },
  {
    name: "TEST 3 · Normalization example follow-up",
    turns: ["Explain normalization.", "Give an example."],
    verify: (answer) => /normaliz/i.test(answer) && /table|student|duplicate|redundan|anomal/i.test(answer),
  },
  {
    name: "TEST 4 · Primary key compared with foreign key",
    turns: ["What is a primary key?", "Difference between it and foreign key?"],
    verify: (answer) => /primary key/i.test(answer) && /foreign key/i.test(answer) && /unique|identify|reference|refer|link/i.test(answer),
  },
  {
    name: "TEST 5 · ACID second property stays Consistency",
    turns: ["Explain ACID properties.", "Explain the second property more simply."],
    verify: (answer) => /consistency/i.test(answer) && /valid|rule|constraint|correct|consistent/i.test(answer),
  },
  {
    name: "TEST 6 · Explicit topic change to SQL",
    turns: ["What is DBMS?", "Now explain SQL."],
    verify: (answer) => /\bsql\b|structured query language/i.test(answer) && /query|command|language|select/i.test(answer),
  },
];

async function runScenario(scenario) {
  const history = [];
  let finalAnswer = "";
  let testPassed = true;
  for (let index = 0; index < scenario.turns.length; index += 1) {
    const question = scenario.turns[index];
    const result = await ask(question, history.slice(-8), { followup: index > 0 });
    history.push({ role: "user", text: question }, { role: "assistant", text: result.answer });
    finalAnswer = result.answer;
    console.log(JSON.stringify({ test: scenario.name, turn: index + 1, question, ...result.timing, answerPreview: result.answer.slice(0, 260) }));
    if (result.timing.server?.failed || result.timing.streamError) testPassed = false;
  }
  testPassed = testPassed && scenario.verify(finalAnswer);
  console.log(JSON.stringify({ test: scenario.name, result: testPassed ? "PASS" : "FAIL", finalAnswerPreview: finalAnswer.slice(0, 260) }));
  return testPassed;
}

async function runSelectedQuestion(unit1a) {
  const selected = unit1a.find((item) => item.number === 4);
  const history = [
    { role: "user", text: "Unit 1 IMP" },
    { role: "assistant", text: `Unit 1 Part A list. Q4: ${selected.text}` },
  ];
  const result = await ask("Explain question 4.", history, { followup: true, questionContext: selected });
  const passes = /data model/i.test(result.answer) && /hierarchical|network|relational|object/i.test(result.answer) && !/usually worth\s*2\s*marks/i.test(result.answer) && result.timing.server?.apiCalls === 1;
  console.log(JSON.stringify({ test: "TEST 7 · Selected question routes to one Gemini call", result: passes ? "PASS" : "FAIL", selected: { id: selected.id, part: selected.part, number: selected.number, text: selected.text, source: selected.source, page: selected.page }, ...result.timing, answerPreview: result.answer.slice(0, 320) }));
  return passes;
}

async function runSelectedFollowup(unit1a) {
  const selected = unit1a.find((item) => item.number === 4);
  const history = [
    { role: "user", text: "Unit 1 IMP" },
    { role: "assistant", text: `Part A Q4: ${selected.text}` },
    { role: "user", text: "Explain question 4." },
    { role: "assistant", text: "The four data models are hierarchical, network, relational, and object-oriented." },
  ];
  const result = await ask("Give me a 10-mark answer.", history, { followup: true, questionContext: selected });
  const passes = /data model/i.test(result.answer) && result.answer.length > 450 && result.timing.server?.apiCalls === 1;
  console.log(JSON.stringify({ test: "TEST 8 · Selected question depth follow-up", result: passes ? "PASS" : "FAIL", ...result.timing, answerPreview: result.answer.slice(0, 320) }));
  return passes;
}

async function main() {
  const localCounts = verifyLocalQuestionLists();
  const results = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario));
  results.push(await runSelectedQuestion(localCounts.unit1a));
  results.push(await runSelectedFollowup(localCounts.unit1a));
  const passed = results.filter(Boolean).length;
  const liveModelCalls = scenarios.reduce((total, scenario) => total + scenario.turns.length, 0) + 2;
  const average = (selector) => {
    const values = timingSamples.map(selector).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  const median = (selector) => {
    const values = timingSamples.map(selector).filter(Number.isFinite).sort((left, right) => left - right);
    return values.length ? values[Math.floor(values.length / 2)] : null;
  };
  console.log(JSON.stringify({
    summary: true,
    testScenarios: scenarios.length + 2,
    passed,
    failed: results.length - passed,
    studentMessages: liveModelCalls,
    modelRequests: liveModelCalls,
    localQuestionListModelRequests: 0,
    progressiveResponses: timingSamples.filter((sample) => sample.progressiveText).length,
    measurements: {
      averageClientTTFTMs: average((sample) => sample.clientTtftMs),
      medianClientTTFTMs: median((sample) => sample.clientTtftMs),
      averageClientTotalMs: average((sample) => sample.clientTotalMs),
      medianClientTotalMs: median((sample) => sample.clientTotalMs),
      averageServerProcessingMs: average((sample) => sample.server?.serverProcessingMs),
      averageGeminiTimeToFirstTokenMs: average((sample) => sample.server?.timeToFirstTokenMs),
      averageGeminiGenerationMs: average((sample) => sample.server?.geminiGenerationMs),
      averageTotalApiRequestMs: average((sample) => sample.server?.totalApiRequestMs),
      averageTotalResponseMs: average((sample) => sample.server?.totalResponseMs),
      averageGeneratedChunks: average((sample) => sample.server?.generatedChunks),
    },
  }));
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
