/**
 * Legal AI — Routes all Claude calls through the backend proxy.
 * No API keys in the frontend.
 *
 * Set VITE_API_BASE in .env to point to your CounselView server.
 * e.g. VITE_API_BASE=http://localhost:3001
 */

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

interface LegalResponse {
  text: string;
}

async function post(endpoint: string, body: Record<string, any>): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`API ${endpoint} failed:`, res.status);
      return "Server error. Try again.";
    }
    const data = await res.json();
    return data.text || "No response.";
  } catch (err) {
    console.error(`API ${endpoint} error:`, err);
    return "Cannot reach server.\nCheck connection.";
  }
}

/**
 * Analyze a question for objections.
 * Uses fast model for real-time speed.
 */
export async function analyzeObjection(question: string): Promise<LegalResponse> {
  const text = await post("/api/objection", { question });
  return { text };
}

/**
 * General legal search/lookup.
 */
export async function legalSearch(query: string, caseContext?: string): Promise<LegalResponse> {
  const text = await post("/api/search", { query, caseContext });
  return { text };
}

/**
 * Check for impeachment opportunities against prior testimony.
 */
export async function checkImpeachment(
  witness: string,
  priorTestimony: string[],
  currentStatement?: string
): Promise<LegalResponse> {
  const text = await post("/api/impeach", { witness, priorTestimony, currentStatement });
  return { text };
}

/**
 * Lookup statute or Federal Rule of Evidence.
 */
export async function lookupStatute(query: string, knownStatutes?: string[]): Promise<LegalResponse> {
  const text = await post("/api/statute", { query, knownStatutes });
  return { text };
}

/**
 * Generate follow-up question suggestions based on witness answer.
 */
export async function suggestFollowUp(witnessAnswer: string, currentTopic: string): Promise<LegalResponse> {
  const text = await post("/api/followup", { witnessAnswer, topic: currentTopic });
  return { text };
}
