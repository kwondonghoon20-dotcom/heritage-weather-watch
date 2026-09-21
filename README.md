# 국가유산 기상관측판 — 지도 기반 프로토타입

야외 국가유산의 재질별 기상 취약도를 지도 위에서 관측하는 웹앱. 계산 로직(재질별 가중치, 점수 공식,
4단계 경보 매핑, 권장조치 문구)은 [legacy/heritage-weather-watch.html](legacy/heritage-weather-watch.html)
프로토타입에서 그대로 이식했다.

## 폴더 구조

- `legacy/` — 원본 목록형 프로토타입 (계산 로직 원본 참조용, 보존)
- `frontend/` — Vite + React + TypeScript + Leaflet 지도 앱
  - `src/domain/` — 이식된 계산 로직 (`scoring.ts`, `advice.ts`, `constants.ts`) — 실시간/시뮬레이션 모드 공용, 수정 없음
  - `src/hooks/useSiteCatalog.ts`, `useHeritageData.ts` — 앱 시작 시 `/api/sites`(유산 1,617곳)를 1회 받아 시나리오·실시간 모드가 함께 쓴다.
    이 카탈로그가 유산 목록의 유일한 출처이며 대체 데이터는 없다(실패하면 안내와 "다시 시도" 버튼을 보여준다)
  - `src/hooks/useLiveWeather.ts` — 백엔드 `/api/live` 폴링 훅(5분 주기, 서버가 아직 다 못 채운 응답이면 15초 뒤 재요청)과, 날씨(격자)와 산불위험·특보(시군구)를 유산별로 합치는 `resolveLiveSite`
  - `src/components/` — MapView, ClusterLayer(leaflet.markercluster), SidePanel, ScenarioControls, ModeToggle, LiveStatusBar, SummaryPanel, MaterialFilter(재질 7종 필터)
- `backend/` — Node.js/Express, 공공데이터 프록시·캐시 서버
  - `src/domain/grid.ts` — 기상청 LCC 위경도→격자(nx,ny) 변환
  - `src/data/heritageSites.generated.ts` — 유산 1,617곳 카탈로그(자동 생성, `scripts/heritage/build-sites.mjs`).
    큐레이션한 16곳의 regionTag·elevationProfile·era·desc 는 `scripts/heritage/site-overrides.json`에 있다
  - `src/siteGrids.ts` — 유산이 놓인 기상청 5km 격자 741개(유산 수 순)와 결측 격자의 이웃 대체 후보
  - `src/liveRegions.ts` — 시군구 191곳과 시군구별 산불 코드(산불위험·특보가 시군구 단위로만 값을 주기 때문)
  - `src/services/kmaClient.ts` — 기상청 초단기실황(`getUltraSrtNcst`) 호출 + 격자별 캐시(시계 기준 N시간 구간), 실패 백오프, 일일 호출 상한, 개발용 디스크 캐시
  - `src/services/forestFireClient.ts` — 국립산림과학원 산불위험예보(시군구) 호출 + 30분 캐시
  - `src/services/warningClient.ts` — 기상청 API허브 특보 조회 + 시군구↔특보 구역 매칭
  - `src/liveData.ts` — `/api/live` 조립(격자 조회 + 응답 제한 시간 + 결측 대체) 및 CDN `Cache-Control` 계산
  - `src/routes/live.ts`, `sites.ts` — `GET /api/live`(격자별 날씨 `grids` + 시군구별 산불·특보 `regions`), `GET /api/sites`(유산 카탈로그, 유산마다 자기 격자 키 `grid` 포함)
- `docs/` — API 필드 매핑 메모

## 현재 진행 상태

**Phase 1 (mock 지도 UI)** 및 **Phase 2 (실시간 데이터 연동)** 완료.

- 시나리오 시뮬레이션 모드: 프리셋/슬라이더로 정한 가상 기상값 기반 (Phase 1)
- 실시간 관측 모드: 기상청 초단기실황 + 국립산림과학원 산불위험예보 실제 API 연동 (Phase 2)
- 두 모드 모두 상단 토글로 전환, 동일한 `domain/scoring.ts` 계산 로직 사용

## 실행 방법

두 서버를 각각 다른 터미널에서 실행한다 (프런트는 `/api`를 백엔드로 프록시).

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

`.env`(레포 루트)에 `KMA_API_KEY`, `FOREST_FIRE_API_KEY`를 채워야 실시간 모드가 동작한다. `.env.example` 참고.

## 실시간 데이터 연동 메모

- **기상청**: `VilageFcstInfoService_2.0/getUltraSrtNcst` (초단기실황). 매시 40분 발표, 배포 지연을 감안해
  45분 이전 요청 시 이전 시각 값을 사용한다. `RN1`(강수)·`T1H`(기온)·`WSD`(풍속)·`REH`(습도)를 사용.
- **국립산림과학원 산불위험예보**: `forestPointV2/forestPointListSigunguSearchV2` (시·군·구 단위,
  `localAreas`에 5자리 시군구코드를 콤마로 여러 개 묶어 한 번에 조회 가능). 응답의 `meanavg`(0~100)를
  낮음(≤50)/다소높음(51~65)/높음(66~85)/매우높음(86~) 4등급으로 변환해 `fireIdx`(1~4)에 매핑한다.
  - 주의: 시군구 코드는 최신 행정구역 개편을 반영해야 한다 — 전북특별자치도 출범으로 익산시는
    `52140`(구 `45xxx` 아님), 전남·광주 통합특별시 출범으로 화순군은 `12760`(구 `46xxx` 아님)이다.
    두 값 모두 실제 API 호출로 검증했다. 나머지 지역 코드도 향후 행정구역 개편 시 재검증이 필요하다.
- 두 API 모두 서버(`backend/`)에서만 키를 사용하며, `/api/live` 응답에는 원본 키나 요청 URL이 노출되지
  않는다. 시군구 하나의 기상/산불 데이터 조회가 실패해도 그 시군구만 `null`("데이터 없음")로 표시되고
  나머지 응답에는 영향이 없다.
- **유산별 격자 날씨**: 유산 1,617곳은 기상청 5km 격자 741개에 놓이고, 각 격자를 개별로 조회한다(시군구 대표 격자 방식은 폐지).
  `/api/live` 응답의 `grids` 키는 `"nx,ny"`이고, 유산은 `/api/sites`가 붙여 준 자기 `grid`로 날씨를, `sigunguCode`로 산불위험·특보를 찾는다
  (`resolveLiveSite`). 산불위험예보와 특보는 API 자체가 시군구 단위라 그대로 시군구 단위다.
- **캐시 주기와 호출량**: 하루 호출량 = 741 × (24 ÷ `KMA_CACHE_HOURS`). 기본 3시간이면 **5,928건/일**(한도 10,000건의 59%)이고,
  2시간(8,892건)은 목표(8,000건)를 넘는다. 캐시는 KST 0시부터 N시간 단위의 시계 기준 구간으로 나뉘어, 구간마다 격자당 최대 1번만 조회한다.
  새 값을 못 받으면 직전 값을 12시간까지 대신 보여준다(값 없음으로 바꾸지 않는다). 그래서 화면의 날씨는 최대 약 4시간 전 관측값일 수 있고,
  `weatherAsOf`(상태 표시줄의 "날씨 관측 기준")가 실제 조회 시각을 알려 준다. 급변은 10분 캐시인 특보가 보완한다.
- **환경변수**(`.env.example` 참고): `KMA_CACHE_HOURS`(기본 3), `KMA_DAILY_CALL_LIMIT`(기본 8,000), `KMA_LIVE_DEADLINE_MS`(기본 7,000, 0=제한 없음),
  `KMA_DISK_CACHE`(로컬 기본 켜짐). 개발 중 호출이 걱정되면 `KMA_CACHE_HOURS`를 키운다.
- **개발 서버 디스크 캐시**: `tsx watch`는 파일을 저장할 때마다 재시작한다. 격자 캐시와 오늘 호출 수를 `.cache/kma-grid-cache.json`에 저장해
  재시작해도 이어받는다(같은 구간이면 재시작 뒤 호출 0건). Vercel에서는 꺼져 있다. 캐시를 비우려면 이 파일을 지운다.
- **응답 제한 시간과 부분 응답**: 격자 741개를 한 번에 채우면 오래 걸린다(로컬 약 10초). `/api/live`는 `KMA_LIVE_DEADLINE_MS`(7초) 안에 채운 만큼만
  응답한다 — 유산이 많은 격자부터 채우고, 못 채운 격자는 직전 값(없으면 `null` = "아직 값 없음")이며 `complete:false`로 표시한다. 프런트는 15초 뒤
  다시 요청해 이어서 채운다.
- **CDN 캐시 헤더**(`liveCacheControl`): 전부 이번 구간 값이면 `s-maxage`를 "이번 캐시 구간이 끝날 때까지(최대 `KMA_CACHE_HOURS`시간)"로 두고
  `stale-while-revalidate=3600`을 붙인다. 고정 3시간이 아니라 구간 끝에 맞추는 이유는, 어긋나면 서버 구간 3시간 + CDN 3시간이 겹쳐 값이 최대 7시간까지
  낡기 때문이다. 못 채운 응답은 5~10초, 조회 실패가 있으면 5분만 캐시한다.
- **`/api/sites` 캐시**: 응답이 브라우저·CDN에 길게 캐시되므로(`stale-while-revalidate=86400`) 응답 모양이 바뀌면 프런트 `useSiteCatalog.ts`의 `SITES_URL`
  버전(`?v=`)을 올려야 한다. 안 올리면 재방문자가 옛 카탈로그로 새 화면을 그려 실시간 값이 전부 "데이터 없음"이 된다(로컬에서 실제로 겪음).
- **산불 코드**: 카탈로그 시군구코드는 산불 API 코드와 같은 체계지만 여주시(41730)·청주시(43710)·당진시(44830)·
  창원시(48110)는 API에서 각각 41670·43110·44270·48120으로 조회해야 한다(`liveRegions.ts`의 별칭).
- **기상 결측**: 관측값이 없는 격자는 `-999`류 값이 내려온다. 이를 "데이터 없음"으로 다루고 이웃 격자(상하좌우→대각, 이미 조회하는 유산 격자 우선, 최대 6곳)의 값을 대신 쓴다.
  결측은 다시 물어도 같으므로 그 구간 동안 확정으로 캐시한다. 조회 자체가 실패한 격자는 2분→4분→…최대 1시간 백오프 뒤에 다시 시도한다.
- **특보 등급 판정**: 특보수준(LVL)은 화이트리스트로만 인정한다 — 원본 값 `주의`→주의보, `경보`→경보, `중대경보`→경보. 발효 전인 `예비`(예비특보)를 포함해
  그 밖의 값은 특보 없음으로 처리한다(원본은 "주의보"가 아니라 "주의"로 내려온다). 특보 조회 시간 제한은 4초, 실패 결과는 90초만 캐시한다. 회귀 테스트: `cd backend && npm test`.
- **호출량 보호**: 하루 호출 수가 `KMA_DAILY_CALL_LIMIT`(기본 8,000)에 닿으면 조회를 멈추고 직전 값으로 응답한다(개발 서버에서는 재시작해도 카운터를 이어받는다).

## 알려진 한계

- **서울 특보 권역**: 서울 특보는 4개 권역(동남·동북·서남·서북)으로 나뉘는데 구→권역 매핑이 없어, 어느 권역의 특보든 서울의
  모든 구가 받는다. 특보가 일부 권역에만 걸리는 날에는 다른 권역의 구(예: 종로구 71곳)에 과다하게 표시될 수 있다.
  다른 광역시의 동부/서부 권역도 마찬가지다. (`backend/src/services/warningClient.ts` 주석 참고, 의도적으로 미해결)
- **Vercel 인스턴스 캐시는 공유되지 않는다**: 격자 캐시는 함수 인스턴스의 메모리에 있어서 콜드스타트나 인스턴스가 늘 때마다 비어 있다. 그때마다
  최대 741건이 다시 나가므로 하루 5,928건이라는 계산은 "인스턴스가 하나이고 계속 살아 있을 때"의 값이다. CDN 캐시 헤더(위)가 함수 호출 자체를 줄여
  완화하지만 상한을 보장하지는 않는다 — `KMA_DAILY_CALL_LIMIT`도 인스턴스별로 센다. 여러 인스턴스에서도 확실히 지키려면 공유 저장소(KV·Blob 등)가 필요하다.
- **시군구가 없는 유산 1건**(포항 여강이씨 달전재사)은 격자 날씨는 있지만 산불위험(시군구 단위)을 알 수 없어 "데이터 없음"으로 표시된다.
- **옛 화면이 열려 있는 탭**: 배포 전에 로드된 프런트는 옛 `/api/live` 응답 모양(시군구별 값)을 기대하므로 배포 뒤 새로고침하기 전까지 값이 깨진다.

## 다음 단계

1. 국가유산청 공간정보 Open API 연동(현재는 gis-heritage.go.kr 공간정보를 가공한 정적 카탈로그 사용)
2. 배포 시 프런트 정적 파일을 백엔드에서 함께 서빙하거나 리버스 프록시 구성
