package io.flagship.sdk;

import io.flagship.shared.model.EvaluationContext;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import java.lang.reflect.Method;

@Aspect
public class FeatureFlagAspect {
    private final FlagShipClient client;

    public FeatureFlagAspect(FlagShipClient client) {
        this.client = client;
    }

    @Around("@annotation(featureFlag)")
    public Object guardMethod(ProceedingJoinPoint pjp, FeatureFlag featureFlag) throws Throwable {
        EvaluationContext ctx = EvaluationContext.builder("anonymous").build();
        boolean enabled = client.isEnabled(featureFlag.value(), ctx, featureFlag.defaultValue());
        if (enabled) {
            return pjp.proceed();
        }
        return switch (featureFlag.onDisabled()) {
            case THROW_EXCEPTION -> throw new IllegalStateException("Feature flag disabled: " + featureFlag.value());
            case FALLBACK_METHOD -> invokeFallback(pjp, featureFlag.fallbackMethod());
            case RETURN_NULL -> null;
        };
    }

    private Object invokeFallback(ProceedingJoinPoint pjp, String fallbackName) throws Throwable {
        if (fallbackName == null || fallbackName.isBlank()) {
            return null;
        }
        MethodSignature sig = (MethodSignature) pjp.getSignature();
        Method fallback = pjp.getTarget().getClass().getMethod(fallbackName, sig.getParameterTypes());
        return fallback.invoke(pjp.getTarget(), pjp.getArgs());
    }
}
