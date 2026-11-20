package io.flagship.shared.engine;

import io.flagship.shared.model.EvaluationContext;
import io.flagship.shared.model.FlagModels.*;
import org.junit.jupiter.api.Test;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class FlagEvaluationEngineTest {

    private final FlagEvaluationEngine engine = new FlagEvaluationEngine();

    @Test
    void millionUserRolloutPreservesCohortAndMatches10To20Percent() {
        List<FlagVariationDefinition> vars = List.of(
            new FlagVariationDefinition("on", "On", true),
            new FlagVariationDefinition("off", "Off", false)
        );
        FlagEvaluationConfig cfg10 = new FlagEvaluationConfig(
            "checkout-v2", FlagType.BOOLEAN, true, false, "off", "off",
            10.0, "on", null, vars, Map.of(), List.of(), 1
        );
        FlagEvaluationConfig cfg20 = new FlagEvaluationConfig(
            "checkout-v2", FlagType.BOOLEAN, true, false, "off", "off",
            20.0, "on", null, vars, Map.of(), List.of(), 2
        );

        Set<String> cohort10 = new HashSet<>();
        int count20 = 0;
        for (int i = 0; i < 1_000_000; i++) {
            String key = "user-" + i;
            EvaluationContext ctx = EvaluationContext.builder(key).build();
            boolean in10 = Boolean.TRUE.equals(engine.evaluate(cfg10, ctx, Map.of()).value());
            boolean in20 = Boolean.TRUE.equals(engine.evaluate(cfg20, ctx, Map.of()).value());
            if (in10) {
                cohort10.add(key);
                assertTrue(in20, "Cohort violation for " + key);
            }
            if (in20) count20++;
        }

        assertTrue(cohort10.size() > 95_000 && cohort10.size() < 105_000);
        assertTrue(count20 > 195_000 && count20 < 205_000);
    }
}
