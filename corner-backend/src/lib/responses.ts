import type { Response } from "express";

/** Every 2xx body is `{ data: ... }`. */
export function sendData<T>(res: Response, value: T, statusCode = 200): void {
  res.status(statusCode).json({ data: value });
}

export function sendNoContent(res: Response): void {
  res.status(204).send();
}

/**
 * The scaffold's placeholder response.
 *
 * BRIEF: "Controller bodies return 501 Not Implemented with a TODO comment
 * naming what needs to be built." Corner has no controllers layer
 * (CONVENTIONS.md), so this is returned from the route handler itself.
 *
 * It is a real response in the standard error envelope, not a crash and not a
 * 404 — the definition of done requires every route to answer.
 */
export function sendNotImplemented(res: Response, todo: string): void {
  res.status(501).json({
    error: {
      code: "not_implemented",
      message: "This endpoint is scaffolded but not implemented yet.",
      details: { todo },
    },
  });
}
