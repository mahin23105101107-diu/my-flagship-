package io.flagship.server.sdk;

import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * Observer Pattern: Broadcasts configuration changes to all connected SDK SSE emitters.
 */
@Service
public class SseStreamService {
    private final Map<Long, Set<SseEmitter>> emittersByEnv = new ConcurrentHashMap<>();

    public SseEmitter subscribe(long environmentId, Object initialSnapshot) {
        SseEmitter emitter = new SseEmitter(0L);
        emittersByEnv.computeIfAbsent(environmentId, k -> new CopyOnWriteArraySet<>()).add(emitter);
        emitter.onCompletion(() -> remove(environmentId, emitter));
        emitter.onTimeout(() -> remove(environmentId, emitter));
        emitter.onError(e -> remove(environmentId, emitter));
        try {
            emitter.send(SseEmitter.event().name("snapshot").data(initialSnapshot));
        } catch (IOException ex) {
            remove(environmentId, emitter);
        }
        return emitter;
    }

    public void publishUpdate(long environmentId, Map<String, Object> payload) {
        Set<SseEmitter> targets = emittersByEnv.get(environmentId);
        if (targets == null) return;
        for (SseEmitter emitter : targets) {
            try {
                emitter.send(SseEmitter.event().name("flag-update").data(payload));
            } catch (IOException ex) {
                remove(environmentId, emitter);
            }
        }
    }

    private void remove(long envId, SseEmitter emitter) {
        Set<SseEmitter> set = emittersByEnv.get(envId);
        if (set != null) set.remove(emitter);
    }
}
