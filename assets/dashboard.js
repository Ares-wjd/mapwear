// 대시보드 — 프론트 화면 요구사항 정의서 v1 의 화면 구성을 따른다.
//   지도 = 등급 중심, 상세 패널 = 점수 중심 (정의서 5.1)
//   구간 위에 마우스 → 간단한 말풍선 / 클릭 → 강조 + 상세 패널 (정의서 10장)

const C = MW_CONFIG;
const state = {
  segs: [],
  lines: new Map(),          // segment_id -> Leaflet polyline
  grades: new Set(Object.keys(C.GRADE_COLORS)),   // 켜져 있는 등급
  road: "",                  // 도로명 검색어
  selected: null,
};

const $ = (id) => document.getElementById(id);
const map = L.map("map", { zoomControl: true });
MW.tiles(map);

// ---------- 필터 ----------
function visible(s) {
  if (!state.grades.has(s.grade)) return false;
  if (state.road && !(s.d.road_name || "").includes(state.road)) return false;
  return true;
}

function applyFilter() {
  let n = 0;
  state.segs.forEach((s) => {
    const line = state.lines.get(s.id);
    if (visible(s)) { if (!map.hasLayer(line)) line.addTo(map); n++; }
    else if (map.hasLayer(line)) map.removeLayer(line);
  });
  $("count").textContent = `${state.segs.length}개 구간 중 ${n}개 표시`;
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

function select(s) {
  state.selected = s;
  state.segs.forEach((t) => {
    state.lines.get(t.id).setStyle(lineStyle(t, !s ? "normal" : t === s ? "selected" : "dim"));
  });
  if (s) { state.lines.get(s.id).bringToFront(); renderDetail(s); }
  else renderOverview();
}

// ---------- 상세 패널 ----------
function renderOverview() {
  const shown = state.segs.filter(visible);
  const counts = MW.countGrades(shown);
  const scored = shown.filter((s) => s.d.lcs_score !== null);
  const avg = scored.length ? scored.reduce((a, s) => a + s.d.lcs_score, 0) / scored.length : null;
  const roads = [...new Set(shown.map((s) => s.d.road_name))].join(", ") || "—";

  let rows = "";
  Object.keys(C.GRADE_COLORS).forEach((g) => {
    if (g === C.NO_DATA && !counts[g]) return;
    const pct = shown.length ? (counts[g] / shown.length) * 100 : 0;
    rows += `<div class="metric"><span><i class="dot" style="background:${MW.color(g)}"></i>${g}</span>
      <div class="bar"><i style="width:${pct}%;background:${MW.color(g)}"></i></div><b>${counts[g]}</b></div>`;
  });

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
    <div class="hint">지도에서 구간(선)을 누르면 그 구간의 LCS와 4개 지표, 촬영 정보를 볼 수 있습니다.</div>`;
}

function renderDetail(s) {
  const d = s.d, m = d.capture_metadata || {};
  const color = MW.color(s.grade);
  const noData = d.lcs_score === null;

  const metrics = C.METRICS.map((k) => {
    const v = d[k.key];
    return `<div class="metric"><span>${k.name}</span>
      <div class="bar"><i style="width:${v ?? 0}%"></i></div><b>${MW.fmt(v, 0)}</b></div>`;
  }).join("");

  $("panel").innerHTML = `
    <div class="panel-head">
      <div><h2>${d.road_name || "—"}</h2><div class="sub">${s.id}</div></div>
      <button class="close" type="button" aria-label="닫기" id="closeBtn">×</button>
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
      <div class="block-title" title="가중치: 면적 40% · 연속성 25% · 명암비 20% · 밝기 15%">세부 지표 ⓘ</div>
      ${metrics}
    </div>

    <div class="block">
      <div class="block-title">촬영 정보</div>
      <table class="info">
        <tr><td>촬영 일시</td><td>${MW.fmtTime(d.captured_at)}</td></tr>
        <tr><td>유효 사진 수</td><td>${d.frame_count ?? "—"}장</td></tr>
        <tr><td>주간 / 야간</td><td>${m.day_night || "—"}</td></tr>
        <tr><td>날씨</td><td>${m.weather || "—"}</td></tr>
        <tr><td>차량 속도</td><td>${m.vehicle_speed != null ? m.vehicle_speed + " km/h" : "—"}</td></tr>
        <tr><td>카메라</td><td>${m.camera_model || "—"}</td></tr>
        <tr><td>AI 신뢰도</td><td>${d.confidence != null ? MW.fmt(d.confidence, 2) : "—"}</td></tr>
      </table>
    </div>`;
  $("closeBtn").onclick = () => select(null);
}

// ---------- CSV (정의서 12장 — 지금 필터 조건 그대로) ----------
$("csvBtn").onclick = () => {
  const cols = ["segment_id", "road_name", "latitude", "longitude", "lcs_score", "lcs_grade",
    "area_score", "continuity_score", "contrast_score", "brightness_score", "captured_at", "frame_count"];
  const esc = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const lines = [cols.join(",")];
  state.segs.filter(visible).forEach((s) => {
    const row = { ...s.d, segment_id: s.id, lcs_grade: s.grade === C.NO_DATA ? "" : s.grade };
    lines.push(cols.map((c) => esc(row[c])).join(","));
  });
  // 엑셀에서 한글이 깨지지 않게 BOM 을 붙인다
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mapwear_segments_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---------- 범례 ----------
function addLegend() {
  const counts = MW.countGrades(state.segs);
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = "<b>LCS 등급</b>" + Object.keys(C.GRADE_COLORS)
      .filter((g) => g !== C.NO_DATA || counts[g])
      .map((g) => `<div><i class="dot" style="background:${MW.color(g)}"></i>${g}${
        g === "양호" ? " (80~100)" : g === "주의" ? " (60~80)" : g === "위험" ? " (0~60)" : ""}</div>`)
      .join("");
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
    const line = L.polyline(s.latlngs, lineStyle(s, "normal")).addTo(map);
    const tip = s.d.lcs_score === null
      ? `${s.d.road_name} · ${s.grade}`
      : `${s.d.road_name} · LCS ${MW.fmt(s.d.lcs_score)} · ${s.grade}`;
    line.bindTooltip(tip, { sticky: true, className: "seg-tip", direction: "top" });
    line.on("click", (e) => { L.DomEvent.stopPropagation(e); select(s); });
    state.lines.set(s.id, line);
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
