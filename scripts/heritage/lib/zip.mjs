import zlib from "node:zlib";

// 외부 zip 라이브러리 없이 읽는 최소 구현. 이 사이트의 zip은 파일명이 CP949(UTF-8 플래그 없음)이므로
// WHATWG "euc-kr"(= windows-949, CP949 상위집합)로 디코딩한다.
export function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("zip 끝 레코드(EOCD)를 찾을 수 없음 — 파일이 잘렸거나 zip이 아님");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const cp949 = new TextDecoder("euc-kr");
  const entries = [];

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("중앙 디렉터리 손상");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nameLen);
    const name = flags & 0x800 ? rawName.toString("utf8") : cp949.decode(rawName);

    const dataStart = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const compressed = buf.subarray(dataStart, dataStart + csize);
    entries.push({
      name,
      crc,
      read() {
        const data = method === 8 ? zlib.inflateRawSync(compressed) : method === 0 ? compressed : null;
        if (!data) throw new Error(`지원하지 않는 압축 방식 ${method}: ${name}`);
        return data;
      },
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// 모든 엔트리를 풀어 CRC32까지 맞는지 확인한다. 이 사이트는 Content-Length 없이 chunked로 보내므로
// "다운로드가 끝까지 정상적으로 왔는지"는 크기가 아니라 이 검사로 판단한다.
export function verifyZip(buf) {
  const entries = readZip(buf);
  for (const e of entries) {
    const actual = zlib.crc32(e.read());
    if (actual !== e.crc) throw new Error(`CRC 불일치: ${e.name}`);
  }
  return entries;
}
