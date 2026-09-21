// 야외 노출 여부 1차 분류 규칙 (이름·종목만 보는 규칙 기반).
//
// "야외" = 비바람에 노출되는 부동산 유산. 목조 전각·근대 건축물·가옥처럼 지붕·외벽이 노출되는 건물도 야외로 본다.
// "실내" = 건물 안에 두는 이동 가능한 소장품(불화·목판·문서·초상·목조/금동 불상 등).
// "애매" = 규칙으로 판단이 안 되는 것. 호출 쪽에서 어떻게 다룰지 정한다.
//
// classify(properties) → { cls: "야외"|"실내"|"애매", rule, matched }
//   rule 은 어떤 규칙이 판단했는지, matched 는 근거가 된 키워드/글자.

// 종목만으로 야외로 보는 카테고리 (단, A_EXCEPT 이름은 애매로 뺀다)
export const TIER_A = new Set(["사적", "명승", "천연기념물", "시도기념물", "시도자연유산", "시도자연유산자료"]);
const A_EXCEPT = /동굴|기념관|해저유물/;

// 이름에 들어가면 야외 구조물·유적·조형물인 키워드
const OUT_SUBSTR = new RegExp([
  "마애|암각|석탑|전탑|모전|승탑|부도|탑비|석등|장명등|당간|지주|석주|석종|장승|벅수|솟대|돌하르방|입석|선돌|고인돌|지석묘|산성|읍성|토성|왜성|성곽|성문|성지|성혈",
  "향교|서원|서당|고택|종택|고가|가옥|생가|한옥|초가|사당|사우|영우|재사|재실|영당|정려|묘려|홍살문|일주문|관아|동헌|객사|내아|이아|담장|돌담",
  "고분|분군|왕릉|묘역|묘소|묘비|묘표|묘갈|신도비|선정비|송덕비|공덕비|사적비|유허|가마|요지|패총|석축|우물|정자|누각|문루|옹성|봉수|보루|목책|돈대|공심돈",
  "사지|원지|궁지|교회|성당|양관|공사관|영사관|학교|본관|서관|동관|정사|별서|원림|귀부|이수|석물|표석|계표|석표|봉표|석인|석사자|용호석|배례석|석련지",
  "미륵불|미륵좌불|굴뚝|석굴|다리|터널|배수지|제방|독살|연자|맷돌|방아|온돌|나루|주막|마을|세거지|거리|벙커|방공호|진지|시설|상가주택|주택|창고",
  "금융조합|은행|우체국|협회|호텔|사무소|사무동|청사|병원|극장|학당|사옥|공장|정미소|양조장|주조장|제철소|터미널|역사|식당동|서고|아틀리에|경찰서|노동조합|상회|세탁|여인숙|사령부|주둔소|저장탱크|수원지|정수장|사택|선교사촌|관사|구락부",
  "공룡|화석|유적|유구|당산|성황|서낭|제단|천제|수조|연지|서석지|수표|수위표|철도|철교|교량|고로|석조|석분|대좌|광배|불두|노주|근석|남근|암수바위|석마|자웅석|석돈|석수|각석|사랑채|정침|뒤주|폐탑|불감|굴항|수문|왕버들|해시계",
  "동자복|서자복|각서석", // 제주 복신미륵(석상), 부산 각서석 등 — 명백한 야외 석조물
].join("|"));
const OUT_LASTCHAR = new Set("탑비문루정각당전사교묘릉능궁재헌대성옥택댁가집역청간원관실방점고창장소터단암봉지총호굴려".split(""));

// 실내: 이동 가능한 소장품·문서·그림·불상(재질). 건물 접미사가 붙으면 건물이므로 제외
const IND_SUBSTR = /병풍|문서|전적|서적|목판|경판|판목|책판|불화|탱화|괘불|소장|유물|일기|절목|족보/;
const IND_END = /(초상|진영|초상화|탱|범종|동종)$|(신중|감로|칠성|산신|독성|지장|나한|영산회상|후불)도$/;
const BUILDING_END = /[각루전정당재문관사원실헌청암]$/;
const STATUE = /좌상|입상|불상|여래|보살|나한|삼존|삼세불|지장|관음|아미타|비로자나|미륵|불$|상$/;
const STATUE_OUT = /마애|석불|석조|석상|(^|\s)석(\s|$)|돌|철불/;
const STATUE_IN = /목조|금동|소조|건칠|도금|동조|청동|은제|금제|철조|칠|지본|견본/;
const STRONG_OUT = /마애|암각|석탑|승탑|부도|탑비|석등|당간|석종|산성|왕릉|고분|분군|묘역|사리탑/;
const PORTRAIT_END = /(초상|진영|초상화)$/; // 초상화: "…상"으로 끝나 불상류로 오인되지 않도록 먼저 본다

const m = (re, s) => (s.match(re) ?? [""])[0];

export function classify(p) {
  const kind = p.종목명;
  const full = p.국가유산명.trim().replace(/\(.*?\)|<.*?>/g, "");
  if (TIER_A.has(kind)) {
    return A_EXCEPT.test(full) ? { cls: "애매", rule: "category-exception", matched: m(A_EXCEPT, full) } : { cls: "야외", rule: "category", matched: kind };
  }
  const head = full.split(/[와과]\s|\s및\s/)[0].trim(); // "A와 B", "A 및 B" 는 앞 요소가 대표
  const last = head.split(/\s+/).pop();
  const lastFull = full.split(/\s+/).pop();

  if (PORTRAIT_END.test(last) && !OUT_SUBSTR.test(full)) return { cls: "실내", rule: "portrait", matched: m(PORTRAIT_END, last) };
  if (STRONG_OUT.test(full)) return { cls: "야외", rule: "strong-keyword", matched: m(STRONG_OUT, full) };
  if (STATUE.test(last) && !BUILDING_END.test(last)) {
    if (STATUE_OUT.test(head)) return { cls: "야외", rule: "stone-statue", matched: m(STATUE_OUT, head) };
    if (STATUE_IN.test(head)) return { cls: "실내", rule: "material-statue", matched: m(STATUE_IN, head) };
    if (!OUT_SUBSTR.test(full)) return { cls: "애매", rule: "statue-unknown-material", matched: m(STATUE, last) };
  }
  const headIndoor = IND_END.test(last) || (IND_SUBSTR.test(last) && !BUILDING_END.test(last));
  if (headIndoor) {
    const matched = m(IND_END, last) || m(IND_SUBSTR, last);
    return OUT_SUBSTR.test(full) || /(정려|비|묘|요지|가마)$/.test(full)
      ? { cls: "애매", rule: "mixed-indoor-outdoor", matched }
      : { cls: "실내", rule: "movable-keyword", matched };
  }
  if (OUT_SUBSTR.test(full)) return { cls: "야외", rule: "outdoor-keyword", matched: m(OUT_SUBSTR, full) };
  const ch = OUT_LASTCHAR.has(lastFull.slice(-1)) ? lastFull.slice(-1) : OUT_LASTCHAR.has(last.slice(-1)) ? last.slice(-1) : null;
  if (ch) return { cls: "야외", rule: "end-char", matched: ch };
  return { cls: "애매", rule: "no-rule", matched: "" };
}
