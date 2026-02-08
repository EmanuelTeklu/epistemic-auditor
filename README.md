# Epistemic Auditor — Frontier Calibration for Claims

> Decomposes complex claims into testable sub-claims, maps evidence, and resolves source conflicts.

## Problem

Viral misinformation relies on multi-layered half-truths. Simple true/false fact-checkers miss nuance. A claim like "AI labs will achieve AGI before 2030" bundles together scaling assumptions, definitional ambiguity, funding sustainability, and alignment risk — each with its own evidence landscape. Superforecasters need calibration tools, not verdict machines.

## Solution

Paste any claim → AI decomposes into sub-claims → searches evidence → flags where sources conflict → shows reasoning chain.

The Epistemic Auditor breaks complex claims into 3-5 independently testable sub-claims, maps evidence for and against each one, and highlights where the evidence *contradicts itself* across sub-claims. A Socratic Process sidebar shows the chain of reasoning as it happens, making the analysis transparent and auditable.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Claim Input                         │
└───────────────────────┬──────────────────────────────┘
                        │
              ┌─────────▼─────────┐
              │  Deconstructor    │  ThinkingLevel: HIGH
              │  Agent            │  Decomposes into sub-claims
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │  Researcher       │  Google Search grounding
              │  Agent            │  Maps evidence landscape
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │  Judge Agent      │  ThinkingLevel: LOW
              │                   │  Resolves source conflicts
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │  Results + Source  │
              │  Conflict Resolver│
              └───────────────────┘
```

**Gemini orchestration pipeline:**
- **Deconstructor Agent** — Uses ThinkingLevel.HIGH to perform Socratic deconstruction of the claim into independently testable sub-claims
- **Researcher Agent** — Function Calling for Google Search grounding to map the evidence landscape for each sub-claim
- **Judge Agent** — Uses ThinkingLevel.LOW for fast synthesis, identifies where evidence contradicts across sub-claims
- **1M context window** — Full article ingestion for deep evidence analysis

## Tech Stack

- Single HTML file (340 lines)
- Tailwind CSS via CDN
- Gemini API (client-side, no backend)
- Zero build step, zero dependencies
- Dark mode, fully responsive

## Setup

```bash
# Clone
git clone https://github.com/EmanuelTeklu/epistemic-auditor.git
cd epistemic-auditor

# Option 1: Open the static app directly
open docs/index.html

# Option 2: Run the full React development app
npm install
npm run dev
```

**Quick start:** Open `docs/index.html` in your browser. Click any example claim to see a full analysis with mock data — no API key required.

**Live mode:** Click the API Key button, enter your Gemini API key, and submit any claim for real-time AI analysis.

## Target Users

- **Superforecasters** — Calibrate predictions by seeing evidence both for and against each component of a claim
- **Researchers** — Map the evidence landscape for complex scientific or policy claims
- **Journalists** — Identify where sources conflict before publishing
- **Policy analysts** — Decompose multi-layered policy claims into independently verifiable components

## Screenshots

<!-- Screenshot placeholder — replace with actual screenshot -->
![Epistemic Auditor Screenshot](docs/screenshot.png)

*The Epistemic Auditor analyzing "AI labs will achieve AGI before 2030" — showing sub-claim decomposition, evidence mapping, and source conflict detection.*

## Live Demo

See [DEPLOY-STATUS.md](DEPLOY-STATUS.md) for the live GitHub Pages URL.

## License

MIT
