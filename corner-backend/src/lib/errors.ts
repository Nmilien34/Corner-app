// Error classes. Ported from Pepta's shape: a code, an HTTP status, optional
// structured details, and an `expose` flag deciding whether the message is
// safe to send to a client.

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly expose: boolean;

  public constructor(
    code: string,
    message: string,
    statusCode = 500,
    details?: unknown,
    expose = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.expose = expose;
  }
}

export class ValidationError extends AppError {
  public constructor(message = "Request validation failed", details?: unknown) {
    super("validation_error", message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  public constructor(message = "Authentication required") {
    super("unauthorized", message, 401);
  }
}

export class ForbiddenError extends AppError {
  public constructor(message = "Not permitted") {
    super("forbidden", message, 403);
  }
}

export class NotFoundError extends AppError {
  public constructor(message = "Resource not found") {
    super("not_found", message, 404);
  }
}

/**
 * Premium feature requested without entitlement.
 *
 * 402 rather than 403 because BRIEF asks for "a structured 402-style payload
 * the app can turn into a paywall prompt" — the app needs to distinguish "buy
 * this" from "you may never have this".
 */
export class PaymentRequiredError extends AppError {
  public constructor(
    message = "This feature requires an active subscription",
    details?: unknown,
  ) {
    super("payment_required", message, 402, details);
  }
}

/** Quota exhausted. Also 402: the remedy is upgrading, not authenticating. */
export class QuotaExceededError extends AppError {
  public constructor(message = "Quota exceeded", details?: unknown) {
    super("quota_exceeded", message, 402, details);
  }
}

export class ConflictError extends AppError {
  public constructor(message = "Conflict", details?: unknown) {
    super("conflict", message, 409, details);
  }
}

export class RateLimitedError extends AppError {
  public constructor(message = "Too many requests", details?: unknown) {
    super("rate_limited", message, 429, details);
  }
}

/**
 * Access could not be verified right now — distinct from a positive "no".
 *
 * Pepta's entitlement remediation turns on this distinction: a provider
 * outage must not downgrade a paying user to inactive. 503 tells the client to
 * retry, where a 402 would send them to a paywall they already paid at.
 */
export class AccessUnavailableError extends AppError {
  public constructor(message = "Access verification temporarily unavailable") {
    super("access_unavailable", message, 503, undefined, true);
  }
}

export class InternalError extends AppError {
  public constructor(message = "Internal server error", details?: unknown) {
    super("internal_error", message, 500, details, false);
  }
}

export class NotImplementedError extends AppError {
  public constructor(message = "Not implemented") {
    super("not_implemented", message, 501, undefined, true);
  }
}
