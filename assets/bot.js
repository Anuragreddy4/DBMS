(() => {
  const knowledge = window.QNO_DBMS_KNOWLEDGE;
  const overlay = document.getElementById("qno-overlay");
  const launcher = document.getElementById("qno-open");
  if (!knowledge || !overlay || !launcher) return;

  const rootPrefix = overlay.dataset.rootPrefix || "";
  const closeButton = overlay.querySelector("[data-qno-close]");
  const input = overlay.querySelector("#qno-input");
  const form = overlay.querySelector("#qno-form");
  const scope = overlay.querySelector("#qno-scope");
  const sendButton = overlay.querySelector(".qno-send");
  const statusLabel = overlay.querySelector("[data-qno-status]");
  const privacyNote = overlay.querySelector("[data-qno-privacy]");
  const welcome = overlay.querySelector("#qno-welcome");
  const messages = overlay.querySelector("#qno-messages");
  const scrollArea = overlay.querySelector("#qno-scroll");
  let lastFocus = null;
  let currentUnit = 0;
  let activeQuiz = null;
  let lastTopic = null;
  let geminiConfigured = false;
  let requestPending = false;
  let activeController = null;
  let conversationVersion = 0;
  let activeQuestionContext = null;
  let activeQuestionSet = null;
  let lastAnswerQuery = "";
  let queuedQuestion = null;

  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "can", "could", "do", "does", "explain", "for", "from",
    "give", "how", "i", "in", "is", "it", "me", "of", "on", "or", "please", "tell", "that", "the", "this",
    "to", "what", "when", "where", "which", "who", "why", "with", "would", "you", "about", "show", "find",
    "page", "lesson", "topic", "unit", "some", "more", "example", "examples", "meaning", "define", "definition",
    "understand", "understanding", "understood", "understandable", "confused", "clear", "clarify", "simpler", "simple",
    "different", "differently", "again", "mean",
  ]);

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/database\s+management\s+systems?/g, "dbms")
      .replace(/\bd\s*b\s*m\s*s\b/g, "dbms")
      .replace(/two[\s-]*phase\s+locking/g, "2pl")
      .replace(/b\s*(?:plus|\+)\s*trees?/g, "bplustree")
      .replace(/normalisation/g, "normalization")
      .replace(/serialisability/g, "serializability")
      .replace(/serialisable/g, "serializable")
      .replace(/organisation/g, "organization")
      .replace(/modelling/g, "modeling")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function tokens(value) {
    return normalize(value).split(/\s+/).filter((word) => word && !stopWords.has(word));
  }

  function editDistance(left, right) {
    if (Math.abs(left.length - right.length) > 2) return 9;
    let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
    for (let i = 1; i <= left.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= right.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
        );
      }
      previous = current;
    }
    return previous[right.length];
  }

  const topicRecords = knowledge.topics.map((topic) => {
    const lesson = getLesson(topic);
    const worked = lesson?.worked || {};
    const workedText = [worked.title, worked.setup, ...(worked.steps || []).flatMap((step) => [step.title, step.body]), worked.answer].join(" ");
    const titleText = [topic.title, ...(topic.aliases || [])].join(" ");
    const bodyText = [topic.lessonTitle, topic.unitTitle, topic.definition, ...(topic.details || []), topic.example, lesson?.plain, ...(lesson?.goals || []), lesson?.exam, workedText].join(" ");
    return {
      topic,
      titleText: normalize(titleText),
      titleTokens: new Set(tokens(titleText)),
      bodyTokens: new Set(tokens(bodyText)),
    };
  });
  const lessonRecords = knowledge.units.flatMap((unit) => unit.lessons.map((lesson) => {
    const topic = {
      unit: unit.number,
      unitTitle: unit.title,
      lessonTitle: lesson.title,
      lessonNo: lesson.number,
      title: lesson.title,
      definition: lesson.plain,
      details: lesson.goals,
      example: lesson.worked?.setup || "",
      href: lesson.href,
      lessonHref: lesson.href,
      recordType: "lesson",
    };
    const titleText = lesson.title;
    const bodyText = [unit.title, lesson.plain, ...lesson.goals, lesson.exam, lesson.worked?.title, lesson.worked?.setup, ...(lesson.worked?.steps || []).flatMap((step) => [step.title, step.body]), lesson.worked?.answer].join(" ");
    return { topic, titleText: normalize(titleText), titleTokens: new Set(tokens(titleText)), bodyTokens: new Set(tokens(bodyText)) };
  }));
  const searchRecords = [...topicRecords, ...lessonRecords];

  function searchTopics(query, unitNumber = 0) {
    const normalizedQuery = normalize(query);
    const queryTokens = [...new Set(tokens(query))];
    if (!queryTokens.length) return [];

    const ranked = searchRecords
      .filter(({ topic }) => !unitNumber || topic.unit === unitNumber)
      .map((record) => {
        const { topic, titleText, titleTokens, bodyTokens } = record;
        let score = 0;
        if (normalizedQuery.includes(titleText) || titleText.includes(normalizedQuery)) score += 18;
        let matched = 0;

        queryTokens.forEach((word) => {
          if (titleTokens.has(word)) {
            score += 6;
            matched += 1;
            return;
          }
          if (bodyTokens.has(word)) {
            score += 1.2;
            matched += 0.65;
            return;
          }

          let titleFuzzy = 0;
          titleTokens.forEach((candidate) => {
            if (candidate.length < 4 || word.length < 4) return;
            const distance = editDistance(word, candidate);
            const allowance = Math.max(word.length, candidate.length) >= 8 ? 2 : 1;
            if (distance <= allowance) titleFuzzy = Math.max(titleFuzzy, 3.4 - distance * 0.7);
          });
          if (titleFuzzy) {
            score += titleFuzzy;
            matched += 0.55;
            return;
          }

          let bodyFuzzy = false;
          bodyTokens.forEach((candidate) => {
            if (!bodyFuzzy && candidate.length >= 5 && word.length >= 5 && editDistance(word, candidate) === 1) bodyFuzzy = true;
          });
          if (bodyFuzzy) {
            score += 0.45;
            matched += 0.25;
          }
        });

        score += (matched / queryTokens.length) * 2;
        return { topic, score };
      })
      .sort((a, b) => b.score - a.score);
    return ranked;
  }

  function isReliableTopicMatch(query, match) {
    if (!match?.topic || match.score < 4.5) return false;
    const queryWords = new Set(tokens(query));
    const titleWords = new Set(tokens([match.topic.title, ...(match.topic.aliases || [])].join(" ")));
    return [...queryWords].some((word) => titleWords.has(word));
  }

  function addMessage(role, content) {
    welcome.hidden = true;
    const row = document.createElement("article");
    row.className = `qno-message qno-message-${role}`;
    const avatar = document.createElement("span");
    avatar.className = "qno-message-avatar";
    avatar.textContent = role === "user" ? "Y" : "Q";
    const body = document.createElement("div");
    body.className = "qno-message-body";
    if (role === "user") {
      const bubble = document.createElement("div");
      bubble.className = "qno-user-bubble";
      bubble.textContent = content;
      body.append(bubble);
    } else {
      body.append(content);
    }
    row.append(avatar, body);
    messages.append(row);
    requestAnimationFrame(() => {
      if (content?.classList?.contains("qno-question-list-card")) {
        row.scrollIntoView({ block: "start", behavior: "smooth" });
      } else {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    });
    return body;
  }

  function botText(text) {
    const bubble = document.createElement("div");
    bubble.className = "qno-bot-bubble";
    bubble.textContent = text;
    return addMessage("bot", bubble);
  }

  function greetingPrefix(query) {
    const match = String(query || "").match(/^\s*(hi|hello|hey|good\s+(?:morning|afternoon|evening)|good\s+day)\b[\s,!?.-]*/i);
    return match ? { greeting: match[1].toLowerCase(), rest: query.slice(match[0].length).trim() } : { greeting: "", rest: query.trim() };
  }

  function smallTalkReply(query) {
    const text = normalize(query).replace(/\b(qno|q)\b/g, " ").trim();
    if (/^(hi|hello|hey)( there)?$|^(good morning|good afternoon|good evening|good day)$/.test(text)) {
      if (text.startsWith("good morning")) return "Good morning! I’m Qno. What DBMS topic would you like help with?";
      if (text.startsWith("good afternoon")) return "Good afternoon! I’m Qno. What DBMS topic would you like help with?";
      if (text.startsWith("good evening")) return "Good evening! I’m Qno. What DBMS topic would you like help with?";
      return "Hi! I’m Qno. What DBMS topic would you like help with?";
    }
    if (/^(thanks|thank you|thank you very much|thx)$/.test(text)) return "You’re welcome! Ask another DBMS question whenever you’re ready.";
    if (/^(bye|goodbye|see you|see you later)$/.test(text)) return "Goodbye! I’ll be here when you want to study DBMS again.";
    if (/^(how are you|how are you doing)$/.test(text)) return "I’m ready to help you study. What DBMS idea are you working on?";
    return "";
  }

  function isClarificationRequest(query) {
    return /\b(i (?:still )?(?:do not|don['’]?t|dont) (?:understand|get it)|i(?:'m| am) not understanding|not understanding|still not (?:clear|understandable)|not (?:clear|understandable|easy to understand)|didn['’]?t understand|i(?:'m| am) confused|what do you mean|what does that mean|explain(?: it| that)? (?:again|differently|in other words)|explain(?: it| that)? (?:in )?(?:different|simpler) words|explain again|can you explain (?:again|that again)|say (?:it )?(?:in )?(?:different|simpler) words|put (?:it|that) another way|explain more|another example|one more example|simpler please|make it simpler)\b/i.test(query);
  }

  function isAffirmativeConfirmation(query) {
    const text = String(query || "").toLowerCase().replace(/[,.!?]+/g, " ").replace(/\s+/g, " ").trim();
    return /^(?:(?:yes|yeah|yep|yup|sure|certainly|absolutely|okay|ok|alright|all right)(?: (?:please|do|go ahead|yes|yeah)){0,2}|please|go ahead|please do|do it|that would be (?:great|helpful)|sounds good)$/.test(text);
  }

  function previousAssistantOfferedAction() {
    const previousAssistant = recentConversation(8).filter((turn) => turn.role === "assistant").at(-1)?.text || "";
    return /\b(?:would you like|do you want|shall i|should i|can i|could i|want me to|let me know if you|if you(?:'d| would) like|would it help|would you prefer|i can (?:give|show|provide|write|create|explain|walk you through))\b/i.test(previousAssistant);
  }

  function isContextualFollowUp(query) {
    return (isAffirmativeConfirmation(query) && previousAssistantOfferedAction()) || isClarificationRequest(query) ||
      /\b(?:give (?:me )?(?:an? )?example|example please|for example|explain (?:it |that |this )?(?:simply|in simple english|step by step|more simply|more slowly)|in simple english|step by step|make (?:it|that|this) (?:shorter|simpler|clearer)|shorten (?:it|that)|the (?:first|second|third|next|previous) (?:one|point|property|step)|difference between it and|compare it with)\b/i.test(query) ||
      /\b(?:it|that|this|those|these|same|above|previous|second|third|first|former|latter)\b/i.test(query) ||
      Boolean(activeQuestionContext && /\b(?:\d+\s*[- ]?marks?|exam answer|more detail|give an example)\b/i.test(query));
  }

  function refersBackToPreviousTopic(query) {
    return /\b(?:it|that|this|those|these|same|above|previous|second|third|first|former|latter|another|again|example|simply|shorter|step by step)\b/i.test(query) ||
      isClarificationRequest(query);
  }

  function isAnotherExampleRequest(query) {
    return /\b(another|one more|different) example\b/i.test(query);
  }

  function easyify(text, topic) {
    let result = String(text || "");
    const relational = /relation|relational|tuple|attribute|schema/i.test(`${topic.title} ${topic.lessonTitle || ""}`);
    const replacements = [
      [/database management system/gi, "database management software"],
      [/functional dependencies/gi, "rules linking columns"],
      [/functional dependency/gi, "rule linking columns"],
      [/referential integrity/gi, "the rule that a link must point to an existing row"],
      [/candidate keys/gi, "candidate keys (minimal column sets that identify a row)"],
      [/candidate key/gi, "candidate key (a minimal column set that identifies a row)"],
      [/superkeys/gi, "column sets that uniquely identify rows"],
      [/superkey/gi, "a column set that uniquely identifies a row"],
      [/determinants?/gi, "left-side column sets"],
      [/decomposition/gi, "splitting a table"],
      [/decomposed/gi, "split into smaller tables"],
      [/lossless(?:-join)?/gi, "without losing or inventing rows"],
      [/redundancy/gi, "repeated copies of the same fact"],
      [/redundant/gi, "repeated"],
      [/anomalies/gi, "update problems"],
      [/anomaly/gi, "an update problem"],
      [/serializability/gi, "the guarantee that concurrent work has the same result as a safe one-at-a-time order"],
      [/serializable/gi, "equivalent to a safe one-at-a-time order"],
      [/concurrency control/gi, "coordination of simultaneous transactions"],
      [/transaction/gi, "group of database actions"],
      [/transactions/gi, "groups of database actions"],
      [/functional dependency/gi, "rule between columns"],
      [/attribute values/gi, "column values"],
      [/attributes/gi, relational ? "columns" : "properties"],
      [/attribute/gi, relational ? "column" : "property"],
      [/tuples/gi, "rows"],
      [/tuple/gi, "row"],
      [/relations/gi, relational ? "tables" : "relationships"],
      [/relation/gi, relational ? "table" : "relationship"],
      [/schema/gi, "structure or blueprint"],
      [/instance/gi, "data stored right now"],
      [/domain/gi, "allowed set of values"],
      [/projection/gi, "choosing columns"],
      [/selection/gi, "filtering rows"],
      [/referential/gi, "linking-table"],
      [/stable storage/gi, "permanent storage"],
      [/buffer pool/gi, "memory area for recently used pages"],
      [/disk page/gi, "block of data read from disk"],
      [/leaf pages/gi, "bottom-level pages"],
      [/leaf page/gi, "bottom-level page"],
      [/internal pages/gi, "middle pages"],
      [/internal page/gi, "middle page"],
    ];
    replacements.forEach(([pattern, replacement]) => { result = result.replace(pattern, replacement); });
    return result.replace(/\s+/g, " ").trim();
  }

  const easyExplanations = [
    [/database, dbms, and database system|what is a dbms|database management/i,
      "A database is an organized collection of information. A DBMS is the software that stores it, finds it, changes it, and checks who is allowed to use it. The database system includes the data and the programs that work with it.",
      "Think of a library: the database is the collection, and the DBMS is the librarian and catalog system that finds a book, updates the catalog, and controls access."],
    [/data abstraction|three schema|three levels of abstraction/i,
      "Data abstraction means hiding storage details people do not need. A user sees a useful view, while the DBMS handles the logical structure and the physical files underneath.",
      "It is like using an ATM: you see the balance and buttons, not the bank’s servers, files, or storage layout."],
    [/schema and instance|schema|database instance/i,
      "A schema is the planned shape of the data, such as table names and columns. An instance is the actual data sitting in those tables right now.",
      "A class timetable template is the schema; the classes filled into it this week are the current instance."],
    [/relation|tuple|attribute|relational model/i,
      "In the relational model, a table is called a relation, a row is a tuple, and a column is an attribute. Each row describes one item; each column describes one kind of fact about it.",
      "In STUDENT(sid, name), one row might be (21, Mina): sid and name are columns, and Mina’s record is a row."],
    [/primary key|candidate key|superkey|foreign key|key constraints/i,
      "A key is one or more columns used to identify a row. A primary key is the chosen identifier for this table. A foreign key is a link to a key in another table.",
      "A student ID can identify one student row; an enrollment row can store that ID as a foreign key to show who enrolled."],
    [/relational algebra.*(selection|projection)|selection and projection/i,
      "Selection filters rows. Projection chooses columns. You can combine them: first keep only the rows you need, then show only the columns you asked for.",
      "From STUDENT, selection keeps students from CS; projection then shows only their names."],
    [/join|natural join|theta join/i,
      "A join combines related rows from two tables using a matching condition. It lets you bring together facts that were stored separately.",
      "Match each ENROLLMENT row’s student ID with the same ID in STUDENT to add the student’s name."],
    [/functional dependenc/i,
      "A functional dependency is a rule between columns: if two rows have the same value for X, they must also have the same value for Y. We write that rule as X → Y.",
      "If student ID determines student name, then knowing the ID tells us exactly which name belongs to that student."],
    [/normalization|normal form/i,
      "Normalization organizes tables to reduce repeated facts and avoid update problems. The idea is to store each fact in a suitable place and connect tables with keys.",
      "Keep each student’s name once in STUDENT; store course enrollments separately. Changing a name then needs one update, not many."],
    [/bcnf|boyce.codd/i,
      "BCNF is a rule for table design: whenever one set of columns determines another, the determining columns must be able to identify a whole row. If not, the table may need to be split.",
      "If instructor determines room but instructor is not a key, storing many instructor-room copies in one table can cause repetition. A separate instructor-room table may fit better."],
    [/transaction|acid/i,
      "A transaction is a group of database actions treated as one unit. It should finish as a whole or be rolled back, so the database does not keep only half of an important change.",
      "Moving money means subtracting it from one account and adding it to another. Both actions should succeed together."],
    [/serializab|conflict serial|view serial/i,
      "Serializability checks whether interleaved transactions still produce a result like some safe order where each transaction ran by itself. That helps prevent simultaneous work from corrupting results.",
      "Two people editing the same seat should end with a result that could have happened if one booking was processed first and then the other."],
    [/two.phase locking|2pl|lock/i,
      "Two-phase locking has a growing phase, where a transaction gets locks, and a shrinking phase, where it releases them. After releasing its first lock, it cannot take new locks.",
      "A transaction first gathers the permissions it needs, then starts releasing them. It cannot go back to gathering more."],
    [/write.ahead logging|wal|log records/i,
      "Write-ahead logging means saving the recovery note before writing the changed data page. If the system crashes, the note tells the DBMS how to redo or undo the change.",
      "Write the instruction in the journal first; then change the page. If power fails, the journal helps finish or reverse the update."],
    [/b\+? tree|bplus|b tree/i,
      "A B+ tree is a balanced index that guides a search through sorted keys. The top pages narrow down where to look, and the bottom pages hold the entries in order, so range searches can move through them efficiently.",
      "It works like a book index: use headings to reach the right place, then follow nearby entries to find a range of keys."],
    [/hash/i,
      "Hashing uses a calculation to send a search key to a bucket. It is useful for finding one exact key quickly, but buckets are not kept in sorted order, so ranges are a poor fit.",
      "A locker number is calculated from a student ID. That can find one ID’s locker quickly, but it does not make lockers for IDs 100–120 sit in order."],
  ];

  function easyCore(topic, alternate = false) {
    const label = `${topic.title} ${topic.lessonTitle || ""}`;
    const match = easyExplanations.find(([pattern]) => pattern.test(label));
    if (match) return alternate ? match[2] : match[1];
    const source = topic.definition || topic.details?.[0] || "This idea is covered in the linked lesson.";
    const simplified = easyify(source, topic);
    const firstSentence = simplified.match(/^.{1,260}?(?:[.!?](?:\s|$)|$)/);
    if (!alternate) return firstSentence ? firstSentence[0].trim() : simplified;
    const second = topic.details?.find((detail) => detail && detail !== source);
    if (second) return `Another way to see it: ${easyify(second, topic)}`;
    return `Put simply, ${simplified.charAt(0).toLowerCase()}${simplified.slice(1)}`;
  }

  function conversationalAnswer(topic, mode = "normal", extraGreeting = "") {
    lastTopic = topic;
    const lesson = getLesson(topic);
    const section = document.createElement("section");
    section.className = "qno-conversation-answer";
    const heading = document.createElement("h3");
    heading.textContent = topic.title;
    const explanation = document.createElement("p");
    explanation.className = "qno-conversation-explanation";
    const prefix = mode === "alternate" ? "Of course. Let me put it another way. " : mode === "example" ? "Sure—here’s another way to picture it. " : "Sure—here’s the simple idea. ";
    explanation.textContent = `${extraGreeting}${prefix}${easyCore(topic, mode === "alternate")}`;
    section.append(heading, explanation);

    const example = mode === "example" || mode === "alternate"
      ? (lesson?.worked?.setup || topic.example || lesson?.worked?.answer || "Open the lesson for its worked example.")
      : (topic.example || lesson?.worked?.setup || "");
    if (example) {
      const exampleLine = document.createElement("p");
      exampleLine.className = "qno-conversation-example";
      const label = document.createElement("strong");
      label.textContent = mode === "example" ? "Another example: " : mode === "alternate" ? "Here’s a concrete case: " : "For example: ";
      const detail = document.createElement("span");
      detail.textContent = easyify(example, topic);
      exampleLine.append(label, detail);
      section.append(exampleLine);
    }

    const lessonLink = document.createElement("div");
    lessonLink.className = "qno-conversation-links";
    lessonLink.append(makeLink("Read this lesson", topic.href));
    if (lesson?.worked?.title) lessonLink.append(makeLink("See the worked example", `${lesson.href}#worked-example`, "qno-answer-link qno-answer-link-muted"));
    section.append(lessonLink);
    return section;
  }

  function makeLink(label, path, className = "qno-answer-link") {
    const link = document.createElement("a");
    link.className = className;
    link.href = rootPrefix + path;
    link.textContent = label;
    return link;
  }

  function makeAskGptLink(prompt, className = "") {
    const link = document.createElement("a");
    link.className = "ask-gpt-link" + (className ? " " + className : "");
    link.href = "https://chatgpt.com/?q=" + encodeURIComponent(prompt);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", "Open ChatGPT with a prepared DBMS prompt");
    const icon = document.createElement("img");
    icon.className = "ask-gpt-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.alt = "";
    icon.src = rootPrefix + "assets/chatgpt-mark.png";
    const label = document.createElement("span");
    label.textContent = "Ask GPT";
    link.append(icon, label);
    return link;
  }

  function questionGptPrompt(question) {
    const unit = knowledge.units.find((item) => item.number === Number(question.unit));
    const partLabel = question.part === "A"
      ? "Part A · Question " + question.number + " · 2 marks"
      : "Part " + (question.part || "B") + " · Question " + question.number + " · long-answer question";
    const answerGuidance = question.part === "A"
      ? "Give a compact 2-mark answer in simple English. Define the key idea directly and add one tiny example only if it helps."
      : "Give a complete, well-structured exam answer in simple English. Use clear headings, explain each step, and add a basic example plus a simple visual diagram or flowchart when useful.";
    return [
      "I am studying DBMS (Database Management Systems) for a university exam.",
      "Unit " + question.unit + ": " + (unit?.title || "DBMS") + ".",
      partLabel + ".",
      "Exact question: " + question.text,
      answerGuidance + " Stay focused on this question and explain unfamiliar terms.",
    ].join("\n");
  }

  function lessonGptPrompt(unitNumber, unitTitle, lessonTitle, subtopics = []) {
    const topicList = subtopics.length
      ? "Subtopics in this lesson:\n" + subtopics.map((item) => "- " + item.title + (item.description ? ": " + item.description : "")).join("\n")
      : "";
    return [
      "I am studying DBMS (Database Management Systems) for a university exam.",
      "Unit " + unitNumber + ": " + unitTitle + ".",
      "Lesson: " + lessonTitle + ".",
      topicList,
      "Teach this lesson and its subtopics in clear, beginner-friendly English. Define each term before using it, explain the ideas step by step, and include basic worked examples. Add a readable visual diagram or flowchart where it helps understanding. Keep the explanation connected to this DBMS syllabus.",
    ].filter(Boolean).join("\n");
  }

  function unitNumberOnPage() {
    const pathMatch = window.location.pathname.match(/unit-(0?[1-6])(?:-lesson-\d+)?\.html$/i);
    if (pathMatch) return Number(pathMatch[1]);
    const breadcrumbMatch = document.querySelector(".breadcrumb")?.textContent.match(/\bUnit\s*0?([1-6])\b/i);
    return breadcrumbMatch ? Number(breadcrumbMatch[1]) : 0;
  }

  function enhanceImportantQuestionButtons() {
    document.querySelectorAll(".important-ask-button[data-qno-question-id]").forEach((button) => {
      if (button.parentElement?.classList.contains("important-question-actions")) return;
      const question = knowledge.questionBank?.items?.find((item) => item.id === button.dataset.qnoQuestionId);
      if (!question) return;
      const actions = document.createElement("div");
      actions.className = "important-question-actions";
      button.parentNode.insertBefore(actions, button);
      actions.append(button, makeAskGptLink(questionGptPrompt(question)));
    });
  }

  function enhanceLessonTopics() {
    if (!document.body.classList.contains("lesson-page")) return;
    const unitNumber = unitNumberOnPage();
    if (!unitNumber) return;
    const unitTitle = knowledge.units.find((item) => item.number === unitNumber)?.title
      || document.querySelector(".breadcrumb a[href*='unit-']")?.textContent.replace(/^Unit\s*0?\d+:\s*/i, "").trim()
      || "DBMS";
    const lessonTitle = document.querySelector(".lesson-intro h1")?.textContent.trim() || "DBMS lesson";
    const lessonNumber = document.querySelector(".breadcrumb")?.textContent.match(/\bLesson\s*0?(\d+)\b/i)?.[1] || "";
    const subtopics = [...document.querySelectorAll(".subtopic-grid .subtopic-card strong")].map((item) => item.textContent.trim());
    const introTitle = document.querySelector(".lesson-intro h1");
    if (introTitle && !document.querySelector(".lesson-gpt-cta")) {
      const cta = document.createElement("div");
      cta.className = "lesson-gpt-cta";
      const promptTitle = (lessonNumber ? "Lesson " + Number(lessonNumber) + ": " : "") + lessonTitle;
      const topicRows = subtopics.map((title) => ({ title }));
      cta.append(makeAskGptLink(lessonGptPrompt(unitNumber, unitTitle, promptTitle, topicRows)));
      introTitle.insertAdjacentElement("afterend", cta);
    }
    enhanceLessonRegeneration(unitNumber, unitTitle, Number(lessonNumber) || 1, lessonTitle, subtopics);
  }

  function lessonPageContext(unitNumber, unitTitle, lessonNumber, lessonTitle) {
    const textOf = (node) => String(node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
    const tableText = (table) => [...table.querySelectorAll("tr")].map((row) =>
      [...row.querySelectorAll("th,td")].map(textOf).join(" | "),
    ).filter(Boolean).join("\n");
    const intro = document.querySelector(".lesson-intro");
    const plainWords = textOf(intro?.querySelector(".plain-definition p"));
    const goals = [...(intro?.querySelectorAll(".learning-goals li") || [])].map(textOf);
    const syllabusTopics = [...document.querySelectorAll(".subtopic-grid .subtopic-card strong")].map(textOf);
    const topics = [...document.querySelectorAll(".concept-list .concept-panel")].map((panel, index) => {
      const title = textOf(panel.querySelector("h2"));
      const definition = textOf(panel.querySelector(".definition-box p"));
      const details = [...panel.querySelectorAll(":scope > p, .small-example p")].map(textOf);
      const tables = [...panel.querySelectorAll("table")].map(tableText);
      const diagrams = [...panel.querySelectorAll(".concept-diagram")].map((figure) => {
        const caption = textOf(figure.querySelector("figcaption"));
        const labels = [...figure.querySelectorAll("svg text")].map(textOf).filter(Boolean);
        return [caption, labels.join(" → ")].filter(Boolean).join("; ");
      });
      return ["Topic " + (index + 1) + ": " + title, definition ? "Definition: " + definition : "", ...details, ...tables, ...diagrams].filter(Boolean).join("\n");
    });
    const worked = document.querySelector(".worked-example");
    const workedSteps = [...(worked?.querySelectorAll(".walk-detail") || [])].map((step, index) =>
      "Step " + (index + 1) + ": " + [textOf(step.querySelector("h3")), textOf(step.querySelector("p"))].filter(Boolean).join(" — "),
    );
    const workedTables = [...(worked?.querySelectorAll("table") || [])].map(tableText);
    const workedCode = [...(worked?.querySelectorAll("pre code") || [])].map((code) => "Code example:\n" + String(code.textContent || "").trim());
    const workedExample = worked ? [
      textOf(worked.querySelector(".worked-heading h2")),
      textOf(worked.querySelector(".worked-heading > p")),
      ...workedTables,
      ...workedCode,
      ...workedSteps,
      textOf(worked.querySelector(".worked-answer p")),
    ].filter(Boolean).join("\n") : "";
    const examFocus = document.querySelector(".exam-focus");
    return [
      "DBMS course: " + unitTitle + " (Unit " + unitNumber + ").",
      "Lesson " + lessonNumber + ": " + lessonTitle + ".",
      plainWords ? "Lesson overview: " + plainWords : "",
      goals.length ? "Learning goals:\n- " + goals.join("\n- ") : "",
      syllabusTopics.length ? "Syllabus topics:\n- " + syllabusTopics.join("\n- ") : "",
      topics.length ? "Full topic explanations:\n\n" + topics.join("\n\n") : "",
      workedExample ? "Worked example and every step:\n" + workedExample : "",
      examFocus ? "Exam focus: " + textOf(examFocus.querySelector("p")) : "",
    ].filter(Boolean).join("\n\n").slice(0, 14_000);
  }

  function enhanceLessonRegeneration(unitNumber, unitTitle, lessonNumber, lessonTitle, subtopics) {
    const navigation = document.querySelector(".lesson-navigation");
    if (!navigation || document.querySelector(".lesson-regeneration-card")) return;
    const card = document.createElement("section");
    card.className = "lesson-regeneration-card";
    card.setAttribute("aria-labelledby", "lesson-regeneration-title");
    const heading = document.createElement("div");
    heading.className = "lesson-regeneration-heading";
    const eyebrow = document.createElement("span");
    eyebrow.className = "section-label";
    eyebrow.textContent = "GEMINI STUDY REBUILD";
    const title = document.createElement("h2");
    title.id = "lesson-regeneration-title";
    title.textContent = "Regenerate this lesson with Q&A";
    const description = document.createElement("p");
    description.textContent = "Ask Gemini for a fresh, complete explanation of every topic in this lesson, followed by review questions with answers.";
    heading.append(eyebrow, title, description);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lesson-regeneration-button";
    button.textContent = "Regenerate with Q&A";
    const status = document.createElement("p");
    status.className = "lesson-regeneration-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;
    const output = document.createElement("div");
    output.className = "lesson-regeneration-output";
    output.hidden = true;
    card.append(heading, button, status, output);
    navigation.insertAdjacentElement("afterend", card);

    let activeController = null;
    button.addEventListener("click", async () => {
      if (activeController) {
        activeController.abort();
        status.textContent = "Stopping generation…";
        return;
      }
      const lessonContext = lessonPageContext(unitNumber, unitTitle, lessonNumber, lessonTitle);
      if (!lessonContext) {
        status.hidden = false;
        status.textContent = "This lesson’s content could not be collected. Reload the page and try again.";
        return;
      }
      const controller = new AbortController();
      activeController = controller;
      const startedAt = performance.now();
      let firstTokenAt = null;
      let chunks = 0;
      let answer = "";
      let streamError = "";
      let serverMetrics = null;
      let completed = false;
      button.textContent = "Stop generation";
      button.setAttribute("aria-busy", "true");
      status.hidden = false;
      status.textContent = "Gemini is reading the lesson and preparing a complete explanation with Q&A…";
      output.hidden = false;
      output.replaceChildren();
      const liveText = document.createElement("div");
      liveText.className = "lesson-regeneration-stream";
      liveText.setAttribute("aria-live", "polite");
      output.append(liveText);
      const question = [
        "Create a complete regenerated DBMS study lesson with a Q&A review.",
        "Course: Unit " + unitNumber + " — " + unitTitle + ". Lesson " + lessonNumber + " — " + lessonTitle + ".",
        "Cover every subtopic: " + (subtopics.length ? subtopics.join("; ") : lessonTitle) + ".",
        "Use the full lesson page content supplied with this request. Preserve every concept, important rule, example, worked-example step, and exam-focus point; do not omit or combine unrelated ideas.",
        "Explain in simple student-friendly English with clear headings, definitions before technical terms, step-by-step explanations, and basic examples. Finish with 5–8 useful questions and their answers covering the lesson. Return the full lesson, not a short summary.",
      ].join("\n");
      const consumeEvent = (eventText) => {
        const data = eventText.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!data || data === "[DONE]") return;
        let payload;
        try { payload = JSON.parse(data); } catch { return; }
        if (payload.metrics) serverMetrics = payload.metrics;
        if (payload.error) { streamError = payload.error; return; }
        if (payload.done) completed = true;
        if (typeof payload.text === "string" && payload.text) {
          if (firstTokenAt === null) firstTokenAt = performance.now();
          chunks += 1;
          answer += payload.text;
          liveText.textContent = answer;
        }
      };
      try {
        const response = await fetch(`${rootPrefix}api/qno`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
          body: JSON.stringify({ question, intent: "lesson-regenerate", unit: unitNumber, history: [], lessonContext }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || "Gemini could not regenerate this lesson.");
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("This browser cannot stream the generated lesson.");
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || "";
          events.forEach(consumeEvent);
          if (streamError) throw new Error(streamError);
          if (done) break;
        }
        if (buffer.trim()) consumeEvent(buffer);
        if (streamError) throw new Error(streamError);
        if (!completed || !answer.trim()) throw new Error("Gemini ended before confirming a complete lesson. The partial text is saved; regenerate to retry.");
        const rendered = geminiAnswerContent(answer);
        rendered.classList.add("lesson-regeneration-answer");
        output.replaceChildren(rendered);
        status.textContent = "Complete lesson and Q&A ready.";
      } catch (error) {
        if (answer.trim()) {
          const rendered = geminiAnswerContent(answer);
          rendered.classList.add("lesson-regeneration-answer");
          output.replaceChildren(rendered);
        } else {
          output.replaceChildren();
          output.hidden = true;
        }
        status.textContent = controller.signal.aborted
          ? (answer.trim() ? "Generation stopped. The partial answer is saved; regenerate to finish it." : "Generation stopped. Select Regenerate with Q&A to try again.")
          : (error.message || "Gemini could not finish this lesson. Please try again.");
        console.warn("[Qno lesson regeneration]", { totalMs: Math.round(performance.now() - startedAt), ttftMs: firstTokenAt === null ? null : Math.round(firstTokenAt - startedAt), chunks, server: serverMetrics, error: error.name });
      } finally {
        activeController = null;
        button.textContent = "Regenerate with Q&A";
        button.removeAttribute("aria-busy");
      }
      if (completed) console.info("[Qno lesson regeneration]", { totalMs: Math.round(performance.now() - startedAt), ttftMs: firstTokenAt === null ? null : Math.round(firstTokenAt - startedAt), chunks, progressiveText: chunks > 1, server: serverMetrics });
    });
  }

  function getLesson(topic) {
    const unit = knowledge.units.find((item) => item.number === topic.unit);
    return unit?.lessons.find((item) => item.number === topic.lessonNo);
  }

  function normalizeMathNotation(source, trim = true) {
    const subscript = (value) => [...value].map((character) => ({
      0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉",
      "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
    })[character] || character).join("");
    const superscript = (value) => [...value].map((character) => ({
      0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹",
      "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", i: "ⁱ", n: "ⁿ",
    })[character] || character).join("");
    const symbols = {
      alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ", omega: "ω",
      Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ", Omega: "Ω",
      forall: "∀", exists: "∃", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇",
      cup: "∪", cap: "∩", land: "∧", lor: "∨", neg: "¬", mid: " | ", vert: " | ", lvert: "|", rvert: "|",
      to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftrightarrow: "⇔", le: "≤", leq: "≤", ge: "≥", geq: "≥",
      ne: "≠", neq: "≠", approx: "≈", equiv: "≡", times: "×", cdot: "·", div: "÷", pm: "±", infty: "∞",
      dots: "…", dotsb: "…", ldots: "…", cdots: "…", langle: "⟨", rangle: "⟩", emptyset: "∅",
    };
    const normalized = String(source || "")
      .replace(/\\(?:left|right)\b\s*/g, "")
      .replace(/\\(?:text|textrm|textbf|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1 / $2")
      .replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)")
      .replace(/\\\{/g, "{").replace(/\\\}/g, "}")
      .replace(/\\([#$%&_])/g, "$1")
      .replace(/\\[,;:!]/g, " ")
      .replace(/\\([A-Za-z]+)\b/g, (command, name) => symbols[name] || name)
      .replace(/([A-Za-z][A-Za-z0-9]*)_\{([A-Za-z0-9+\-=()]+)\}/g, (_, base, index) => `${base}${subscript(index)}`)
      .replace(/([A-Za-z][A-Za-z0-9]*)_([A-Za-z0-9+\-=()])\b/g, (_, base, index) => `${base}${subscript(index)}`)
      .replace(/([A-Za-z][A-Za-z0-9]*)\^\{([A-Za-z0-9+\-=()]+)\}/g, (_, base, power) => `${base}${superscript(power)}`)
      .replace(/([A-Za-z][A-Za-z0-9]*)\^([A-Za-z0-9+\-=()])\b/g, (_, base, power) => `${base}${superscript(power)}`)
      .replace(/\\[A-Za-z]+\b/g, "")
      .replace(/\s+/g, " ");
    return trim ? normalized.trim() : normalized;
  }

  function addMathNotation(parent, source, display = false) {
    const notation = normalizeMathNotation(source);
    const element = document.createElement(display ? "div" : "span");
    element.className = display ? "qno-math-display" : "qno-math";
    element.setAttribute("role", "math");
    element.setAttribute("aria-label", `Math notation: ${notation}`);
    const code = document.createElement("code");
    code.textContent = notation;
    element.append(code);
    parent.append(element);
  }

  function appendAnswerText(parent, text) {
    parent.append(document.createTextNode(normalizeMathNotation(text, false).replace(/\\+\$/g, "$").replace(/\\([#*_`|])/g, "$1")));
  }

  function addInlineFormatting(parent, text) {
    const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\((.+?)\\\)|\\\$([\s\S]+?)\\\$|\$((?:\\.|[^$\n])+?)\$|(<br\s*\/?>)/gi;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(text))) {
      appendAnswerText(parent, text.slice(cursor, match.index));
      if (match[1] !== undefined) {
        const code = document.createElement("code");
        code.textContent = match[1];
        parent.append(code);
      } else if (match[2] !== undefined || match[3] !== undefined) {
        const element = document.createElement(match[2] !== undefined ? "strong" : "em");
        addInlineFormatting(element, match[2] ?? match[3]);
        parent.append(element);
      } else if (match[4] !== undefined || match[5] !== undefined || match[6] !== undefined || match[7] !== undefined || match[8] !== undefined) {
        addMathNotation(parent, match[4] ?? match[5] ?? match[6] ?? match[7] ?? match[8]);
      } else if (match[9] !== undefined) {
        parent.append(document.createElement("br"));
      }
      cursor = pattern.lastIndex;
    }
    appendAnswerText(parent, text.slice(cursor));
  }

  function splitMarkdownTableRow(rawLine) {
    let line = String(rawLine || "").trim();
    if (line.startsWith("|")) line = line.slice(1);
    if (line.endsWith("|") && !line.endsWith("\\|")) line = line.slice(0, -1);
    const cells = [];
    let cell = "";
    let inCode = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === "\\" && line[index + 1] === "|") {
        cell += "|";
        index += 1;
      } else if (character === "`") {
        inCode = !inCode;
        cell += character;
      } else if (character === "|" && !inCode) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += character;
      }
    }
    cells.push(cell.trim());
    return cells;
  }

  function isMarkdownTableSeparator(line) {
    const cells = splitMarkdownTableRow(line);
    return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function appendMarkdownTable(article, lines) {
    const rows = lines.map(splitMarkdownTableRow);
    const wrapper = document.createElement("div");
    wrapper.className = "qno-table-scroll";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Answer table. Scroll horizontally to see every column.");
    const table = document.createElement("table");
    table.className = "qno-answer-table";
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    rows[0].forEach((value) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      addInlineFormatting(cell, value);
      headerRow.append(cell);
    });
    head.append(headerRow);
    table.append(head);
    const body = document.createElement("tbody");
    rows.slice(1).filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell))).forEach((row) => {
      const tableRow = document.createElement("tr");
      for (let index = 0; index < Math.max(rows[0].length, row.length); index += 1) {
        const cell = document.createElement("td");
        addInlineFormatting(cell, row[index] || "");
        tableRow.append(cell);
      }
      body.append(tableRow);
    });
    table.append(body);
    wrapper.append(table);
    article.append(wrapper);
  }

  function geminiAnswerContent(text) {
    const article = document.createElement("article");
    article.className = "qno-gemini-answer";
    const lines = String(text || "").split(/\r?\n/);
    let activeList = null;
    let activeListType = "";
    for (let index = 0; index < lines.length;) {
      const rawLine = lines[index];
      if (/^\s*```/.test(rawLine)) {
        index += 1;
        const codeLines = [];
        while (index < lines.length && !/^\s*```/.test(lines[index])) codeLines.push(lines[index++]);
        if (index < lines.length) index += 1;
        const pre = document.createElement("pre");
        pre.className = "qno-code-block";
        const code = document.createElement("code");
        code.textContent = codeLines.join("\n");
        pre.append(code);
        article.append(pre);
        activeList = null;
        continue;
      }
      const line = rawLine.trim();
      if (!line) {
        activeList = null;
        activeListType = "";
        index += 1;
        continue;
      }
      if (index + 1 < lines.length && line.includes("|") && isMarkdownTableSeparator(lines[index + 1])) {
        const tableLines = [rawLine];
        index += 2;
        while (index < lines.length && lines[index].includes("|")) tableLines.push(lines[index++]);
        appendMarkdownTable(article, tableLines);
        activeList = null;
        activeListType = "";
        continue;
      }
      const displayStart = line.startsWith("$$") ? "$$" : line.startsWith("\\[") ? "\\[" : "";
      if (displayStart) {
        const close = displayStart === "$$" ? "$$" : "\\]";
        let expression = line.slice(displayStart.length);
        const inlineClose = expression.indexOf(close);
        if (inlineClose >= 0) {
          expression = expression.slice(0, inlineClose);
          index += 1;
        } else {
          const mathLines = [expression];
          index += 1;
          while (index < lines.length && !lines[index].includes(close)) mathLines.push(lines[index++]);
          if (index < lines.length) {
            mathLines.push(lines[index].slice(0, lines[index].indexOf(close)));
            index += 1;
          }
          expression = mathLines.join(" ");
        }
        const block = document.createElement("div");
        addMathNotation(block, expression, true);
        article.append(block);
        activeList = null;
        activeListType = "";
        continue;
      }
      if (/^(?:---+|\*\*\*+|___+)$/.test(line)) {
        article.append(document.createElement("hr"));
        index += 1;
        continue;
      }
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        activeList = null;
        const heading = document.createElement("h4");
        addInlineFormatting(heading, headingMatch[1]);
        article.append(heading);
        index += 1;
        continue;
      }
      const bulletMatch = line.match(/^(?:[-*•])\s+(.+)$/);
      const numberMatch = line.match(/^\d+[.)]\s+(.+)$/);
      const listText = bulletMatch?.[1] || numberMatch?.[1];
      const listType = bulletMatch ? "ul" : numberMatch ? "ol" : "";
      if (listText) {
        if (!activeList || activeListType !== listType) {
          activeList = document.createElement(listType);
          activeListType = listType;
          article.append(activeList);
        }
        const item = document.createElement("li");
        addInlineFormatting(item, listText);
        activeList.append(item);
        index += 1;
        continue;
      }
      activeList = null;
      activeListType = "";
      const paragraph = document.createElement("p");
      addInlineFormatting(paragraph, line.replace(/^>\s?/, ""));
      article.append(paragraph);
      index += 1;
    }
    return article;
  }

  function recentConversation(turnCount = 6) {
    const rows = [...messages.children];
    let currentQuestionIndex = rows.length;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index].classList.contains("qno-message-user")) {
        currentQuestionIndex = index;
        break;
      }
    }
    return rows.slice(0, currentQuestionIndex).slice(-turnCount).map((row) => {
      const userBubble = row.querySelector(".qno-user-bubble");
      const content = userBubble || row.querySelector(".qno-message-body");
      const fullText = content?.textContent?.trim() || "";
      const text = fullText.length > 1_100
        ? fullText.slice(0, 680) + "\n[…middle omitted…]\n" + fullText.slice(-400)
        : fullText;
      return { role: userBubble ? "user" : "assistant", text };
    }).filter((turn) => turn.text);
  }

  function setRequestPending(pending) {
    requestPending = pending;
    input.disabled = pending;
    sendButton.disabled = false;
    sendButton.setAttribute("aria-label", pending ? "Stop response" : "Send question");
    sendButton.classList.toggle("qno-send-stop", pending);
    const icon = sendButton.querySelector("span");
    if (icon) icon.textContent = pending ? "■" : "↑";
  }

  function retryNotice(query, partialRow, version, label = "Generation stopped. Your question and conversation are saved.") {
    const notice = document.createElement("div");
    notice.className = "qno-retry-notice";
    const message = document.createElement("span");
    message.textContent = label;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "qno-retry-button";
    retry.textContent = "Retry response";
    const noticeBody = addMessage("bot", notice);
    notice.append(message, retry);
    const noticeRow = noticeBody.closest(".qno-message");
    retry.addEventListener("click", async () => {
      if (requestPending || version !== conversationVersion) return;
      partialRow?.remove();
      noticeRow?.remove();
      setRequestPending(true);
      try {
        await replyTo(query);
      } finally {
        activeController = null;
        setRequestPending(false);
        input.focus();
      }
    });
  }

  function answerActions(answer, query, matches, followUp, row) {
    const actions = document.createElement("div");
    actions.className = "qno-answer-actions";
    const button = (label, action, title = "") => {
      const control = document.createElement("button");
      control.type = "button";
      control.className = "qno-answer-action";
      control.textContent = label;
      if (title) control.title = title;
      control.addEventListener("click", action);
      actions.append(control);
      return control;
    };
    button("Copy", async (event) => {
      const control = event.currentTarget;
      try {
        await navigator.clipboard.writeText(answer);
        control.textContent = "Copied";
        setTimeout(() => { control.textContent = "Copy"; }, 1300);
      } catch {
        control.textContent = "Copy unavailable";
      }
    }, "Copy this answer");
    button("Retry", async () => {
      if (requestPending) return;
      row.remove();
      setRequestPending(true);
      try { await askGemini(query, matches, followUp); }
      finally { activeController = null; setRequestPending(false); input.focus(); }
    }, "Generate this answer again");
    if (/```/.test(answer)) {
      button("Copy SQL", async (event) => {
        const code = [...answer.matchAll(/```(?:sql)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim()).join("\n\n");
        try {
          await navigator.clipboard.writeText(code);
          event.currentTarget.textContent = "SQL copied";
        } catch {
          event.currentTarget.textContent = "Copy unavailable";
        }
      }, "Copy SQL code blocks");
    }
    if (activeQuestionContext) {
      [2, 5, 10].forEach((marks) => button(`${marks}-mark`, () => sendQuestion(`Give me a ${marks}-mark answer for this selected question.`)));
    } else {
      button("Simplify", () => sendQuestion("I don't understand. Explain the same topic more simply."));
      button("Give example", () => sendQuestion("Give me a clear example of the same topic."));
      button("Explain more", () => sendQuestion("Explain the same topic in more detail."));
    }
    return actions;
  }

  function completionBadge(label = "Answer ready") {
    const badge = document.createElement("div");
    badge.className = "qno-answer-complete";
    const mark = document.createElement("span");
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "✓";
    const text = document.createElement("span");
    text.textContent = label;
    badge.append(mark, text);
    return badge;
  }

  function sourceNote(sources) {
    if (!Array.isArray(sources) || !sources.length) return null;
    const note = document.createElement("div");
    note.className = "qno-source-note";
    const label = document.createElement("strong");
    label.textContent = "Course sources";
    const list = document.createElement("span");
    list.textContent = sources.map((source) => `${source.source}${source.location && source.location !== "section" ? ` · ${source.location}` : ""}`).join("; ");
    note.append(label, list);
    return note;
  }

  function showQuestionList(query) {
    const unit = unitNumberFromQuery(query) || currentUnit || Number(scope.value) || 0;
    if (!unit) {
      botText("Name a unit, for example “Unit 1 important” or “Unit 2 Part A questions,” and I’ll show its exact source list.");
      return;
    }
    const text = normalize(query);
    if (/\brepeated\b/.test(text)) {
      botText("The local question bank contains the Important Questions PDF and the syllabus image only. Repeated-question comparisons from previous papers are not indexed.");
      return;
    }
    const bank = knowledge.questionBank;
    if (!bank?.items?.length) {
      botText("The question list has not been built yet. Run “npm run index:dbms” and rebuild the site.");
      return;
    }
    const allQuestions = bank.items.filter((question) => question.unit === unit);
    const part = text.match(/\bpart\s*([ab])\b/)?.[1]?.toUpperCase() || null;
    const questions = part ? allQuestions.filter((question) => question.part === part) : allQuestions;
    const askedMarks = text.match(/\b(2|5|10)\s*mark/);
    const hasMarks = allQuestions.some((question) => Number.isFinite(question.marks));
    const markNote = askedMarks && !hasMarks
      ? "The Important Questions PDF does not assign marks to individual questions, so this complete list is grouped by the source’s Part A and Part B labels instead."
      : "The original question wording and Part A / Part B numbering are preserved from the PDF.";
    renderQuestionList({
      type: "question-list",
      kind: "important",
      unit,
      part,
      title: `${part ? `Part ${part} · ` : ""}Important questions · Unit ${unit}`,
      source: bank.source,
      questions,
      allQuestions,
      questionCount: questions.length,
      totalMatches: questions.length,
      note: markNote,
      availableFilters: {
        all: true,
        partA: allQuestions.some((question) => question.part === "A"),
        partB: allQuestions.some((question) => question.part === "B"),
        repeated: false,
        marks: [...new Set(allQuestions.map((question) => question.marks).filter(Number.isFinite))].sort((a, b) => a - b),
      },
    });
  }

  async function askGemini(query, matches, followUp = false) {
    if (!geminiConfigured) return false;
    const controller = new AbortController();
    const runVersion = conversationVersion;
    const clientStartedAt = performance.now();
    lastAnswerQuery = query;
    activeController = controller;
    const responseCard = document.createElement("div");
    responseCard.className = "qno-generation-card qno-generation-waiting";
    responseCard.setAttribute("role", "status");
    responseCard.setAttribute("aria-label", "Qno is preparing a course-based answer");
    const identity = document.createElement("div");
    identity.className = "qno-ai-identity";
    const signal = document.createElement("span");
    signal.className = "qno-ai-signal";
    signal.setAttribute("aria-hidden", "true");
    const signalCore = document.createElement("i");
    signal.append(signalCore);
    const identityCopy = document.createElement("span");
    identityCopy.className = "qno-ai-identity-copy";
    const identityTitle = document.createElement("strong");
    identityTitle.textContent = "Qno";
    const identityStatus = document.createElement("small");
    identityStatus.textContent = "Preparing your course-based answer";
    identityCopy.append(identityTitle, identityStatus);
    identity.append(signal, identityCopy);
    const streamNode = document.createElement("div");
    streamNode.className = "qno-gemini-answer qno-gemini-stream";
    streamNode.setAttribute("aria-live", "off");
    responseCard.append(identity, streamNode);
    const streamBody = addMessage("bot", responseCard);
    const responseRow = streamBody.closest(".qno-message");
    const relevantMatches = followUp
      ? (matches?.length ? matches : lastTopic ? [{ topic: lastTopic, score: 20 }] : [])
      : (isReliableTopicMatch(query, matches?.[0]) ? matches : []);
    let answer = "";
    let firstTokenAt = null;
    let receivedChunks = 0;
    let serverMetrics = null;
    let sources = [];
    let streamError = "";
    let createdFirstChunk = false;
    try {
      const requestStartedAt = performance.now();
      const response = await fetch(`${rootPrefix}api/qno`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
        body: JSON.stringify({
          question: query,
          intent: followUp ? "followup" : "answer",
          history: recentConversation(8),
          unit: currentUnit || Number(scope.value) || null,
          questionContext: activeQuestionContext ? { id: activeQuestionContext.id, unit: activeQuestionContext.unit, part: activeQuestionContext.part, number: activeQuestionContext.number, text: activeQuestionContext.text, source: activeQuestionContext.source, page: activeQuestionContext.page } : null,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Gemini could not answer right now.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("This browser cannot stream the answer.");
      const decoder = new TextDecoder();
      let buffer = "";
      const consumeEvent = (eventText) => {
        const data = eventText.split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") return;
        let payload;
        try { payload = JSON.parse(data); } catch { return; }
        if (payload.meta) sources = payload.meta.sources || [];
        if (payload.metrics) serverMetrics = payload.metrics;
        if (payload.error) {
          streamError = payload.error;
          return;
        }
        if (typeof payload.text === "string" && payload.text) {
          if (firstTokenAt === null) firstTokenAt = performance.now();
          receivedChunks += 1;
          if (!createdFirstChunk) {
            createdFirstChunk = true;
            responseCard.classList.remove("qno-generation-waiting");
            responseCard.classList.add("qno-generation-active");
            responseCard.setAttribute("aria-label", "Qno is writing an answer");
            identityStatus.textContent = "Writing from the relevant course material";
          }
          answer += payload.text;
          streamNode.textContent = answer;
          requestAnimationFrame(() => { scrollArea.scrollTop = scrollArea.scrollHeight; });
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";
        events.forEach(consumeEvent);
        if (streamError) throw new Error(streamError);
        if (done) break;
      }
      if (buffer.trim()) consumeEvent(buffer);
      if (streamError) throw new Error(streamError);
      if (!answer.trim()) throw new Error("Gemini returned an empty answer.");
      streamNode.replaceWith(geminiAnswerContent(answer));
      responseCard.classList.remove("qno-generation-active", "qno-generation-waiting");
      responseCard.classList.add("qno-generation-complete");
      responseCard.setAttribute("role", "article");
      responseCard.setAttribute("aria-label", "Qno answer");
      identityStatus.textContent = "Course-grounded explanation";
      responseCard.append(completionBadge());
      const citation = sourceNote(sources);
      if (citation) responseCard.append(citation);
      responseCard.append(answerActions(answer, query, relevantMatches, followUp, responseRow));
      responseRow.scrollIntoView({ block: "end", behavior: "smooth" });
      if (!followUp) lastTopic = isReliableTopicMatch(query, matches?.[0]) ? matches[0].topic : null;
      console.info("[Qno timing]", {
        model: serverMetrics?.model || "unknown",
        apiCalls: serverMetrics?.apiCalls ?? 1,
        userSendToRequestMs: Math.round(requestStartedAt - clientStartedAt),
        clientTotalMs: Math.round(performance.now() - clientStartedAt),
        clientTtftMs: firstTokenAt === null ? null : Math.round(firstTokenAt - clientStartedAt),
        clientTextChunks: receivedChunks,
        progressiveText: receivedChunks > 1,
        server: serverMetrics,
      });
      return true;
    } catch (error) {
      console.warn("[Qno timing]", {
        model: serverMetrics?.model || "unknown",
        apiCalls: serverMetrics?.apiCalls ?? (serverMetrics?.modelRequests ? 1 : 0),
        userSendToRequestMs: Math.round(performance.now() - clientStartedAt),
        clientTotalMs: Math.round(performance.now() - clientStartedAt),
        clientTtftMs: firstTokenAt === null ? null : Math.round(firstTokenAt - clientStartedAt),
        clientTextChunks: receivedChunks,
        server: serverMetrics,
        error: error.name,
      });
      if (answer.trim()) {
        streamNode.replaceWith(geminiAnswerContent(answer));
        responseCard.classList.remove("qno-generation-waiting", "qno-generation-active");
        responseCard.classList.add("qno-generation-complete");
        responseCard.append(completionBadge("Partial answer saved"));
      } else {
        responseRow.remove();
      }
      if (error.name === "AbortError" || controller.signal.aborted) {
        if (runVersion === conversationVersion) retryNotice(query, answer.trim() ? responseRow : null, runVersion);
        return true;
      }
      if (runVersion === conversationVersion) retryNotice(query, answer.trim() ? responseRow : null, runVersion, error.message || "Qno couldn’t finish this reply. Your question is saved.");
      return true;
    } finally {
      if (activeController === controller) activeController = null;
    }
  }

  function renderQuestionList(payload) {
    const allItems = payload.allQuestions || payload.questions || [];
    activeQuestionSet = { ...payload, allQuestions: allItems, questions: payload.questions || [] };
    const card = document.createElement("section");
    card.className = "qno-question-list-card";
    const eyebrow = document.createElement("div");
    eyebrow.className = "qno-answer-meta";
    eyebrow.textContent = payload.kind === "repeated" ? "PREVIOUS-PAPER MATCHES" : `SOURCE QUESTION BANK · UNIT ${String(payload.unit).padStart(2, "0")}`;
    const title = document.createElement("h3");
    title.textContent = payload.title || `Unit ${payload.unit} questions`;
    const count = document.createElement("p");
    count.className = "qno-question-count";
    const filters = document.createElement("div");
    filters.className = "qno-question-filters";
    const list = document.createElement("div");
    list.className = "qno-question-items";
    const footer = document.createElement("div");
    footer.className = "qno-question-list-footer";
    const note = document.createElement("p");
    note.textContent = payload.note || "Original wording is kept from the source file.";
    const citation = document.createElement("small");
    citation.textContent = payload.source ? `Source: ${payload.source}` : "Source details are shown on each question.";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "qno-question-copy";
    copy.textContent = "Copy question list";
    copy.addEventListener("click", async () => {
      const text = activeQuestionSet.questions.map((item) => `${item.part ? `Part ${item.part} · ` : ""}Q${item.number}: ${item.text}`).join("\n");
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "List copied";
        setTimeout(() => { copy.textContent = "Copy question list"; }, 1300);
      } catch { copy.textContent = "Copy unavailable"; }
    });
    function drawQuestions() {
      list.replaceChildren();
      const items = activeQuestionSet.questions;
      count.textContent = `${items.length} ${payload.kind === "repeated" ? "repeated-question matches" : "source questions"} · complete result`;
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "qno-question-empty";
        empty.textContent = "No entries match this filter in the indexed source.";
        list.append(empty);
      }
      let lastPart = "";
      items.forEach((item, index) => {
        if (payload.kind === "important" && !activeQuestionSet.part && item.part && item.part !== lastPart) {
          lastPart = item.part;
          const section = document.createElement("h4");
          section.className = "qno-question-section-heading";
          section.textContent = `Part ${item.part}`;
          list.append(section);
        }
        const question = document.createElement("button");
        question.type = "button";
        question.className = "qno-source-question";
        const number = document.createElement("span");
        number.className = "qno-source-question-number";
        number.textContent = item.part ? `${item.part} · ${String(item.number).padStart(2, "0")}` : `0${index + 1}`;
        const text = document.createElement("span");
        text.className = "qno-source-question-text";
        text.textContent = item.text;
        const details = document.createElement("small");
        details.textContent = item.papers?.length
          ? item.papers.map((paper) => `${paper.examSession || paper.year || paper.paperId} · p.${paper.page}`).join(" / ")
          : `${item.origin || "Question bank"} · ${item.source || payload.source || "source file"}${item.page ? ` · p.${item.page}` : ""}${item.marks ? ` · ${item.marks} marks` : ""}`;
        question.append(number, text, details);
        question.addEventListener("click", () => {
          activeQuestionContext = item;
          sendQuestion(`Explain this exact DBMS exam question: ${item.text}`, item);
        });
        const row = document.createElement("div");
        row.className = "qno-source-question-row";
        row.append(question, makeAskGptLink(questionGptPrompt(item), "qno-source-question-gpt"));
        list.append(row);
      });
    }
    const addFilter = (label, callback, active = false) => {
      const control = document.createElement("button");
      control.type = "button";
      control.className = `qno-question-filter${active ? " is-active" : ""}`;
      control.textContent = label;
      control.addEventListener("click", callback);
      filters.append(control);
    };
    const setFilter = (label, items, part = null) => {
      activeQuestionSet.questions = items;
      activeQuestionSet.part = part;
      filters.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item.textContent === label));
      drawQuestions();
    };
    addFilter("All", () => setFilter("All", allItems), !payload.part);
    if (payload.availableFilters?.partA) addFilter("Part A", () => setFilter("Part A", allItems.filter((item) => item.part === "A"), "A"), payload.part === "A");
    if (payload.availableFilters?.partB) addFilter("Part B", () => setFilter("Part B", allItems.filter((item) => item.part === "B"), "B"), payload.part === "B");
    if (payload.availableFilters?.repeated && payload.kind !== "repeated") addFilter("Repeated", () => sendQuestion(`Give me repeated questions from Unit ${payload.unit}.`));
    (payload.availableFilters?.marks || []).forEach((marks) => addFilter(`${marks} marks`, () => setFilter(`${marks} marks`, allItems.filter((item) => item.marks === marks))));
    footer.append(note, citation, copy);
    card.append(eyebrow, title, count, filters, list, footer);
    addMessage("bot", card);
    drawQuestions();
  }

  function setGeminiStatus(configured, model = "") {
    geminiConfigured = configured;
    statusLabel.textContent = configured ? `Gemini AI · ${model || "ready"}` : "Local guide · Gemini not set up";
    privacyNote.textContent = configured
      ? "Gemini receives your question, the selected important question when relevant, and recent chat turns. The API key stays server-side."
      : "The indexed question lists work locally. Add GEMINI_API_KEY as a server-side secret to enable AI explanations.";
    overlay.classList.toggle("qno-gemini-ready", configured);
  }

  async function checkGeminiStatus() {
    try {
      const response = await fetch(`${rootPrefix}api/qno`, { cache: "no-store" });
      if (!response.ok) throw new Error("Gemini server unavailable");
      const result = await response.json();
      setGeminiStatus(Boolean(result.configured), result.model);
    } catch {
      setGeminiStatus(false);
    }
  }

  function unitCard(unit) {
    const card = document.createElement("article");
    card.className = "qno-unit-card";
    const heading = document.createElement("h3");
    heading.textContent = `Unit ${unit.number}: ${unit.title}`;
    const deck = document.createElement("p");
    deck.textContent = unit.deck;
    const lessons = document.createElement("div");
    lessons.className = "qno-unit-lesson-links";
    unit.lessons.forEach((lesson) => {
      lessons.append(makeLink(`Lesson ${lesson.number}: ${lesson.title}`, lesson.href, "qno-unit-lesson-link"));
    });
    card.append(heading, deck, lessons);
    return card;
  }

  function showUnits() {
    const body = addMessage("bot", document.createElement("div"));
    const intro = document.createElement("div");
    intro.className = "qno-bot-bubble";
    intro.textContent = "Choose a unit to see its separate lesson pages. I’ll also limit your next question to that unit if you want.";
    const list = document.createElement("div");
    list.className = "qno-unit-card-list";
    knowledge.units.forEach((unit) => list.append(unitCard(unit)));
    body.append(intro, list);
  }

  function showUnit(unitNumber) {
    const unit = knowledge.units.find((item) => item.number === unitNumber);
    if (!unit) return;
    currentUnit = unitNumber;
    scope.value = String(unitNumber);
    botText(`Unit ${unit.number}: ${unit.title}. ${unit.deck} Choose a lesson below, or ask me a question about this unit.`);
    const body = addMessage("bot", document.createElement("div"));
    body.append(unitCard(unit));
  }

  function unitNumberFromQuery(query) {
    const match = normalize(query).match(/\bunit\s*(1|2|3|4|5|6|one|two|three|four|five|six|i|ii|iii|iv|v|vi)\b/);
    if (!match) return 0;
    const values = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
    return Number(match[1]) || values[match[1]] || 0;
  }

  function isNavigationQuestion(query) {
    return /\b(where|find|locate|open|take me|which (unit|lesson|page|chapter|topic)|navigate|go to)\b/i.test(query);
  }

  function isUnitOnlyQuery(query) {
    const rest = normalize(query).replace(/\bunit\s*(1|2|3|4|5|6|one|two|three|four|five|six|i|ii|iii|iv|v|vi)\b/, " ");
    const navigationWords = new Set(["where", "find", "locate", "open", "take", "me", "go", "navigate", "to", "is", "which", "please", "show", "me"]);
    return tokens(rest).filter((word) => !/^\d+$/.test(word) && !navigationWords.has(word)).length === 0;
  }

  function isQuizRequest(query) {
    return /\b(quiz|test me|ask me a question|practice question|mcq)\b/i.test(query);
  }

  function isWorkedRequest(query) {
    return /\b(worked example|worked problem|solve (this|it|the)|walk me through|step by step)\b/i.test(query);
  }

  function isExamRequest(query) {
    return /\b(exam focus|important questions?|exam questions?|what should i study|what to study)\b/i.test(query);
  }

  function questionBankMatchInQuery(query) {
    const normalizedQuery = ` ${normalize(query)} `;
    const matches = (knowledge.questionBank?.items || [])
      .map((question) => ({ question, normalized: normalize(question.text) }))
      .filter((item) => item.normalized.length >= 8 && normalizedQuery.includes(` ${item.normalized} `))
      .sort((left, right) => right.normalized.length - left.normalized.length);
    if (!matches.length) return null;

    const longestLength = matches[0].normalized.length;
    const longestMatches = matches.filter((item) => item.normalized.length === longestLength);
    const explicitUnit = unitNumberFromQuery(query);
    if (explicitUnit) {
      const unitMatch = longestMatches.find((item) => Number(item.question.unit) === explicitUnit);
      if (unitMatch) return unitMatch.question;
    }
    const selectedMatch = longestMatches.find((item) => item.question.id === activeQuestionContext?.id);
    if (selectedMatch) return selectedMatch.question;

    const currentUnitHint = activeQuestionSet?.unit || currentUnit || Number(scope.value);
    const unitMatch = currentUnitHint
      ? longestMatches.find((item) => Number(item.question.unit) === Number(currentUnitHint))
      : null;
    return (unitMatch || longestMatches[0]).question;
  }

  function shouldAnswerMatchedQuestion(query, question) {
    const normalizedQuestion = normalize(question.text);
    const wrapper = normalize(query).replace(normalizedQuestion, " ").trim();
    if (!wrapper) return true;
    const asksForAnswer = /\b(explain|answer|solve|walk|describe|define|what is|what are|how|tell me)\b/.test(wrapper);
    const asksForList = /\b(all|list|show|give|fetch|find|important|imp|repeated|part a|part b|previous|past|question bank)\b/.test(wrapper);
    return asksForAnswer || !asksForList;
  }

  function isQuestionListRequest(query) {
    const text = normalize(query);
    const hasUnit = Boolean(unitNumberFromQuery(query)) || Boolean(activeQuestionSet?.unit) || Boolean(currentUnit) || Boolean(Number(scope.value)) || /\bunit\s*(i|ii|iii|iv|v|vi)\b/i.test(query);
    const asksForSet = /\b(questions?|question bank|important|imp|repeated|part a|part b|previous year|past papers?)\b/.test(text);
    const asksForList = /\b(all|list|give|show|fetch|find|important|imp|repeated|part a|part b|previous|past)\b/.test(text);
    return (hasUnit || /\bquestions?\b|\bpart\s*[ab]\b/.test(text)) && asksForSet && asksForList;
  }

  function selectedQuestionFromList(query) {
    const numberMatch = String(query).match(/\b(?:question|q)\s*0?(\d+)\s*([ab])?\b/i);
    if (!numberMatch) return null;
    const number = Number(numberMatch[1]);
    const requestedPart = String(query).match(/\bpart\s*([ab])\b/i)?.[1]?.toUpperCase() || numberMatch[2]?.toUpperCase();
    const preferredPart = requestedPart || activeQuestionSet?.part || "A";
    const unitNumber = unitNumberFromQuery(query) || activeQuestionSet?.unit || currentUnit || Number(scope.value) || 0;
    if (!unitNumber) return null;
    const candidates = activeQuestionSet?.questions?.length
      ? activeQuestionSet.questions
      : (knowledge.questionBank?.items || []).filter((question) => !unitNumber || question.unit === unitNumber);
    return candidates.find((question) => Number(question.number) === number && question.part === preferredPart)
      || candidates.find((question) => Number(question.number) === number)
      || null;
  }

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function shortDefinition(topic) {
    const definition = topic.definition || topic.details?.[0] || "This topic is explained in the linked lesson.";
    return definition.length > 210 ? `${definition.slice(0, 207).trimEnd()}…` : definition;
  }

  function startQuiz(unitNumber = currentUnit) {
    const pool = knowledge.topics.filter((topic) => (!unitNumber || topic.unit === unitNumber) && topic.definition);
    if (pool.length < 4) {
      botText("I need at least four topics in the selected unit to build a multiple-choice question. Choose another unit or set the menu to All units.");
      return;
    }
    const answer = pool[Math.floor(Math.random() * pool.length)];
    const distractors = shuffle(pool.filter((topic) => topic !== answer && topic.definition !== answer.definition)).slice(0, 3);
    const choices = shuffle([answer, ...distractors]);
    const correctIndex = choices.indexOf(answer);
    const quizId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeQuiz = { id: quizId, answer, correctIndex, choices };

    const card = document.createElement("section");
    card.className = "qno-quiz-card";
    card.dataset.qnoQuiz = quizId;
    const label = document.createElement("div");
    label.className = "qno-answer-meta";
    label.textContent = `QUICK QUIZ · UNIT ${String(answer.unit).padStart(2, "0")}`;
    const question = document.createElement("h3");
    question.textContent = `Which statement best explains “${answer.title}”?`;
    const options = document.createElement("div");
    options.className = "qno-quiz-options";
    choices.forEach((choice, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.qnoChoice = String(index);
      button.dataset.qnoQuiz = quizId;
      button.textContent = shortDefinition(choice);
      options.append(button);
    });
    card.append(label, question, options);
    addMessage("bot", card);
  }

  function workedExampleCard(unit, lesson) {
    const worked = lesson.worked;
    const card = document.createElement("article");
    card.className = "qno-worked-card";
    const meta = document.createElement("div");
    meta.className = "qno-answer-meta";
    meta.textContent = `UNIT ${String(unit.number).padStart(2, "0")} · ${lesson.title}`;
    const title = document.createElement("h3");
    title.textContent = worked.title;
    const setup = document.createElement("p");
    setup.className = "qno-worked-setup";
    setup.textContent = worked.setup;
    const steps = document.createElement("ol");
    steps.className = "qno-worked-steps";
    worked.steps.forEach((step) => {
      const item = document.createElement("li");
      const stepTitle = document.createElement("strong");
      stepTitle.textContent = step.title;
      const stepBody = document.createElement("p");
      stepBody.textContent = step.body;
      item.append(stepTitle, stepBody);
      steps.append(item);
    });
    const answer = document.createElement("p");
    answer.className = "qno-worked-answer";
    answer.textContent = worked.answer;
    card.append(meta, title, setup, steps, answer, makeLink("Open the full lesson", `${lesson.href}#worked-example`));
    return card;
  }

  function showWorkedExample(unitNumber = currentUnit) {
    const eligible = knowledge.units
      .filter((unit) => !unitNumber || unit.number === unitNumber)
      .flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson })))
      .filter(({ lesson }) => lesson.worked?.steps?.length);
    if (!eligible.length) {
      botText("I couldn’t find a worked example for that unit. Choose another unit or browse its lesson cards.");
      return;
    }
    const { unit, lesson } = eligible[Math.floor(Math.random() * eligible.length)];
    addMessage("bot", workedExampleCard(unit, lesson));
  }

  async function replyTo(query) {
    const greeting = greetingPrefix(query);
    const greetingReply = smallTalkReply(query);
    if (greetingReply) {
      botText(greetingReply);
      return;
    }
    let extraGreeting = "";
    if (greeting.greeting && greeting.rest) {
      extraGreeting = greeting.greeting.startsWith("good ")
        ? `${greeting.greeting.replace(/\b\w/g, (letter) => letter.toUpperCase())}! `
        : "Hi! ";
      query = greeting.rest.replace(/^qno\b[\s,!?.-]*/i, "");
    }
    const exactQuestion = questionBankMatchInQuery(query);
    if (exactQuestion && shouldAnswerMatchedQuestion(query, exactQuestion)) {
      activeQuestionContext = exactQuestion;
      activeQuestionSet = null;
      await askGemini(query, [], false);
      return;
    }
    const questionListRequest = isQuestionListRequest(query);
    if (questionListRequest) {
      activeQuestionContext = null;
      showQuestionList(query);
      return;
    }
    const chosenQuestion = selectedQuestionFromList(query);
    if (chosenQuestion && (/\b(explain|answer|solve|walk)\b/i.test(query) || /(?:question|q)\s*\d+\s*[ab]?\b/i.test(query))) {
      activeQuestionContext = chosenQuestion;
      await askGemini(query, [], true);
      return;
    }
    if (/(?:question|q)\s*\d+\s*[ab]?\b/i.test(query)) {
      botText("Choose a unit first, or open its question list with “Unit 1 IMP.” Then I can select the exact Part A or Part B question and explain it.");
      return;
    }
    const followUp = isContextualFollowUp(query);
    if (activeQuestionContext && followUp) {
      if (await askGemini(query, [], true)) return;
    }
    if (!followUp) {
      activeQuestionContext = null;
      activeQuestionSet = null;
    }
    if (followUp) {
      const clarificationScope = unitNumberFromQuery(query) || currentUnit || Number(scope.value) || 0;
      const clarificationMatches = searchTopics(query, clarificationScope);
      const namedTopic = isReliableTopicMatch(query, clarificationMatches[0]) ? clarificationMatches[0].topic : null;
      const topicToClarify = refersBackToPreviousTopic(query) ? lastTopic || namedTopic : namedTopic || lastTopic;
      const contextMatches = [];
      [topicToClarify, namedTopic].filter(Boolean).forEach((topic) => {
        if (!contextMatches.some((item) => item.topic.title === topic.title && item.topic.unit === topic.unit)) {
          contextMatches.push({ topic, score: 20 });
        }
      });
      if (await askGemini(query, contextMatches, true)) return;
      if (topicToClarify) {
        conversationalAnswer(topicToClarify, isAnotherExampleRequest(query) ? "example" : "alternate", extraGreeting);
        return;
      }
      botText("I want to explain the same idea, but I can’t identify it from the recent messages. Name the concept and I’ll explain it with a fresh example.");
      return;
    }
    const askedUnit = unitNumberFromQuery(query);
    if (isQuizRequest(query)) {
      startQuiz(askedUnit || currentUnit);
      return;
    }
    if (/\b(how do i use|how to use|help menu|what can you do)\b/i.test(query)) {
      botText("Ask a DBMS question in your own words, choose a unit from the left, or use Take a quiz. For navigation, ask “Where is normalization?” and I’ll link to its lesson. I search the lessons and course topics stored with this site, including common spelling variations.");
      return;
    }
    if (askedUnit && (/\b(lessons?|topics?|outline|contents|browse|show|list)\b/i.test(query) || (isNavigationQuestion(query) && isUnitOnlyQuery(query)))) {
      showUnit(askedUnit);
      return;
    }

    const unitFilter = askedUnit || currentUnit || Number(scope.value) || 0;
    const matches = searchTopics(query, unitFilter);
    if (!matches.length || matches[0].score < 1.8) {
      if (await askGemini(query, matches)) return;
      botText("I couldn’t match that wording to a topic in the stored DBMS guide. Try a shorter phrase, choose a unit, or ask me to list the lessons. I’ll say when I can’t find a reliable match rather than inventing an answer.");
      return;
    }

    if (isNavigationQuestion(query)) {
      const topic = matches[0].topic;
      const card = document.createElement("article");
      card.className = "qno-location-card";
      const label = document.createElement("div");
      label.className = "qno-answer-meta";
      label.textContent = "TOPIC LOCATION";
      const heading = document.createElement("h3");
      heading.textContent = topic.title;
      const location = document.createElement("p");
      location.textContent = `Unit ${topic.unit}: ${topic.unitTitle}  ›  Lesson ${topic.lessonNo}: ${topic.lessonTitle}`;
      const openLabel = topic.supplemental ? "Open the closest lesson" : topic.recordType === "lesson" ? "Open this lesson" : "Open this topic";
      card.append(label, heading, location, makeLink(openLabel, topic.href));
      addMessage("bot", card);
      return;
    }

    if (isWorkedRequest(query)) {
      const topic = matches[0].topic;
      const unit = knowledge.units.find((item) => item.number === topic.unit);
      const lesson = getLesson(topic);
      if (unit && lesson?.worked?.steps?.length) addMessage("bot", workedExampleCard(unit, lesson));
      else botText("I found the topic, but its lesson does not include a worked example yet. Open the linked lesson to review its explanation.");
      return;
    }

    if (isExamRequest(query)) {
      const lesson = getLesson(matches[0].topic);
      if (lesson?.exam) {
        lastTopic = matches[0].topic;
        const body = addMessage("bot", document.createElement("div"));
        const intro = document.createElement("div");
        intro.className = "qno-bot-bubble";
        intro.textContent = `${extraGreeting}For ${lesson.title}, make sure you can explain these exam points in your own words:`;
        const focus = document.createElement("div");
        focus.className = "qno-bot-bubble qno-exam-focus";
        focus.textContent = easyify(lesson.exam, matches[0].topic);
        const link = document.createElement("div");
        link.append(makeLink("Read this lesson", lesson.href));
        body.append(intro, focus, link);
        return;
      }
    }

    if (await askGemini(query, matches)) return;

    const compareIntent = /\b(compare|difference|differentiate|versus|\bvs\b)\b/i.test(query);
    if (compareIntent && matches.length > 1 && matches[1].score >= matches[0].score * 0.58) {
      botText(`${extraGreeting}Here are the two ideas in simpler words:`);
      addMessage("bot", conversationalAnswer(matches[0].topic));
      addMessage("bot", conversationalAnswer(matches[1].topic, "alternate"));
      return;
    }

    const best = matches[0];
    if (best.score < 3.2 && matches[1] && matches[1].score > best.score * 0.82) {
      const body = addMessage("bot", document.createElement("div"));
      const intro = document.createElement("div");
      intro.className = "qno-bot-bubble";
      intro.textContent = "I found a couple of close matches. Pick the concept you meant:";
      const choices = document.createElement("div");
      choices.className = "qno-match-list";
      matches.slice(0, 3).forEach(({ topic }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.qnoTopic = topic.href;
        button.textContent = `${topic.title} · Unit ${topic.unit}`;
        choices.append(button);
      });
      body.append(intro, choices);
      return;
    }
    addMessage("bot", conversationalAnswer(best.topic, "normal", extraGreeting));
  }

  async function sendQuestion(value, questionContext = null) {
    if (requestPending) {
      if (questionContext) queuedQuestion = { value, questionContext };
      activeController?.abort();
      return;
    }
    const query = String(value || "").trim();
    if (!query) return;
    if (questionContext) activeQuestionContext = questionContext;
    setRequestPending(true);
    addMessage("user", query);
    input.value = "";
    input.style.height = "auto";
    try {
      await replyTo(query);
    } finally {
      activeController = null;
      setRequestPending(false);
      if (queuedQuestion) {
        const nextQuestion = queuedQuestion;
        queuedQuestion = null;
        window.setTimeout(() => sendQuestion(nextQuestion.value, nextQuestion.questionContext), 0);
      }
      input.focus();
    }
  }

  function openBot() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("qno-open");
    input.focus();
  }

  function closeBot() {
    overlay.hidden = true;
    document.body.classList.remove("qno-open");
    lastFocus?.focus?.();
  }

  function resetConversation() {
    conversationVersion += 1;
    activeController?.abort();
    messages.replaceChildren();
    welcome.hidden = false;
    activeQuiz = null;
    lastTopic = null;
    activeQuestionContext = null;
    activeQuestionSet = null;
    queuedQuestion = null;
    lastAnswerQuery = "";
    currentUnit = 0;
    scope.value = "";
    overlay.querySelectorAll("[data-qno-unit]").forEach((button) => button.classList.remove("is-selected"));
    input.value = "";
    input.focus();
    scrollArea.scrollTop = 0;
  }

  function chooseUnit(number) {
    showUnit(Number(number));
    overlay.querySelectorAll("[data-qno-unit]").forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.qnoUnit) === Number(number));
    });
  }

  launcher.addEventListener("click", openBot);
  checkGeminiStatus();
  closeButton.addEventListener("click", closeBot);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeBot();
  });
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      closeBot();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]),a[href],textarea,select')].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendQuestion(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
  });
  scope.addEventListener("change", () => {
    currentUnit = Number(scope.value) || 0;
    overlay.querySelectorAll("[data-qno-unit]").forEach((button) => {
      button.classList.toggle("is-selected", currentUnit && Number(button.dataset.qnoUnit) === currentUnit);
    });
  });

  overlay.addEventListener("click", (event) => {
    const action = event.target.closest("[data-qno-action]");
    if (action) {
      const name = action.dataset.qnoAction;
      if (name === "new") resetConversation();
      if (name === "browse" || name === "units") showUnits();
      if (name === "quiz") startQuiz(Number(scope.value) || currentUnit);
      if (name === "example") showWorkedExample(Number(scope.value) || currentUnit);
      if (name === "ask") input.focus();
      return;
    }
    const unitButton = event.target.closest("[data-qno-unit]");
    if (unitButton) {
      chooseUnit(unitButton.dataset.qnoUnit);
      return;
    }
    const prompt = event.target.closest("[data-qno-prompt]");
    if (prompt) {
      sendQuestion(prompt.dataset.qnoPrompt);
      return;
    }
    const topicChoice = event.target.closest("[data-qno-topic]");
    if (topicChoice) {
      const topic = knowledge.topics.find((item) => item.href === topicChoice.dataset.qnoTopic);
      if (topic) addMessage("bot", conversationalAnswer(topic));
      return;
    }
    const option = event.target.closest("[data-qno-choice]");
    if (option && activeQuiz && option.dataset.qnoQuiz === activeQuiz.id) {
      const quiz = activeQuiz;
      const selected = Number(option.dataset.qnoChoice);
      const card = option.closest("[data-qno-quiz]");
      card.querySelectorAll("[data-qno-choice]").forEach((button, index) => {
        button.disabled = true;
        if (index === quiz.correctIndex) button.classList.add("qno-choice-correct");
        if (index === selected && index !== quiz.correctIndex) button.classList.add("qno-choice-wrong");
      });
      activeQuiz = null;
      lastTopic = quiz.answer;
      botText(selected === quiz.correctIndex ? "Correct! Let’s make sure the idea sticks." : `Not quite—the best answer was option ${quiz.correctIndex + 1}. Here’s the idea in plain language.`);
      addMessage("bot", conversationalAnswer(quiz.answer));
      const more = document.createElement("button");
      more.type = "button";
      more.className = "qno-next-quiz";
      more.dataset.qnoAction = "quiz";
      more.textContent = "Ask me another question";
      addMessage("bot", more);
    }
  });

  document.addEventListener("click", (event) => {
    const askButton = event.target.closest("[data-qno-question-id]");
    if (!askButton) return;
    const question = knowledge.questionBank?.items?.find((item) => item.id === askButton.dataset.qnoQuestionId);
    if (!question) return;

    const questionDialog = askButton.closest(".important-dialog");
    if (questionDialog?.open) questionDialog.close();
    currentUnit = Number(question.unit);
    scope.value = String(question.unit);
    overlay.querySelectorAll("[data-qno-unit]").forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.qnoUnit) === currentUnit);
    });
    activeQuestionContext = question;
    activeQuestionSet = { unit: currentUnit, part: question.part, questions: [question], allQuestions: [question], kind: "important" };
    openBot();
    sendQuestion(`Explain Question ${question.number}${question.part}: ${question.text}`, question);
  });

  enhanceImportantQuestionButtons();
  enhanceLessonTopics();

})();
