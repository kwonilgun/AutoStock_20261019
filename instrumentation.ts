export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadPickClaudeSetting } = await import("@/lib/server/pick-llm");
  try {
    await loadPickClaudeSetting();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[pick] claude setting load failed ${message}`);
  }
}
