// 소개 페이지 — 데이터를 읽어 작은 지도 2개와 통계를 채운다.

(async function () {
  MW.notice(document.getElementById("notice"));

  let segs;
  try {
    segs = await MW.load();
  } catch (e) {
    document.getElementById("resultMap").innerHTML = '<div class="error">' + e.message + "</div>";
    return;
  }

  // 지도에 구간 선을 그리는 공용 함수
  function drawMap(elId, opts) {
    const map = L.map(elId, Object.assign({ zoomControl: true, scrollWheelZoom: false }, opts));
    MW.tiles(map);
    const group = L.featureGroup(
      segs.map((s) =>
        L.polyline(s.latlngs, { color: MW.color(s.grade), weight: opts.weight || 6, opacity: 0.95, lineCap: "butt" })
      )
    ).addTo(map);
    const fit = () => { map.invalidateSize(); map.fitBounds(group.getBounds(), { padding: [20, 20] }); };
    fit();
    // 글꼴·그림이 늦게 들어오면 지도 칸 크기가 바뀐다. 그때 다시 맞추지 않으면 한쪽이 회색으로 빈다
    new ResizeObserver(fit).observe(document.getElementById(elId));
    return map;
  }

  // STEP 6 작은 지도 — 그림처럼 보이게 조작을 끈다
  drawMap("stepMap", {
    zoomControl: false, dragging: false, doubleClickZoom: false, touchZoom: false,
    boxZoom: false, keyboard: false, attributionControl: false, weight: 5,
  });

  // 결과 미리보기 지도
  drawMap("resultMap", { weight: 7 });

  // 통계
  const d0 = segs[0].d;
  document.getElementById("statSeg").textContent = segs.length + "개";
  document.getElementById("statLen").textContent = ((segs.length * MW_CONFIG.SEGMENT_M) / 1000).toFixed(2) + "km";
  const cs = MW_CONFIG.CAPTURE_STATS || {};
  document.getElementById("statFrames").textContent = cs.frames ? cs.frames + "장" : "—";
  document.getElementById("statGap").textContent = cs.frame_gap_m ? "약 " + cs.frame_gap_m + "m" : "—";
  document.getElementById("statRoad").textContent = d0.road_name || "—";
  document.getElementById("statDate").textContent = MW.fmtTime(d0.captured_at).slice(0, 10);

  const counts = MW.countGrades(segs);
  const rows = document.getElementById("gradeRows");
  Object.keys(MW_CONFIG.GRADE_COLORS).forEach((g) => {
    if (g === MW_CONFIG.NO_DATA && !counts[g]) return;   // 데이터 부족이 없으면 줄을 감춘다
    const pct = (counts[g] / segs.length) * 100;
    rows.insertAdjacentHTML("beforeend",
      `<div class="grade-row"><span><i class="dot" style="background:${MW.color(g)}"></i>${g}</span>` +
      `<div class="bar"><i style="width:${pct}%;background:${MW.color(g)}"></i></div><b>${counts[g]}</b></div>`);
  });
})();
