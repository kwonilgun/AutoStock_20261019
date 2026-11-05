import { execFile } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";

const exec = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.dirname(root);
const audioDir = path.join(root, "audio");
const frameDir = path.join(root, "frames");
const stillDir = path.join(root, "stills");
const htmlPath = path.join(root, "explainer.html");
const outPath = path.join(project, "에그밸런스_소개.mp4");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FPS = 24;

const SCENES = [
  {
    before: 0.45,
    after: 0.55,
    text: "지금 얼마를 팔고, 얼마를 사야 할까요? 에그밸런스는 그 답을 목표 비율로 보여 줍니다.",
  },
  {
    before: 0.28,
    after: 0.42,
    text: "금리와 주가는 달걀처럼 한 바퀴를 돕니다. 바닥에서 올라가고, 과열된 뒤, 다시 내려옵니다.",
  },
  {
    before: 0.24,
    after: 0.4,
    text: "이 한 바퀴를 여섯 칸으로 나눕니다. 왼쪽은 올라가는 쪽, 오른쪽은 내려가는 쪽입니다.",
  },
  {
    before: 0.24,
    after: 0.42,
    text: "이번 달의 칸은 하나로 정해집니다. 그 칸의 목표 비율이, 모든 계좌의 기준이 됩니다.",
  },
  {
    before: 0.24,
    after: 0.42,
    text: "돈은 아홉 가지로 나눕니다. 주식과 채권, 금과 비트코인, 부동산, 그리고 원화와 달러입니다.",
  },
  {
    before: 0.24,
    after: 0.48,
    text: "내 계좌와 이 목표를 비교합니다. 차이가 작으면 그대로 두고, 큰 것만 줄이거나 채우라고 알려 줍니다.",
  },
  {
    before: 0.24,
    after: 0.4,
    text: "가진 종목을 넣고, 어디가 많은지 확인한 다음, 증권사 앱에서 직접 사고팝니다.",
  },
  {
    before: 0.24,
    after: 0.45,
    text: "에그밸런스는 주문을 보내지 않습니다. 같은 규칙으로, 매달 다시 맞춰 보게 해 주는 안내입니다.",
  },
  {
    before: 0.3,
    after: 1.35,
    text: "매달, 달걀의 한 칸으로. 에그밸런스.",
  },
];

async function durationOf(file) {
  const { stdout } = await exec("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    file,
  ]);
  return Number(stdout.trim());
}

async function buildAudio() {
  await mkdir(audioDir, { recursive: true });
  const durations = [];
  const wavs = [];
  for (let i = 0; i < SCENES.length; i += 1) {
    const scene = SCENES[i];
    const aiff = path.join(audioDir, `s${i}.aiff`);
    const wav = path.join(audioDir, `s${i}.wav`);
    await exec("say", ["-v", "Yuna", "-r", "148", "-o", aiff, scene.text]);
    const voice = await durationOf(aiff);
    const delay = Math.round(scene.before * 1000);
    await exec("ffmpeg", [
      "-y",
      "-i", aiff,
      "-af", `adelay=${delay}:all=1,apad=pad_dur=${scene.after}`,
      "-c:a", "pcm_s16le",
      wav,
    ]);
    const total = await durationOf(wav);
    durations.push(total);
    wavs.push(wav);
    console.log(`scene ${i + 1}: voice ${voice.toFixed(2)}s, slot ${total.toFixed(2)}s`);
  }
  const listPath = path.join(audioDir, "list.txt");
  await writeFile(listPath, wavs.map((file) => `file '${file}'`).join("\n") + "\n");
  return { durations, listPath, total: durations.reduce((sum, item) => sum + item, 0) };
}

async function launch() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--hide-scrollbars", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return { browser, page };
}

async function shoot(page, file, time) {
  await page.evaluate((t) => window.renderAt(t), time);
  await page.screenshot({ path: file, type: "jpeg", quality: 90, optimizeForSpeed: true });
}

const stillsOnly = process.argv.includes("--stills");

const { durations, listPath, total } = await buildAudio();
const { browser, page } = await launch();
await page.evaluate((next) => window.setDurations(next), durations);

try {
  if (stillsOnly) {
    await mkdir(stillDir, { recursive: true });
    let cursor = 0;
    for (let i = 0; i < durations.length; i += 1) {
      const mid = cursor + durations[i] * 0.72;
      await shoot(page, path.join(stillDir, `s${i}.jpg`), mid);
      cursor += durations[i];
      console.log(`still ${i + 1}`);
    }
  } else {
    await rm(frameDir, { recursive: true, force: true });
    await mkdir(frameDir, { recursive: true });
    const frames = Math.ceil(total * FPS - 1e-6);
    const started = Date.now();
    for (let i = 0; i < frames; i += 1) {
      await shoot(page, path.join(frameDir, String(i).padStart(5, "0") + ".jpg"), i / FPS);
      if (i % 48 === 0) {
        const elapsed = (Date.now() - started) / 1000;
        console.log(`frame ${i}/${frames} (${elapsed.toFixed(0)}s)`);
      }
    }
    console.log(`encoding ${total.toFixed(2)}s`);
    await exec("ffmpeg", [
      "-y",
      "-framerate", String(FPS),
      "-i", path.join(frameDir, "%05d.jpg"),
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-af", `afade=t=in:st=0:d=0.08,afade=t=out:st=${Math.max(0, total - 0.45).toFixed(3)}:d=0.4`,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-crf", "17",
      "-preset", "medium",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    ]);
    await rm(frameDir, { recursive: true, force: true });
    console.log(outPath);
  }
} finally {
  await browser.close();
}
