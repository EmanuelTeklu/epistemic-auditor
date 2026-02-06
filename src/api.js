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
      if (decoded.startsWith('http')) {
        return decoded;
      }
    }
  } catch { /* invalid URL */ }
  return url;
}

const RESEARCH_SYSTEM_PROMPT = `You are an epistemic auditor. Given a claim, you must:

1. Decompose the claim into 2-4 distinct, testable sub-claims.
2. For each sub-claim, search for credible evidence FOR and AGAINST it.
3. Cite specific sources with URLs where available.
4. Evaluate the strength of evidence on each side.
5. Provide an overall assessment of the claim's epistemic strength.

Be thorough, balanced, and cite specific data points and sources.`;

const EXTRACTION_SYSTEM_PROMPT = `Extract the epistemic analysis into this exact JSON structure. Return ONLY valid JSON:

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
  "source_urls": ["https://example.com"]
}

Rules:
- confidence per sub-claim must be exactly "High", "Moderate", or "Low"
- overall_score must be exactly "Strong", "Moderate", "Weak", or "Unsupported"
- Include ALL source URLs from the analysis
- evidence arrays should have concrete, specific items
- Extract faithfully from the provided text`;

export async function runAudit(claim, { onThought, onStatus }) {
  const client = getClient();

  // --- Call 1: Research with Google Search grounding + streaming thoughts ---
  onStatus('Starting research with Google Search grounding...');

  let groundedText = '';
  let groundingSources = [];

  const stream = await client.models.generateContentStream({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: `Analyze this claim: "${claim}"` }],
      },
    ],
    config: {
      systemInstruction: RESEARCH_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      thinkingConfig: {
        includeThoughts: true,
      },
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
    // Collect grounding sources (url + title/domain) from metadata
    const gm = candidate?.groundingMetadata;
    if (gm?.groundingChunks) {
      for (const gc of gm.groundingChunks) {
        if (gc.web?.uri) {
          groundingSources.push({ url: gc.web.uri, title: gc.web.title || '' });
        }
      }
    }
  }

  if (!groundedText.trim()) {
    throw new Error('No response received from research step.');
  }

  onStatus('Extracting structured analysis...');

  // --- Call 2: Extract structured JSON ---
  const extractionResponse = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Extract the following epistemic analysis into structured JSON:\n\n${groundedText}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
    },
  });

  const jsonText = extractionResponse.text;
  let result;
  try {
    result = JSON.parse(jsonText);
  } catch {
    throw new Error('Failed to parse structured response. Raw: ' + jsonText?.slice(0, 200));
  }

  // Build deduplicated sources, resolving redirect URLs to real domains
  const seen = new Set();
  const sources = [];
  let sourceIndex = 0;
  for (const s of groundingSources) {
    const realUrl = extractRealUrl(s.url);
    if (!seen.has(realUrl)) {
      seen.add(realUrl);
      sourceIndex++;
      let title = '';
      try { title = new URL(realUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      sources.push({ url: realUrl, title: title || `Source ${sourceIndex}` });
    }
  }
  for (const url of (result.source_urls || [])) {
    const realUrl = extractRealUrl(url || '');
    if (realUrl && !seen.has(realUrl)) {
      seen.add(realUrl);
      sourceIndex++;
      let title = '';
      try { title = new URL(realUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      sources.push({ url: realUrl, title: title || `Source ${sourceIndex}` });
    }
  }
  result.sources = sources;
  result.source_urls = sources.map(s => s.url);

  onStatus('Audit complete.');
  return result;
}
