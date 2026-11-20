package io.flagship.shared.model;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;
import java.util.Map;

public final class FlagModels {
    private FlagModels() {}

    public enum FlagType { BOOLEAN, STRING, NUMBER, JSON }

    public enum OperatorType {
        EQUALS, NOT_EQUALS, IN, CONTAINS, SEMVER_GREATER_THAN, REGEX, DATE_BEFORE, DATE_AFTER
    }

    public enum LogicalOperator { AND, OR }

    public enum EvaluationReason {
        KILL_SWITCH, INDIVIDUAL_TARGET, SEGMENT_RULE, PERCENTAGE_ROLLOUT, DEFAULT, OFFLINE_DEFAULT
    }

    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
    @JsonSubTypes({
        @JsonSubTypes.Type(value = RuleGroupNode.class, name = "GROUP"),
        @JsonSubTypes.Type(value = ConditionLeafNode.class, name = "CONDITION"),
        @JsonSubTypes.Type(value = SegmentRefNode.class, name = "SEGMENT_REF")
    })
    public sealed interface RuleNode permits RuleGroupNode, ConditionLeafNode, SegmentRefNode {}

    public record RuleGroupNode(LogicalOperator operator, List<RuleNode> children) implements RuleNode {}
    public record ConditionLeafNode(String attribute, OperatorType operator, String value) implements RuleNode {}
    public record SegmentRefNode(String segmentKey) implements RuleNode {}

    public record UserSegmentDefinition(String key, String name, RuleNode rootRule) {}
    public record TargetingRuleDefinition(String id, String name, int priority, String variationKey, RuleNode rootRule) {}
    public record FlagVariationDefinition(String key, String name, Object value) {}
    public record RolloutAllocation(String variationKey, double weight) {}

    public record FlagEvaluationConfig(
        String flagKey,
        FlagType type,
        boolean enabled,
        boolean killSwitchActive,
        String defaultVariationKey,
        String offVariationKey,
        double rolloutPercentage,
        String rolloutVariationKey,
        List<RolloutAllocation> rolloutAllocations,
        List<FlagVariationDefinition> variations,
        Map<String, String> individualTargets,
        List<TargetingRuleDefinition> rules,
        long version
    ) {}

    public record EvaluationResult(
        String flagKey,
        String variationKey,
        Object value,
        EvaluationReason reason,
        String matchedRuleName,
        Double bucket,
        long version
    ) {}

    public record EnvironmentSnapshot(
        String projectKey,
        String environmentKey,
        long environmentId,
        String generatedAt,
        Map<String, UserSegmentDefinition> segments,
        Map<String, FlagEvaluationConfig> flags
    ) {}
}
