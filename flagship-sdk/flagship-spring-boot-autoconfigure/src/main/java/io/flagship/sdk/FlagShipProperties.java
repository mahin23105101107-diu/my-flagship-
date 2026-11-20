package io.flagship.sdk;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import java.util.HashMap;
import java.util.Map;

@Validated
@ConfigurationProperties(prefix = "flagship")
public class FlagShipProperties {

    private boolean enabled = true;

    @NotBlank(message = "flagship.server-url must be configured")
    private String serverUrl = "http://localhost:3000";

    @NotBlank(message = "flagship.sdk-key must be configured")
    private String sdkKey;

    private String appName = "spring-boot-app";

    @Min(100)
    @Max(2000)
    private long startupTimeoutMs = 1800;

    private String snapshotFile = "./flagship-snapshot.json";

    private boolean sseEnabled = true;

    @Min(1000)
    private long pollingFallbackIntervalMs = 30_000;

    @Min(1000)
    private long eventFlushIntervalMs = 10_000;

    private Map<String, Object> defaults = new HashMap<>();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getServerUrl() { return serverUrl; }
    public void setServerUrl(String serverUrl) { this.serverUrl = serverUrl; }
    public String getSdkKey() { return sdkKey; }
    public void setSdkKey(String sdkKey) { this.sdkKey = sdkKey; }
    public String getAppName() { return appName; }
    public void setAppName(String appName) { this.appName = appName; }
    public long getStartupTimeoutMs() { return startupTimeoutMs; }
    public void setStartupTimeoutMs(long startupTimeoutMs) { this.startupTimeoutMs = startupTimeoutMs; }
    public String getSnapshotFile() { return snapshotFile; }
    public void setSnapshotFile(String snapshotFile) { this.snapshotFile = snapshotFile; }
    public boolean isSseEnabled() { return sseEnabled; }
    public void setSseEnabled(boolean sseEnabled) { this.sseEnabled = sseEnabled; }
    public long getPollingFallbackIntervalMs() { return pollingFallbackIntervalMs; }
    public void setPollingFallbackIntervalMs(long pollingFallbackIntervalMs) { this.pollingFallbackIntervalMs = pollingFallbackIntervalMs; }
    public long getEventFlushIntervalMs() { return eventFlushIntervalMs; }
    public void setEventFlushIntervalMs(long eventFlushIntervalMs) { this.eventFlushIntervalMs = eventFlushIntervalMs; }
    public Map<String, Object> getDefaults() { return defaults; }
    public void setDefaults(Map<String, Object> defaults) { this.defaults = defaults; }
}
