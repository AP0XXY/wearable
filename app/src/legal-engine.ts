/**
 * Legal Engine — Core AI logic for CounselView
 *
 * Handles objection detection, case law search, impeachment checks,
 * and statute lookups using Claude API.
 */

import Anthropic from "@anthropic-ai/sdk";
import { CaseKnowledge, loadCase } from "./case-knowledge";
import { formatForGlasses } from "./display";

const client = new Anthropic();

// Use Haiku for real-time objection detection (speed matters)
const FAST_MODEL = "claude-haiku-4-5-20251001";
// Use Sonnet for deeper legal analysis
const SMART_MODEL = "claude-sonnet-4-6";

const GLASSES_SYSTEM = `You are a litigation support AI displayed on AR glasses during live proceedings.
CRITICAL CONSTRAINT: Responses must be under 200 characters total.
Format: short lines, max 40 chars per line, max 5 lines.
No disclaimers. No caveats. Direct answers only.`;

const OBJECTION_SYSTEM = `You analyze trial questions for objectionable form.
Respond in this exact format (nothing else):

OBJECTION: [type]
Rule: FRE [number]
[one-line explanation]

Types: Leading, Hearsay, Relevance, Speculation, Compound, Asked & Answered, Assumes Facts, Argumentative, Best Evidence, Character, Foundation

If NOT objectionable, respond with exactly: NO OBJECTION`;

export class LegalEngine {
  private questions: string[] = [];
  private _questionIndex = -1;
  private caseKnowledge: CaseKnowledge | null = null;

  get questionIndex(): number {
    return this._questionIndex;
  }

  get questionCount(): number {
    return this.questions.length;
  }

  loadQuestions(questions: string[]) {
    this.questions = questions;
    this._questionIndex = -1;
  }

  loadCase(caseData: CaseKnowledge) {
    this.caseKnowledge = caseData;
    if (caseData.questions) {
      this.loadQuestions(caseData.questions);
    }
  }

  nextQuestion(): string | null {
    if (this._questionIndex < this.questions.length - 1) {
      this._questionIndex++;
      return this.questions[this._questionIndex];
    }
    return null;
  }

  prevQuestion(): string | null {
    if (this._questionIndex > 0) {
      this._questionIndex--;
      return this.questions[this._questionIndex];
    }
    return this._questionIndex === 0 ? this.questions[0] : null;
  }

  getExhibit(id: string): string {
    if (!this.caseKnowledge?.exhibits) {
      return "No case loaded.";
    }
    const desc = this.caseKnowledge.exhibits[id];
    if (!desc) {
      return `Exhibit ${id} not found.`;
    }
    return formatForGlasses(`Exhibit ${id}\n${desc}`);
  }

  async analyzeObjection(questionText: string): Promise<string> {
    if (!questionText) {
      return "Say the question\nto analyze.";
    }

    try {
      const response = await client.messages.create({
        model: FAST_MODEL,
        max_tokens: 150,
        system: OBJECTION_SYSTEM,
        messages: [{ role: "user", content: questionText }],
      });
      const text =
        response.content[0].type === "text" ? response.content[0].text : "";
      return formatForGlasses(text);
    } catch (err) {
      console.error("Objection analysis error:", err);
      return "Analysis unavailable.";
    }
  }

  async search(query: string): Promise<string> {
    const context = this.buildContext();

    try {
      const response = await client.messages.create({
        model: SMART_MODEL,
        max_tokens: 200,
        system: GLASSES_SYSTEM,
        messages: [
          {
            role: "user",
            content: `${context}\n\nLegal query: ${query}`,
          },
        ],
      });
      const text =
        response.content[0].type === "text" ? response.content[0].text : "";
      return formatForGlasses(text);
    } catch (err) {
      console.error("Search error:", err);
      return "Search unavailable.";
    }
  }

  async checkImpeachment(witness: string): Promise<string> {
    if (!this.caseKnowledge?.depositionExcerpts) {
      return "No depositions loaded.";
    }

    // Find matching witness (case-insensitive partial match)
    const witnessKey = Object.keys(this.caseKnowledge.depositionExcerpts).find(
      (k) => k.toLowerCase().includes(witness.toLowerCase())
    );

    if (!witnessKey) {
      return `No deposition found\nfor "${witness}".`;
    }

    const excerpts = this.caseKnowledge.depositionExcerpts[witnessKey];
    const excerptText = excerpts.join("\n");

    try {
      const response = await client.messages.create({
        model: SMART_MODEL,
        max_tokens: 200,
        system: `${GLASSES_SYSTEM}\n\nYou have prior deposition testimony. Identify the most useful impeachment points. Format: page cite + key contradiction.`,
        messages: [
          {
            role: "user",
            content: `Witness: ${witnessKey}\nPrior testimony:\n${excerptText}\n\nProvide impeachment summary.`,
          },
        ],
      });
      const text =
        response.content[0].type === "text" ? response.content[0].text : "";
      return formatForGlasses(text);
    } catch (err) {
      console.error("Impeachment check error:", err);
      return "Analysis unavailable.";
    }
  }

  async lookupStatute(query: string): Promise<string> {
    const statutes = this.caseKnowledge?.keyStatutes?.join("\n") || "";

    try {
      const response = await client.messages.create({
        model: SMART_MODEL,
        max_tokens: 200,
        system: `${GLASSES_SYSTEM}\n\nProvide the statute section and its key operative language. If the user references a Federal Rule of Evidence (FRE), give the rule number, title, and the most critical clause.`,
        messages: [
          {
            role: "user",
            content: `Known statutes:\n${statutes}\n\nLookup: ${query}`,
          },
        ],
      });
      const text =
        response.content[0].type === "text" ? response.content[0].text : "";
      return formatForGlasses(text);
    } catch (err) {
      console.error("Statute lookup error:", err);
      return "Lookup unavailable.";
    }
  }

  private buildContext(): string {
    if (!this.caseKnowledge) return "";

    const parts: string[] = [];
    if (this.caseKnowledge.caseName) {
      parts.push(
        `Case: ${this.caseKnowledge.caseName} (${this.caseKnowledge.caseNumber})`
      );
    }
    if (this.caseKnowledge.keyStatutes?.length) {
      parts.push(
        `Key statutes: ${this.caseKnowledge.keyStatutes.slice(0, 5).join(", ")}`
      );
    }
    if (this.caseKnowledge.opposingArguments?.length) {
      parts.push(
        `Opposing arguments: ${this.caseKnowledge.opposingArguments.join("; ")}`
      );
    }
    return parts.join("\n");
  }
}
