import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import puppeteer from "/Users/kwonilgun/Desktop/애그밸랜스_앱_2026년10월16일/AutoStock_20261019/promo/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js";

for (const line of readFileSync("/Users/kwonilgun/Desktop/애그밸랜스_앱_2026년10월16일/AutoStock_20261019/.env", "utf8").split("\n")) {
  const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (!match || process.env[match[1]]) continue;
  process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const prisma = new PrismaClient();
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
let sessionId = null;

function hashNote(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

try {
  const users = await prisma.user.findMany({
    where: { role: "user" },
    select: {
      id: true,
      portfolios: { select: { id: true, _count: { select: { valuations: true, holdings: true } } } },
    },
  });
  const ranked = users
    .map((user) => ({
      id: user.id,
      valuations: user.portfolios.reduce((sum, portfolio) => sum + portfolio._count.valuations, 0),
      holdings: user.portfolios.reduce((sum, portfolio) => sum + portfolio._count.holdings, 0),
    }))
    .sort((a, b) => b.valuations - a.valuations || b.holdings - a.holdings);
  const user = ranked[0];
  if (!user) throw new Error("no user");
  console.log(`user valuations=${user.valuations} holdings=${user.holdings}`);
  const session = await prisma.session.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  sessionId = session.id;

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 1100, deviceScaleFactor: 1 });
  await page.setCookie({
    name: "egg_session",
    value: token,
    url: "http://127.0.0.1:3002/performance",
    httpOnly: true,
  });
  await page.goto("http://127.0.0.1:3002/performance", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector("text/기간", { timeout: 15000 });

  async function readState(name) {
    const text = await page.evaluate(() => document.body.innerText);
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    console.log(`\n== ${name} ==`);
    console.log(hashNote(lines.slice(0, 40).join(" | ")));
    await page.screenshot({ path: `/tmp/perf-${name}.png`, fullPage: true });
  }

  await readState("day");
  await page.locator("button[role='tab']", { hasText: "월별" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("월별 기록"));
  await readState("month");
  await page.locator("button[aria-label='이전 기간']").click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await readState("month-prev");
  await page.locator("button[role='tab']", { hasText: "년도별" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("년도별 기록"));
  await readState("year");
  const record = await page.locator("section >> text=년도별 기록").locator("xpath=ancestor::section").locator("ul button").first();
  if (await record.count()) {
    await record.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await readState("year-record");
  }
  await page.locator("button[role='tab']", { hasText: "날짜별" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("날짜별 기록"));
  await readState("day-again");
  await browser.close();
} finally {
  if (sessionId) await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
  await prisma.$disconnect();
}
