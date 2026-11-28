import { loadDotEnv } from "./load-dotenv";

loadDotEnv();

async function main() {
  const { runGapAlerts } = await import("@/lib/server/gap-alert-run");
  const { prisma } = await import("@/lib/db");
  try {
    const result = await runGapAlerts();
    console.log(`[gap-alert] ${result.line}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown";
  console.error(`[gap-alert] ${message}`);
  process.exitCode = 1;
});
