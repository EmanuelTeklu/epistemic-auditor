import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-2.5-flash';

let ai = null;

function getClient() {
  if (!ai) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Missing VITE_GEMINI_API_KEY. Create a .env file with your Gemini API key.'
      );
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

// Extract real URL from vertexaisearch redirect URLs
function extractRealUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'vertexaisearch.cloud.google.com' && u.pathname.startsWith('/grounding-api-redirect/')) {
      const encoded = u.pathname.slice('/grounding-api-redirect/'.length);
      const decoded = decodeURIComponent(encoded);
      if (decoded.startsWith('http')) return decoded;
    }
  } catch { /* invalid URL */ }
  return url;
}

function buildSources(groundingSources, resultUrls = []) {
  const seen = new Set();
  const sources = [];
  let idx = 0;
  for (const s of groundingSources) {
    const realUrl = extractRealUrl(s.url);
    if (!seen.has(realUrl)) {
      seen.add(realUrl);
      idx++;
      let title = '';
      try { title = new URL(realUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      sources.push({ url: realUrl, title: title || `Source ${idx}` });
    }
  }
  for (const url of resultUrls) {
    const realUrl = extractRealUrl(url || '');
    if (realUrl && !seen.has(realUrl)) {
      seen.add(realUrl);
      idx++;
      let title = '';
      try { title = new URL(realUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      sources.push({ url: realUrl, title: title || `Source ${idx}` });
    }
  }
  return sources;
}

// --- System Prompts ---

const CLAIM_RESEARCH_PROMPT = `You are an epistemic auditor. Given a claim, you must:

1. Decompose the claim into 2-4 distinct, testable sub-claims.
2. For each sub-claim, search for credible evidence FOR and AGAINST it.
3. Cite specific sources with URLs where available.
4. Evaluate the strength of evidence on each side.
5. Provide an overall assessment of the claim's epistemic strength.
6. Identify 4-6 key concepts related to this claim.

Be thorough, balanced, and cite specific data points and sources.`;

const FORECAST_RESEARCH_PROMPT = `You are an epistemic forecasting analyst. Given a probability forecast, you must:

1. Identify the stated probability and timeframe.
2. Find relevant base rates for similar events or outcomes.
3. Identify 2-3 reference classes (categories of similar predictions).
4. Assess calibration — is the stated probability reasonable given evidence?
5. Provide an adjusted probability estimate with reasoning.
6. Search for credible evidence and data points.
7. Identify 4-6 key concepts related to this forecast.

Be thorough, balanced, and cite specific data points and sources.`;

const DEFINITION_RESEARCH_PROMPT = `You are an epistemic encyclopedia. Given a concept, you must:

1. Provide a clear, precise definition (2-3 sentences).
2. Identify 2-3 key ongoing debates or tensions around this concept.
3. Identify 2-3 common misconceptions people hold about this concept.
4. Suggest 4-6 related concepts that help understand this one.
5. Cite specific sources where relevant.

Be thorough, precise, and academic in tone.`;

// --- Extraction Prompts ---

const CLAIM_EXTRACTION_PROMPT = `Extract the epistemic analysis into this exact JSON structure. Return ONLY valid JSON:

{
  "claim": "the original claim text",
  "sub_claims": [
    {
      "title": "concise sub-claim statement",
      "evidence_for": ["specific evidence point with source"],
      "evidence_against": ["specific evidence point with source"],
      "confidence": "High | Moderate | Low"
    }
  ],
  "overall_score": "Strong | Moderate | Weak | Unsupported",
  "summary": "2-3 sentence summary of the epistemic analysis",
  "related_concepts": ["concept 1", "concept 2", "concept 3", "concept 4"],
  "source_urls": ["https://example.com"]
}

Rules:
- confidence per sub-claim must be exactly "High", "Moderate", or "Low"
- overall_score must be exactly "Strong", "Moderate", "Weak", or "Unsupported"
- Include ALL source URLs from the analysis
- evidence arrays should have concrete, specific items
- related_concepts should be 4-6 key concepts mentioned or relevant to the analysis
- Extract faithfully from the provided text`;

const FORECAST_EXTRACTION_PROMPT = `Extract the forecast analysis into this exact JSON structure. Return ONLY valid JSON:

{
  "forecast": "the original forecast text",
  "stated_probability": "the probability stated in the forecast",
  "adjusted_probability": "your adjusted probability based on evidence",
  "base_rate_analysis": "2-3 sentence analysis of relevant base rates",
  "reference_classes": [
    { "name": "reference class name", "base_rate": "historical rate", "relevance": "why relevant" }
  ],
  "calibration_assessment": "2-3 sentence assessment of forecast calibration",
  "overall_score": "Strong | Moderate | Weak | Unsupported",
  "summary": "2-3 sentence summary",
  "related_concepts": ["concept 1", "concept 2", "concept 3", "concept 4"],
  "source_urls": ["https://example.com"]
}

Rules:
- overall_score reflects how well-calibrated and evidence-supported the forecast is
- related_concepts should be 4-6 key concepts relevant to the forecast
- Extract faithfully from the provided text`;

const DEFINITION_EXTRACTION_PROMPT = `Extract the concept analysis into this exact JSON structure. Return ONLY valid JSON:

{
  "concept": "the concept name",
  "definition": "clear 2-3 sentence definition",
  "key_debates": [
    { "title": "debate title", "description": "1-2 sentence description" }
  ],
  "common_misconceptions": [
    { "misconception": "what people wrongly think", "reality": "what is actually true" }
  ],
  "related_concepts": ["concept 1", "concept 2", "concept 3", "concept 4", "concept 5"],
  "source_urls": ["https://example.com"]
}

Rules:
- definition should be precise and academic
- key_debates should have 2-3 items
- common_misconceptions should have 2-3 items
- related_concepts should have 4-6 items
- Extract faithfully from the provided text`;

// --- Go Deeper Prompts ---

const GO_DEEPER_PROMPTS = {
  steelman: `You are an epistemic analyst. Given a claim, construct the strongest possible version of it (the "steel man"). Find the best evidence, most favorable interpretations, and most credible supporters. Present the strongest case FOR the claim. Be thorough, cite sources, and keep your response to 3-4 paragraphs.`,
  crux: `You are an epistemic analyst. Given a claim, identify the single most important disagreement or uncertainty underlying it. What is the crux — the one thing that, if resolved, would most change our assessment? Be specific, explain why this is the crux, and cite evidence from both sides. Keep your response to 3-4 paragraphs.`,
  historical: `You are an epistemic analyst. Given a claim or prediction, identify 2-3 historical claims or predictions that were structurally similar. For each, explain: what was predicted, what actually happened, and what lessons apply. Cite specific historical examples with dates and outcomes. Keep your response to 3-4 paragraphs.`,
};

// --- Core Helpers ---

async function streamWithGrounding(systemPrompt, userMessage, { onThought, onStatus }) {
  const client = getClient();
  onStatus('Researching with Google Search...');

  let groundedText = '';
  const groundingSources = [];

  const stream = await client.models.generateContentStream({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: systemPrompt,
      tools: [{ googleSearch: {} }],
      thinkingConfig: { includeThoughts: true },
    },
  });

  for await (const chunk of stream) {
    const candidate = chunk.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.thought && part.text) {
          onThought(part.text);
        } else if (part.text) {
          groundedText += part.text;
        }
      }
    }
    const gm = candidate?.groundingMetadata;
    if (gm?.groundingChunks) {
      for (const gc of gm.groundingChunks) {
        if (gc.web?.uri) {
          groundingSources.push({ url: gc.web.uri, title: gc.web.title || '' });
        }
      }
    }
  }

  return { groundedText, groundingSources };
}

async function extractJSON(groundedText, extractionPrompt) {
  const client = getClient();
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      { role: 'user', parts: [{ text: `Extract the following analysis into structured JSON:\n\n${groundedText}` }] },
    ],
    config: {
      systemInstruction: extractionPrompt,
      responseMimeType: 'application/json',
    },
  });
  const text = response.text;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Failed to parse structured response. Raw: ' + text?.slice(0, 200));
  }
}

// --- Public API ---

export async function runAudit(input, mode, { onThought, onStatus }) {
  const isForecast = mode === 'forecast';
  const systemPrompt = isForecast ? FORECAST_RESEARCH_PROMPT : CLAIM_RESEARCH_PROMPT;
  const extractionPrompt = isForecast ? FORECAST_EXTRACTION_PROMPT : CLAIM_EXTRACTION_PROMPT;
  const userMessage = isForecast
    ? `Analyze this probability forecast: "${input}"`
    : `Analyze this claim: "${input}"`;

  const { groundedText, groundingSources } = await streamWithGrounding(
    systemPrompt, userMessage, { onThought, onStatus }
  );

  if (!groundedText.trim()) throw new Error('No response received from research step.');

  onStatus('Extracting structured analysis...');
  const result = await extractJSON(groundedText, extractionPrompt);
  result.sources = buildSources(groundingSources, result.source_urls);
  result.source_urls = result.sources.map(s => s.url);

  onStatus('Complete.');
  return result;
}

export async function runDefinition(concept, { onThought, onStatus }) {
  const { groundedText, groundingSources } = await streamWithGrounding(
    DEFINITION_RESEARCH_PROMPT,
    `Define and analyze this concept: "${concept}"`,
    { onThought, onStatus }
  );

  if (!groundedText.trim()) throw new Error('No response received.');

  onStatus('Extracting definition...');
  const result = await extractJSON(groundedText, DEFINITION_EXTRACTION_PROMPT);
  result.sources = buildSources(groundingSources, result.source_urls);
  result.source_urls = result.sources.map(s => s.url);

  onStatus('Complete.');
  return result;
}

export async function runGoDeeper(type, claim) {
  const client = getClient();
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: `Regarding this claim: "${claim}"` }] }],
    config: {
      systemInstruction: GO_DEEPER_PROMPTS[type],
      tools: [{ googleSearch: {} }],
    },
  });
  return response.text;
}
