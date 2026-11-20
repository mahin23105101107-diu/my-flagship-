package io.flagship.sdk;

import io.flagship.shared.model.EvaluationContext;
import io.flagship.shared.model.FlagModels.EvaluationResult;
import java.util.Map;

public interface FlagShipClient {
    boolean isEnabled(String flagKey, EvaluationContext context);
    boolean isEnabled(String flagKey, EvaluationContext context, boolean defaultValue);
    String getString(String flagKey, EvaluationContext context, String defaultValue);
    Number getNumber(String flagKey, EvaluationContext context, Number defaultValue);
    Map<String, Object> getJson(String flagKey, EvaluationContext context, Map<String, Object> defaultValue);
    Object getValue(String flagKey, EvaluationContext context, Object defaultValue);
    EvaluationResult evaluate(String flagKey, EvaluationContext context, Object defaultValue);
    void trackConversion(String flagKey, String eventName, EvaluationContext context, double value);
}
