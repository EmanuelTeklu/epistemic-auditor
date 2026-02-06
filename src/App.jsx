import { useState, useRef, useEffect, useCallback } from 'react';
import { runAudit, runDefinition, runGoDeeper } from './api';

// --- Utilities ---

const SCORE_COLORS = {
  Strong: { text: 'text-emerald-400', glow: 'rgba(52, 211, 153, 0.1)', bg: 'bg-emerald-500/10' },
  Moderate: { text: 'text-amber-400', glow: 'rgba(245, 158, 11, 0.1)', bg: 'bg-amber-500/10' },
  Weak: { text: 'text-orange-400', glow: 'rgba(249, 115, 22, 0.1)', bg: 'bg-orange-500/10' },
  Unsupported: { text: 'text-red-400', glow: 'rgba(239, 68, 68, 0.1)', bg: 'bg-red-500/10' },
};

const SCORE_VERDICTS = {
  Strong: 'Evidence broadly supports this claim.',
  Moderate: 'Mixed evidence \u2014 proceed with caution.',
  Weak: 'This claim requires significant scrutiny.',
  Unsupported: 'Little to no evidence supports this claim.',
};

const CONFIDENCE_COLORS = {
  High: 'text-emerald-400',
  Moderate: 'text-amber-400',
  Low: 'text-red-400',
};

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function extractSentence(text) {
  const cleaned = text.replace(/\n/g, ' ').trim();
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  const sentence = match ? match[0].trim() : cleaned;
  return sentence.length > 100 ? sentence.slice(0, 97) + '...' : sentence;
}

const EXAMPLE_CLAIMS = [
  'GLP-1 drugs will reduce US obesity by 50% in 10 years',
  'China will invade Taiwan before 2030',
  'Global AI regulation will be established by 2027',
];

const EXAMPLE_CONCEPTS = [
  'Moral hazard',
  'Base rate neglect',
  'Epistemic humility',
];

const PLACEHOLDER_BY_MODE = {
  claim: 'Paste a claim to audit, e.g. \u201cGlobal temperatures will rise 2\u00B0C by 2030\u201d',
  forecast: 'Enter a probability forecast, e.g. \u201c70% chance China invades Taiwan by 2030\u201d',
  definition: 'Enter a concept to explore, e.g. \u201cmoral hazard\u201d or \u201cherd immunity\u201d',
};

const BUTTON_LABEL = { claim: 'Run Audit', forecast: 'Analyze Forecast', definition: 'Explore Concept' };
const LOADING_LABEL = { claim: 'Running Audit...', forecast: 'Analyzing...', definition: 'Exploring...' };

const THOUGHT_SCHEDULE = [2000, 5000, 9000, 14000];
const THOUGHT_TIMESTAMPS = ['0:02', '0:05', '0:09', '0:14'];

// --- Small Components ---

function SocratesIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-zinc-400">
      <path
        d="M10 5Q14 1 18 5L18 9 21 12Q20 13.5 18 14Q17 17 15 19Q12 20 11 17L10 14Q9 10 10 5Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M7 25Q10 22 14 22Q18 22 21 25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function TypewriterText({ text, speed = 30 }) {
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    setCharCount(0);
    if (!text) return;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setCharCount(i);
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return text.slice(0, charCount);
}

function ScoreBadge({ score }) {
  const colors = SCORE_COLORS[score] || SCORE_COLORS.Unsupported;
  return (
    <span className={`inline-flex items-center px-6 py-2.5 rounded-full text-lg font-bold ${colors.bg} ${colors.text}`}>
      {score}
    </span>
  );
}

// --- Input Mode Pills ---

const INPUT_MODES = [
  { key: 'claim', label: 'Claim' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'definition', label: 'Definition' },
];

function InputModePills({ mode, setMode }) {
  return (
    <div className="flex gap-2">
      {INPUT_MODES.map(m => (
        <button
          key={m.key}
          onClick={() => setMode(m.key)}
          className={`tactile min-h-10 px-4 py-2 text-xs font-medium rounded-full cursor-pointer ${
            mode === m.key
              ? 'bg-indigo-600/20 text-indigo-300'
              : 'bg-zinc-900/40 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// --- Claim Input ---

function ClaimInput({ claim, setClaim, onSubmit, loading, mode, setMode }) {
  return (
    <div className="space-y-4">
      <InputModePills mode={mode} setMode={setMode} />
      <textarea
        value={claim}
        onChange={(e) => setClaim(e.target.value)}
        placeholder={PLACEHOLDER_BY_MODE[mode]}
        className="textarea-premium w-full h-32 bg-zinc-900/50 rounded-2xl p-6 text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none"
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
      />
      <div className="flex items-center gap-4">
        <button
          onClick={onSubmit}
          disabled={loading || !claim.trim()}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Spinner />
              {LOADING_LABEL[mode]}
            </span>
          ) : (
            BUTTON_LABEL[mode]
          )}
        </button>
        <span className="text-xs text-zinc-600 hidden sm:inline">
          Ctrl+Enter to submit
        </span>
      </div>
    </div>
  );
}

// --- Empty State ---

function EmptyState({ onSelect }) {
  return (
    <div className="text-center py-16">
      <p className="text-zinc-500 text-sm italic mb-8 tracking-wide">
        No claim is too sacred to question.
      </p>
      <div className="space-y-3 max-w-lg mx-auto mb-12">
        {EXAMPLE_CLAIMS.map((claim, i) => (
          <button
            key={i}
            onClick={() => onSelect(claim, 'claim')}
            className="tactile block w-full text-left px-6 py-5 bg-zinc-900/40 rounded-2xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 cursor-pointer text-sm leading-loose min-h-12"
          >
            &ldquo;{claim}&rdquo;
          </button>
        ))}
      </div>
      <p className="text-zinc-600 text-xs mb-4">
        Or explore a concept
      </p>
      <div className="flex justify-center gap-3">
        {EXAMPLE_CONCEPTS.map((concept, i) => (
          <button
            key={i}
            onClick={() => onSelect(concept, 'definition')}
            className="tactile px-4 py-2.5 text-xs font-medium text-zinc-500 bg-zinc-900/30 rounded-full hover:text-zinc-200 hover:bg-zinc-800/50 cursor-pointer min-h-10"
          >
            {concept}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Socratic Process (Sidebar) ---

function ThoughtEntry({ thought, index }) {
  const label = `[${String(index + 1).padStart(2, '0')} \u00B7 ${thought.timestamp}s]`;

  return (
    <div className="thought-slide-in">
      <div className="flex items-start gap-2.5 py-3 px-1">
        <span className="text-emerald-600/60 font-mono text-[10px] shrink-0 pt-px select-none">
          {label}
        </span>
        <p className="text-emerald-300/50 text-[11px] font-mono leading-relaxed break-words flex-1 min-w-0">
          <TypewriterText text={thought.text} />
        </p>
      </div>
    </div>
  );
}

function SocraticProcess({ thoughts, status, active, complete }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, status]);

  return (
    <div className={`flex flex-col h-full bg-zinc-950/90 backdrop-blur-sm transition-opacity duration-700 ${complete && !active ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2.5 px-5 py-4 shrink-0">
        {active ? (
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-orb-pulse shrink-0" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-zinc-700 shrink-0" />
        )}
        <h2 className="text-[11px] font-medium font-mono text-emerald-500/60">
          Socratic Process
        </h2>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 min-h-0">
        {thoughts.length === 0 && !active && !complete && (
          <div className="flex items-center gap-1.5 py-4 px-1">
            <span className="text-emerald-700/50 text-xs font-mono">
              Awaiting a claim to examine...
            </span>
            <span className="text-emerald-500/50 font-mono animate-cursor-blink">_</span>
          </div>
        )}
        {thoughts.map((t, i) => (
          <ThoughtEntry key={i} thought={t} index={i} />
        ))}
        {status && active && (
          <div className="thought-slide-in flex items-center gap-2 py-2.5 px-1">
            <Spinner />
            <span className="text-emerald-400/70 text-[11px] font-mono">{status}</span>
          </div>
        )}
        {complete && !active && thoughts.length > 0 && (
          <div className="thought-slide-in py-4 px-1">
            <span className="text-emerald-600/50 text-[11px] font-mono">Analysis complete</span>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-claim Cards ---

function SubClaimCard({ subClaim, index }) {
  const [expanded, setExpanded] = useState(false);
  const confidenceColor = CONFIDENCE_COLORS[subClaim.confidence] || 'text-zinc-400';

  return (
    <div className="card-elevated bg-zinc-900/40 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-zinc-800/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-zinc-600 text-sm font-mono shrink-0">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="text-zinc-200 font-normal truncate">{subClaim.title}</span>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          <span className={`text-xs font-medium ${confidenceColor}`}>{subClaim.confidence}</span>
          <svg
            className={`w-4 h-4 text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="px-6 pb-6 space-y-5 bg-zinc-900/20">
          <div className="pt-4">
            <h4 className="text-sm font-normal text-emerald-400/80 mb-3">Evidence for</h4>
            {subClaim.evidence_for?.length > 0 ? (
              <ul className="space-y-2">
                {subClaim.evidence_for.map((e, i) => (
                  <li key={i} className="text-sm text-zinc-300 leading-loose flex items-start gap-2">
                    <span className="text-emerald-500 shrink-0 mt-1">+</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-600 italic">No supporting evidence found</p>
            )}
          </div>
          <div>
            <h4 className="text-sm font-normal text-red-400/80 mb-3">Evidence against</h4>
            {subClaim.evidence_against?.length > 0 ? (
              <ul className="space-y-2">
                {subClaim.evidence_against.map((e, i) => (
                  <li key={i} className="text-sm text-zinc-300 leading-loose flex items-start gap-2">
                    <span className="text-red-500 shrink-0 mt-1">&minus;</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-600 italic">No opposing evidence found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sources ---

function SourcesList({ sources }) {
  const [showAll, setShowAll] = useState(false);

  const groupMap = new Map();
  for (const source of sources) {
    const key = source.title || getDomain(source.url);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(source);
  }
  const groups = [...groupMap.entries()].sort((a, b) => b[1].length - a[1].length);

  const TOP = 8;
  const visible = showAll ? groups : groups.slice(0, TOP);
  const hasMore = groups.length > TOP;

  return (
    <div>
      <h3 className="text-sm font-normal text-zinc-500 mb-4">
        Sources ({sources.length})
      </h3>
      <div className="card-elevated bg-zinc-900/30 rounded-2xl p-7">
        <ul className="space-y-2.5">
          {visible.map(([label, groupSources]) => (
            <li key={label} className="text-sm flex items-center gap-2">
              <span className="text-zinc-700 text-xs">&bull;</span>
              <a
                href={groupSources[0].url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 transition-colors truncate"
              >
                {label}
              </a>
              {groupSources.length > 1 && (
                <span className="text-zinc-600 text-xs shrink-0">&times;{groupSources.length}</span>
              )}
            </li>
          ))}
        </ul>
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer pt-4 block"
          >
            {showAll ? 'Show fewer' : `Show all ${groups.length} sources`}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Concept Map ---

function ConceptMap({ concepts, onConceptClick }) {
  if (!concepts?.length) return null;

  return (
    <div>
      <h3 className="text-sm font-normal text-zinc-500 mb-4">
        Related concepts
      </h3>
      <div className="flex flex-wrap gap-3">
        {concepts.map((concept, i) => (
          <button
            key={i}
            onClick={() => onConceptClick(concept)}
            className="tactile px-4 py-2.5 text-xs font-medium text-zinc-400 bg-zinc-900/30 rounded-full hover:text-zinc-200 hover:bg-zinc-800/50 cursor-pointer min-h-10"
          >
            {concept}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Go Deeper ---

const GO_DEEPER_CARDS = [
  { type: 'steelman', icon: '\u2694\uFE0F', title: 'Steelman this claim', desc: 'Find the strongest version of this argument' },
  { type: 'crux', icon: '\uD83C\uDFAF', title: 'Find the crux', desc: 'What single disagreement matters most?' },
  { type: 'historical', icon: '\uD83D\uDCDC', title: 'Historical parallels', desc: 'What similar predictions came before?' },
];

function GoDeeper({ claim }) {
  const [activeType, setActiveType] = useState(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClick = async (type) => {
    setActiveType(type);
    setLoading(true);
    setResult('');
    try {
      const text = await runGoDeeper(type, claim);
      setResult(text);
    } catch (err) {
      setResult('Error: ' + (err.message || 'Failed to load'));
    } finally {
      setLoading(false);
    }
  };

  if (activeType) {
    const active = GO_DEEPER_CARDS.find(c => c.type === activeType);
    return (
      <div>
        <h3 className="text-sm font-normal text-zinc-500 mb-4">
          {active.icon} {active.title}
        </h3>
        <div className="card-elevated bg-zinc-900/30 rounded-2xl p-8">
          {loading ? (
            <div className="flex items-center gap-3 text-zinc-400 text-sm">
              <Spinner /> Researching...
            </div>
          ) : (
            <>
              <div className="text-sm text-zinc-300 leading-loose whitespace-pre-line">
                {result}
              </div>
              <button
                onClick={() => { setActiveType(null); setResult(''); }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer mt-6 block"
              >
                &larr; Back to options
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-normal text-zinc-500 mb-4">
        Continue the inquiry
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {GO_DEEPER_CARDS.map(card => (
          <button
            key={card.type}
            onClick={() => handleClick(card.type)}
            className="tactile text-left p-6 bg-zinc-900/30 rounded-2xl hover:bg-zinc-900/50 cursor-pointer min-h-12"
          >
            <span className="text-lg mb-3 block">{card.icon}</span>
            <p className="text-sm font-normal text-zinc-200 mb-1">{card.title}</p>
            <p className="text-xs text-zinc-500 leading-relaxed">{card.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Results: Claim Mode ---

function ClaimDashboard({ result }) {
  if (!result) return null;

  const colors = SCORE_COLORS[result.overall_score] || SCORE_COLORS.Unsupported;
  const verdict = SCORE_VERDICTS[result.overall_score] || '';

  return (
    <div className="space-y-12">
      {/* Epistemic Health */}
      <div
        className="rounded-2xl p-8"
        style={{ background: `linear-gradient(135deg, ${colors.glow} 0%, rgba(24, 24, 27, 0.6) 100%)` }}
      >
        <div className="flex items-start justify-between gap-8">
          <div className="flex-1">
            <p className="text-sm font-normal text-zinc-500 mb-3">Epistemic health</p>
            <p className="text-zinc-300 text-base leading-loose max-w-xl mb-4">{result.summary}</p>
            {verdict && <p className={`text-sm font-normal ${colors.text} italic`}>{verdict}</p>}
          </div>
          <ScoreBadge score={result.overall_score} />
        </div>
      </div>

      {/* Sub-claims */}
      <div>
        <h3 className="text-sm font-normal text-zinc-500 mb-5">
          Sub-claims ({result.sub_claims?.length || 0})
        </h3>
        <div className="space-y-4">
          {result.sub_claims?.map((sc, i) => (
            <SubClaimCard key={i} subClaim={sc} index={i} />
          ))}
        </div>
      </div>

      {result.sources?.length > 0 && <SourcesList sources={result.sources} />}
    </div>
  );
}

// --- Results: Forecast Mode ---

function ForecastDashboard({ result, onConceptClick }) {
  if (!result) return null;

  const colors = SCORE_COLORS[result.overall_score] || SCORE_COLORS.Unsupported;
  const verdict = SCORE_VERDICTS[result.overall_score] || '';

  return (
    <div className="space-y-12">
      {/* Probability comparison */}
      <div className="grid grid-cols-2 gap-5">
        <div className="card-elevated bg-zinc-900/40 rounded-2xl p-8 text-center">
          <p className="text-sm font-normal text-zinc-500 mb-3">Stated</p>
          <p className="text-3xl font-light text-zinc-100">{result.stated_probability || '\u2014'}</p>
        </div>
        <div
          className="card-elevated rounded-2xl p-8 text-center"
          style={{ background: `linear-gradient(135deg, ${colors.glow} 0%, rgba(24, 24, 27, 0.6) 100%)` }}
        >
          <p className="text-sm font-normal text-zinc-500 mb-3">Adjusted</p>
          <p className={`text-3xl font-light ${colors.text}`}>{result.adjusted_probability || '\u2014'}</p>
        </div>
      </div>

      {/* Base rate analysis */}
      <div className="card-elevated bg-zinc-900/30 rounded-2xl p-8">
        <h3 className="text-sm font-normal text-zinc-500 mb-3">Base rate analysis</h3>
        <p className="text-sm text-zinc-300 leading-loose">{result.base_rate_analysis}</p>
      </div>

      {/* Reference classes */}
      {result.reference_classes?.length > 0 && (
        <div>
          <h3 className="text-sm font-normal text-zinc-500 mb-5">Reference classes</h3>
          <div className="space-y-4">
            {result.reference_classes.map((rc, i) => (
              <div key={i} className="card-elevated bg-zinc-900/30 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-normal text-zinc-200">{rc.name}</p>
                  <span className="text-xs font-mono text-indigo-400">{rc.base_rate}</span>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">{rc.relevance}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calibration card */}
      <div
        className="rounded-2xl p-8"
        style={{ background: `linear-gradient(135deg, ${colors.glow} 0%, rgba(24, 24, 27, 0.6) 100%)` }}
      >
        <div className="flex items-start justify-between gap-8">
          <div className="flex-1">
            <p className="text-sm font-normal text-zinc-500 mb-3">Calibration assessment</p>
            <p className="text-zinc-300 text-sm leading-loose mb-3">{result.calibration_assessment}</p>
            <p className="text-zinc-300 text-base leading-loose">{result.summary}</p>
            {verdict && <p className={`text-sm font-normal ${colors.text} italic mt-3`}>{verdict}</p>}
          </div>
          <ScoreBadge score={result.overall_score} />
        </div>
      </div>

      {result.sources?.length > 0 && <SourcesList sources={result.sources} />}
      <ConceptMap concepts={result.related_concepts} onConceptClick={onConceptClick} />
    </div>
  );
}

// --- Results: Definition Mode ---

function DefinitionCard({ result, onConceptClick }) {
  if (!result) return null;

  return (
    <div className="space-y-12">
      {/* Definition */}
      <div className="card-elevated bg-zinc-900/40 rounded-2xl p-8">
        <p className="text-sm font-normal text-indigo-400/80 mb-3">Definition</p>
        <h2 className="text-2xl font-light text-zinc-100 mb-4">{result.concept}</h2>
        <p className="text-zinc-300 leading-loose">{result.definition}</p>
      </div>

      {/* Key debates */}
      {result.key_debates?.length > 0 && (
        <div>
          <h3 className="text-sm font-normal text-zinc-500 mb-5">Key debates</h3>
          <div className="space-y-4">
            {result.key_debates.map((debate, i) => (
              <div key={i} className="card-elevated bg-zinc-900/30 rounded-2xl p-6">
                <p className="text-sm font-normal text-zinc-200 mb-2">{debate.title}</p>
                <p className="text-sm text-zinc-400 leading-loose">{debate.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Misconceptions */}
      {result.common_misconceptions?.length > 0 && (
        <div>
          <h3 className="text-sm font-normal text-zinc-500 mb-5">Common misconceptions</h3>
          <div className="space-y-4">
            {result.common_misconceptions.map((m, i) => (
              <div key={i} className="card-elevated bg-zinc-900/30 rounded-2xl p-6">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-red-400/70 shrink-0">&times;</span>
                  <p className="text-sm text-zinc-300 leading-loose">{m.misconception}</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-emerald-400/70 shrink-0">&check;</span>
                  <p className="text-sm text-zinc-400 leading-loose">{m.reality}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.sources?.length > 0 && <SourcesList sources={result.sources} />}
      <ConceptMap concepts={result.related_concepts} onConceptClick={onConceptClick} />
    </div>
  );
}

// --- Main App ---

export default function App() {
  const [mode, setMode] = useState('claim');
  const [claim, setClaim] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [resultMode, setResultMode] = useState('claim');
  const [thoughts, setThoughts] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const auditStartRef = useRef(null);
  const rawThoughtsRef = useRef([]);
  const thoughtTimersRef = useRef([]);
  const displayedCountRef = useRef(0);

  const handleAudit = useCallback(async () => {
    if (!claim.trim() || loading) return;

    setLoading(true);
    setResult(null);
    setResultMode(mode);
    setThoughts([]);
    setStatus('');
    setError('');
    setComplete(false);

    rawThoughtsRef.current = [];
    displayedCountRef.current = 0;
    thoughtTimersRef.current.forEach(t => clearTimeout(t));
    thoughtTimersRef.current = [];
    auditStartRef.current = Date.now();

    THOUGHT_SCHEDULE.forEach((delay, idx) => {
      const timer = setTimeout(() => {
        const raw = rawThoughtsRef.current;
        if (raw.length === 0) return;
        const thoughtIdx = Math.min(idx, raw.length - 1);
        const sentence = extractSentence(raw[thoughtIdx]);
        setThoughts(prev => {
          if (prev.length >= 4) return prev;
          return [...prev, { text: sentence, timestamp: THOUGHT_TIMESTAMPS[idx] }];
        });
      }, delay);
      thoughtTimersRef.current.push(timer);
    });

    try {
      let auditResult;
      if (mode === 'definition') {
        auditResult = await runDefinition(claim, {
          onThought: (text) => { rawThoughtsRef.current.push(text); },
          onStatus: (msg) => setStatus(msg),
        });
      } else {
        auditResult = await runAudit(claim, mode, {
          onThought: (text) => { rawThoughtsRef.current.push(text); },
          onStatus: (msg) => setStatus(msg),
        });
      }
      setResult(auditResult);
      setStatus('');
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
      setStatus('');
    } finally {
      setLoading(false);
      setComplete(true);
      thoughtTimersRef.current.forEach(t => clearTimeout(t));
    }
  }, [claim, loading, mode]);

  const handleConceptClick = useCallback((concept) => {
    setClaim(concept);
    setMode('definition');
  }, []);

  const handleSelect = useCallback((text, selectedMode) => {
    setClaim(text);
    if (selectedMode) setMode(selectedMode);
  }, []);

  return (
    <div className="min-h-screen bg-depth text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <SocratesIcon />
          <div>
            <h1 className="text-lg font-normal text-zinc-100">Epistemic Auditor</h1>
            <p className="text-xs text-zinc-600 italic">What would Socrates ask?</p>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex min-h-0">
        <main className="flex-1 overflow-y-auto p-6 lg:p-10">
          <div className="max-w-3xl mx-auto space-y-12">
            <ClaimInput
              claim={claim}
              setClaim={setClaim}
              onSubmit={handleAudit}
              loading={loading}
              mode={mode}
              setMode={setMode}
            />

            {error && (
              <div className="bg-red-500/10 rounded-2xl p-6 text-red-400 text-sm">
                {error}
              </div>
            )}

            {!result && !loading && !error && (
              <EmptyState onSelect={handleSelect} />
            )}

            {/* Mode-specific results */}
            {resultMode === 'definition' ? (
              <DefinitionCard result={result} onConceptClick={handleConceptClick} />
            ) : resultMode === 'forecast' ? (
              <>
                <ForecastDashboard result={result} onConceptClick={handleConceptClick} />
                {result && <GoDeeper claim={claim} />}
              </>
            ) : (
              <>
                <ClaimDashboard result={result} />
                {result && (
                  <>
                    <GoDeeper claim={claim} />
                    <ConceptMap concepts={result.related_concepts} onConceptClick={handleConceptClick} />
                  </>
                )}
              </>
            )}
          </div>
        </main>

        {/* Socratic Process sidebar */}
        <aside className="w-80 bg-zinc-950/60 hidden lg:flex flex-col shrink-0">
          <SocraticProcess thoughts={thoughts} status={loading ? status : ''} active={loading} complete={complete} />
        </aside>
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 text-center shrink-0">
        <p className="text-xs text-zinc-700">
          The first module of an epistemic engine. &rarr;{' '}
          <a href="https://janehive.com" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400 transition-colors">
            janehive.com
          </a>
        </p>
      </footer>

      {/* Mobile reasoning indicator */}
      {loading && thoughts.length > 0 && (
        <div className="lg:hidden fixed bottom-4 right-4 bg-zinc-900/95 backdrop-blur-sm rounded-2xl p-4 max-w-xs shadow-xl">
          <p className="text-[10px] text-emerald-500/70 font-mono font-medium mb-1">Socratic Process:</p>
          <p className="text-[11px] text-emerald-300/50 font-mono line-clamp-3">
            {thoughts[thoughts.length - 1].text}
          </p>
        </div>
      )}
    </div>
  );
}
