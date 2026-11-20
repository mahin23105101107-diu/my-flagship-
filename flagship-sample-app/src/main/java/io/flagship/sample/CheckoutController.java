package io.flagship.sample;

import io.flagship.sdk.FeatureFlag;
import io.flagship.sdk.FlagShipClient;
import io.flagship.shared.model.EvaluationContext;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/demo")
public class CheckoutController {
    private final FlagShipClient flagShipClient;

    public CheckoutController(FlagShipClient flagShipClient) {
        this.flagShipClient = flagShipClient;
    }

    @FeatureFlag(
        value = "new-dashboard",
        defaultValue = false,
        onDisabled = FeatureFlag.DisabledBehavior.FALLBACK_METHOD,
        fallbackMethod = "legacyDashboard"
    )
    @GetMapping("/dashboard")
    public Map<String, Object> newDashboard() {
        return Map.of("dashboard", "next-gen-analytics", "status", "enabled");
    }

    public Map<String, Object> legacyDashboard() {
        return Map.of("dashboard", "classic-dashboard", "status", "fallback");
    }

    @GetMapping("/checkout")
    public Map<String, Object> checkout(
        @RequestParam(defaultValue = "user-42") String userKey,
        @RequestParam(defaultValue = "enterprise") String plan
    ) {
        EvaluationContext ctx = EvaluationContext.builder(userKey)
            .attribute("plan", plan)
            .build();
        boolean express = flagShipClient.isEnabled("new-checkout", ctx, false);
        String layout = flagShipClient.getString("homepage-layout", ctx, "classic");
        Number maxItems = flagShipClient.getNumber("max-cart-items", ctx, 25);
        return Map.of(
            "userKey", userKey,
            "expressCheckout", express,
            "homepageLayout", layout,
            "maxCartItems", maxItems
        );
    }
}
