package io.flagship.shared.engine;

import io.flagship.shared.model.EvaluationContext;
import io.flagship.shared.model.FlagModels.*;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Shared FlagShip Evaluation Engine implementing:
 * - Strategy Pattern (8 extensible targeting operators + MurmurHash3 bucketing)
 * - Composite + Visitor Pattern (nested AND/OR rule evaluation)
 * - Chain of Responsibility (KillSwitch -> IndividualTarget -> SegmentRules -> PercentageRollout -> Default)
 */
public final class FlagEvaluationEngine {

    @FunctionalInterface
    public interface OperatorStrategy {
        boolean matches(Object actual, String expected);
    }

    private static final Map<OperatorType, OperatorStrategy> OPERATORS = new EnumMap<>(OperatorType.class);

    static {
        OPERATORS.put(OperatorType.EQUALS, (actual, expected) ->
            actual != null && String.valueOf(actual).trim().equals(expected.trim()));
        OPERATORS.put(OperatorType.NOT_EQUALS, (actual, expected) ->
            actual != null && !String.valueOf(actual).trim().equals(expected.trim()));
        OPERATORS.put(OperatorType.IN, (actual, expected) -> {
            if (actual == null) return false;
            String actualStr = String.valueOf(actual).trim();
            for (String item : expected.split(",")) {
                if (item.trim().equals(actualStr)) return true;
            }
            return false;
        });
        OPERATORS.put(OperatorType.CONTAINS, (actual, expected) ->
            actual != null && String.valueOf(actual).toLowerCase().contains(expected.toLowerCase()));
        OPERATORS.put(OperatorType.SEMVER_GREATER_THAN, (actual, expected) ->
            actual != null && compareSemver(String.valueOf(actual), expected) > 0);
        OPERATORS.put(OperatorType.REGEX, (actual, expected) -> {
            if (actual == null) return false;
            try {
                return Pattern.compile(expected).matcher(String.valueOf(actual)).find();
            } catch (Exception ex) {
                return false;
            }
        });
        OPERATORS.put(OperatorType.DATE_BEFORE, (actual, expected) -> compareIsoDates(actual, expected) < 0);
        OPERATORS.put(OperatorType.DATE_AFTER, (actual, expected) -> compareIsoDates(actual, expected) > 0);
    }

    public EvaluationResult evaluate(
        FlagEvaluationConfig config,
        EvaluationContext context,
        Map<String, UserSegmentDefinition> segments
    ) {
        Map<String, FlagVariationDefinition> varMap = new HashMap<>();
        if (config.variations() != null) {
            for (FlagVariationDefinition v : config.variations()) {
                varMap.put(v.key(), v);
            }
        }

        // Step 1: Kill Switch
        if (config.killSwitchActive() || !config.enabled()) {
            return resolve(config, varMap, config.offVariationKey(), EvaluationReason.KILL_SWITCH, null, null);
        }

        // Step 2: Individual User Targets
        if (config.individualTargets() != null) {
            String targetVar = config.individualTargets().get(context.getUserKey());
            if (targetVar != null) {
                return resolve(config, varMap, targetVar, EvaluationReason.INDIVIDUAL_TARGET, null, null);
            }
        }

        // Step 3: Priority-ordered Segment & Composite Rules
        if (config.rules() != null && !config.rules().isEmpty()) {
            List<TargetingRuleDefinition> sorted = new ArrayList<>(config.rules());
            sorted.sort(Comparator.comparingInt(TargetingRuleDefinition::priority));
            RuleEvaluatorVisitor visitor = new RuleEvaluatorVisitor(context, segments);
            for (TargetingRuleDefinition rule : sorted) {
                if (visitor.evaluate(rule.rootRule())) {
                    return resolve(config, varMap, rule.variationKey(), EvaluationReason.SEGMENT_RULE, rule.name(), null);
                }
            }
        }

        // Step 4: Deterministic Percentage Rollout
        double bucket = MurmurHash3.computeBucket(config.flagKey(), context.getUserKey());
        if (config.rolloutAllocations() != null && !config.rolloutAllocations().isEmpty()) {
            double cumulative = 0.0;
            for (RolloutAllocation alloc : config.rolloutAllocations()) {
                cumulative += alloc.weight();
                if (bucket < cumulative) {
                    return resolve(config, varMap, alloc.variationKey(), EvaluationReason.PERCENTAGE_ROLLOUT, null, bucket);
                }
            }
        } else if (config.rolloutPercentage() > 0 && config.rolloutVariationKey() != null) {
            String chosen = bucket < config.rolloutPercentage()
                ? config.rolloutVariationKey()
                : config.defaultVariationKey();
            return resolve(config, varMap, chosen, EvaluationReason.PERCENTAGE_ROLLOUT, null, bucket);
        }

        // Step 5: Default Variation
        return resolve(config, varMap, config.defaultVariationKey(), EvaluationReason.DEFAULT, null, null);
    }

    private EvaluationResult resolve(
        FlagEvaluationConfig config,
        Map<String, FlagVariationDefinition> varMap,
        String variationKey,
        EvaluationReason reason,
        String ruleName,
        Double bucket
    ) {
        FlagVariationDefinition v = varMap.getOrDefault(
            variationKey,
            varMap.get(config.defaultVariationKey())
        );
        return new EvaluationResult(
            config.flagKey(),
            v != null ? v.key() : variationKey,
            v != null ? v.value() : null,
            reason,
            ruleName,
            bucket,
            config.version()
        );
    }

    private static final class RuleEvaluatorVisitor {
        private final EvaluationContext context;
        private final Map<String, UserSegmentDefinition> segments;
        private final Set<String> visitedSegments = new HashSet<>();

        private RuleEvaluatorVisitor(EvaluationContext context, Map<String, UserSegmentDefinition> segments) {
            this.context = context;
            this.segments = segments != null ? segments : Map.of();
        }

        public boolean evaluate(RuleNode node) {
            if (node instanceof RuleGroupNode group) {
                if (group.children() == null || group.children().isEmpty()) return false;
                if (group.operator() == LogicalOperator.AND) {
                    return group.children().stream().allMatch(this::evaluate);
                }
                return group.children().stream().anyMatch(this::evaluate);
            }
            if (node instanceof ConditionLeafNode leaf) {
                OperatorStrategy strategy = OPERATORS.get(leaf.operator());
                if (strategy == null) return false;
                return strategy.matches(context.getAttribute(leaf.attribute()), leaf.value());
            }
            if (node instanceof SegmentRefNode ref) {
                if (!visitedSegments.add(ref.segmentKey())) return false;
                try {
                    UserSegmentDefinition seg = segments.get(ref.segmentKey());
                    return seg != null && evaluate(seg.rootRule());
                } finally {
                    visitedSegments.remove(ref.segmentKey());
                }
            }
            return false;
        }
    }

    private static int compareSemver(String a, String b) {
        try {
            int[] pa = parseSemver(a);
            int[] pb = parseSemver(b);
            for (int i = 0; i < 3; i++) {
                if (pa[i] != pb[i]) return Integer.compare(pa[i], pb[i]);
            }
            return 0;
        } catch (Exception ex) {
            return -1;
        }
    }

    private static int[] parseSemver(String v) {
        String cleaned = v.trim().replaceFirst("^[vV]", "").split("-")[0];
        String[] parts = cleaned.split("\\.");
        int[] out = new int[3];
        for (int i = 0; i < Math.min(3, parts.length); i++) {
            out[i] = Integer.parseInt(parts[i]);
        }
        return out;
    }

    private static int compareIsoDates(Object actual, String expected) {
        if (actual == null) return 0;
        try {
            Instant a = Instant.parse(String.valueOf(actual));
            Instant b = Instant.parse(expected);
            return a.compareTo(b);
        } catch (Exception ex) {
            return 0;
        }
    }
}
