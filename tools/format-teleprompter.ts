/**
 * Formats examination questions for the Even Realities teleprompter.
 *
 * The Even app teleprompter has 3 modes:
 *   - AI mode: syncs to your speech (best for examination)
 *   - Manual mode: tap to advance (volume buttons or temple tap)
 *   - Auto mode: constant scroll speed
 *
 * This tool formats questions with clear separators and numbering
 * so they display well on the G2 lenses.
 *
 * Usage: node --experimental-strip-types tools/format-teleprompter.ts [case.json]
 * Output: copy the text and paste it into the Even app teleprompter.
 */

import { readFileSync, writeFileSync } from "fs";

const SEPARATOR = "\n\n— — —\n\n";

interface CaseFile {
  caseName?: string;
  case_name?: string;
  questions?: string[];
  exhibits?: Record<string, string>;
  key_statutes?: string[];
  keyStatutes?: string[];
  jury_instructions?: string[];
  juryInstructions?: string[];
}

function formatForTeleprompter(caseData: CaseFile): string {
  const sections: string[] = [];
  const name = caseData.caseName || caseData.case_name || "Case";

  // Header
  sections.push(`${name}\nExamination Questions`);

  // Questions
  const questions = caseData.questions || [];
  for (let i = 0; i < questions.length; i++) {
    sections.push(`Question ${i + 1} of ${questions.length}\n\n${questions[i]}`);
  }

  // Key statutes reference (at the end for quick scroll)
  const statutes = caseData.keyStatutes || caseData.key_statutes || [];
  if (statutes.length > 0) {
    sections.push(`KEY STATUTES\n\n${statutes.join("\n\n")}`);
  }

  // Jury instructions
  const instructions = caseData.juryInstructions || caseData.jury_instructions || [];
  if (instructions.length > 0) {
    sections.push(`JURY INSTRUCTIONS\n\n${instructions.join("\n\n")}`);
  }

  return sections.join(SEPARATOR);
}

// --- CLI ---
const inputFile = process.argv[2];

if (inputFile) {
  const raw = JSON.parse(readFileSync(inputFile, "utf-8"));
  const output = formatForTeleprompter(raw);
  const outFile = inputFile.replace(/\.json$/, "-teleprompter.txt");
  writeFileSync(outFile, output);
  console.log(`Written to: ${outFile}`);
  console.log(`\nCopy the contents and paste into Even app → Teleprompt`);
  console.log(`\nPreview:\n${"─".repeat(40)}`);
  console.log(output.slice(0, 500));
  if (output.length > 500) console.log("...");
} else {
  // Demo mode
  const demo = formatForTeleprompter({
    caseName: "Smith v. Acme Corp",
    questions: [
      "Can you state your full name for the record?",
      "Where were you on the evening of March 15, 2025?",
      "Did you observe the defendant at any point that evening?",
      "Can you describe what you saw?",
      "Is it true you previously stated under oath that you did NOT see the defendant?",
      "How do you reconcile that prior testimony with what you just told this court?",
    ],
    keyStatutes: [
      "FRE 801(d)(1) — Prior inconsistent statement",
      "FRE 611(c) — Leading questions on cross",
    ],
  });

  console.log("TELEPROMPTER OUTPUT — Copy and paste into Even app:\n");
  console.log("─".repeat(40));
  console.log(demo);
  console.log("─".repeat(40));
  console.log("\nSteps:");
  console.log("1. Open Even Realities app");
  console.log("2. Tap Teleprompt");
  console.log("3. Paste this text");
  console.log("4. Choose Manual mode (tap to advance)");
  console.log("5. Put on glasses — questions appear on lens");
}
