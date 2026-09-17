# 국가유산 기상관측판 — 지도 기반 프로토타입

야외 국가유산의 재질별 기상 취약도를 지도 위에서 관측하는 웹앱. 계산 로직(재질별 가중치, 점수 공식,
4단계 경보 매핑, 권장조치 문구)은 [legacy/heritage-weather-watch.html](legacy/heritage-weather-watch.html)
프로토타입에서 그대로 이식했다.

## 폴더 구조

- `legacy/` — 원본 목록형 프로토타입 (계산 로직 원본 참조용, 보존)
- `frontend/` — Vite + React + TypeScript + Leaflet 지도 앱
  - `src/domain/` — 이식된 계산 로직 (`scoring.ts`, `advice.ts`, `constants.ts`) — 실시간/시뮬레이션 모드 공용, 수정 없음
  - `src/data/sites.mock.ts` — 16개 유산 mock 데이터(좌표 포함)
  - `src/hooks/useHeritageData.ts` — 유산 메타데이터(mock) 소스
  - `src/hooks/useLiveWeather.ts` — 백엔드 `/api/live` 폴링(5분 주기) 훅
  - `src/components/` — MapView, HeritageMarker, SidePanel, ScenarioControls, ModeToggle, LiveStatusBar, SummaryPanel
- `backend/` — Node.js/Express, 공공데이터 프록시·캐시 서버
  - `src/domain/grid.ts` — 기상청 LCC 위경도→격자(nx,ny) 변환
  - `src/data/sites.ts`, `src/data/siteAdminMap.ts` — 유산 좌표 및 시군구 코드 매핑
  - `src/services/kmaClient.ts` — 기상청 초단기실황(`getUltraSrtNcst`) 호출 + 10분 캐시
  - `src/services/forestFireClient.ts` — 국립산림과학원 산불위험예보(시군구) 호출 + 30분 캐시
  - `src/routes/live.ts` — `GET /api/live` — 유산별 실시간 weather+fireIdx 반환
- `docs/` — API 필드 매핑 메모

## 현재 진행 상태

**Phase 1 (mock 지도 UI)** 및 **Phase 2 (실시간 데이터 연동)** 완료.

- 시나리오 시뮬레이션 모드: mock 프리셋/슬라이더 기반 (Phase 1)
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
  않는다. 개별 유산의 기상/산불 데이터 조회가 실패해도 해당 유산만 `null`("데이터 없음")로 표시되고
  나머지 응답에는 영향이 없다.

## 다음 단계

1. 국가유산청 공간정보 Open API 연동(현재 mock 좌표/재질을 대체)
2. 배포 시 프런트 정적 파일을 백엔드에서 함께 서빙하거나 리버스 프록시 구성
