import { useState, useRef, useEffect, useCallback } from 'react';
import { runAudit, runGoDeeper } from './api';
import { CONCEPTS, findConcept, getConceptById } from './concepts';

// --- Utilities ---

const SCORE_COLORS = {
  Strong: { text: 'text-emerald-400', glow: 'rgba(52, 211, 153, 0.1)', bg: 'bg-emerald-500/10' },
  Moderate: { text: 'text-amber-400', glow: 'rgba(245, 158, 11, 0.1)', bg: 'bg-amber-500/10' },
  Weak: { text: 'text-orange-400', glow: 'rgba(249, 115, 22, 0.1)', bg: 'bg-orange-500/10' },
  Unsupported: { text: 'text-red-400', glow: 'rgba(239, 68, 68, 0.1)', bg: 'bg-red-500/10' },
};

const SCORE_VERDICTS = {
  Strong: 'Evidence broadly supports this claim.',
  Moderate: 'Mixed evidence — proceed with caution.',
  Weak: 'This claim requires significant scrutiny.',
  Unsupported: 'Little to no evidence supports this claim.',
};

const CONFIDENCE_COLORS = {
  High: 'text-emerald-400',
  Moderate: 'text-amber-400',
  Low: 'text-red-400',
};

const SCORE_TO_PROBABILITY = {
  Strong: { label: 'Likely supported', range: '60–80%' },
  Moderate: { label: 'Mixed evidence', range: '40–60%' },
  Weak: { label: 'Significant doubt', range: '20–40%' },
  Unsupported: { label: 'Largely unsupported', range: '<20%' },
};

const FORECAST_BUCKETS = [
  { label: 'Very Unlikely', range: '<20%' },
  { label: 'Unlikely', range: '20–40%' },
  { label: 'Toss-up', range: '40–60%' },
  { label: 'Likely', range: '60–80%' },
  { label: 'Very Likely', range: '>80%' },
];

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

const EXPLORE_CONCEPTS = CONCEPTS.slice(0, 5);

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

// --- Concept Card (static, no API) ---

function ConceptCard({ concept, onConceptClick, onClose }) {
  if (!concept) return null;

  return (
    <div className="card-elevated bg-zinc-900/50 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-normal text-indigo-400/80 mb-1">Concept</p>
          <h3 className="text-lg font-light text-zinc-100">{concept.name}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer shrink-0 text-lg leading-none"
        >
          &times;
        </button>
      </div>
      <p className="text-sm text-zinc-300 leading-loose">{concept.definition}</p>
      <div>
        <p className="text-sm font-normal text-zinc-500 mb-2">Key tension</p>
        <p className="text-sm text-zinc-400 leading-loose italic">{concept.keyTension}</p>
      </div>
      {concept.relatedConcepts?.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {concept.relatedConcepts.map(id => {
            const related = getConceptById(id);
            if (!related) return null;
            return (
              <button
                key={id}
                onClick={() => onConceptClick(related)}
                className="tactile px-3 py-1.5 text-xs font-medium text-zinc-500 bg-zinc-800/50 rounded-full hover:text-zinc-200 hover:bg-zinc-800/80 cursor-pointer"
              >
                {related.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Claim Input ---

function ClaimInput({ claim, setClaim, onSubmit, loading }) {
  return (
    <div className="space-y-4">
      <textarea
        value={claim}
        onChange={(e) => setClaim(e.target.value)}
        placeholder='Paste a claim to audit, e.g. "Global temperatures will rise 2°C by 2030"'
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
              Running Audit...
            </span>
          ) : (
            'Run Audit'
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

function EmptyState({ onSelect, activeConcept, onConceptClick, onConceptClose }) {
  return (
    <div className="text-center py-16">
      <p className="text-zinc-500 text-sm italic mb-8 tracking-wide">
        No claim is too sacred to question.
      </p>
      <div className="space-y-3 max-w-lg mx-auto mb-12">
        {EXAMPLE_CLAIMS.map((claim, i) => (
          <button
            key={i}
            onClick={() => onSelect(claim)}
            className="tactile block w-full text-left px-6 py-5 bg-zinc-900/40 rounded-2xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 cursor-pointer text-sm leading-loose min-h-12"
          >
            &ldquo;{claim}&rdquo;
          </button>
        ))}
      </div>
      <p className="text-zinc-600 text-xs mb-4">
        Or explore a concept
      </p>
      <div className="flex flex-wrap justify-center gap-3 mb-6">
        {EXPLORE_CONCEPTS.map(concept => (
          <button
            key={concept.id}
            onClick={() => onConceptClick(concept)}
            className={`tactile px-4 py-2.5 text-xs font-medium rounded-full cursor-pointer min-h-10 ${
              activeConcept?.id === concept.id
                ? 'bg-indigo-600/20 text-indigo-300'
                : 'bg-zinc-900/30 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            {concept.name}
          </button>
        ))}
      </div>
      {activeConcept && (
        <div className="max-w-lg mx-auto text-left">
          <ConceptCard concept={activeConcept} onConceptClick={onConceptClick} onClose={onConceptClose} />
        </div>
      )}
    </div>
  );
}

// --- Socratic Process (Sidebar) ---

function ThoughtEntry({ thought, index }) {
  const label = `[${String(index + 1).padStart(2, '0')} · ${thought.timestamp}s]`;

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

// --- Forecast Comparison ---

function ForecastComparison({ result, userForecast, setUserForecast }) {
  const colors = SCORE_COLORS[result.overall_score] || SCORE_COLORS.Unsupported;
  const aiAssessment = SCORE_TO_PROBABILITY[result.overall_score] || SCORE_TO_PROBABILITY.Moderate;

  return (
    <div>
      <h3 className="text-sm font-normal text-zinc-500 mb-4">What&rsquo;s your call?</h3>
      <div className="flex flex-wrap gap-2 mb-6">
        {FORECAST_BUCKETS.map(bucket => (
          <button
            key={bucket.label}
            onClick={() => setUserForecast(
              userForecast?.label === bucket.label ? null : bucket
            )}
            className={`tactile px-4 py-2.5 text-xs font-medium rounded-full cursor-pointer min-h-10 ${
              userForecast?.label === bucket.label
                ? 'bg-indigo-600/20 text-indigo-300'
                : 'bg-zinc-900/30 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            {bucket.label} ({bucket.range})
          </button>
        ))}
      </div>
      {userForecast && (
        <div className="grid grid-cols-2 gap-5">
          <div className="card-elevated bg-zinc-900/40 rounded-2xl p-6 text-center">
            <p className="text-sm font-normal text-zinc-500 mb-3">Your call</p>
            <p className="text-2xl font-light text-zinc-100 mb-1">{userForecast.range}</p>
            <p className="text-xs text-zinc-500">{userForecast.label}</p>
          </div>
          <div
            className="card-elevated rounded-2xl p-6 text-center"
            style={{ background: `linear-gradient(135deg, ${colors.glow} 0%, rgba(24, 24, 27, 0.6) 100%)` }}
          >
            <p className="text-sm font-normal text-zinc-500 mb-3">AI assessment</p>
            <p className={`text-2xl font-light mb-1 ${colors.text}`}>{aiAssessment.range}</p>
            <p className="text-xs text-zinc-500">{aiAssessment.label}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Concept Map (matches AI concepts to local database) ---

function ConceptMap({ concepts, activeConcept, onConceptClick, onConceptClose }) {
  if (!concepts?.length) return null;

  const mapped = concepts.map(name => ({
    name,
    data: findConcept(name),
  }));

  return (
    <div>
      <h3 className="text-sm font-normal text-zinc-500 mb-4">
        Related concepts
      </h3>
      <div className="flex flex-wrap gap-3 mb-4">
        {mapped.map((item, i) => {
          const isActive = activeConcept?.id === item.data?.id;
          if (item.data) {
            return (
              <button
                key={i}
                onClick={() => onConceptClick(item.data)}
                className={`tactile px-4 py-2.5 text-xs font-medium rounded-full cursor-pointer min-h-10 ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'bg-zinc-900/30 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {item.data.name}
              </button>
            );
          }
          return (
            <span
              key={i}
              className="px-4 py-2.5 text-xs font-medium text-zinc-600 bg-zinc-900/20 rounded-full min-h-10 inline-flex items-center"
            >
              {item.name}
            </span>
          );
        })}
      </div>
      {activeConcept && (
        <ConceptCard concept={activeConcept} onConceptClick={onConceptClick} onClose={onConceptClose} />
      )}
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
  const [error, setError] = useState('');

  const handleClick = async (type) => {
    setActiveType(type);
    setLoading(true);
    setResult('');
    setError('');
    try {
      const text = await runGoDeeper(type, claim);
      setResult(text);
    } catch {
      setError('Analysis temporarily unavailable. Please try again in a moment.');
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
          ) : error ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/5 rounded-xl">
                <span className="text-amber-400/80 text-sm">&#9888;</span>
                <p className="text-sm text-zinc-400">{error}</p>
              </div>
              <button
                onClick={() => { setActiveType(null); setResult(''); setError(''); }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer mt-6 block"
              >
                &larr; Back to options
              </button>
            </>
          ) : (
            <>
              <div className="text-sm text-zinc-300 leading-loose whitespace-pre-line">
                {result}
              </div>
              <button
                onClick={() => { setActiveType(null); setResult(''); setError(''); }}
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

// --- Results: Claim Dashboard ---

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

// --- Main App ---

export default function App() {
  const [claim, setClaim] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [thoughts, setThoughts] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [userForecast, setUserForecast] = useState(null);
  const [activeConcept, setActiveConcept] = useState(null);
  const rawThoughtsRef = useRef([]);
  const thoughtTimersRef = useRef([]);

  const handleAudit = useCallback(async () => {
    if (!claim.trim() || loading) return;

    setLoading(true);
    setResult(null);
    setThoughts([]);
    setStatus('');
    setError('');
    setComplete(false);
    setUserForecast(null);
    setActiveConcept(null);

    rawThoughtsRef.current = [];
    thoughtTimersRef.current.forEach(t => clearTimeout(t));
    thoughtTimersRef.current = [];

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
      const auditResult = await runAudit(claim, {
        onThought: (text) => { rawThoughtsRef.current.push(text); },
        onStatus: (msg) => setStatus(msg),
      });
      setResult(auditResult);
      setStatus('');
    } catch {
      setError('Analysis temporarily unavailable. Please try again in a moment.');
      setStatus('');
    } finally {
      setLoading(false);
      setComplete(true);
      thoughtTimersRef.current.forEach(t => clearTimeout(t));
    }
  }, [claim, loading]);

  const handleConceptClick = useCallback((concept) => {
    setActiveConcept(prev => prev?.id === concept.id ? null : concept);
  }, []);

  const handleConceptClose = useCallback(() => {
    setActiveConcept(null);
  }, []);

  const handleSelect = useCallback((text) => {
    setClaim(text);
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
            />

            {error && (
              <div className="flex items-center gap-3 px-6 py-5 bg-amber-500/5 rounded-2xl">
                <span className="text-amber-400/80 text-lg">&#9888;</span>
                <p className="text-sm text-zinc-400">{error}</p>
              </div>
            )}

            {!result && !loading && !error && (
              <EmptyState
                onSelect={handleSelect}
                activeConcept={activeConcept}
                onConceptClick={handleConceptClick}
                onConceptClose={handleConceptClose}
              />
            )}

            {result && (
              <>
                <ClaimDashboard result={result} />
                <ForecastComparison
                  result={result}
                  userForecast={userForecast}
                  setUserForecast={setUserForecast}
                />
                <GoDeeper claim={claim} />
                <ConceptMap
                  concepts={result.related_concepts}
                  activeConcept={activeConcept}
                  onConceptClick={handleConceptClick}
                  onConceptClose={handleConceptClose}
                />
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
