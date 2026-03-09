"""
CounselView Prototype — AR Litigation Assistant
Connects directly to Even Realities G1 glasses over BLE.
Run from a laptop within BLE range of the glasses.
"""

import asyncio
import json
import os
from enum import Enum
from dataclasses import dataclass, field

from even_glasses import GlassesManager, Notification, RSVPConfig

# Optional: Claude API for legal analysis
try:
    from anthropic import Anthropic
    claude = Anthropic()
    HAS_CLAUDE = True
except Exception:
    claude = None
    HAS_CLAUDE = False


class Mode(str, Enum):
    EXAMINATION = "examination"
    OBJECTION = "objection"
    RESEARCH = "research"
    DEPOSITION = "deposition"
    VOIR_DIRE = "voir_dire"


@dataclass
class ExaminationState:
    """Tracks state during witness examination."""
    questions: list[str] = field(default_factory=list)
    current_index: int = 0
    exhibit_map: dict[str, str] = field(default_factory=dict)  # exhibit_id -> description

    @property
    def current_question(self) -> str | None:
        if 0 <= self.current_index < len(self.questions):
            return self.questions[self.current_index]
        return None

    @property
    def remaining(self) -> int:
        return max(0, len(self.questions) - self.current_index - 1)

    def next(self) -> str | None:
        self.current_index += 1
        return self.current_question

    def prev(self) -> str | None:
        self.current_index = max(0, self.current_index - 1)
        return self.current_question


@dataclass
class CaseKnowledge:
    """Pre-loaded case knowledge base."""
    case_name: str = ""
    case_number: str = ""
    deposition_excerpts: dict[str, list[str]] = field(default_factory=dict)  # witness -> statements
    exhibits: dict[str, str] = field(default_factory=dict)  # id -> description
    key_statutes: list[str] = field(default_factory=list)
    opposing_arguments: list[str] = field(default_factory=list)
    jury_instructions: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Display helpers — format for 40-char, 5-line G1 display
# ---------------------------------------------------------------------------

MAX_LINE_CHARS = 40
MAX_LINES = 5


def format_for_display(text: str) -> str:
    """Wrap text to fit the G1 display constraints."""
    words = text.split()
    lines = []
    current_line = ""
    for word in words:
        if len(current_line) + len(word) + 1 <= MAX_LINE_CHARS:
            current_line = f"{current_line} {word}" if current_line else word
        else:
            lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)
    return "\n".join(lines)


def format_question_display(state: ExaminationState) -> str:
    """Format current question for glasses display."""
    q = state.current_question
    if not q:
        return "-- End of questions --"
    header = f"Q{state.current_index + 1}/{len(state.questions)}"
    remaining = f"({state.remaining} remaining)"
    return format_for_display(f"{header} {remaining}\n\n{q}")


def format_objection(basis: str, rule: str, detail: str = "") -> str:
    """Format an objection alert for display."""
    lines = [f"** OBJECTION **", f"{basis}", f"Rule: {rule}"]
    if detail:
        lines.append(detail)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Legal analysis via Claude API
# ---------------------------------------------------------------------------

LEGAL_SYSTEM_PROMPT = """You are a litigation support AI embedded in AR glasses worn by a trial attorney.
Your responses MUST be extremely concise — max 5 lines, 40 chars per line (200 chars total).
You are providing real-time assistance during live proceedings.

Respond with only the most critical information:
- For case law queries: Case name, cite, and one-line holding
- For statute queries: Section number and key language
- For objection analysis: Basis, rule number, one-line explanation
- For impeachment: Prior statement cite and contradiction summary

Never include disclaimers, caveats, or lengthy explanations."""


async def query_legal_ai(query: str, case_context: CaseKnowledge | None = None) -> str:
    """Query Claude for legal analysis, formatted for glasses display."""
    if not HAS_CLAUDE:
        return format_for_display("Claude API not configured. Set ANTHROPIC_API_KEY.")

    context = ""
    if case_context:
        context = f"\nCase: {case_context.case_name} ({case_context.case_number})"
        if case_context.key_statutes:
            context += f"\nKey statutes: {', '.join(case_context.key_statutes[:5])}"

    response = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        system=LEGAL_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"{context}\n\nQuery: {query}"}],
    )
    return format_for_display(response.content[0].text)


# ---------------------------------------------------------------------------
# Objection detection
# ---------------------------------------------------------------------------

COMMON_OBJECTIONS = {
    "leading": ("Leading", "FRE 611(c)", "Question suggests the answer"),
    "hearsay": ("Hearsay", "FRE 801-802", "Out-of-court statement for truth"),
    "relevance": ("Relevance", "FRE 401-402", "Not relevant to any issue"),
    "speculation": ("Speculation", "FRE 602", "Witness lacks personal knowledge"),
    "compound": ("Compound", "FRE 611(a)", "Multiple questions in one"),
    "asked_and_answered": ("Asked & Answered", "FRE 611(a)", "Already addressed"),
    "assumes_facts": ("Assumes Facts", "FRE 611(a)", "Not in evidence"),
    "argumentative": ("Argumentative", "FRE 611(a)", "Counsel is arguing"),
    "best_evidence": ("Best Evidence", "FRE 1002", "Original required"),
    "character": ("Character", "FRE 404(a)", "Improper character evidence"),
}


async def check_objection(question_text: str) -> str | None:
    """Use Claude to analyze if a question is objectionable."""
    if not HAS_CLAUDE:
        return None

    response = claude.messages.create(
        model="claude-haiku-4-5-20251001",  # Fast model for real-time
        max_tokens=100,
        system="""Analyze this trial question for objectionable form.
If objectionable, respond with ONLY the objection type from this list:
leading, hearsay, relevance, speculation, compound, asked_and_answered, assumes_facts, argumentative, best_evidence, character
If not objectionable, respond with: NONE
One word only.""",
        messages=[{"role": "user", "content": question_text}],
    )
    result = response.content[0].text.strip().lower()
    if result != "none" and result in COMMON_OBJECTIONS:
        basis, rule, detail = COMMON_OBJECTIONS[result]
        return format_objection(basis, rule, detail)
    return None


# ---------------------------------------------------------------------------
# Main application
# ---------------------------------------------------------------------------

class CounselView:
    def __init__(self):
        self.manager: GlassesManager | None = None
        self.mode = Mode.EXAMINATION
        self.exam_state = ExaminationState()
        self.case = CaseKnowledge()

    async def connect(self) -> bool:
        """Connect to Even Realities G1 glasses."""
        print("Scanning for G1 glasses...")
        self.manager = GlassesManager()
        try:
            await self.manager.scan_and_connect(timeout=15)
            print("Connected to glasses!")
            await self.display("CounselView\nConnected\n\nTap to begin")
            return True
        except Exception as e:
            print(f"Connection failed: {e}")
            return False

    async def display(self, text: str):
        """Send text to both lenses."""
        if self.manager:
            await self.manager.send_text_to_all(text)

    async def notify(self, title: str, message: str):
        """Send a notification to glasses."""
        if self.manager:
            notification = Notification(title=title, subtitle="", message=message)
            await self.manager.send_notification(notification)

    def load_questions(self, questions: list[str]):
        """Load examination questions."""
        self.exam_state = ExaminationState(questions=questions)
        print(f"Loaded {len(questions)} questions")

    def load_case(self, case_file: str):
        """Load case knowledge from JSON file."""
        with open(case_file) as f:
            data = json.load(f)
        self.case = CaseKnowledge(**data)
        print(f"Loaded case: {self.case.case_name}")

    async def show_current_question(self):
        """Display current examination question."""
        text = format_question_display(self.exam_state)
        await self.display(text)

    async def next_question(self):
        """Advance to next question and display."""
        self.exam_state.next()
        await self.show_current_question()

    async def prev_question(self):
        """Go back to previous question."""
        self.exam_state.prev()
        await self.show_current_question()

    async def search(self, query: str):
        """Voice-triggered legal search."""
        await self.display("Searching...")
        result = await query_legal_ai(query, self.case)
        await self.display(result)

    async def check_opposing_question(self, question: str):
        """Check opposing counsel's question for objections."""
        objection = await check_objection(question)
        if objection:
            await self.notify("OBJECTION", objection)

    async def show_exhibit(self, exhibit_id: str):
        """Display exhibit info."""
        desc = self.case.exhibits.get(exhibit_id, "Exhibit not found")
        await self.display(f"Exhibit {exhibit_id}\n\n{desc}")

    async def shutdown(self):
        """Graceful disconnect."""
        if self.manager:
            await self.display("CounselView\nDisconnecting...")
            await self.manager.graceful_shutdown()
            print("Disconnected from glasses")


# ---------------------------------------------------------------------------
# Demo / CLI interface
# ---------------------------------------------------------------------------

async def run_demo():
    """Interactive demo of CounselView."""
    cv = CounselView()

    # Try to connect (will fail gracefully if no glasses nearby)
    connected = await cv.connect()
    if not connected:
        print("\nNo glasses found. Running in display-simulation mode.\n")

    # Load sample questions
    cv.load_questions([
        "Can you state your full name for the record?",
        "Where were you on the evening of March 15, 2025?",
        "Did you observe the defendant at any point that evening?",
        "Can you describe what you saw?",
        "Is it true you previously stated under oath that you did NOT see the defendant?",
        "How do you reconcile that prior testimony with what you just told this court?",
    ])

    print("CounselView Prototype — Commands:")
    print("  n     — Next question")
    print("  p     — Previous question")
    print("  s     — Search (type query after)")
    print("  o     — Check question for objections")
    print("  e     — Show exhibit")
    print("  q     — Quit")
    print()

    while True:
        cmd = input("> ").strip().lower()

        if cmd == "n":
            await cv.next_question()
            q = cv.exam_state.current_question
            print(f"  → Q{cv.exam_state.current_index + 1}: {q}")

        elif cmd == "p":
            await cv.prev_question()
            q = cv.exam_state.current_question
            print(f"  → Q{cv.exam_state.current_index + 1}: {q}")

        elif cmd.startswith("s"):
            query = cmd[1:].strip() or input("  Search: ").strip()
            result = await query_legal_ai(query, cv.case)
            print(f"  → {result}")
            if connected:
                await cv.display(result)

        elif cmd.startswith("o"):
            question = cmd[1:].strip() or input("  Question to check: ").strip()
            objection = await check_objection(question)
            if objection:
                print(f"  → {objection}")
                if connected:
                    await cv.notify("OBJECTION", objection)
            else:
                print("  → No objection")

        elif cmd.startswith("e"):
            exhibit_id = cmd[1:].strip() or input("  Exhibit ID: ").strip()
            if connected:
                await cv.show_exhibit(exhibit_id)
            desc = cv.case.exhibits.get(exhibit_id, "Not found")
            print(f"  → Exhibit {exhibit_id}: {desc}")

        elif cmd == "q":
            if connected:
                await cv.shutdown()
            print("Goodbye.")
            break

        else:
            print("  Unknown command. Use n/p/s/o/e/q")


if __name__ == "__main__":
    asyncio.run(run_demo())
