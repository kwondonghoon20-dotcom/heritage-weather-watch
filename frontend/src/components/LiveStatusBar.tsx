interface Props {
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
  missingCount: number;
}

export function LiveStatusBar({ updatedAt, loading, error, missingCount }: Props) {
  return (
    <section className="control-bar" aria-label="실시간 관측 상태">
      <h2>실시간 관측 상태</h2>
      <p className="live-status">
        출처: 기상청 초단기실황 · 국립산림과학원 산불위험예보
        <br />
        마지막 갱신:{" "}
        {loading ? "갱신 중…" : updatedAt ? new Date(updatedAt).toLocaleTimeString("ko-KR") : "아직 없음"}
      </p>
      {error && <p className="live-error">백엔드 연결 실패: {error} — 백엔드 서버(포트 4000)가 실행 중인지 확인하세요.</p>}
      {missingCount > 0 && !error && (
        <p className="live-error">{missingCount}곳은 실시간 데이터를 가져오지 못해 "데이터 없음"으로 표시됩니다.</p>
      )}
    </section>
  );
}
