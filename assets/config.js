// ===== 설정값 (여기만 바꾸면 된다) ==================================
// 소개 페이지(index.html)와 대시보드(dashboard.html)가 함께 쓴다.
window.MW_CONFIG = {
  // 지도에 그릴 데이터. 같은 형식의 JSON 으로 바꾸면 지도가 바뀐다 (JSON/README.md 형식)
  DATA_URL: "data/lcs_segments_20260914.json",

  // 「지도에서 보기」 버튼. {lat} {lon} {name} 이 실제 값으로 바뀐다. PC·휴대폰 모두 웹으로 열린다.
  // 주소 대신 좌표로 연다 — 열린 지도에서 바로 길찾기가 된다 (2026-10-03 사용자 결정)
  // 구글 지도는 뺐다 — 핀 이름 없이 좌표 숫자로 떠서 보기 나쁘다 (2026-10-03 사용자 결정)
  MAP_LINKS: [
    { name: "카카오맵에서 보기", url: "https://map.kakao.com/link/map/{name},{lat},{lon}" },
  ],

  // 점수가 아직 예시 값이면 true → 화면 위쪽에 안내 띠가 뜬다.
  // YOLO 결과로 진짜 점수를 넣은 뒤 false 로 바꾼다.
  SHOW_SAMPLE_NOTICE: true,
  SAMPLE_NOTICE: "현재 지도의 위치는 실제 촬영 구간이고, 점수는 화면 확인용 예시 값입니다.",

  // 등급 색. 지도 선·범례·막대가 모두 이 값을 쓴다
  GRADE_COLORS: {
    "양호": "#22A06B",
    "주의": "#E5A000",
    "위험": "#E04848",
    "데이터 부족": "#9AA4B2",
  },
  NO_DATA: "데이터 부족",              // lcs_grade 가 null 인 구간의 이름 (형식 설명서 4장)

  // 점수 → 등급 기준 (LCS 정의서 7장). 세부 지표 막대 색에도 같은 기준을 쓴다 (2026-10-03 사용자 요청)
  // ⚠️ 정의서의 등급은 LCS 총점용이다. 지표마다 색을 칠하는 것은 화면 표시 규칙일 뿐이다
  GRADE_CUTS: [
    { min: 80, grade: "양호" },
    { min: 60, grade: "주의" },
    { min: 0,  grade: "위험" },
  ],

  // 4지표 이름과 가중치 (LCS 정의서)
  METRICS: [
    { key: "area_score",       name: "면적 유지율", weight: 0.40 },
    { key: "continuity_score", name: "연속성",      weight: 0.25 },
    { key: "contrast_score",   name: "명암비",      weight: 0.20 },
    { key: "brightness_score", name: "밝기",        weight: 0.15 },
  ],
  SEGMENT_M: 20,                     // 구간 길이 (m)

  // 소개 페이지 「결과」 구역에 보여줄 촬영 정보. JSON 에 없는 값이라 여기 적는다.
  // 데이터를 바꾸면 같이 고칠 것. ⚠️ 사실만 적는다 — "분석 완료" 가 아니라 "뽑은 사진" 수다
  CAPTURE_STATS: {
    frames: 643,          // 영상에서 뽑은 사진 수 (step17, 7프레임마다 1장)
    frame_gap_m: 4.6,     // 사진 사이 거리 (m)
  },

  // 지도 타일 (무료 OpenStreetMap)
  TILE_URL: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  TILE_ATTR: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
// ==================================================================

// ---- 공용 함수 ----
window.MW = {
  // JSON 을 읽어 지도에 쓰기 좋은 모양으로 바꾼다
  async load() {
    const res = await fetch(MW_CONFIG.DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("데이터를 불러오지 못했습니다 (" + res.status + ")");
    const doc = await res.json();
    return doc.segments.map((s) => ({
      id: s.segment_id,
      grade: s.map.lcs_grade || MW_CONFIG.NO_DATA,
      // GeoJSON 은 [경도, 위도] 순서다. Leaflet 은 [위도, 경도] 라 뒤집는다
      latlngs: s.map.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      d: s.detail,
    }));
  },

  mapLinks(lat, lon, name) {
    return MW_CONFIG.MAP_LINKS.map((m) => ({
      name: m.name,
      url: m.url.replace("{lat}", lat).replace("{lon}", lon).replace("{name}", encodeURIComponent(name)),
    }));
  },

  // 점수(0~100) -> 등급 이름. 점수가 없으면 "데이터 부족"
  gradeOf(score) {
    if (score === null || score === undefined) return MW_CONFIG.NO_DATA;
    return (MW_CONFIG.GRADE_CUTS.find((c) => score >= c.min) || MW_CONFIG.GRADE_CUTS.at(-1)).grade;
  },

  color(grade) {
    return MW_CONFIG.GRADE_COLORS[grade] || MW_CONFIG.GRADE_COLORS[MW_CONFIG.NO_DATA];
  },

  fmt(v, digits = 1) {
    return v === null || v === undefined ? "—" : Number(v).toFixed(digits);
  },

  // 2026-09-14T13:30:00.507+09:00 -> 2026.09.14 13:30:00
  fmtTime(iso) {
    if (!iso) return "—";
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    return m ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}:${m[6]}` : iso;
  },

  countGrades(segs) {
    const c = {};
    Object.keys(MW_CONFIG.GRADE_COLORS).forEach((g) => (c[g] = 0));
    segs.forEach((s) => (c[s.grade] = (c[s.grade] || 0) + 1));
    return c;
  },

  notice(el) {
    if (!MW_CONFIG.SHOW_SAMPLE_NOTICE) return;
    el.textContent = MW_CONFIG.SAMPLE_NOTICE;
    el.hidden = false;
  },

  tiles(map) {
    L.tileLayer(MW_CONFIG.TILE_URL, { maxZoom: 19, attribution: MW_CONFIG.TILE_ATTR }).addTo(map);
  },
};
