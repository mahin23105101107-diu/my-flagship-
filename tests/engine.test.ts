import { describe, it, expect } from 'vitest';
import {
  EvaluationContextBuilder,
  evaluateFlag,
  computeDeterministicBucket,
  calculateSrm,
  calculateTwoProportionZTest,
  type FlagEvaluationConfig,
  type UserSegmentDefinition,
} from '../src/shared/engine.ts';

function buildBaseFlag(overrides: Partial<FlagEvaluationConfig> = {}): FlagEvaluationConfig {
  return {
    flagKey: 'new-checkout',
    type: 'BOOLEAN',
    enabled: true,
    killSwitchActive: false,
    defaultVariationKey: 'off',
    offVariationKey: 'off',
    rolloutPercentage: 0,
    rolloutVariationKey: 'on',
    variations: [
      { key: 'on', name: 'On', value: true },
      { key: 'off', name: 'Off', value: false },
    ],
    individualTargets: {},
    rules: [],
    version: 1,
    ...overrides,
  };
}

describe('FlagShip Evaluation Engine & Design Patterns', () => {
  it('enforces Chain of Responsibility order: KillSwitch > IndividualTarget > SegmentRule > Rollout > Default', () => {
    const segments = new Map<string, UserSegmentDefinition>([
      [
        'beta',
        {
          key: 'beta',
          name: 'Beta',
          rootRule: {
            kind: 'GROUP',
            operator: 'AND',
            children: [{ kind: 'CONDITION', attribute: 'plan', operator: 'EQUALS', value: 'enterprise' }],
          },
        },
      ],
    ]);

    const flag = buildBaseFlag({
      killSwitchActive: true,
      individualTargets: { 'u-1': 'on' },
      rules: [
        {
          id: 'r1',
          name: 'Enterprise Rule',
          priority: 1,
          variationKey: 'on',
          rootRule: { kind: 'SEGMENT_REF', segmentKey: 'beta' },
        },
      ],
      rolloutPercentage: 100,
    });

    const ctx = EvaluationContextBuilder.create('u-1').attribute('plan', 'enterprise').build();

    // 1. Kill switch overrides everything
    const killRes = evaluateFlag(flag, ctx, segments);
    expect(killRes.reason).toBe('KILL_SWITCH');
    expect(killRes.value).toBe(false);

    // 2. Individual target overrides rules and rollout when kill switch is off
    const targetRes = evaluateFlag({ ...flag, killSwitchActive: false }, ctx, segments);
    expect(targetRes.reason).toBe('INDIVIDUAL_TARGET');
    expect(targetRes.value).toBe(true);

    // 3. Segment rule matches when user is not individually targeted
    const ctx2 = EvaluationContextBuilder.create('u-2').attribute('plan', 'enterprise').build();
    const ruleRes = evaluateFlag({ ...flag, killSwitchActive: false }, ctx2, segments);
    expect(ruleRes.reason).toBe('SEGMENT_RULE');
    expect(ruleRes.value).toBe(true);

    // 4. Percentage rollout applies when no rules match
    const ctx3 = EvaluationContextBuilder.create('u-3').attribute('plan', 'free').build();
    const rolloutRes = evaluateFlag({ ...flag, killSwitchActive: false }, ctx3, segments);
    expect(rolloutRes.reason).toBe('PERCENTAGE_ROLLOUT');
    expect(rolloutRes.value).toBe(true);

    // 5. Default fallback when rollout is 0%
    const defaultRes = evaluateFlag(
      { ...flag, killSwitchActive: false, rolloutPercentage: 0 },
      ctx3,
      segments,
    );
    expect(defaultRes.reason).toBe('DEFAULT');
    expect(defaultRes.value).toBe(false);
  });

  it('evaluates all 8 targeting operators and nested AND/OR Composite rule trees', () => {
    const flag = buildBaseFlag({
      rules: [
        {
          id: 'complex',
          name: 'Complex Nested Rule',
          priority: 1,
          variationKey: 'on',
          rootRule: {
            kind: 'GROUP',
            operator: 'AND',
            children: [
              { kind: 'CONDITION', attribute: 'country', operator: 'IN', value: 'US,CA,DE' },
              { kind: 'CONDITION', attribute: 'tier', operator: 'NOT_EQUALS', value: 'blocked' },
              { kind: 'CONDITION', attribute: 'appVersion', operator: 'SEMVER_GREATER_THAN', value: '2.4.0' },
              { kind: 'CONDITION', attribute: 'email', operator: 'REGEX', value: '^.*@acme\\.io$' },
              { kind: 'CONDITION', attribute: 'bio', operator: 'CONTAINS', value: 'early' },
              {
                kind: 'GROUP',
                operator: 'OR',
                children: [
                  { kind: 'CONDITION', attribute: 'signupDate', operator: 'DATE_BEFORE', value: '2026-01-01T00:00:00Z' },
                  { kind: 'CONDITION', attribute: 'promoDate', operator: 'DATE_AFTER', value: '2026-06-01T00:00:00Z' },
                ],
              },
            ],
          },
        },
      ],
    });

    const matchingCtx = EvaluationContextBuilder.create('u-100')
      .attribute('country', 'CA')
      .attribute('tier', 'pro')
      .attribute('appVersion', '2.10.0')
      .attribute('email', 'alice@acme.io')
      .attribute('bio', 'Early Adopter')
      .attribute('signupDate', '2025-10-15T00:00:00Z')
      .attribute('promoDate', '2026-02-01T00:00:00Z')
      .build();

    expect(evaluateFlag(flag, matchingCtx).value).toBe(true);

    const failingSemver = EvaluationContextBuilder.create('u-100')
      .attributes({ ...matchingCtx.attributes, appVersion: '2.3.9' })
      .build();
    expect(evaluateFlag(flag, failingSemver).value).toBe(false);
  });

  it('preserves 100% of the 10% cohort when increasing rollout to 20% and keeps flags independent', () => {
    const flag10 = buildBaseFlag({ flagKey: 'checkout-v3', rolloutPercentage: 10 });
    const flag20 = buildBaseFlag({ flagKey: 'checkout-v3', rolloutPercentage: 20 });

    const in10 = new Set<string>();
    const in20 = new Set<string>();

    for (let i = 0; i < 10_000; i++) {
      const ctx = EvaluationContextBuilder.create(`user-${i}`).build();
      if (evaluateFlag(flag10, ctx).value === true) in10.add(`user-${i}`);
      if (evaluateFlag(flag20, ctx).value === true) in20.add(`user-${i}`);
    }

    for (const u of in10) {
      expect(in20.has(u)).toBe(true);
    }

    // Verify independent assignment across different flag keys
    const b1 = computeDeterministicBucket('flag-alpha', 'user-42');
    const b2 = computeDeterministicBucket('flag-beta', 'user-42');
    expect(b1).not.toBe(b2);
  });

  it('computes Chi-Square SRM detection and Z-test significance accurately', () => {
    const balancedSrm = calculateSrm([502, 498], [50, 50]);
    expect(balancedSrm.mismatchDetected).toBe(false);

    const skewedSrm = calculateSrm([720, 280], [50, 50]);
    expect(skewedSrm.mismatchDetected).toBe(true);
    expect(skewedSrm.pValue).toBeLessThan(0.001);

    const sig = calculateTwoProportionZTest(1000, 100, 1000, 180);
    expect(sig.significant).toBe(true);
    expect(sig.upliftPercent).toBe(80);
  });
});
