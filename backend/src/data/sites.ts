export interface BackendSite {
  id: string;
  lat: number;
  lng: number;
}

// frontend/src/data/sites.mock.ts 와 동일한 좌표(id 기준). 격자/시군구 매핑에는 위경도만 필요하므로 최소 필드만 보유.
export const SITES: BackendSite[] = [
  { id: "bulguksa", lat: 35.7898, lng: 129.332 },
  { id: "seokguram", lat: 35.7947, lng: 129.3495 },
  { id: "cheomseongdae", lat: 35.8347, lng: 129.2192 },
  { id: "buseoksa", lat: 36.9986, lng: 128.6944 },
  { id: "hahoe", lat: 36.539, lng: 128.5165 },
  { id: "haeinsa", lat: 35.8007, lng: 128.098 },
  { id: "namhansanseong", lat: 37.4784, lng: 127.1826 },
  { id: "hwaseong", lat: 37.285, lng: 127.0104 },
  { id: "jongmyo", lat: 37.5745, lng: 126.9945 },
  { id: "huwon", lat: 37.5824, lng: 126.9911 },
  { id: "gongsanseong", lat: 36.4595, lng: 127.1265 },
  { id: "muryeongneung", lat: 36.4637, lng: 127.1151 },
  { id: "jeongnimsaji", lat: 36.2789, lng: 126.9107 },
  { id: "mireuksaji", lat: 36.0124, lng: 127.0306 },
  { id: "hwasundolmen", lat: 34.9835, lng: 126.9895 },
  { id: "ganghwadolmen", lat: 37.6423, lng: 126.4009 },
];
