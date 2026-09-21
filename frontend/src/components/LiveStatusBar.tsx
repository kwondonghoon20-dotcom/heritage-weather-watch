interface Props {
  updatedAt: string | null;
  weatherAsOf: string | null;
  refreshHours: number | null;
  pendingGrids: number;
  loading: boolean;
  error: string | null;
  missingCount: number;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

export function LiveStatusBar({ updatedAt, weatherAsOf, refreshHours, pendingGrids, loading, error, missingCount }: Props) {
  return (
    <section className="control-bar" aria-label="실시간 관측 상태">
      <h2>실시간 관측 상태</h2>
      <p className="live-status">
        출처: 기상청 초단기실황 · 국립산림과학원 산불위험예보
        <br />
        날씨는 유산이 속한 5km 격자마다 조회하고{refreshHours ? ` ${refreshHours}시간마다` : ""} 갱신합니다. 산불위험·특보는 시군구 단위 값입니다.
        <br />
        마지막 갱신: {loading ? "갱신 중…" : updatedAt ? new Date(updatedAt).toLocaleTimeString("ko-KR") : "아직 없음"}
        {weatherAsOf && !loading ? ` · 날씨 관측 기준 ${timeOf(weatherAsOf)}` : ""}
      </p>
      {error && <p className="live-error">백엔드 연결 실패: {error} — 백엔드 서버(포트 4000)가 실행 중인지 확인하세요.</p>}
      {pendingGrids > 0 && !error && (
        <p className="live-status">기상 격자 {pendingGrids.toLocaleString()}곳의 값을 채우는 중입니다 — 잠시 후 자동으로 갱신됩니다.</p>
      )}
      {missingCount > 0 && pendingGrids === 0 && !error && (
        <p className="live-error">{missingCount}곳은 실시간 데이터를 가져오지 못해 "데이터 없음"으로 표시됩니다.</p>
      )}
    </section>
  );
}
