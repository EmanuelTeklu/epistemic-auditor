export const CONCEPTS = [
  {
    id: 'moral-hazard',
    name: 'Moral Hazard',
    definition: 'When a party takes on more risk because they don\'t bear the full cost of that risk. The insulated party behaves differently than they would if fully exposed to consequences.',
    keyTension: 'Does insurance create moral hazard, or does it enable productive risk-taking that wouldn\'t otherwise happen?',
    relatedConcepts: ['adverse-selection', 'principal-agent', 'regulatory-capture'],
  },
  {
    id: 'base-rate-neglect',
    name: 'Base Rate Neglect',
    definition: 'The tendency to ignore general statistical information (base rates) in favor of specific but less reliable information about an individual case.',
    keyTension: 'When is it rational to override base rates with case-specific evidence, and when does doing so lead us astray?',
    relatedConcepts: ['anchoring-bias', 'reference-class-forecasting', 'calibration'],
  },
  {
    id: 'epistemic-humility',
    name: 'Epistemic Humility',
    definition: 'The recognition that our knowledge is always limited, provisional, and subject to revision. It involves calibrating confidence to actual evidence rather than intuition or social pressure.',
    keyTension: 'How do you maintain epistemic humility without falling into paralysis or false equivalence between well-supported and unsupported positions?',
    relatedConcepts: ['calibration', 'hindsight-bias', 'scope-insensitivity'],
  },
  {
    id: 'adverse-selection',
    name: 'Adverse Selection',
    definition: 'A market situation where buyers and sellers have asymmetric information, causing the party with less information to attract disproportionately risky counterparts.',
    keyTension: 'Can market design eliminate adverse selection, or is information asymmetry an irreducible feature of complex transactions?',
    relatedConcepts: ['moral-hazard', 'principal-agent', 'regulatory-capture'],
  },
  {
    id: 'principal-agent',
    name: 'Principal-Agent Problem',
    definition: 'A conflict of interest that arises when one party (the agent) is expected to act in the best interest of another (the principal), but has incentives to act otherwise.',
    keyTension: 'Are stronger incentive structures or stronger cultural norms more effective at aligning agent behavior with principal interests?',
    relatedConcepts: ['moral-hazard', 'adverse-selection', 'goodharts-law'],
  },
  {
    id: 'reference-class-forecasting',
    name: 'Reference Class Forecasting',
    definition: 'A method of predicting outcomes by looking at how similar past situations actually turned out, rather than relying on inside-view analysis of the specific case.',
    keyTension: 'How do you choose the right reference class when every situation is unique in some ways and similar in others?',
    relatedConcepts: ['base-rate-neglect', 'anchoring-bias', 'calibration'],
  },
  {
    id: 'anchoring-bias',
    name: 'Anchoring Bias',
    definition: 'The tendency to rely too heavily on the first piece of information encountered when making decisions, even when that information is arbitrary or irrelevant.',
    keyTension: 'Is anchoring a cognitive flaw we should always correct for, or does it serve as a useful heuristic in information-poor environments?',
    relatedConcepts: ['base-rate-neglect', 'hindsight-bias', 'scope-insensitivity'],
  },
  {
    id: 'hindsight-bias',
    name: 'Hindsight Bias',
    definition: 'The tendency to perceive past events as having been more predictable than they actually were. After learning an outcome, people overestimate their ability to have predicted it.',
    keyTension: 'Does hindsight bias help us learn from experience by creating coherent narratives, or does it systematically distort our understanding of risk?',
    relatedConcepts: ['survivorship-bias', 'calibration', 'epistemic-humility'],
  },
  {
    id: 'overton-window',
    name: 'Overton Window',
    definition: 'The range of policies and ideas considered politically acceptable to the mainstream at a given time. Ideas outside this window are seen as radical or unthinkable.',
    keyTension: 'Is the Overton window shifted by intellectual argument, or primarily by material conditions and power dynamics?',
    relatedConcepts: ['regulatory-capture', 'anchoring-bias', 'goodharts-law'],
  },
  {
    id: 'regulatory-capture',
    name: 'Regulatory Capture',
    definition: 'When a regulatory agency, created to act in the public interest, instead advances the interests of the industry it is supposed to regulate.',
    keyTension: 'Is regulatory capture an inevitable result of information asymmetry between regulators and industry, or a failure of institutional design?',
    relatedConcepts: ['principal-agent', 'moral-hazard', 'overton-window'],
  },
  {
    id: 'goodharts-law',
    name: 'Goodhart\'s Law',
    definition: 'When a measure becomes a target, it ceases to be a good measure. Optimizing for a metric rather than the underlying goal it represents leads to perverse outcomes.',
    keyTension: 'If all metrics are eventually gamed, how should institutions measure and incentivize performance?',
    relatedConcepts: ['principal-agent', 'calibration', 'survivorship-bias'],
  },
  {
    id: 'survivorship-bias',
    name: 'Survivorship Bias',
    definition: 'The logical error of concentrating on entities that passed a selection process while overlooking those that did not, leading to false conclusions about what caused success.',
    keyTension: 'How do you study success without survivorship bias when failed cases are often invisible or undocumented?',
    relatedConcepts: ['base-rate-neglect', 'hindsight-bias', 'reference-class-forecasting'],
  },
  {
    id: 'dutch-book',
    name: 'Dutch Book',
    definition: 'A set of bets that guarantees a loss for one party regardless of outcomes, exposing incoherent probability assignments. If your beliefs can be Dutch-booked, they violate basic probability axioms.',
    keyTension: 'Do Dutch Book arguments prove that rational agents must have perfectly coherent probabilities, or are real-world approximations good enough?',
    relatedConcepts: ['calibration', 'base-rate-neglect', 'epistemic-humility'],
  },
  {
    id: 'calibration',
    name: 'Calibration',
    definition: 'The degree to which stated confidence levels match actual accuracy. A well-calibrated forecaster who says "70% confident" is right about 70% of the time.',
    keyTension: 'Is perfect calibration achievable, or do systematic biases in human cognition make it an asymptotic ideal?',
    relatedConcepts: ['base-rate-neglect', 'reference-class-forecasting', 'dutch-book'],
  },
  {
    id: 'scope-insensitivity',
    name: 'Scope Insensitivity',
    definition: 'The human tendency to not scale emotional or evaluative responses proportionally to the magnitude of a problem. Saving 2,000 birds feels almost the same as saving 200,000.',
    keyTension: 'Is scope insensitivity a bug in human cognition, or does it reflect genuine moral intuitions about the limits of utilitarian scaling?',
    relatedConcepts: ['anchoring-bias', 'base-rate-neglect', 'epistemic-humility'],
  },
];

const conceptIndex = new Map();
for (const c of CONCEPTS) {
  conceptIndex.set(c.id, c);
  conceptIndex.set(c.name.toLowerCase().replace(/[^a-z0-9]/g, ''), c);
}

export function findConcept(nameOrId) {
  if (!nameOrId) return null;
  const direct = conceptIndex.get(nameOrId);
  if (direct) return direct;
  const normalized = nameOrId.toLowerCase().replace(/[^a-z0-9]/g, '');
  return conceptIndex.get(normalized) || null;
}

export function getConceptById(id) {
  return conceptIndex.get(id) || null;
}
