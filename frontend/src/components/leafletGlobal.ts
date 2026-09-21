import L from "leaflet";

// leaflet.markercluster 는 전역 L 에 자신을 붙이는 UMD 플러그인이다. 번들러가 쓰는 leaflet 의 ESM 빌드는
// window.L 을 만들지 않으므로, 플러그인을 import 하기 전에 이 모듈을 먼저 import 해서 전역에 걸어 둔다.
(globalThis as unknown as { L: typeof L }).L = L;

export default L;
