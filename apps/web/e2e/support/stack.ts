import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Reads local stack details at runtime so no keys live in the test files.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readEnvFile(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(path.join(repoRoot, file), "utf8")
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => [match[1]!, match[2]!.replace(/^"|"$/g, "")]),
    );
  } catch {
    return {};
  }
}

let cached: Stack | undefined;

export interface Stack {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
  mailpitUrl: string;
  workerSecret?: string;
  revalidateSecret?: string;
}

export function stack(): Stack {
  if (cached) return cached;
  const status = Object.fromEntries(
    execSync("pnpm exec supabase status -o env", { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1]!, match[2]!]),
  );
  const apiUrl = status.API_URL;
  if (!apiUrl || !/^http:\/\/(127\.0\.0\.1|localhost)/.test(apiUrl)) {
    throw new Error(`e2e tests only run against the local Supabase stack (got ${apiUrl ?? "nothing"}). Run pnpm db:start.`);
  }
  cached = {
    apiUrl,
    publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? "",
    secretKey: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY ?? "",
    mailpitUrl: status.INBUCKET_URL ?? status.MAILPIT_URL ?? "http://127.0.0.1:54324",
    workerSecret: readEnvFile("supabase/functions/.env").WORKER_SECRET,
    revalidateSecret: readEnvFile("apps/web/.env.local").REVALIDATE_SECRET,
  };
  return cached;
}

export { repoRoot };
