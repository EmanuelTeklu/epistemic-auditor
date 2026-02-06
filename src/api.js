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

// Robust JSON extraction from model response
function parseJSONResponse(text) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* continue */ }

  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch { /* continue */ }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* continue */ }
  }

  throw new Error('Analysis temporarily unavailable. Please try again in a moment.');
}

function isRateLimited(err) {
  return err?.status === 429
    || err?.httpStatusCode === 429
    || err?.message?.includes('429')
    || err?.message?.includes('RESOURCE_EXHAUSTED');
}

// --- Prompts ---

const AUDIT_PROMPT = `You are an epistemic auditor. Given a claim, research it thoroughly using search, then return a structured JSON analysis.

Your task:
1. Decompose the claim into 2-4 distinct, testable sub-claims
2. For each sub-claim, find specific credible evidence FOR and AGAINST it
3. Evaluate the confidence level for each sub-claim
4. Provide an overall epistemic strength assessment
5. Write a 2-3 sentence summary
6. Identify 4-6 related concepts from epistemology, economics, or cognitive science

You MUST return ONLY a valid JSON object (no markdown, no code blocks, no extra text):

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
- Include ALL source URLs you reference
- evidence arrays should have concrete, specific items with citations
- related_concepts should be 4-6 key concepts
- Return ONLY the JSON object, nothing else`;

const GO_DEEPER_PROMPTS = {
  steelman: `You are an epistemic analyst. Given a claim, construct the strongest possible version of it (the "steel man"). Find the best evidence, most favorable interpretations, and most credible supporters. Present the strongest case FOR the claim. Be thorough, cite sources, and keep your response to 3-4 paragraphs.`,
  crux: `You are an epistemic analyst. Given a claim, identify the single most important disagreement or uncertainty underlying it. What is the crux — the one thing that, if resolved, would most change our assessment? Be specific, explain why this is the crux, and cite evidence from both sides. Keep your response to 3-4 paragraphs.`,
  historical: `You are an epistemic analyst. Given a claim or prediction, identify 2-3 historical claims or predictions that were structurally similar. For each, explain: what was predicted, what actually happened, and what lessons apply. Cite specific historical examples with dates and outcomes. Keep your response to 3-4 paragraphs.`,
};

// --- Public API ---

export async function runAudit(input, { onThought, onStatus }) {
  const client = getClient();

  const doCall = async () => {
    onStatus('Researching with Google Search...');

    let responseText = '';
    const groundingSources = [];

    const stream = await client.models.generateContentStream({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: `Analyze this claim: "${input}"` }] }],
      config: {
        systemInstruction: AUDIT_PROMPT,
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
            responseText += part.text;
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

    if (!responseText.trim()) {
      throw new Error('Analysis temporarily unavailable. Please try again in a moment.');
    }

    onStatus('Processing results...');
    const result = parseJSONResponse(responseText);
    result.sources = buildSources(groundingSources, result.source_urls);
    result.source_urls = result.sources.map(s => s.url);

    onStatus('Complete.');
    return result;
  };

  try {
    return await doCall();
  } catch (err) {
    if (isRateLimited(err)) {
      onStatus('Rate limited — retrying in 3s...');
      await new Promise(r => setTimeout(r, 3000));
      return await doCall();
    }
    throw new Error('Analysis temporarily unavailable. Please try again in a moment.');
  }
}

export async function runGoDeeper(type, claim) {
  const client = getClient();

  const doCall = async () => {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: `Regarding this claim: "${claim}"` }] }],
      config: {
        systemInstruction: GO_DEEPER_PROMPTS[type],
        tools: [{ googleSearch: {} }],
      },
    });
    return response.text;
  };

  try {
    return await doCall();
  } catch (err) {
    if (isRateLimited(err)) {
      await new Promise(r => setTimeout(r, 3000));
      return await doCall();
    }
    throw new Error('Analysis temporarily unavailable. Please try again in a moment.');
  }
}
