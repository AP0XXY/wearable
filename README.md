# CounselView — AR Litigation Assistant for Even Realities Glasses

Real-time legal aid displayed on Even Realities G1/G2 smart glasses for trial litigation, depositions, and legal practice.

## Architecture

```
┌─────────────────────┐     BLE      ┌──────────────────┐   cloud/local   ┌─────────────┐
│  Even Realities G1  │◄────────────►│  MentraOS Phone  │◄──────────────►│  CounselView │
│  (display + mic)    │              │  App (relay)     │                │  Server      │
└─────────────────────┘              └──────────────────┘                │              │
                                                                        │ • Claude API  │
                                                                        │ • Case KB     │
                                                                        │ • Objection   │
                                                                        │   Engine      │
                                                                        │ • FRE/Statute │
                                                                        │   Database    │
                                                                        └──────────────┘
```

## Modes

- **Examination Mode** — Question queue, impeachment alerts, exhibit tracking
- **Objection Copilot** — Real-time objection flagging (hearsay, leading, compound, etc.)
- **Research Mode** — Voice-triggered case law / statute lookup
- **Voir Dire Mode** — Pre-loaded juror profiles, follow-up suggestions
- **Deposition Mode** — Contradiction detection, time management, follow-ups

## Project Structure

```
counselview/
├── prototype/          # Python quick prototype (BLE direct)
├── app/                # MentraOS production app (TypeScript)
│   ├── src/
│   └── config/
└── shared/
    ├── legal-engine/   # Objection detection, case analysis
    └── case-loader/    # Ingest depositions, exhibits, statutes
```

## Quick Start

### Prototype (Python — needs glasses in BLE range)
```bash
cd prototype
pip install -r requirements.txt
python counselview.py
```

### Production (MentraOS)
```bash
cd app
bun install
cp .env.example .env  # Add your API keys
bun run dev
```

## Ethical Guardrails

- No camera, no facial recognition — ever
- No live juror profiling (pre-loaded research only)
- No courtroom recording without explicit consent
- AI outputs flagged as AI-generated (ABA Opinion 512)
- Disclosure mode for judicial notice
