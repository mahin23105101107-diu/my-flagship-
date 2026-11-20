package io.flagship.shared.model;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Builder Pattern: Constructs immutable EvaluationContext instances for flag evaluation.
 */
public final class EvaluationContext {
    private final String userKey;
    private final Map<String, Object> attributes;

    private EvaluationContext(String userKey, Map<String, Object> attributes) {
        this.userKey = Objects.requireNonNull(userKey, "userKey must not be null");
        this.attributes = Collections.unmodifiableMap(new HashMap<>(attributes));
    }

    public String getUserKey() {
        return userKey;
    }

    public Map<String, Object> getAttributes() {
        return attributes;
    }

    public Object getAttribute(String key) {
        return "userKey".equals(key) ? userKey : attributes.get(key);
    }

    public static Builder builder(String userKey) {
        return new Builder(userKey);
    }

    public static final class Builder {
        private final String userKey;
        private final Map<String, Object> attributes = new HashMap<>();

        private Builder(String userKey) {
            this.userKey = userKey;
        }

        public Builder attribute(String key, Object value) {
            if (key != null && value != null) {
                this.attributes.put(key, value);
            }
            return this;
        }

        public Builder attributes(Map<String, Object> map) {
            if (map != null) {
                map.forEach(this::attribute);
            }
            return this;
        }

        public EvaluationContext build() {
            return new EvaluationContext(userKey, attributes);
        }
    }
}
