package io.flagship.server;

import io.flagship.server.approval.ApprovalService;
import io.flagship.server.common.GlobalExceptionHandler.SelfApprovalForbiddenException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Testcontainers
class ApprovalAndRolloutIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("flagship")
        .withUsername("flagship")
        .withPassword("flagship_test");

    @DynamicPropertySource
    static void configureDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    ApprovalService approvalService;

    @Test
    void preventsSelfApprovalAndRunsFlywayAgainstPostgreSQL() {
        assertThrows(SelfApprovalForbiddenException.class, () ->
            approvalService.validateAndPublishApproval(10L, 10L, 3L, "new-checkout", 2L));
        assertDoesNotThrow(() ->
            approvalService.validateAndPublishApproval(10L, 20L, 3L, "new-checkout", 2L));
    }
}
