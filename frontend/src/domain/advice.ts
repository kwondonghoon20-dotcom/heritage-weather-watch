import type { FactorKey, LevelKey, MaterialKey } from "../types";

// 원본 프로토타입의 ADVICE_BY_FACTOR / URGENCY_PREFIX 그대로 이식.
export const ADVICE_BY_FACTOR: Record<FactorKey, (material: MaterialKey) => string> = {
  rain: (mat) => {
    if (mat === "wood") return "지속된 강우로 목부재 함수율이 오르고 있습니다. 처마·기와 누수와 배수로 상태를 확인하세요.";
    if (mat === "wall" || mat === "mound") return "누적 강우로 성벽·봉분 지반의 침하나 유실 위험이 커집니다. 배수로와 사면 균열을 순찰하세요.";
    if (mat === "site") return "누적 강우로 노출된 유구와 흙 지반이 침식·유실될 위험이 커집니다. 배수 상태와 표면 세굴, 보호 덮개 상태를 순찰하세요.";
    if (mat === "modern") return "지속된 강우로 외벽 조적 줄눈·방수층과 지붕 배수에서 누수가 생길 수 있습니다. 홈통·옥상 배수와 벽체 습윤 흔적을 확인하세요.";
    return "기단부와 주변 배수 상태를 점검하고 표면 이끼·오염 진행을 살펴보세요.";
  },
  wind: (mat) => {
    if (mat === "wood") return "강풍에 기와·서까래 등 부재 이탈 위험이 있습니다. 취약 부재 고정 상태를 확인하세요.";
    if (mat === "site") return "강풍으로 보호 덮개·안내 시설물이 이탈하거나 노출 지표가 건조·침식될 수 있습니다. 고정 상태를 확인하세요.";
    if (mat === "modern") return "강풍에 지붕 마감재·창호·외장재 이탈 위험이 있습니다. 옥상 시설물과 유리창 고정 상태를 확인하세요.";
    return "강풍에 의한 낙석이나 구조물 전도 가능성을 점검하세요.";
  },
  freeze: (mat) => {
    if (mat === "site") return "기온이 영상과 영하를 오가며 동결·융해가 반복될 수 있습니다. 노출된 유구 단면과 지반의 박락·들뜸 진행 여부를 확인하세요.";
    if (mat === "modern") return "기온이 영상과 영하를 오가며 동결·융해가 반복될 수 있습니다. 외벽 조적·콘크리트 표면의 균열·박리와 배관 동파 여부를 확인하세요.";
    return "기온이 영상과 영하를 오가며 동결·융해가 반복될 수 있습니다. 석재 표면의 균열·박리 진행 여부를 확인하세요.";
  },
  fire: () => "산불 위험도가 높습니다. 방염포 점검, 주변 낙엽·가연물 제거, 소화시설 가동 준비가 필요합니다.",
  humidity: (mat) => {
    if (mat === "site") return "높은 습도가 이어지며 유구 표면의 이끼·식생 번식과 지반 약화 우려가 커집니다. 배수와 식생 관리 상태를 점검하세요.";
    if (mat === "modern") return "높은 습도가 이어지며 벽체 곰팡이·백화와 목부재(창호·지붕틀) 부후 우려가 커집니다. 통풍과 방습 조치를 점검하세요.";
    return "높은 습도가 이어지며 목재 부후균·생물 피해 우려가 커집니다. 통풍과 방습 조치를 점검하세요.";
  },
};

export const URGENCY_PREFIX: Partial<Record<LevelKey, string>> = {
  yellow: "관심을 갖고 지켜봐야 할 상태입니다. ",
  orange: "예방 조치를 준비할 단계입니다. ",
  red: "즉시 현장 확인이 필요한 상태입니다. ",
};

export function adviceFor(levelKey: LevelKey, topFactor: FactorKey, material: MaterialKey): string {
  if (levelKey === "blue") {
    return "현재 두드러진 기상 위험 요인은 확인되지 않습니다. 정기 점검 주기를 유지하세요.";
  }
  const prefix = URGENCY_PREFIX[levelKey] ?? "";
  return prefix + ADVICE_BY_FACTOR[topFactor](material);
}
