package io.flagship.sdk;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@EnableConfigurationProperties(FlagShipProperties.class)
@ConditionalOnProperty(prefix = "flagship", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FlagShipAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public SnapshotStore flagShipSnapshotStore(FlagShipProperties props, ObjectMapper mapper) {
        return new SnapshotStore(props.getSnapshotFile(), mapper);
    }

    @Bean
    @ConditionalOnMissingBean
    public MeterRegistry flagShipFallbackMeterRegistry() {
        return new SimpleMeterRegistry();
    }

    @Bean
    @ConditionalOnMissingBean(FlagShipClient.class)
    public DefaultFlagShipClient flagShipClient(
        FlagShipProperties props,
        SnapshotStore store,
        ObjectMapper mapper,
        MeterRegistry registry
    ) {
        return new DefaultFlagShipClient(props, store, mapper, registry);
    }

    @Bean
    @ConditionalOnMissingBean
    public FeatureFlagAspect featureFlagAspect(FlagShipClient client) {
        return new FeatureFlagAspect(client);
    }

    @Bean
    @ConditionalOnMissingBean
    public FlagShipEndpoint flagShipActuatorEndpoint(DefaultFlagShipClient client) {
        return new FlagShipEndpoint(client);
    }
}
