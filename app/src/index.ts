/**
 * CounselView — AR Litigation Assistant
 *
 * MentraOS app that runs as a TypeScript server.
 * Displays legal assistance on Even Realities G1 glasses
 * via the MentraOS cloud relay.
 */

import { AppServer, AppSession } from "@mentra/sdk";
import { LegalEngine } from "./legal-engine";
import { CaseKnowledge, loadCase } from "./case-knowledge";
import { formatForGlasses, MODES } from "./display";

class CounselViewApp extends AppServer {
  private sessions = new Map<
    string,
    { session: AppSession; engine: LegalEngine; mode: string }
  >();

  onSession(session: AppSession, sessionId: string, userId: string) {
    const engine = new LegalEngine();
    const state = { session, engine, mode: "menu" };
    this.sessions.set(sessionId, state);

    // Welcome screen
    session.layouts.showTextWall(
      "CounselView v0.1\n" +
        "────────────────\n" +
        "Say a command:\n" +
        '"next" — next question\n' +
        '"object" — check objection\n' +
        '"search [query]" — lookup\n' +
        '"exhibit [#]" — show exhibit'
    );

    // Core: handle voice transcription
    session.events.onTranscription(async (transcription) => {
      if (!transcription.isFinal) return;

      const text = transcription.text.trim().toLowerCase();
      console.log(`[${sessionId}] Voice: "${text}"`);

      try {
        await this.handleVoiceCommand(sessionId, text);
      } catch (err) {
        console.error(`[${sessionId}] Error:`, err);
        session.layouts.showTextWall("Error processing\ncommand. Try again.");
      }
    });

    // Battery monitoring
    session.events.onGlassesBattery?.((battery) => {
      if (battery < 15) {
        session.layouts.showTextWall(`Low battery: ${battery}%\nCharge soon.`);
      }
    });

    console.log(`[${sessionId}] Session started for user ${userId}`);
  }

  private async handleVoiceCommand(sessionId: string, text: string) {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    const { session, engine } = state;

    // --- Navigation commands ---
    if (text === "next" || text === "next question") {
      const q = engine.nextQuestion();
      if (q) {
        session.layouts.showTextWall(
          formatForGlasses(
            `Q${engine.questionIndex + 1}/${engine.questionCount}\n\n${q}`
          )
        );
      } else {
        session.layouts.showTextWall("No more questions.");
      }
      return;
    }

    if (text === "back" || text === "previous") {
      const q = engine.prevQuestion();
      if (q) {
        session.layouts.showTextWall(
          formatForGlasses(
            `Q${engine.questionIndex + 1}/${engine.questionCount}\n\n${q}`
          )
        );
      }
      return;
    }

    // --- Objection analysis ---
    if (text.startsWith("object") || text.startsWith("objection")) {
      session.layouts.showTextWall("Analyzing...");
      const result = await engine.analyzeObjection(text.replace(/^objection?\s*/i, ""));
      session.layouts.showTextWall(result);
      return;
    }

    // --- Legal search ---
    if (text.startsWith("search") || text.startsWith("find") || text.startsWith("look up")) {
      const query = text.replace(/^(search|find|look ?up)\s*/i, "");
      if (!query) {
        session.layouts.showTextWall("Say: search [query]\ne.g. search hearsay\nexceptions");
        return;
      }
      session.layouts.showTextWall("Searching...");
      const result = await engine.search(query);
      session.layouts.showTextWall(result);
      return;
    }

    // --- Exhibit lookup ---
    if (text.startsWith("exhibit")) {
      const id = text.replace(/^exhibit\s*/i, "").trim();
      const result = engine.getExhibit(id);
      session.layouts.showTextWall(result);
      return;
    }

    // --- Impeachment check ---
    if (text.startsWith("impeach") || text.startsWith("contradiction")) {
      const witness = text.replace(/^(impeach|contradiction)\s*/i, "").trim();
      session.layouts.showTextWall("Checking prior\ntestimony...");
      const result = await engine.checkImpeachment(witness);
      session.layouts.showTextWall(result);
      return;
    }

    // --- Statute lookup ---
    if (text.startsWith("statute") || text.startsWith("rule") || text.startsWith("fre")) {
      const query = text.replace(/^(statute|rule|fre)\s*/i, "").trim();
      session.layouts.showTextWall("Looking up...");
      const result = await engine.lookupStatute(query);
      session.layouts.showTextWall(result);
      return;
    }

    // --- Mode switching ---
    if (text === "menu" || text === "home") {
      session.layouts.showTextWall(
        "CounselView\n────────────\nnext | object | search\nexhibit | impeach | rule"
      );
      return;
    }

    // --- Fallback: treat as general legal query ---
    session.layouts.showTextWall("Thinking...");
    const result = await engine.search(text);
    session.layouts.showTextWall(result);
  }
}

// --- Start server ---
const app = new CounselViewApp({
  packageName: process.env.PACKAGE_NAME!,
  apiKey: process.env.MENTRAOS_API_KEY!,
  port: parseInt(process.env.PORT || "3000"),
});

app.start();
console.log("CounselView server running on port", process.env.PORT || 3000);
