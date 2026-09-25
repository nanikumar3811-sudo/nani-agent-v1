export type EvidenceKind = 'MARKET' | 'SHOPPING';
export type EvidenceQuality = 'PRIMARY' | 'TRUSTED_SECONDARY' | 'DISCOVERY';
export type DecisionState = 'NO_TRADE' | 'WATCH' | 'WAIT' | 'WORTH_BUYING' | 'SKIP' | 'NEEDS_ANSWER';

export type EvidenceFact = {
  subject: string;
  kind: EvidenceKind;
  field: string;
  value: unknown;
  sourceUrl: string;
  sourceName: string;
  quality: EvidenceQuality;
  observedAt: string;
  verifiedAt: string;
  expiresAt?: string | null;
};

export type Delta = {
  field: string;
  previous: unknown;
  current: unknown;
  changed: boolean;
};

export type LivingState = {
  subject: string;
  kind: EvidenceKind;
  decision: DecisionState;
  facts: Record<string, unknown>;
  deltas: Delta[];
  changed: boolean;
  reason: string;
  nextCondition: string;
  evidence: EvidenceFact[];
  generatedAt: string;
};

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function compareFacts(previous: Record<string, unknown> | null, facts: EvidenceFact[]): Delta[] {
  const next = Object.fromEntries(facts.map((f) => [f.field, f.value]));
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next)]);
  return [...keys].map((field) => ({
    field,
    previous: previous?.[field] ?? null,
    current: next[field] ?? null,
    changed: !same(previous?.[field] ?? null, next[field] ?? null),
  }));
}

export function buildLivingState(input: {
  subject: string;
  kind: EvidenceKind;
  facts: EvidenceFact[];
  previousFacts: Record<string, unknown> | null;
  previousDecision?: DecisionState | null;
  decision?: DecisionState;
  reason?: string;
  nextCondition?: string;
}): LivingState {
  const verified = input.facts.filter((f) => f.quality !== 'DISCOVERY' && Boolean(f.sourceUrl) && !Number.isNaN(Date.parse(f.verifiedAt)));
  const facts = Object.fromEntries(verified.map((f) => [f.field, f.value]));
  const deltas = compareFacts(input.previousFacts, verified);
  const changed = deltas.some((d) => d.changed);
  const safeDefault: DecisionState = input.kind === 'MARKET' ? 'NO_TRADE' : 'WAIT';
  const decision = input.decision || input.previousDecision || safeDefault;

  return {
    subject: input.subject,
    kind: input.kind,
    decision,
    facts,
    deltas,
    changed,
    reason: input.reason || (changed ? 'Verified state changed.' : 'No decision-changing verified change.'),
    nextCondition: input.nextCondition || 'Wait for a verified material change.',
    evidence: verified,
    generatedAt: new Date().toISOString(),
  };
}

export function shouldNotify(current: LivingState, previousDecision?: DecisionState | null) {
  if (!current.changed) return false;
  if (previousDecision && previousDecision !== current.decision) return true;
  const material = new Set(['price','availability','stock','trigger','invalidation','regime','catalyst','bundlePrice','decision']);
  return current.deltas.some((d) => d.changed && material.has(d.field));
}
