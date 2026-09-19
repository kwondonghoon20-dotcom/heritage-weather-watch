// gis-heritage.go.kr "전체다운로드"를 시도(sidoList=ADDR<코드>)별로 순차 요청해 data/raw/heritage/<코드>.zip 으로 저장한다.
//
// 배경: 필터 없는 전체 요청(sidoList 비움)은 서버가 150초 이상 응답하지 못한다. 시도 하나로 좁히면 정상 응답한다.
// 페이지의 openWindow()는 XHR로 zip 전체를 받아 Content-Disposition: attachment 로 저장하는 방식이다.
//
// - 시도 목록은 페이지의 #sidoList <li sidocd label> 에서 실행 시점에 읽는다(행정구역 개편 자동 반영).
// - 요청 사이 5초 간격, 요청당 타임아웃 240초. 자동 재시도는 하지 않는다.
// - 성공 판정: HTTP 200 + zip 전 엔트리 CRC32 통과 + 필요한 레이어 존재. (응답이 chunked라 크기로는 완결 여부를 알 수 없다)
// - 이미 받아 검증된 시도는 건너뛴다. 실패한 시도는 data/raw/heritage/failed.txt 에 남고, 다시 실행하면 그것만 재시도된다.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyZip } from "./lib/zip.mjs";
import { WANTED_LAYERS } from "./lib/layers.mjs";

const BASE = "https://gis-heritage.go.kr";
const PAGE_URL = `${BASE}/newMain/heritageDownload.do`;
const INTERVAL_MS = 5_000;
const TIMEOUT_MS = 240_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const RAW_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/raw/heritage");
const FAILED_FILE = path.join(RAW_DIR, "failed.txt");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...a);

// 새 익명 세션(쿠키)을 받으면서 페이지에서 시도 목록을 읽는다.
async function openSession() {
  const res = await fetch(PAGE_URL, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`안내 페이지 HTTP ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const html = await res.text();
  const start = html.indexOf('id="sidoList"');
  const block = start < 0 ? "" : html.slice(start, html.indexOf("</ul>", start));
  const sidos = [...block.matchAll(/<li sidocd="(\d+)" label="([^"]+)"/g)].map((m) => ({ cd: m[1], label: m[2] }));
  return { cookie, sidos };
}

function buildUrl(sido) {
  // 페이지 스크립트(makeSearchParams)와 동일: encodeURI(encodeURIComponent("소재지:<시도명>  / "))
  const searchParams = encodeURI(encodeURIComponent(`소재지:${sido.label}  / `));
  return `${BASE}/board/heritageDownload/downloadFilesAll2.do?searchKeyword=&sidoList=ADDR${sido.cd}&sggList=&jjgbList=&jjgbList2=&tab=1&searchParams=${searchParams}`;
}

function checkLayers(entries) {
  const names = new Set(entries.map((e) => e.name));
  const missing = WANTED_LAYERS.filter((l) => !["shp", "dbf", "prj"].every((x) => names.has(`${l}.${x}`)));
  if (missing.length) throw new Error(`필요 레이어 누락: ${missing.join(", ")}`);
}

async function isDone(sido) {
  const file = path.join(RAW_DIR, `${sido.cd}.zip`);
  try {
    checkLayers(verifyZip(await fs.readFile(file)));
    return true;
  } catch {
    return false; // 없거나 손상 → 다시 받는다
  }
}

async function downloadOne(sido) {
  const { cookie } = await openSession();
  const res = await fetch(buildUrl(sido), {
    headers: { "User-Agent": UA, Referer: PAGE_URL, Accept: "*/*", Cookie: cookie },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const disposition = res.headers.get("content-disposition") ?? "";
  if (!disposition.includes("attachment")) throw new Error(`첨부 파일이 아님 (content-type: ${res.headers.get("content-type")})`);
  const buf = Buffer.from(await res.arrayBuffer());
  checkLayers(verifyZip(buf)); // 손상/미완결이면 여기서 예외
  const dest = path.join(RAW_DIR, `${sido.cd}.zip`);
  await fs.writeFile(`${dest}.part`, buf);
  await fs.rename(`${dest}.part`, dest);
  return buf.length;
}

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  const { sidos } = await openSession();
  if (sidos.length === 0) throw new Error("페이지에서 시도 목록을 읽지 못함 — 페이지 구조가 바뀌었을 수 있음");
  log(`시도 ${sidos.length}개: ${sidos.map((s) => `${s.label}(${s.cd})`).join(", ")}`);

  const todo = [];
  for (const s of sidos) (await isDone(s)) ? log(`건너뜀(이미 검증됨): ${s.label}`) : todo.push(s);
  log(`받을 시도 ${todo.length}개`);

  const failures = new Map();
  let requested = 0;
  for (const s of todo) {
    if (requested > 0) await sleep(INTERVAL_MS); // 서버 부담을 줄이기 위한 요청 간격
    requested++;
    const t0 = Date.now();
    try {
      const size = await downloadOne(s);
      log(`성공 ${s.label}(${s.cd}) — ${(size / 1024).toFixed(0)}KB, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
    } catch (err) {
      const reason = err?.name === "TimeoutError" ? `타임아웃 ${TIMEOUT_MS / 1000}초` : (err?.message ?? String(err));
      failures.set(s.cd, `${s.label}\t${reason}`);
      log(`실패 ${s.label}(${s.cd}) — ${reason} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    }
  }

  if (failures.size) {
    const lines = [...failures].map(([cd, rest]) => `${cd}\t${rest}`);
    await fs.writeFile(FAILED_FILE, lines.join("\n") + "\n");
    log(`실패 ${failures.size}건 → ${FAILED_FILE} (다시 실행하면 이 시도만 재시도됨)`);
    process.exitCode = 1;
  } else {
    await fs.rm(FAILED_FILE, { force: true });
    log("모든 시도 다운로드 완료");
  }
}

main().catch((e) => {
  console.error("치명적 오류:", e);
  process.exit(2);
});
