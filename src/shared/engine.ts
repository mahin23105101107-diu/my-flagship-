/**
 * FlagShip Shared Deterministic Evaluation Engine
 *
 * Implements:
 * - Builder Pattern: EvaluationContextBuilder
 * - Strategy Pattern: OperatorStrategy, MurmurHash3RolloutStrategy
 * - Composite Pattern: RuleGroupNode & ConditionLeafNode
 * - Visitor Pattern: RuleEvaluatorVisitor
 * - Chain of Responsibility: KillSwitch -> IndividualTarget -> SegmentRules -> PercentageRollout -> Default
 */

export type FlagType = 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON';

export type OperatorType =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'IN'
  | 'CONTAINS'
  | 'SEMVER_GREATER_THAN'
  | 'REGEX'
  | 'DATE_BEFORE'
  | 'DATE_AFTER';

export type LogicalOperator = 'AND' | 'OR';

export type EvaluationReason =
  | 'KILL_SWITCH'
  | 'INDIVIDUAL_TARGET'
  | 'SEGMENT_RULE'
  | 'PERCENTAGE_ROLLOUT'
  | 'DEFAULT'
  | 'OFFLINE_DEFAULT';

export interface EvaluationContext {
  userKey: string;
  attributes: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Builder Pattern for constructing immutable EvaluationContext objects.
 */
export class EvaluationContextBuilder {
  private readonly userKey: string;
  private readonly attrs: Record<string, string | number | boolean | null | undefined> = {};

  private constructor(userKey: string) {
    this.userKey = userKey;
  }

  static create(userKey: string): EvaluationContextBuilder {
    return new EvaluationContextBuilder(userKey);
  }

  attribute(key: string, value: string | number | boolean | null | undefined): this {
    this.attrs[key] = value;
    return this;
  }

  attributes(map: Record<string, string | number | boolean | null | undefined>): this {
    Object.assign(this.attrs, map);
    return this;
  }

  build(): EvaluationContext {
    return {
      userKey: this.userKey,
      attributes: { ...this.attrs },
    };
  }
}

export interface ConditionLeafNode {
  kind: 'CONDITION';
  attribute: string;
  operator: OperatorType;
  value: string;
}

export interface SegmentRefNode {
  kind: 'SEGMENT_REF';
  segmentKey: string;
}

export interface RuleGroupNode {
  kind: 'GROUP';
  operator: LogicalOperator;
  children: RuleNode[];
}

export type RuleNode = ConditionLeafNode | SegmentRefNode | RuleGroupNode;

export interface UserSegmentDefinition {
  key: string;
  name: string;
  rootRule: RuleNode;
}

export interface TargetingRuleDefinition {
  id: string;
  name: string;
  priority: number;
  variationKey: string;
  rootRule: RuleNode;
}

export interface FlagVariationDefinition {
  key: string;
  name: string;
  value: unknown;
}

export interface RolloutAllocation {
  variationKey: string;
  weight: number; // 0 to 100
}

export interface FlagEvaluationConfig {
  flagKey: string;
  type: FlagType;
  enabled: boolean;
  killSwitchActive: boolean;
  defaultVariationKey: string;
  offVariationKey: string;
  rolloutPercentage: number; // 0 to 100
  rolloutVariationKey?: string;
  rolloutAllocations?: RolloutAllocation[];
  variations: FlagVariationDefinition[];
  individualTargets: Record<string, string>; // userKey -> variationKey
  rules: TargetingRuleDefinition[];
  version: number;
}

export interface EvaluationResult {
  flagKey: string;
  variationKey: string;
  value: unknown;
  reason: EvaluationReason;
  matchedRuleId?: string;
  matchedRuleName?: string;
  bucket?: number;
  version: number;
  evaluatedAtMicros?: number;
}

/**
 * MurmurHash3 32-bit implementation (x86_32) matching Java FlagShip MurmurHash3 bit-for-bit.
 */
export function murmurHash32(input: string, seed = 0): number {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const len = data.length;
  let h1 = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const nblocks = len >> 2;

  for (let i = 0; i < nblocks; i++) {
    const i4 = i * 4;
    let k1 =
      (data[i4] & 0xff) |
      ((data[i4 + 1] & 0xff) << 8) |
      ((data[i4 + 2] & 0xff) << 16) |
      ((data[i4 + 3] & 0xff) << 24);

    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = Math.imul(h1, 5) + 0xe6546b64;
  }

  let k1 = 0;
  const tailIndex = nblocks * 4;
  switch (len & 3) {
    case 3:
      k1 ^= (data[tailIndex + 2] & 0xff) << 16;
    // falls through
    case 2:
      k1 ^= (data[tailIndex + 1] & 0xff) << 8;
    // falls through
    case 1:
      k1 ^= data[tailIndex] & 0xff;
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
  }

  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/**
 * Deterministic bucket in [0, 100) with 0.01% resolution (10,000 buckets).
 * Increasing rollout from 10% to 20% preserves 100% of the 0..9.99% cohort.
 */
export function computeDeterministicBucket(flagKey: string, userKey: string, salt = ''): number {
  const compositeKey = salt ? `${flagKey}:${userKey}:${salt}` : `${flagKey}:${userKey}`;
  const hash = murmurHash32(compositeKey, 0x9747b28c);
  return (hash % 10000) / 100;
}

function parseSemver(ver: string): [number, number, number] | null {
  const cleaned = ver.trim().replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.');
  if (parts.length < 1 || parts.length > 3) return null;
  const nums = [0, 0, 0];
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0) return null;
    nums[i] = n;
  }
  return [nums[0], nums[1], nums[2]];
}

function compareSemver(a: string, b: string): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * Strategy Pattern: Extensible targeting operator strategies.
 */
export type OperatorStrategy = (actualValue: unknown, expectedValue: string) => boolean;

export const OPERATOR_STRATEGIES: Record<OperatorType, OperatorStrategy> = {
  EQUALS: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    return String(actual).trim() === expected.trim();
  },
  NOT_EQUALS: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    return String(actual).trim() !== expected.trim();
  },
  IN: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    const items = expected
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return items.includes(String(actual).trim());
  },
  CONTAINS: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    return String(actual).toLowerCase().includes(expected.toLowerCase());
  },
  SEMVER_GREATER_THAN: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    const cmp = compareSemver(String(actual), expected);
    return cmp !== null && cmp > 0;
  },
  REGEX: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    try {
      const re = new RegExp(expected);
      return re.test(String(actual));
    } catch {
      return false;
    }
  },
  DATE_BEFORE: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    const tActual = Date.parse(String(actual));
    const tExpected = Date.parse(expected);
    if (Number.isNaN(tActual) || Number.isNaN(tExpected)) return false;
    return tActual < tExpected;
  },
  DATE_AFTER: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    const tActual = Date.parse(String(actual));
    const tExpected = Date.parse(expected);
    if (Number.isNaN(tActual) || Number.isNaN(tExpected)) return false;
    return tActual > tExpected;
  },
};

/**
 * Visitor Pattern for traversing and evaluating Composite RuleNode trees.
 */
export interface RuleVisitor<T> {
  visitGroup(node: RuleGroupNode): T;
  visitCondition(node: ConditionLeafNode): T;
  visitSegmentRef(node: SegmentRefNode): T;
}

export class RuleEvaluatorVisitor implements RuleVisitor<boolean> {
  private readonly context: EvaluationContext;
  private readonly segments: Map<string, UserSegmentDefinition>;
  private readonly visitedSegments = new Set<string>();

  constructor(context: EvaluationContext, segments: Map<string, UserSegmentDefinition>) {
    this.context = context;
    this.segments = segments;
  }

  evaluate(node: RuleNode): boolean {
    switch (node.kind) {
      case 'GROUP':
        return this.visitGroup(node);
      case 'CONDITION':
        return this.visitCondition(node);
      case 'SEGMENT_REF':
        return this.visitSegmentRef(node);
    }
  }

  visitGroup(node: RuleGroupNode): boolean {
    if (!node.children || node.children.length === 0) return false;
    if (node.operator === 'AND') {
      return node.children.every((child) => this.evaluate(child));
    }
    return node.children.some((child) => this.evaluate(child));
  }

  visitCondition(node: ConditionLeafNode): boolean {
    const strategy = OPERATOR_STRATEGIES[node.operator];
    if (!strategy) return false;
    const actual =
      node.attribute === 'userKey' ? this.context.userKey : this.context.attributes[node.attribute];
    return strategy(actual, node.value);
  }

  visitSegmentRef(node: SegmentRefNode): boolean {
    if (this.visitedSegments.has(node.segmentKey)) return false; // cycle guard
    const seg = this.segments.get(node.segmentKey);
    if (!seg) return false;
    this.visitedSegments.add(node.segmentKey);
    const result = this.evaluate(seg.rootRule);
    this.visitedSegments.delete(node.segmentKey);
    return result;
  }
}

/**
 * Chain of Responsibility: Evaluation pipeline handlers.
 * Order:
 * 1. Kill Switch
 * 2. Individual User Targets
 * 3. Segment / Targeting Rules (sorted by priority asc)
 * 4. Percentage Rollout
 * 5. Default Variation
 */
interface EvaluationStepInput {
  config: FlagEvaluationConfig;
  context: EvaluationContext;
  segments: Map<string, UserSegmentDefinition>;
  variationMap: Map<string, FlagVariationDefinition>;
}

abstract class EvaluationHandler {
  protected next: EvaluationHandler | null = null;

  setNext(handler: EvaluationHandler): EvaluationHandler {
    this.next = handler;
    return handler;
  }

  abstract handle(input: EvaluationStepInput): EvaluationResult;

  protected resolveVariation(
    input: EvaluationStepInput,
    variationKey: string,
    reason: EvaluationReason,
    extra: Partial<EvaluationResult> = {},
  ): EvaluationResult {
    const v =
      input.variationMap.get(variationKey) ??
      input.variationMap.get(input.config.defaultVariationKey) ??
      input.config.variations[0];
    return {
      flagKey: input.config.flagKey,
      variationKey: v ? v.key : variationKey,
      value: v ? v.value : null,
      reason,
      version: input.config.version,
      ...extra,
    };
  }
}

class KillSwitchHandler extends EvaluationHandler {
  handle(input: EvaluationStepInput): EvaluationResult {
    if (input.config.killSwitchActive || !input.config.enabled) {
      return this.resolveVariation(input, input.config.offVariationKey, 'KILL_SWITCH');
    }
    return this.next!.handle(input);
  }
}

class IndividualTargetHandler extends EvaluationHandler {
  handle(input: EvaluationStepInput): EvaluationResult {
    const targetVar = input.config.individualTargets[input.context.userKey];
    if (targetVar) {
      return this.resolveVariation(input, targetVar, 'INDIVIDUAL_TARGET');
    }
    return this.next!.handle(input);
  }
}

class SegmentRuleHandler extends EvaluationHandler {
  handle(input: EvaluationStepInput): EvaluationResult {
    if (input.config.rules && input.config.rules.length > 0) {
      const sorted = [...input.config.rules].sort((a, b) => a.priority - b.priority);
      const visitor = new RuleEvaluatorVisitor(input.context, input.segments);
      for (const rule of sorted) {
        if (visitor.evaluate(rule.rootRule)) {
          return this.resolveVariation(input, rule.variationKey, 'SEGMENT_RULE', {
            matchedRuleId: rule.id,
            matchedRuleName: rule.name,
          });
        }
      }
    }
    return this.next!.handle(input);
  }
}

class PercentageRolloutHandler extends EvaluationHandler {
  handle(input: EvaluationStepInput): EvaluationResult {
    const { config, context } = input;
    const bucket = computeDeterministicBucket(config.flagKey, context.userKey);

    if (config.rolloutAllocations && config.rolloutAllocations.length > 0) {
      let cumulative = 0;
      for (const alloc of config.rolloutAllocations) {
        cumulative += alloc.weight;
        if (bucket < cumulative) {
          return this.resolveVariation(input, alloc.variationKey, 'PERCENTAGE_ROLLOUT', {
            bucket,
          });
        }
      }
    } else if (config.rolloutPercentage > 0 && config.rolloutVariationKey) {
      if (bucket < config.rolloutPercentage) {
        return this.resolveVariation(input, config.rolloutVariationKey, 'PERCENTAGE_ROLLOUT', {
          bucket,
        });
      }
      return this.resolveVariation(input, config.defaultVariationKey, 'PERCENTAGE_ROLLOUT', {
        bucket,
      });
    }

    return this.next!.handle(input);
  }
}

class DefaultVariationHandler extends EvaluationHandler {
  handle(input: EvaluationStepInput): EvaluationResult {
    return this.resolveVariation(input, input.config.defaultVariationKey, 'DEFAULT');
  }
}

const killHandler = new KillSwitchHandler();
const targetHandler = new IndividualTargetHandler();
const ruleHandler = new SegmentRuleHandler();
const rolloutHandler = new PercentageRolloutHandler();
const defaultHandler = new DefaultVariationHandler();

killHandler
  .setNext(targetHandler)
  .setNext(ruleHandler)
  .setNext(rolloutHandler)
  .setNext(defaultHandler);

export function evaluateFlag(
  config: FlagEvaluationConfig,
  context: EvaluationContext,
  segments: Map<string, UserSegmentDefinition> = new Map(),
): EvaluationResult {
  const variationMap = new Map<string, FlagVariationDefinition>();
  for (const v of config.variations) {
    variationMap.set(v.key, v);
  }
  return killHandler.handle({
    config,
    context,
    segments,
    variationMap,
  });
}

// ---------- Statistical Analytics Helpers (SRM + Z-test) ----------

function normalCdf(z: number): number {
  // Abramowitz & Stegun approximation for standard normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp((-z * z) / 2);
  const prob =
    d *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - prob : prob;
}

/**
 * Chi-square Goodness-of-Fit test for Sample Ratio Mismatch (SRM).
 * Flags mismatch when p-value < 0.001 (or chiSquare > 10.83 for df=1).
 */
export function calculateSrm(
  observedCounts: number[],
  expectedWeights: number[],
): { chiSquare: number; pValue: number; mismatchDetected: boolean } {
  const totalObserved = observedCounts.reduce((acc, v) => acc + v, 0);
  const totalWeight = expectedWeights.reduce((acc, v) => acc + v, 0);
  if (totalObserved === 0 || totalWeight <= 0 || observedCounts.length < 2) {
    return { chiSquare: 0, pValue: 1, mismatchDetected: false };
  }

  let chiSquare = 0;
  for (let i = 0; i < observedCounts.length; i++) {
    const expected = (expectedWeights[i] / totalWeight) * totalObserved;
    if (expected > 0) {
      const diff = observedCounts[i] - expected;
      chiSquare += (diff * diff) / expected;
    }
  }

  // Approximate p-value for df = k - 1 using Wilson-Hilferty transformation
  const df = observedCounts.length - 1;
  let pValue = 1;
  if (chiSquare > 0) {
    if (df === 1) {
      pValue = 2 * (1 - normalCdf(Math.sqrt(chiSquare)));
    } else {
      const z =
        (Math.pow(chiSquare / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
      pValue = 1 - normalCdf(z);
    }
  }

  return {
    chiSquare: Number(chiSquare.toFixed(4)),
    pValue: Number(Math.max(0, Math.min(1, pValue)).toFixed(6)),
    mismatchDetected: totalObserved >= 100 && pValue < 0.001,
  };
}

/**
 * Two-proportion two-tailed Z-test for experiment conversion rate significance.
 */
export function calculateTwoProportionZTest(
  controlExposures: number,
  controlConversions: number,
  treatmentExposures: number,
  treatmentConversions: number,
): { zScore: number; pValue: number; significant: boolean; upliftPercent: number } {
  if (controlExposures <= 0 || treatmentExposures <= 0) {
    return { zScore: 0, pValue: 1, significant: false, upliftPercent: 0 };
  }
  const p1 = controlConversions / controlExposures;
  const p2 = treatmentConversions / treatmentExposures;
  const upliftPercent = p1 > 0 ? ((p2 - p1) / p1) * 100 : 0;

  const pPool = (controlConversions + treatmentConversions) / (controlExposures + treatmentExposures);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / controlExposures + 1 / treatmentExposures));
  if (se === 0) {
    return { zScore: 0, pValue: 1, significant: false, upliftPercent: Number(upliftPercent.toFixed(2)) };
  }
  const z = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    zScore: Number(z.toFixed(3)),
    pValue: Number(Math.max(0, Math.min(1, pValue)).toFixed(4)),
    significant: pValue < 0.05 && controlExposures >= 30 && treatmentExposures >= 30,
    upliftPercent: Number(upliftPercent.toFixed(2)),
  };
}
