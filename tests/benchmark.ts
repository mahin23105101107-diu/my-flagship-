import {
  EvaluationContextBuilder,
  evaluateFlag,
  type FlagEvaluationConfig,
  type RuleNode,
} from '../src/shared/engine.ts';

function build10RuleFlag(): FlagEvaluationConfig {
  const rules = Array.from({ length: 10 }, (_, idx) => ({
    id: `r-${idx}`,
    name: `Rule ${idx}`,
    priority: idx + 1,
    variationKey: 'on',
    rootRule: {
      kind: 'GROUP',
      operator: 'AND',
      children: [
        { kind: 'CONDITION', attribute: 'country', operator: 'EQUALS', value: `COUNTRY_${idx}` },
        { kind: 'CONDITION', attribute: 'appVersion', operator: 'SEMVER_GREATER_THAN', value: '1.0.0' },
      ],
    } as RuleNode,
  }));

  return {
    flagKey: 'perf-flag-10-rules',
    type: 'BOOLEAN',
    enabled: true,
    killSwitchActive: false,
    defaultVariationKey: 'off',
    offVariationKey: 'off',
    rolloutPercentage: 25,
    rolloutVariationKey: 'on',
    variations: [
      { key: 'on', name: 'On', value: true },
      { key: 'off', name: 'Off', value: false },
    ],
    individualTargets: { 'vip-user-0': 'on' },
    rules,
    version: 1,
  };
}

function runBenchmarks() {
  console.log('=== FlagShip Quality Attribute Benchmarks (QA1 & QA4) ===\n');

  // 1. QA1 Latency Benchmark (10 rules, 100,000 evaluations)
  const flag = build10RuleFlag();
  const ctx = EvaluationContextBuilder.create('bench-user-42')
    .attribute('country', 'NO_MATCH')
    .attribute('appVersion', '2.1.0')
    .build();

  // Warmup JIT
  for (let i = 0; i < 10_000; i++) {
    evaluateFlag(flag, ctx);
  }

  const samples = 100_000;
  const latenciesUs = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    evaluateFlag(flag, ctx);
    latenciesUs[i] = (performance.now() - t0) * 1000;
  }
  latenciesUs.sort();
  const p50 = latenciesUs[Math.floor(samples * 0.5)];
  const p95 = latenciesUs[Math.floor(samples * 0.95)];
  const p99 = latenciesUs[Math.floor(samples * 0.99)];

  console.log(`[QA1 Speed - 10 Rules, ${samples.toLocaleString()} iterations]`);
  console.log(`  p50: ${p50.toFixed(2)} us`);
  console.log(`  p95: ${p95.toFixed(2)} us`);
  console.log(`  p99: ${p99.toFixed(2)} us (Target: <= 50 us)`);

  // 2. QA1 Heap footprint with 1,000 flags
  const beforeHeap = process.memoryUsage().heapUsed;
  const flagCache = new Map<string, FlagEvaluationConfig>();
  for (let i = 0; i < 1000; i++) {
    flagCache.set(`flag-${i}`, { ...flag, flagKey: `flag-${i}` });
  }
  const afterHeap = process.memoryUsage().heapUsed;
  const heapDeltaMb = (afterHeap - beforeHeap) / (1024 * 1024);
  console.log(`\n[QA1 Memory - 1,000 Cached Flags]`);
  console.log(`  Heap Delta: ${heapDeltaMb.toFixed(2)} MB (Target: <= 20 MB)`);

  // 3. QA4 Consistency & Cohort Preservation across 1,000,000 user keys
  const flag10: FlagEvaluationConfig = {
    ...flag,
    flagKey: 'qa4-consistency-flag',
    rules: [],
    individualTargets: {},
    rolloutPercentage: 10,
  };
  const flag20: FlagEvaluationConfig = { ...flag10, rolloutPercentage: 20 };

  const totalKeys = 1_000_000;
  let count10 = 0;
  let count20 = 0;
  let cohortViolations = 0;

  const tStart = performance.now();
  for (let i = 0; i < totalKeys; i++) {
    const userCtx = EvaluationContextBuilder.create(`user-${i}`).build();
    const r10 = evaluateFlag(flag10, userCtx).value === true;
    const r20 = evaluateFlag(flag20, userCtx).value === true;
    if (r10) {
      count10++;
      if (!r20) cohortViolations++;
    }
    if (r20) count20++;
  }
  const elapsedMs = performance.now() - tStart;

  console.log(`\n[QA4 Consistency & Cohort Preservation - ${totalKeys.toLocaleString()} User Keys]`);
  console.log(`  Elapsed Time: ${elapsedMs.toFixed(1)} ms`);
  console.log(`  10% Rollout Count: ${count10.toLocaleString()} (${((count10 / totalKeys) * 100).toFixed(3)}%)`);
  console.log(`  20% Rollout Count: ${count20.toLocaleString()} (${((count20 / totalKeys) * 100).toFixed(3)}%)`);
  console.log(`  10% -> 20% Cohort Violations: ${cohortViolations}`);

  if (cohortViolations > 0) {
    process.exit(1);
  }
}

runBenchmarks();
