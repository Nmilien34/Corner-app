import type { UserDocument } from "../models";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      user?: { id: string };
      /**
       * Set by loadUser, which the quota and entitlement middleware need.
       *
       * CONVENTIONS.md notes the references deliberately do NOT load the full
       * user in auth middleware. Corner has to, because quota counters and
       * entitlement state live on the user document and are consulted before
       * most handlers run. Typed here rather than cast at each call site.
       */
      currentUser?: UserDocument;
      requestId?: string;
    }
  }
}

export {};
