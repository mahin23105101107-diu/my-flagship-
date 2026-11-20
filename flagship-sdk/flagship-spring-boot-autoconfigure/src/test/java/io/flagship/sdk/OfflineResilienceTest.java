package io.flagship.sdk;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.flagship.shared.model.EvaluationContext;
import io.flagship.shared.model.FlagModels.*;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class OfflineResilienceTest {

    @Test
    void loadsSavedSnapshotWhenServerOfflineAndNeverThrows(@TempDir Path tempDir) {
        Path snapshotFile = tempDir.resolve("flagship-snapshot.json");
        ObjectMapper mapper = new ObjectMapper();
        SnapshotStore store = new SnapshotStore(snapshotFile.toString(), mapper);

        EnvironmentSnapshot saved = new EnvironmentSnapshot(
            "core-commerce", "production", 3L, "2026-11-18T00:00:00Z",
            Map.of(),
            Map.of("new-checkout", new FlagEvaluationConfig(
                "new-checkout", FlagType.BOOLEAN, true, false, "off", "off",
                100.0, "on", null,
                List.of(new FlagVariationDefinition("on", "On", true), new FlagVariationDefinition("off", "Off", false)),
                Map.of(), List.of(), 7L
            ))
        );
        store.save(saved);

        FlagShipProperties props = new FlagShipProperties();
        props.setServerUrl("http://127.0.0.1:59999"); // unreachable server
        props.setSdkKey("fs_prod_test");
        props.setStartupTimeoutMs(250);
        props.setSnapshotFile(snapshotFile.toString());
        props.setSseEnabled(false);

        DefaultFlagShipClient client = new DefaultFlagShipClient(props, store, mapper, new SimpleMeterRegistry());
        long start = System.currentTimeMillis();
        client.start();
        long elapsed = System.currentTimeMillis() - start;

        assertTrue(elapsed < 2000, "Startup exceeded 2s timeout: " + elapsed);
        assertTrue(client.isEnabled("new-checkout", EvaluationContext.builder("u-1").build(), false));
        assertFalse(client.isEnabled("missing-flag", EvaluationContext.builder("u-1").build(), false));
        client.shutdown();
    }
}
