package io.flagship.server.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.net.URI;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(SelfApprovalForbiddenException.class)
    public ProblemDetail handleSelfApproval(SelfApprovalForbiddenException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
        pd.setTitle("Self-Approval Forbidden");
        pd.setType(URI.create("https://flagship.dev/problems/self-approval-forbidden"));
        return pd;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request validation failed.");
        pd.setTitle("Validation Error");
        pd.setType(URI.create("https://flagship.dev/problems/validation-error"));
        return pd;
    }

    public static class SelfApprovalForbiddenException extends RuntimeException {
        public SelfApprovalForbiddenException(String message) {
            super(message);
        }
    }
}
