import type { NextFunction, Request, Response } from "express";

import { verifyToken } from "../auth/tokens";
import { UnauthorizedError } from "../lib/errors";
import { UserModel } from "../models";

/** Verifies the bearer token and sets `req.user`. Does not hit the database. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization");

  if (!header?.startsWith("Bearer ")) {
    next(new UnauthorizedError("Missing bearer token"));
    return;
  }

  try {
    const payload = verifyToken(header.slice("Bearer ".length).trim());
    req.user = { id: payload.sub };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Loads the full user document onto `req.currentUser`.
 *
 * Separate from requireAuth on purpose. The reference apps never load the user
 * in auth middleware, and most Corner routes do not need it either — but quota
 * and entitlement both read state off the user document, so the routes that
 * gate on those opt in rather than every authenticated request paying for a
 * lookup.
 */
export async function loadUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }

    const user = await UserModel.findById(req.user.id);
    if (!user) {
      // The token verified but its subject is gone (deleted account, or a
      // token minted against a different database).
      next(new UnauthorizedError("User no longer exists"));
      return;
    }

    req.currentUser = user;
    next();
  } catch (error) {
    next(error);
  }
}
