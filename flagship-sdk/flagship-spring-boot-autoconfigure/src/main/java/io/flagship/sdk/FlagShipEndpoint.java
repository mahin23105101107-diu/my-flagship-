package io.flagship.sdk;

import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import java.util.Map;

@Endpoint(id = "flagship")
public class FlagShipEndpoint {
    private final DefaultFlagShipClient client;

    public FlagShipEndpoint(DefaultFlagShipClient client) {
        this.client = client;
    }

    @ReadOperation
    public Map<String, Object> diagnostics() {
        return client.getDiagnostics();
    }
}
