// 대시보드 — 프론트 화면 요구사항 정의서 v1 의 화면 구성을 따른다.
//   지도 = 등급 중심, 상세 패널 = 점수 중심 (정의서 5.1)
//   구간 위에 마우스 → 간단한 말풍선 / 클릭 → 강조 + 상세 패널 (정의서 10장)
//   핵심 흐름 "도로 상태 탐색 → 위험구간 발견 → 상세정보 확인" (정의서 1장) → 점수 낮은 구간 목록

// ===== 설정값 =====================================================
const LIST_MAX_H   = 320;   // 점수 낮은 구간 목록의 최대 높이(px). 넘치면 목록 안에서 스크롤
const HIT_WEIGHT   = 22;    // 눈에 안 보이는 터치 영역 굵기(px). 휴대폰에서 20m 구간을 손가락으로 고르기 위함
const FOCUS_ZOOM   = 17;    // 목록에서 구간을 누르면 이 배율까지 확대
const NARROW_MEDIA = "(max-width: 640px)";   // style.css 의 휴대폰 기준과 같게
// ==================================================================

const C = MW_CONFIG;
const state = {
  segs: [],
  lines: new Map(),          // segment_id -> 보이는 선
  hits: new Map(),           // segment_id -> 터치 영역(투명한 굵은 선)
  grades: new Set(Object.keys(C.GRADE_COLORS)),   // 켜져 있는 등급
  road: "",                  // 도로명 검색어
  selected: null,
};

const $ = (id) => document.getElementById(id);
const narrow = () => window.matchMedia(NARROW_MEDIA).matches;
const map = L.map("map", { zoomControl: true });
MW.tiles(map);

// SAMPLE_0061 -> "61번 구간". JSON 의 segment_id 는 그대로 두고 화면에만 이렇게 보인다
function segName(s) {
  const m = s.id.match(/(\d+)$/);
  return m ? `${parseInt(m[1], 10)}번 구간` : s.id;
}

// ---------- 필터 ----------
function visible(s) {
  if (!state.grades.has(s.grade)) return false;
  if (state.road && !(s.d.road_name || "").includes(state.road)) return false;
  return true;
}

function applyFilter() {
  let n = 0;
  state.segs.forEach((s) => {
    const show = visible(s);
    [state.lines.get(s.id), state.hits.get(s.id)].forEach((l) => {
      if (show && !map.hasLayer(l)) l.addTo(map);
      if (!show && map.hasLayer(l)) map.removeLayer(l);
    });
    if (show) n++;
  });
  $("count").textContent = n === 0 && state.road
    ? `'${state.road}' 검색 결과가 없습니다`
    : `${state.segs.length}개 구간 중 ${n}개 표시`;
  $("count").classList.toggle("empty", n === 0);
  if (state.selected && !visible(state.selected)) select(null);
  if (!state.selected) renderOverview();
}

function buildChips() {
  const counts = MW.countGrades(state.segs);
  Object.keys(C.GRADE_COLORS).forEach((g) => {
    if (g === C.NO_DATA && !counts[g]) return;
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button";
    b.setAttribute("aria-pressed", "true");
    b.innerHTML = `<i class="dot" style="background:${MW.color(g)}"></i>${g} <small>${counts[g]}</small>`;
    b.onclick = () => {
      const on = b.getAttribute("aria-pressed") === "true";
      b.setAttribute("aria-pressed", String(!on));
      on ? state.grades.delete(g) : state.grades.add(g);
      applyFilter();
    };
    $("chips").appendChild(b);
  });
}

$("searchForm").onsubmit = (e) => {
  e.preventDefault();
  state.road = $("searchInput").value.trim();
  applyFilter();
  const shown = state.segs.filter(visible).map((s) => state.lines.get(s.id));
  if (shown.length) map.fitBounds(L.featureGroup(shown).getBounds(), { padding: [30, 30] });
};

$("resetBtn").onclick = () => {
  state.road = ""; $("searchInput").value = "";
  state.grades = new Set(Object.keys(C.GRADE_COLORS));
  document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", "true"));
  select(null);
  applyFilter();
  fitAll();
};

// ---------- 선택 ----------
function lineStyle(s, mode) {
  const base = { color: MW.color(s.grade), lineCap: "butt" };
  if (mode === "selected") return { ...base, weight: 13, opacity: 1 };
  if (mode === "dim") return { ...base, weight: 7, opacity: 0.35 };
  return { ...base, weight: 8, opacity: 0.95 };
}

// from: "map"(지도에서 누름) / "list"(목록에서 누름) / undefined
function select(s, from) {
  state.selected = s;
  state.segs.forEach((t) => {
    state.lines.get(t.id).setStyle(lineStyle(t, !s ? "normal" : t === s ? "selected" : "dim"));
  });
  if (!s) { renderOverview(); return; }

  state.lines.get(s.id).bringToFront();
  renderDetail(s);
  if (from === "list") {
    map.flyToBounds(state.lines.get(s.id).getBounds(), { maxZoom: FOCUS_ZOOM, duration: 0.6 });
  }
  // 휴대폰에서는 패널이 지도 아래에 있어 눌러도 안 보인다 → 패널로 내려간다
  if (narrow()) {
    setTimeout(() => {      // 패널 내용이 바뀐 뒤에 위치를 잰다
      const top = $("panel").getBoundingClientRect().top + window.scrollY - 64;   // 64 = 위쪽 고정 바
      window.scrollTo({ top, behavior: "smooth" });
    }, 0);
  }
}

// ---------- 상세 패널 ----------
function renderOverview() {
  const shown = state.segs.filter(visible);
  const counts = MW.countGrades(shown);
  const scored = shown.filter((s) => s.d.lcs_score !== null);
  const avg = scored.length ? scored.reduce((a, s) => a + s.d.lcs_score, 0) / scored.length : null;
  const roads = [...new Set(shown.map((s) => s.d.road_name))].join(", ");

  if (!shown.length) {
    $("panel").innerHTML = `<h2>구간 요약</h2>
      <div class="hint">${state.road ? `'${state.road}' 에 해당하는 구간이 없습니다. 도로명을 확인하거나 [초기화]를 눌러 주세요.`
        : "선택한 등급에 해당하는 구간이 없습니다."}</div>`;
    return;
  }

  let rows = "";
  Object.keys(C.GRADE_COLORS).forEach((g) => {
    if (g === C.NO_DATA && !counts[g]) return;
    const pct = (counts[g] / shown.length) * 100;
    rows += `<div class="metric"><span><i class="dot" style="background:${MW.color(g)}"></i>${g}</span>
      <div class="bar"><i style="width:${pct}%;background:${MW.color(g)}"></i></div><b>${counts[g]}</b></div>`;
  });

  // 점수 낮은 순 — 점수 없는(데이터 부족) 구간은 맨 뒤
  const sorted = [...shown].sort((a, b) =>
    (a.d.lcs_score ?? Infinity) - (b.d.lcs_score ?? Infinity));
  const items = sorted.map((s) => `
    <li><button type="button" class="seg-item" data-id="${s.id}">
      <i class="dot" style="background:${MW.color(s.grade)}"></i>
      <span class="name">${segName(s)}</span>
      <b>${s.d.lcs_score === null ? "—" : MW.fmt(s.d.lcs_score)}</b>
      <span class="grade" style="color:${MW.color(s.grade)}">${s.grade}</span>
    </button></li>`).join("");

  $("panel").innerHTML = `
    <h2>구간 요약</h2>
    <div class="sub">${roads}</div>
    <div class="block">
      <div class="block-title">평균 LCS</div>
      <div class="lcs-big"><b>${MW.fmt(avg)}</b><span>/ 100</span></div>
    </div>
    <div class="block">
      <div class="block-title">등급별 구간 수 (${shown.length}개 · ${(shown.length * C.SEGMENT_M / 1000).toFixed(2)}km)</div>
      ${rows}
    </div>
    <div class="block">
      <div class="block-title">점수 낮은 구간부터 · 누르면 지도에서 찾아갑니다</div>
      <ul class="seg-list" style="max-height:${LIST_MAX_H}px">${items}</ul>
    </div>`;

  $("panel").querySelectorAll(".seg-item").forEach((b) => {
    b.onclick = () => select(state.segs.find((s) => s.id === b.dataset.id), "list");
  });
}

function renderDetail(s) {
  const d = s.d, m = d.capture_metadata || {};
  const color = MW.color(s.grade);
  const noData = d.lcs_score === null;

  const links = MW.mapLinks(d.latitude, d.longitude, `${d.road_name || ""} ${segName(s)}`.trim())
    .map((l) => `<a class="maplink" href="${l.url}" target="_blank" rel="noopener">${l.name} ↗</a>`).join("");

  const metrics = C.METRICS.map((k) => {
    const v = d[k.key];
    const col = MW.color(MW.gradeOf(v));      // 80 이상 초록 / 60~80 주황 / 60 미만 빨강
    return `<div class="metric"><span>${k.name}</span>
      <div class="bar"><i style="width:${v ?? 0}%;background:${col}"></i></div><b style="color:${col}">${MW.fmt(v, 0)}</b></div>`;
  }).join("");

  $("panel").innerHTML = `
    <div class="panel-head">
      <div><h2>${d.road_name || "—"}</h2><div class="sub">${segName(s)}</div></div>
      <button class="close" type="button" aria-label="목록으로" title="목록으로" id="closeBtn">×</button>
    </div>

    <div class="block">
      <div class="block-title">LCS</div>
      ${noData
        ? `<div class="lcs-big"><b>—</b><span class="pill" style="background:${color}">${s.grade}</span></div>
           <div class="hint">유효 사진이 3장 미만이라 점수를 매기지 않았습니다.</div>`
        : `<div class="lcs-big"><b>${MW.fmt(d.lcs_score)}</b><span>/ 100</span>
             <span class="pill" style="background:${color}">${s.grade}</span></div>
           <div class="progress"><i style="width:${d.lcs_score}%;background:${color}"></i></div>`}
    </div>

    <div class="block">
      <div class="block-title" title="가중치: 면적 40% · 연속성 25% · 명암비 20% · 밝기 15%
막대 색: 80 이상 초록 · 60~80 주황 · 60 미만 빨강">세부 지표 ⓘ</div>
      ${metrics}
    </div>

    <div class="block">
      <div class="block-title">촬영 정보</div>
      <table class="info">
        <tr><td>위치</td><td class="maplinks">${links}</td></tr>
        <tr><td>촬영 일시</td><td>${MW.fmtTime(d.captured_at)}</td></tr>
        <tr><td>유효 사진 수</td><td>${d.frame_count ?? "—"}장</td></tr>
        <tr><td>주간 / 야간</td><td>${m.day_night || "—"}</td></tr>
        <tr><td>날씨</td><td>${m.weather || "—"}</td></tr>
        <tr><td>차량 속도</td><td>${m.vehicle_speed != null ? m.vehicle_speed + " km/h" : "—"}</td></tr>
        <tr><td>카메라</td><td>${m.camera_model || "—"}</td></tr>
        <tr><td>AI 신뢰도</td><td>${d.confidence != null ? MW.fmt(d.confidence, 2) : "—"}</td></tr>
      </table>
    </div>
    <button class="btn btn-light btn-sm back" type="button" id="backBtn">← 구간 목록으로</button>`;
  $("closeBtn").onclick = () => select(null);
  $("backBtn").onclick = () => select(null);
}

// ---------- CSV (정의서 12장 — 지금 필터 조건 그대로) ----------
$("csvBtn").onclick = () => {
  const sample = C.SHOW_SAMPLE_NOTICE;     // 점수가 예시 값이면 파일 안팎에 표시한다
  const cols = ["segment_id", "road_name", "latitude", "longitude", "lcs_score", "lcs_grade",
    "area_score", "continuity_score", "contrast_score", "brightness_score", "captured_at", "frame_count"];
  if (sample) cols.push("note");
  const esc = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const lines = [cols.join(",")];
  const shown = state.segs.filter(visible);
  shown.forEach((s) => {
    const row = { ...s.d, segment_id: s.id, lcs_grade: s.grade === C.NO_DATA ? "" : s.grade,
                  note: "예시 값(실제 점수 아님)" };
    lines.push(cols.map((c) => esc(row[c])).join(","));
  });
  // 파일 이름은 오늘 날짜가 아니라 촬영 날짜
  const day = (shown[0] || state.segs[0]).d.captured_at.slice(0, 10).replace(/-/g, "");
  // 엑셀에서 한글이 깨지지 않게 BOM 을 붙인다
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mapwear_segments_${day}${sample ? "_예시값" : ""}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---------- 범례 (휴대폰에서는 접어 둔다) ----------
function addLegend() {
  const counts = MW.countGrades(state.segs);
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("details", "legend");
    if (!narrow()) div.open = true;
    div.innerHTML = "<summary>LCS 등급</summary>" + Object.keys(C.GRADE_COLORS)
      .filter((g) => g !== C.NO_DATA || counts[g])
      .map((g) => `<div><i class="dot" style="background:${MW.color(g)}"></i>${g}${
        g === "양호" ? " (80~100)" : g === "주의" ? " (60~80)" : g === "위험" ? " (0~60)" : ""}</div>`)
      .join("");
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legend.addTo(map);
}

function fitAll() {
  map.fitBounds(L.featureGroup([...state.lines.values()]).getBounds(), { padding: [30, 30] });
}

// ---------- 시작 ----------
(async function () {
  MW.notice($("notice"));
  try {
    state.segs = await MW.load();
  } catch (e) {
    $("panel").innerHTML = `<div class="error">${e.message}</div>`;
    return;
  }

  state.segs.forEach((s) => {
    // 보이는 선은 눌리지 않게 하고, 그 위에 투명한 굵은 선을 덧대 손가락으로 누르기 쉽게 한다
    const line = L.polyline(s.latlngs, { ...lineStyle(s, "normal"), interactive: false }).addTo(map);
    const hit = L.polyline(s.latlngs, { weight: HIT_WEIGHT, opacity: 0, lineCap: "butt" }).addTo(map);
    const tip = s.d.lcs_score === null
      ? `${s.d.road_name} ${segName(s)} · ${s.grade}`
      : `${s.d.road_name} ${segName(s)} · LCS ${MW.fmt(s.d.lcs_score)} · ${s.grade}`;
    hit.bindTooltip(tip, { sticky: true, className: "seg-tip", direction: "top" });
    hit.on("click", (e) => { L.DomEvent.stopPropagation(e); select(s, "map"); });
    state.lines.set(s.id, line);
    state.hits.set(s.id, hit);
  });
  map.on("click", () => select(null));

  [...new Set(state.segs.map((s) => s.d.road_name))].forEach((r) => {
    $("roadList").insertAdjacentHTML("beforeend", `<option value="${r}">`);
  });

  buildChips();
  addLegend();
  fitAll();
  applyFilter();
})();
