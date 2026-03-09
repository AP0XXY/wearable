/**
 * Case Store — In-memory case knowledge for CounselView
 *
 * Loaded from JSON on the phone UI, stored in memory,
 * queried by the legal AI and display logic.
 */

export interface CaseData {
  caseName: string;
  caseNumber: string;
  depositionExcerpts: Record<string, string[]>;
  exhibits: Record<string, string>;
  keyStatutes: string[];
  opposingArguments: string[];
  juryInstructions: string[];
  questions: string[];
}

const EMPTY_CASE: CaseData = {
  caseName: "",
  caseNumber: "",
  depositionExcerpts: {},
  exhibits: {},
  keyStatutes: [],
  opposingArguments: [],
  juryInstructions: [],
  questions: [],
};

let currentCase: CaseData = { ...EMPTY_CASE };
let questionIndex = -1;

/**
 * Load case data from a JSON object (supports snake_case or camelCase keys).
 */
export function loadCaseData(raw: any): CaseData {
  currentCase = {
    caseName: raw.caseName || raw.case_name || "",
    caseNumber: raw.caseNumber || raw.case_number || "",
    depositionExcerpts: raw.depositionExcerpts || raw.deposition_excerpts || {},
    exhibits: raw.exhibits || {},
    keyStatutes: raw.keyStatutes || raw.key_statutes || [],
    opposingArguments: raw.opposingArguments || raw.opposing_arguments || [],
    juryInstructions: raw.juryInstructions || raw.jury_instructions || [],
    questions: raw.questions || [],
  };
  questionIndex = -1;
  return currentCase;
}

export function getCase(): CaseData {
  return currentCase;
}

export function getCaseContext(): string {
  if (!currentCase.caseName) return "";
  const parts = [`Case: ${currentCase.caseName} (${currentCase.caseNumber})`];
  if (currentCase.keyStatutes.length) {
    parts.push(`Statutes: ${currentCase.keyStatutes.slice(0, 3).join(", ")}`);
  }
  return parts.join("\n");
}

// --- Question queue ---

export function loadQuestions(questions: string[]): void {
  currentCase.questions = questions;
  questionIndex = -1;
}

export function nextQuestion(): { question: string | null; index: number; total: number } {
  if (questionIndex < currentCase.questions.length - 1) {
    questionIndex++;
  }
  return {
    question: currentCase.questions[questionIndex] || null,
    index: questionIndex,
    total: currentCase.questions.length,
  };
}

export function prevQuestion(): { question: string | null; index: number; total: number } {
  if (questionIndex > 0) {
    questionIndex--;
  }
  return {
    question: currentCase.questions[questionIndex] || null,
    index: questionIndex,
    total: currentCase.questions.length,
  };
}

export function currentQuestion(): { question: string | null; index: number; total: number } {
  return {
    question: questionIndex >= 0 ? currentCase.questions[questionIndex] : null,
    index: questionIndex,
    total: currentCase.questions.length,
  };
}

// --- Exhibit lookup ---

export function getExhibit(id: string): string | null {
  return currentCase.exhibits[id] || null;
}

export function listExhibits(): string[] {
  return Object.entries(currentCase.exhibits).map(
    ([id, desc]) => `Ex ${id}: ${desc}`
  );
}

// --- Deposition lookup ---

export function getWitnesses(): string[] {
  return Object.keys(currentCase.depositionExcerpts);
}

export function getDepositionExcerpts(witness: string): string[] {
  // Case-insensitive partial match
  const key = Object.keys(currentCase.depositionExcerpts).find((k) =>
    k.toLowerCase().includes(witness.toLowerCase())
  );
  return key ? currentCase.depositionExcerpts[key] : [];
}
