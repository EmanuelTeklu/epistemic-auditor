# Epistemic Auditor — Hackathon Submission

## Tagline

Frontier calibration for complex claims — because truth isn't binary.

## What it does

Epistemic Auditor decomposes complex claims into 3-5 independently testable sub-claims, maps evidence for and against each, and flags where sources contradict each other. It cuts time-to-competence in frontier domains from weeks of reading to minutes of structured debate and bottleneck mapping.

## How we built it

We orchestrate Gemini 3 through a three-agent pipeline: a **Deconstructor** agent uses Dynamic Thinking with **ThinkingLevel.HIGH** for deep Socratic deconstruction of claims into sub-claims. A **Researcher** agent leverages **Function Calling for Google Search grounding** to map the evidence landscape, ingesting full articles through Gemini's **1M context window**. A **Judge** agent uses **ThinkingLevel.LOW** for fast synthesis, running our core innovation: the **Source Conflict Resolver**, which identifies where evidence contradicts *across* sub-claims — the exact failure mode that makes multi-layered misinformation effective.

The architecture mirrors the Prosecutor-Advocate-Judge pattern from superforecasting methodology: one agent attacks the claim, one defends it, one arbitrates the conflicts. This adversarial structure prevents the single-model confirmation bias that plagues simple fact-checkers.

## Why it matters

Simple true/false verdicts miss nuance. A claim like "AI labs will achieve AGI before 2030" bundles scaling assumptions, definitional ambiguity, funding risk, and alignment challenges — each independently testable. Superforecasters, researchers, journalists, and policy analysts need calibration tools, not verdict machines. Epistemic Auditor gives them structured decomposition with transparent reasoning.

## Technical highlights

- **Dynamic Thinking Levels**: HIGH for decomposition, LOW for synthesis
- **Function Calling**: Google Search grounding for real-time evidence
- **1M context window**: Full article ingestion, not just snippets
- **Source Conflict Resolver**: Core innovation — cross-sub-claim contradiction detection
- **Zero infrastructure**: Single HTML file, Tailwind CDN, client-side Gemini API, no build step
