/**
 * CounselView Main — Wires the phone UI to glasses display + legal AI
 */

import {
  initGlasses,
  isEvenApp,
  showText,
  updateText,
  showHeaderAndBody,
  showList,
  onTap,
  onScroll,
  startMic,
  stopMic,
} from "./glasses";

import {
  analyzeObjection,
  legalSearch,
  checkImpeachment,
  lookupStatute,
  suggestFollowUp,
} from "./legal-ai";

import {
  loadCaseData,
  loadQuestions,
  nextQuestion,
  prevQuestion,
  currentQuestion,
  getExhibit,
  listExhibits,
  getCase,
  getCaseContext,
  getWitnesses,
  getDepositionExcerpts,
} from "./case-store";

// --- State ---
let currentMode: string = "examination";
let glassesConnected = false;

// --- DOM refs ---
const $ = (id: string) => document.getElementById(id)!;
const statusEl = $("status");
const logEl = $("log");

// --- Logging ---
function log(msg: string): void {
  const time = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[CounselView] ${msg}`);
}

// --- Glasses display wrapper ---
function displayOnGlasses(text: string): void {
  if (glassesConnected) {
    showText(text);
  }
  log(`→ Display: ${text.split("\n")[0]}...`);
}

function displayHeaderBody(header: string, body: string): void {
  if (glassesConnected) {
    showHeaderAndBody(header, body);
  }
  log(`→ [${header}] ${body.split("\n")[0]}...`);
}

// --- Init ---
async function init(): Promise<void> {
  log("Initializing CounselView...");

  // Try connecting to glasses
  if (isEvenApp()) {
    statusEl.textContent = "Connecting to G2...";
    glassesConnected = await initGlasses();
    if (glassesConnected) {
      statusEl.textContent = "Connected to G2";
      statusEl.className = "status connected";
      log("G2 glasses connected!");
      displayOnGlasses("CounselView\n────────────\nReady.\nTap to navigate.");
    } else {
      statusEl.textContent = "G2 connection failed";
      statusEl.className = "status error";
      log("Failed to connect to G2");
    }
  } else {
    statusEl.textContent = "Dev mode (no glasses)";
    statusEl.className = "status";
    log("Running in dev mode — no glasses bridge detected");
  }

  // Set up glasses input handlers
  onTap((event) => {
    log(`Tap event: code=${event.eventCode}`);
    if (currentMode === "examination") {
      // Single tap = next question, double tap = prev
      if (event.eventCode === 0) handleNextQuestion();
      if (event.eventCode === 3) handlePrevQuestion();
    }
  });

  onScroll((event) => {
    log(`Scroll event: code=${event.eventCode}`);
    if (currentMode === "examination") {
      if (event.eventCode === 2) handleNextQuestion(); // scroll down
      if (event.eventCode === 1) handlePrevQuestion(); // scroll up
    }
  });

  // Set up phone UI handlers
  setupModeButtons();
  setupExamination();
  setupResearch();
  setupObjection();
  setupDeposition();
  setupCaseLoader();

  log("Ready.");
}

// --- Mode switching ---
function setupModeButtons(): void {
  const modes = ["examination", "objection", "research", "deposition"];
  const panels: Record<string, string> = {
    examination: "exam-panel",
    objection: "objection-panel",
    research: "research-panel",
    deposition: "deposition-panel",
  };

  for (const mode of modes) {
    $(`mode-${mode}`).addEventListener("click", () => {
      // Update button styles
      for (const m of modes) {
        $(`mode-${m}`).classList.toggle("active", m === mode);
      }
      // Show/hide panels
      for (const [m, panelId] of Object.entries(panels)) {
        $(panelId).style.display = m === mode ? "block" : "none";
      }
      currentMode = mode;
      log(`Mode: ${mode}`);

      // Update glasses display for new mode
      const modeLabels: Record<string, string> = {
        examination: "EXAM",
        objection: "OBJ",
        research: "SEARCH",
        deposition: "DEPO",
      };
      displayHeaderBody(
        `[${modeLabels[mode]}]`,
        `${mode.charAt(0).toUpperCase() + mode.slice(1)} mode active.\nUse phone or tap to navigate.`
      );
    });
  }
}

// --- Examination mode ---
function setupExamination(): void {
  $("load-questions").addEventListener("click", () => {
    const input = ($("questions-input") as HTMLTextAreaElement).value;
    const questions = input
      .split("\n")
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    if (questions.length === 0) {
      log("No questions to load");
      return;
    }

    loadQuestions(questions);
    log(`Loaded ${questions.length} questions`);

    $("question-nav").style.display = "flex";
    handleNextQuestion(); // Show first question
  });

  $("next-q").addEventListener("click", handleNextQuestion);
  $("prev-q").addEventListener("click", handlePrevQuestion);
}

function handleNextQuestion(): void {
  const { question, index, total } = nextQuestion();
  if (question) {
    $("q-counter").textContent = `${index + 1}/${total}`;
    displayHeaderBody(
      `Q${index + 1}/${total}`,
      question
    );
  } else {
    displayOnGlasses("End of questions.");
  }
}

function handlePrevQuestion(): void {
  const { question, index, total } = prevQuestion();
  if (question) {
    $("q-counter").textContent = `${index + 1}/${total}`;
    displayHeaderBody(
      `Q${index + 1}/${total}`,
      question
    );
  }
}

// --- Research mode ---
function setupResearch(): void {
  $("search-btn").addEventListener("click", async () => {
    const query = ($("search-input") as HTMLInputElement).value.trim();
    if (!query) return;

    displayOnGlasses("Searching...");
    log(`Search: "${query}"`);

    const result = await legalSearch(query, getCaseContext());
    displayOnGlasses(result.text);
    log(`Result: ${result.text.split("\n")[0]}`);
  });

  // Voice search via mic
  let micActive = false;
  $("mic-btn").addEventListener("click", () => {
    if (!micActive) {
      startMic();
      ($("mic-btn") as HTMLButtonElement).textContent = "Stop Listening";
      ($("mic-btn") as HTMLButtonElement).classList.add("danger");
      micActive = true;
      displayOnGlasses("Listening...\nSpeak your query.");
      log("Mic activated for voice search");
    } else {
      stopMic();
      ($("mic-btn") as HTMLButtonElement).textContent = "Voice Search";
      ($("mic-btn") as HTMLButtonElement).classList.remove("danger");
      micActive = false;
      log("Mic deactivated");
    }
  });
}

// --- Objection mode ---
function setupObjection(): void {
  $("objection-btn").addEventListener("click", async () => {
    const question = ($("objection-input") as HTMLInputElement).value.trim();
    if (!question) return;

    displayOnGlasses("Analyzing...");
    log(`Objection check: "${question.slice(0, 50)}..."`);

    const result = await analyzeObjection(question);
    displayOnGlasses(result.text);
    log(`Objection: ${result.text.split("\n")[0]}`);
  });
}

// --- Deposition mode ---
function setupDeposition(): void {
  $("load-depo").addEventListener("click", () => {
    const text = ($("depo-transcript") as HTMLTextAreaElement).value.trim();
    if (!text) return;

    // Parse as lines of prior testimony
    const excerpts = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    log(`Loaded ${excerpts.length} deposition excerpts`);
    displayOnGlasses(`Deposition loaded.\n${excerpts.length} excerpts ready.`);
  });

  $("depo-check").addEventListener("click", async () => {
    const statement = ($("depo-search") as HTMLInputElement).value.trim();
    if (!statement) return;

    const witnesses = getWitnesses();
    if (witnesses.length === 0) {
      displayOnGlasses("No depositions loaded.\nLoad case data first.");
      return;
    }

    displayOnGlasses("Checking...");
    log(`Contradiction check: "${statement.slice(0, 50)}..."`);

    // Check all witnesses
    for (const witness of witnesses) {
      const excerpts = getDepositionExcerpts(witness);
      if (excerpts.length > 0) {
        const result = await checkImpeachment(witness, excerpts, statement);
        displayOnGlasses(result.text);
        log(`Impeachment (${witness}): ${result.text.split("\n")[0]}`);
        break; // Show first match
      }
    }
  });
}

// --- Case loader ---
function setupCaseLoader(): void {
  $("load-case").addEventListener("click", () => {
    const jsonText = ($("case-json") as HTMLTextAreaElement).value.trim();
    if (!jsonText) return;

    try {
      const data = JSON.parse(jsonText);
      const caseData = loadCaseData(data);

      // Update case info display
      $("case-info").innerHTML = `
        <strong>${caseData.caseName}</strong> (${caseData.caseNumber})<br>
        ${Object.keys(caseData.depositionExcerpts).length} witnesses |
        ${Object.keys(caseData.exhibits).length} exhibits |
        ${caseData.keyStatutes.length} statutes
        ${caseData.questions.length > 0 ? `| ${caseData.questions.length} questions` : ""}
      `;

      // Auto-load questions if present
      if (caseData.questions.length > 0) {
        ($("questions-input") as HTMLTextAreaElement).value =
          caseData.questions.join("\n");
        loadQuestions(caseData.questions);
        $("question-nav").style.display = "flex";
      }

      log(`Case loaded: ${caseData.caseName}`);
      displayOnGlasses(
        `Case loaded:\n${caseData.caseName}\n${caseData.caseNumber}\n\nReady.`
      );
    } catch (err) {
      log(`Error parsing case JSON: ${err}`);
      $("case-info").textContent = "Error: invalid JSON";
    }
  });
}

// --- Boot ---
init();
