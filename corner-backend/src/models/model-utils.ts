import type { Query, Schema } from "mongoose";
import { Types } from "mongoose";

type ApiRecord = Record<string, unknown> & {
  _id?: unknown;
  __v?: unknown;
  id?: unknown;
};

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeValue(entry),
      ]),
    );
  }

  return value;
}

function transformForApi(_doc: unknown, ret: ApiRecord): ApiRecord {
  const serialized = serializeValue(ret) as ApiRecord;
  serialized.id =
    ret._id instanceof Types.ObjectId ? ret._id.toString() : String(ret._id);
  delete serialized._id;
  delete serialized.__v;

  return serialized;
}

/**
 * @param omit storage-only paths to drop from the API shape.
 *
 * Ported from Pepta, including the reason it takes an omit list. Response
 * schemas are STRICT: they reject unknown keys rather than ignoring them, so a
 * persistence field that is not part of the contract does not get quietly
 * dropped — it throws. Pepta lost /home's whole profile section in production
 * on 2026-08-21 to exactly this, via a field declared `default: null` and
 * therefore present on every document.
 *
 * Corner's exposure is worse than Pepta's, because DocumentChunk.embedding is
 * a multi-hundred-float array on the hottest read path in the app. Declaring
 * the omission on the MODEL is what makes it unforgettable — a new
 * serialization call site inherits it, where a fix at the call site would not.
 */
export function applyApiTransforms(
  schema: Schema,
  omit: readonly string[] = [],
): void {
  const options = {
    virtuals: false,
    transform(doc: unknown, ret: ApiRecord): ApiRecord {
      const serialized = transformForApi(doc, ret);
      for (const path of omit) delete serialized[path];
      return serialized;
    },
  };

  schema.set("toJSON", options);
  schema.set("toObject", options);
}

/**
 * Excludes soft-deleted documents from `find*` unless the caller asks for them
 * explicitly by naming `deletedAt` in the filter.
 *
 * Corner applies this to User only. Documents and their derived artifacts are
 * HARD deleted (BRIEF "Privacy"), so do not reach for this on a document-side
 * model — a soft delete there would leave contract and medical-record text in
 * Mongo after the user believed it was gone.
 */
export function applySoftDeleteQueryMiddleware(schema: Schema): void {
  schema.pre(/^find/, function excludeDeleted(this: Query<unknown, unknown>, next) {
    const filter = this.getFilter() as Record<string, unknown>;

    if (!Object.hasOwn(filter, "deletedAt")) {
      this.where({ deletedAt: null });
    }

    next();
  });
}
