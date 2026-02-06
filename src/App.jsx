import { useState, useRef, useEffect, useCallback } from 'react';
import { runAudit } from './api';

// --- Score color utilities ---

const SCORE_COLORS = {
  Strong: { bg: 'bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-400' },
  Moderate: { bg: 'bg-amber-500/20', border: 'border-amber-500', text: 'text-amber-400' },
  Weak: { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400' },
  Unsupported: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400' },
};

const CONFIDENCE_COLORS = {
  High: 'text-emerald-400',
  Moderate: 'text-amber-400',
  Low: 'text-red-400',
};

// --- Components ---

function ClaimInput({ claim, setClaim, onSubmit, loading }) {
  return (
    <div className="space-y-4">
      <textarea
        value={claim}
        onChange={(e) => setClaim(e.target.value)}
        placeholder='Paste a claim to audit, e.g. "Global temperatures will rise 2°C by 2030"'
        className="w-full h-32 bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={loading || !claim.trim()}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
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

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ReasoningLog({ thoughts, status }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, status]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 border-b border-zinc-800 shrink-0">
        Reasoning Log
      </h2>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {thoughts.length === 0 && !status && (
          <p className="text-zinc-600 text-sm italic">
            Thoughts will appear here during audit...
          </p>
        )}
        {thoughts.map((t, i) => (
          <div key={i} className="text-sm">
            <div className="flex items-start gap-2">
              <span className="text-indigo-400 shrink-0 mt-0.5">&#9656;</span>
              <p className="text-zinc-400 leading-relaxed break-words">{t}</p>
            </div>
          </div>
        ))}
        {status && (
          <div className="flex items-center gap-2 text-sm text-indigo-400">
            <Spinner />
            <span>{status}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBadge({ score }) {
  const colors = SCORE_COLORS[score] || SCORE_COLORS.Unsupported;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${colors.bg} ${colors.border} ${colors.text}`}>
      {score}
    </span>
  );
}

function SubClaimCard({ subClaim, index }) {
  const [expanded, setExpanded] = useState(false);
  const confidenceColor = CONFIDENCE_COLORS[subClaim.confidence] || 'text-zinc-400';

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-zinc-600 text-sm font-mono shrink-0">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="text-zinc-200 font-medium truncate">
            {subClaim.title}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <span className={`text-xs font-medium ${confidenceColor}`}>
            {subClaim.confidence}
          </span>
          <svg
            className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-800/50">
          <div className="pt-3">
            <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
              Evidence For
            </h4>
            {subClaim.evidence_for?.length > 0 ? (
              <ul className="space-y-1.5">
                {subClaim.evidence_for.map((e, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
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
            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">
              Evidence Against
            </h4>
            {subClaim.evidence_against?.length > 0 ? (
              <ul className="space-y-1.5">
                {subClaim.evidence_against.map((e, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
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

function ResultsDashboard({ result }) {
  if (!result) return null;

  const colors = SCORE_COLORS[result.overall_score] || SCORE_COLORS.Unsupported;

  return (
    <div className="space-y-6">
      {/* Original Claim */}
      <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          Claim Under Review
        </p>
        <p className="text-zinc-100 text-lg leading-relaxed">
          &ldquo;{result.claim}&rdquo;
        </p>
      </div>

      {/* Overall Score */}
      <div className={`border rounded-lg p-5 ${colors.bg} ${colors.border}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Epistemic Health
            </p>
            <p className="text-zinc-300 text-sm leading-relaxed max-w-xl">
              {result.summary}
            </p>
          </div>
          <ScoreBadge score={result.overall_score} />
        </div>
      </div>

      {/* Sub-claims */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Sub-claims ({result.sub_claims?.length || 0})
        </h3>
        <div className="space-y-2">
          {result.sub_claims?.map((sc, i) => (
            <SubClaimCard key={i} subClaim={sc} index={i} />
          ))}
        </div>
      </div>

      {/* Sources */}
      {result.source_urls?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Sources ({result.source_urls.length})
          </h3>
          <div className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-4">
            <ul className="space-y-1.5">
              {result.source_urls.map((url, i) => (
                <li key={i} className="text-sm truncate">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
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

  const handleAudit = useCallback(async () => {
    if (!claim.trim() || loading) return;

    setLoading(true);
    setResult(null);
    setThoughts([]);
    setStatus('');
    setError('');

    try {
      const auditResult = await runAudit(claim, {
        onThought: (text) => {
          const summary = text.length > 300 ? text.slice(0, 297) + '...' : text;
          setThoughts((prev) => [...prev, summary]);
        },
        onStatus: (msg) => setStatus(msg),
      });
      setResult(auditResult);
      setStatus('');
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
      setStatus('');
    } finally {
      setLoading(false);
    }
  }, [claim, loading]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              EA
            </div>
            <h1 className="text-lg font-semibold text-zinc-100">
              Epistemic Auditor
            </h1>
          </div>
          <p className="text-xs text-zinc-600 hidden sm:block">
            AI-powered claim verification
          </p>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex min-h-0">
        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-8">
            <ClaimInput
              claim={claim}
              setClaim={setClaim}
              onSubmit={handleAudit}
              loading={loading}
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            <ResultsDashboard result={result} />
          </div>
        </main>

        {/* Reasoning Log sidebar */}
        <aside className="w-80 border-l border-zinc-800 bg-zinc-900/50 hidden lg:flex flex-col shrink-0">
          <ReasoningLog thoughts={thoughts} status={loading ? status : ''} />
        </aside>
      </div>

      {/* Mobile reasoning log */}
      {loading && thoughts.length > 0 && (
        <div className="lg:hidden fixed bottom-4 right-4 bg-zinc-800 border border-zinc-700 rounded-lg p-3 max-w-xs shadow-xl">
          <p className="text-xs text-zinc-400 font-medium mb-1">Latest thought:</p>
          <p className="text-xs text-zinc-500 line-clamp-3">
            {thoughts[thoughts.length - 1]}
          </p>
        </div>
      )}
    </div>
  );
}
