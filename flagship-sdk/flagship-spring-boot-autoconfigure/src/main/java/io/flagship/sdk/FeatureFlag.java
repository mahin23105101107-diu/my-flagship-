package io.flagship.sdk;

import java.lang.annotation.*;

@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface FeatureFlag {
    String value();
    boolean defaultValue() default false;
    DisabledBehavior onDisabled() default DisabledBehavior.RETURN_NULL;
    String fallbackMethod() default "";

    enum DisabledBehavior {
        RETURN_NULL,
        THROW_EXCEPTION,
        FALLBACK_METHOD
    }
}
