// Diagnoses MONGODB_URI without starting the server.
//
// A Render redeploy takes minutes and tells you only "Authentication failed".
// This turns the same question into a few seconds and names the specific
// cause, because Atlas's error codes distinguish situations that all look
// identical from the outside: a wrong password, a user that does not exist,
// a user without rights on this database, and an IP that is not allowlisted.
//
//   npm run check:db -w @corner/backend
//
// Never prints the password.

import { MongoClient } from "mongodb";

import { env } from "../config/env";

interface Parsed {
  user: string;
  password: string;
  host: string;
  database: string;
}

function parse(uri: string): Parsed | null {
  const m = /^mongodb(?:\+srv)?:\/\/([^:]+):([^@]+)@([^/?]+)\/([^?]*)/.exec(uri);
  if (!m) return null;
  return { user: m[1]!, password: m[2]!, host: m[3]!, database: m[4]! };
}

function fail(title: string, lines: string[]): never {
  console.error(`\n  FAIL  ${title}\n`);
  for (const l of lines) console.error(`        ${l}`);
  console.error("");
  process.exit(1);
}

async function main(): Promise<void> {
  const parsed = parse(env.MONGODB_URI);

  if (!parsed) {
    fail("MONGODB_URI is not a parseable connection string", [
      "Expected: mongodb+srv://<user>:<password>@<host>/<database>?<options>",
    ]);
  }

  const { user, password, host, database } = parsed;

  console.log("\n  Connection string");
  console.log(`    user      ${user}`);
  console.log(`    host      ${host}`);
  console.log(`    database  ${database}`);
  console.log(`    password  <${password.length} chars>`);

  // Cheap checks first — these are the mistakes that cost a redeploy to learn.
  if (/[<>]/.test(password)) {
    fail("The password is still a placeholder", [
      `It is literally "${password}" — angle brackets and all.`,
      "",
      "Atlas > Database Access > Add New Database User:",
      "  username   corner_app",
      "  password   Autogenerate (copy it)",
      "  privileges Specific Privileges > readWrite on database 'corner'",
      "",
      "Then replace the placeholder in .env AND in Render > Env Groups.",
    ]);
  }

  if (database !== env.MONGODB_DB_NAME) {
    fail(`The URI points at database "${database}", not "${env.MONGODB_DB_NAME}"`, [
      "Corner refuses to start against the wrong database — it shares this",
      "cluster with another application.",
    ]);
  }

  const encodeNeeded = [...password].filter((c) => "@:/?#[]".includes(c));
  if (encodeNeeded.length > 0 && !password.includes("%")) {
    console.log(
      `\n  WARN  Password contains ${encodeNeeded.join(" ")} — these must be percent-encoded.`,
    );
  }

  console.log("\n  Connecting...");
  const client = new MongoClient(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    await client.connect();
    await client.db(database).command({ ping: 1 });
    console.log("  OK    authenticated and reached the database");
  } catch (error) {
    const err = error as { code?: number; codeName?: string; message?: string };

    if (err.codeName === "AuthenticationFailed" || err.code === 18) {
      fail("Authentication failed — the cluster is reachable, the credential is wrong", [
        "The cluster answered, so DNS, TLS and IP allowlisting are all fine.",
        "Only the username or password is being rejected. Check, in order:",
        "",
        `  1. Does a user named "${user}" exist? Atlas > Database Access.`,
        "  2. Was the password copied whole, with no trailing space or newline?",
        "  3. A user created in the last minute may not have propagated — retry.",
        "  4. Special characters in the password must be percent-encoded.",
      ]);
    }

    if (err.codeName === "Unauthorized" || err.code === 13) {
      fail(`"${user}" authenticated but is not authorized on "${database}"`, [
        "The password is correct; the privileges are not.",
        "Atlas > Database Access > Edit > Specific Privileges:",
        `  readWrite on database "${database}"`,
      ]);
    }

    if (String(err.message).includes("ServerSelection") || String(err.message).includes("ENOTFOUND")) {
      fail("Could not reach the cluster at all", [
        "This is network, not credentials. Either the hostname is wrong, or",
        "this machine's IP is not allowlisted.",
        "",
        "Atlas > Network Access > Add IP Address.",
      ]);
    }

    fail("Unexpected error", [String(err.message ?? error)]);
  }

  // Only meaningful once connected: can this user actually write?
  try {
    const probe = client.db(database).collection("__corner_write_probe");
    await probe.insertOne({ at: new Date() });
    await probe.drop();
    console.log("  OK    write permission confirmed on this database");
  } catch {
    console.log(
      "  WARN  connected but could not write — check readWrite on this database",
    );
  }

  const collections = await client.db(database).listCollections().toArray();
  console.log(`  INFO  ${collections.length} existing collection(s) in "${database}"`);

  await client.close();
  console.log("\n  All checks passed. The backend should start.\n");
}

main().catch((error: unknown) => {
  console.error("check-db crashed:", error);
  process.exit(1);
});
