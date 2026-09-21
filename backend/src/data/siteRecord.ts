// /api/sites 가 내려주는 유산 1건. 프런트의 HeritageSite 타입과 같은 모양이다(era·desc·sigungu 는 선택 필드).
// 프런트 타입과 값 종류를 맞춰 두었으니 한쪽을 바꾸면 다른 쪽도 함께 바꿀 것.
export type SiteMaterial = "wood" | "stone" | "wall" | "mound" | "dolmen" | "site" | "modern";
export type SiteRegionTag = "mountain" | "coast" | "river" | "urban" | "plain";
export type SiteElevationProfile = "flood-prone" | "plain" | "hillside" | "ridge";

export interface SiteRecord {
  id: string;
  name: string;
  region: string;
  sigungu?: string;
  material: SiteMaterial;
  heritageType: string;
  lat: number;
  lng: number;
  regionTag: SiteRegionTag;
  elevationProfile: SiteElevationProfile;
  era?: string;
  desc?: string;
}
