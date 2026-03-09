/**
 * Case Knowledge — Pre-loaded case data for CounselView
 *
 * Load depositions, exhibits, statutes, and examination questions
 * before trial. Everything is pre-cached locally so it works
 * even with poor connectivity.
 */

import { readFileSync } from "fs";

export interface CaseKnowledge {
  caseName: string;
  caseNumber: string;
  depositionExcerpts: Record<string, string[]>; // witness -> prior statements
  exhibits: Record<string, string>; // exhibit id -> description
  keyStatutes: string[];
  opposingArguments: string[];
  juryInstructions: string[];
  questions?: string[]; // examination question queue
}

/**
 * Load case knowledge from a JSON file.
 *
 * Expected JSON format matches CaseKnowledge interface with
 * either camelCase or snake_case keys.
 */
export function loadCase(filePath: string): CaseKnowledge {
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));

  return {
    caseName: raw.caseName || raw.case_name || "",
    caseNumber: raw.caseNumber || raw.case_number || "",
    depositionExcerpts:
      raw.depositionExcerpts || raw.deposition_excerpts || {},
    exhibits: raw.exhibits || {},
    keyStatutes: raw.keyStatutes || raw.key_statutes || [],
    opposingArguments:
      raw.opposingArguments || raw.opposing_arguments || [],
    juryInstructions:
      raw.juryInstructions || raw.jury_instructions || [],
    questions: raw.questions || [],
  };
}

/**
 * Merge multiple case files into one knowledge base.
 * Useful when depositions, exhibits, and questions are in separate files.
 */
export function mergeCases(...cases: CaseKnowledge[]): CaseKnowledge {
  const merged: CaseKnowledge = {
    caseName: "",
    caseNumber: "",
    depositionExcerpts: {},
    exhibits: {},
    keyStatutes: [],
    opposingArguments: [],
    juryInstructions: [],
    questions: [],
  };

  for (const c of cases) {
    if (c.caseName) merged.caseName = c.caseName;
    if (c.caseNumber) merged.caseNumber = c.caseNumber;
    Object.assign(merged.depositionExcerpts, c.depositionExcerpts);
    Object.assign(merged.exhibits, c.exhibits);
    merged.keyStatutes.push(...c.keyStatutes);
    merged.opposingArguments.push(...c.opposingArguments);
    merged.juryInstructions.push(...c.juryInstructions);
    if (c.questions) merged.questions!.push(...c.questions);
  }

  return merged;
}
