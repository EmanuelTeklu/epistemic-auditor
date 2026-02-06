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

function isRateLimited(err) {
  return err?.status === 429
    || err?.httpStatusCode === 429
    || err?.message?.includes('429')
    || err?.message?.includes('RESOURCE_EXHAUSTED');
}

// --- Prompts ---

const RESEARCH_PROMPT = `You are an epistemic auditor. Given a claim, you must:

1. Decompose the claim into 2-4 distinct, testable sub-claims.
2. For each sub-claim, search for credible evidence FOR and AGAINST it.
3. Cite specific sources with URLs where available.
4. Evaluate the strength of evidence on each side.
5. Provide an overall assessment of the claim's epistemic strength.
6. Identify 4-6 key concepts related to this claim.

Be thorough, balanced, and cite specific data points and sources.`;

const EXTRACTION_PROMPT = `Extract the epistemic analysis into this exact JSON structure. Return ONLY valid JSON:

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

const GO_DEEPER_PROMPTS = {
  steelman: `You are an epistemic analyst. Given a claim, construct the strongest possible version of it (the "steel man"). Find the best evidence, most favorable interpretations, and most credible supporters. Present the strongest case FOR the claim. Be thorough, cite sources, and keep your response to 3-4 paragraphs.`,
  crux: `You are an epistemic analyst. Given a claim, identify the single most important disagreement or uncertainty underlying it. What is the crux — the one thing that, if resolved, would most change our assessment? Be specific, explain why this is the crux, and cite evidence from both sides. Keep your response to 3-4 paragraphs.`,
  historical: `You are an epistemic analyst. Given a claim or prediction, identify 2-3 historical claims or predictions that were structurally similar. For each, explain: what was predicted, what actually happened, and what lessons apply. Cite specific historical examples with dates and outcomes. Keep your response to 3-4 paragraphs.`,
};

// --- Public API ---

async function withRetry(fn, onRetryStatus) {
  try {
    return await fn();
  } catch (err) {
    if (isRateLimited(err)) {
      if (onRetryStatus) onRetryStatus('Rate limited — retrying in 3s...');
      await new Promise(r => setTimeout(r, 3000));
      return await fn();
    }
    throw err;
  }
}

export async function runAudit(input, { onThought, onStatus }) {
  const client = getClient();

  try {
    // Step 1: Stream with grounding + thoughts
    const { groundedText, groundingSources } = await withRetry(async () => {
      onStatus('Researching with Google Search...');
      let text = '';
      const sources = [];

      const stream = await client.models.generateContentStream({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: `Analyze this claim: "${input}"` }] }],
        config: {
          systemInstruction: RESEARCH_PROMPT,
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
              text += part.text;
            }
          }
        }
        const gm = candidate?.groundingMetadata;
        if (gm?.groundingChunks) {
          for (const gc of gm.groundingChunks) {
            if (gc.web?.uri) {
              sources.push({ url: gc.web.uri, title: gc.web.title || '' });
            }
          }
        }
      }

      if (!text.trim()) throw new Error('No research data received.');
      return { groundedText: text, groundingSources: sources };
    }, (msg) => onStatus(msg));

    // Step 2: Extract structured JSON
    const result = await withRetry(async () => {
      onStatus('Extracting structured analysis...');
      const response = await client.models.generateContent({
        model: MODEL,
        contents: [
          { role: 'user', parts: [{ text: `Extract the following analysis into structured JSON:\n\n${groundedText}` }] },
        ],
        config: {
          systemInstruction: EXTRACTION_PROMPT,
          responseMimeType: 'application/json',
        },
      });
      return JSON.parse(response.text);
    }, (msg) => onStatus(msg));

    result.sources = buildSources(groundingSources, result.source_urls);
    result.source_urls = result.sources.map(s => s.url);
    onStatus('Complete.');
    return result;
  } catch {
    throw new Error('Analysis temporarily unavailable. Please try again in a moment.');
  }
}

export async function runGoDeeper(type, claim) {
  const client = getClient();

  try {
    return await withRetry(async () => {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: `Regarding this claim: "${claim}"` }] }],
        config: {
          systemInstruction: GO_DEEPER_PROMPTS[type],
          tools: [{ googleSearch: {} }],
        },
      });
      return response.text;
    });
  } catch {
    throw new Error('Analysis temporarily unavailable. Please try again in a moment.');
  }
}
