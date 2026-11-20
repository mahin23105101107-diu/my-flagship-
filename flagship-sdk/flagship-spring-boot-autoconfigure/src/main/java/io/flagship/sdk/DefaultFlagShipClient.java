package io.flagship.sdk;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.flagship.shared.engine.FlagEvaluationEngine;
import io.flagship.shared.model.EvaluationContext;
import io.flagship.shared.model.FlagModels.*;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Proxy / Decorator & Offline-Resilient FlagShip SDK Client:
 * - In-memory AtomicReference snapshot cache (< 50 us evaluation)
 * - Disk snapshot fallback on startup (< 2s timeout)
 * - Live SSE stream + automatic polling fallback + Micrometer instrumentation
 */
public class DefaultFlagShipClient implements FlagShipClient {
    private static final Logger log = LoggerFactory.getLogger(DefaultFlagShipClient.class);

    private final FlagShipProperties properties;
    private final SnapshotStore snapshotStore;
    private final ObjectMapper objectMapper;
    private final FlagEvaluationEngine engine = new FlagEvaluationEngine();
    private final HttpClient httpClient;
    private final AtomicReference<EnvironmentSnapshot> cache = new AtomicReference<>();
    private final AtomicBoolean sseConnected = new AtomicBoolean(false);
    private final AtomicReference<String> lastSyncAt = new AtomicReference<>("never");
    private final ConcurrentLinkedQueue<Map<String, Object>> exposureBuffer = new ConcurrentLinkedQueue<>();
    private final ConcurrentLinkedQueue<Map<String, Object>> conversionBuffer = new ConcurrentLinkedQueue<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);
    private final ExecutorService sseExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean running = true;

    private final Timer evalTimer;
    private final Counter offlineFallbackCounter;

    public DefaultFlagShipClient(
        FlagShipProperties properties,
        SnapshotStore snapshotStore,
        ObjectMapper objectMapper,
        MeterRegistry meterRegistry
    ) {
        this.properties = properties;
        this.snapshotStore = snapshotStore;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(properties.getStartupTimeoutMs()))
            .build();
        this.evalTimer = Timer.builder("flagship.sdk.evaluate").register(meterRegistry);
        this.offlineFallbackCounter = Counter.builder("flagship.sdk.offline_fallback").register(meterRegistry);
    }

    @PostConstruct
    public void start() {
        // 1. Load saved local snapshot immediately for instant offline readiness
        snapshotStore.load().ifPresent(cache::set);

        // 2. Attempt initial server sync bounded strictly by startupTimeoutMs (<= 2000ms)
        try {
            CompletableFuture.runAsync(this::fetchSnapshot)
                .get(properties.getStartupTimeoutMs(), TimeUnit.MILLISECONDS);
        } catch (Exception ex) {
            log.warn("FlagShip initial sync timed out or offline ({}ms); running on cached snapshot.",
                properties.getStartupTimeoutMs());
        }

        // 3. Start SSE listener and periodic polling fallback + event flushing
        if (properties.isSseEnabled()) {
            sseExecutor.submit(this::runSseLoop);
        }
        scheduler.scheduleAtFixedRate(
            this::safePollAndHeartbeat,
            properties.getPollingFallbackIntervalMs(),
            properties.getPollingFallbackIntervalMs(),
            TimeUnit.MILLISECONDS
        );
        scheduler.scheduleAtFixedRate(
            this::flushEvents,
            properties.getEventFlushIntervalMs(),
            properties.getEventFlushIntervalMs(),
            TimeUnit.MILLISECONDS
        );
    }

    @PreDestroy
    public void shutdown() {
        running = false;
        flushEvents();
        scheduler.shutdownNow();
        sseExecutor.shutdownNow();
    }

    @Override
    public boolean isEnabled(String flagKey, EvaluationContext context) {
        return isEnabled(flagKey, context, false);
    }

    @Override
    public boolean isEnabled(String flagKey, EvaluationContext context, boolean defaultValue) {
        Object val = getValue(flagKey, context, defaultValue);
        return val instanceof Boolean b ? b : Boolean.parseBoolean(String.valueOf(val));
    }

    @Override
    public String getString(String flagKey, EvaluationContext context, String defaultValue) {
        Object val = getValue(flagKey, context, defaultValue);
        return val != null ? String.valueOf(val) : defaultValue;
    }

    @Override
    public Number getNumber(String flagKey, EvaluationContext context, Number defaultValue) {
        Object val = getValue(flagKey, context, defaultValue);
        return val instanceof Number n ? n : defaultValue;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> getJson(String flagKey, EvaluationContext context, Map<String, Object> defaultValue) {
        Object val = getValue(flagKey, context, defaultValue);
        return val instanceof Map<?, ?> m ? (Map<String, Object>) m : defaultValue;
    }

    @Override
    public Object getValue(String flagKey, EvaluationContext context, Object defaultValue) {
        return evaluate(flagKey, context, defaultValue).value();
    }

    @Override
    public EvaluationResult evaluate(String flagKey, EvaluationContext context, Object defaultValue) {
        return evalTimer.record(() -> {
            try {
                EnvironmentSnapshot snap = cache.get();
                if (snap == null || snap.flags() == null || !snap.flags().containsKey(flagKey)) {
                    offlineFallbackCounter.increment();
                    Object fallback = properties.getDefaults().getOrDefault(flagKey, defaultValue);
                    return new EvaluationResult(flagKey, "default", fallback, EvaluationReason.OFFLINE_DEFAULT, null, null, 0L);
                }
                FlagEvaluationConfig cfg = snap.flags().get(flagKey);
                EvaluationResult result = engine.evaluate(cfg, context, snap.segments());
                exposureBuffer.offer(Map.of(
                    "flagKey", flagKey,
                    "userKey", context.getUserKey(),
                    "variationKey", result.variationKey(),
                    "reason", result.reason().name(),
                    "occurredAt", Instant.now().toString()
                ));
                return result;
            } catch (Exception ex) {
                offlineFallbackCounter.increment();
                Object fallback = properties.getDefaults().getOrDefault(flagKey, defaultValue);
                return new EvaluationResult(flagKey, "default", fallback, EvaluationReason.OFFLINE_DEFAULT, null, null, 0L);
            }
        });
    }

    @Override
    public void trackConversion(String flagKey, String eventName, EvaluationContext context, double value) {
        EvaluationResult res = evaluate(flagKey, context, false);
        conversionBuffer.offer(Map.of(
            "flagKey", flagKey,
            "eventName", eventName,
            "userKey", context.getUserKey(),
            "variationKey", res.variationKey(),
            "value", value,
            "occurredAt", Instant.now().toString()
        ));
    }

    public Map<String, Object> getDiagnostics() {
        EnvironmentSnapshot snap = cache.get();
        return Map.of(
            "sseConnected", sseConnected.get(),
            "lastSyncAt", lastSyncAt.get(),
            "cachedFlagCount", snap != null && snap.flags() != null ? snap.flags().size() : 0,
            "pendingExposures", exposureBuffer.size(),
            "pendingConversions", conversionBuffer.size()
        );
    }

    void fetchSnapshot() {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(properties.getServerUrl() + "/api/v1/sdk/snapshot"))
                .timeout(Duration.ofMillis(properties.getStartupTimeoutMs()))
                .header("X-FlagShip-SDK-Key", properties.getSdkKey())
                .GET()
                .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                EnvironmentSnapshot snap = objectMapper.readValue(resp.body(), EnvironmentSnapshot.class);
                cache.set(snap);
                snapshotStore.save(snap);
                lastSyncAt.set(Instant.now().toString());
            }
        } catch (Exception ex) {
            log.debug("FlagShip snapshot fetch failed (staying resilient offline): {}", ex.getMessage());
        }
    }

    private void runSseLoop() {
        long backoffMs = 1000;
        while (running) {
            try {
                HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(properties.getServerUrl() + "/api/v1/sdk/stream"))
                    .header("X-FlagShip-SDK-Key", properties.getSdkKey())
                    .GET()
                    .build();
                HttpResponse<java.io.InputStream> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofInputStream());
                if (resp.statusCode() == 200) {
                    sseConnected.set(true);
                    backoffMs = 1000;
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(resp.body(), StandardCharsets.UTF_8))) {
                        String line;
                        String currentEvent = null;
                        while (running && (line = reader.readLine()) != null) {
                            if (line.startsWith("event:")) {
                                currentEvent = line.substring(6).trim();
                            } else if (line.startsWith("data:") && "snapshot".equals(currentEvent)) {
                                String json = line.substring(5).trim();
                                EnvironmentSnapshot snap = objectMapper.readValue(json, EnvironmentSnapshot.class);
                                cache.set(snap);
                                snapshotStore.save(snap);
                                lastSyncAt.set(Instant.now().toString());
                            } else if (line.startsWith("data:") && "flag-update".equals(currentEvent)) {
                                fetchSnapshot();
                            }
                        }
                    }
                }
            } catch (Exception ex) {
                sseConnected.set(false);
                log.debug("SSE stream disconnected; reconnecting in {}ms", backoffMs);
            }
            sseConnected.set(false);
            try {
                Thread.sleep(backoffMs);
                backoffMs = Math.min(30_000, backoffMs * 2);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private void safePollAndHeartbeat() {
        if (!sseConnected.get()) {
            fetchSnapshot();
        }
    }

    private void flushEvents() {
        if (exposureBuffer.isEmpty() && conversionBuffer.isEmpty()) return;
        List<Map<String, Object>> exps = new ArrayList<>();
        List<Map<String, Object>> convs = new ArrayList<>();
        while (exps.size() < 200 && !exposureBuffer.isEmpty()) exps.add(exposureBuffer.poll());
        while (convs.size() < 200 && !conversionBuffer.isEmpty()) convs.add(conversionBuffer.poll());
        try {
            String body = objectMapper.writeValueAsString(Map.of("exposures", exps, "conversions", convs));
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(properties.getServerUrl() + "/api/v1/events/batch"))
                .header("X-FlagShip-SDK-Key", properties.getSdkKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
            httpClient.send(req, HttpResponse.BodyHandlers.discarding());
        } catch (Exception ex) {
            log.debug("FlagShip batch event flush skipped while offline");
        }
    }
}
