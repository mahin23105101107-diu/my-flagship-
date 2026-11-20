package io.flagship.server.approval;

import io.flagship.server.common.GlobalExceptionHandler.SelfApprovalForbiddenException;
import io.flagship.server.sdk.SseStreamService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

@Service
public class ApprovalService {
    private final SseStreamService sseStreamService;

    public ApprovalService(SseStreamService sseStreamService) {
        this.sseStreamService = sseStreamService;
    }

    @Transactional
    public void validateAndPublishApproval(long authorId, long approverId, long environmentId, String flagKey, long newVersion) {
        if (authorId == approverId) {
            throw new SelfApprovalForbiddenException(
                "Authors cannot approve their own production change requests."
            );
        }
        sseStreamService.publishUpdate(environmentId, Map.of("flagKey", flagKey, "version", newVersion));
    }
}
