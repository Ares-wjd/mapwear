// 검증 실험 페이지 — 가상 마모 사례를 원본과 나란히 보여 준다.
// 🔴 실험 자료다. 실제 지도 데이터(lcs_segments_*.json)와 섞지 않는다.

(async function () {
  // ===== 설정값 (여기만 바꾸면 된다) =================================
  const DATA_URL = "data/virtual_wear.json";   // web_tools/make_verify_data.py 가 만든다
  const DROP_MIN = 3;                           // 원본보다 이만큼 넘게 내려간 지표만 "감점" 으로 적는다
  // ==================================================================

  const $ = (id) => document.getElementById(id);
  let doc;
  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("실험 자료를 불러오지 못했습니다 (" + res.status + ")");
    doc = await res.json();
  } catch (e) {
    $("cardOrig").innerHTML = '<div class="error">' + e.message + "</div>";
    return;
  }

  let line = doc.lines[0];
  let picked = null;                            // 지금 보고 있는 가상 마모 사례

  const orig = (ln) => ln.cases.find((c) => c.id === "orig");
  const others = (ln) => ln.cases.filter((c) => c.id !== "orig");

  // 4지표 막대. base 를 주면 원본과의 차이를 옆에 적는다
  function metrics(c, base) {
    return MW_CONFIG.METRICS.map((m) => {
      const v = c[m.key];
      const col = MW.color(MW.gradeOf(v));
      const d = base ? v - base[m.key] : 0;
      const delta = base && d <= -DROP_MIN ? `<em class="down">${Math.round(d)}</em>` : "<em></em>";
      return `<div class="metric vf-metric"><span>${m.name}</span>` +
        `<div class="bar"><i style="width:${v}%;background:${col}"></i></div>` +
        `<b style="color:${col}">${Math.round(v)}</b>${delta}</div>`;
    }).join("");
  }

  function card(c, base, tag) {
    const col = MW.color(c.lcs_grade);
    return `<div class="vf-photo"><span class="vf-tag ${base ? "exp" : ""}">${tag}</span>` +
      `<img src="${c.image}" alt="${line.name} — ${c.name}" loading="lazy"></div>` +
      `<div class="vf-body"><h3>${c.name}</h3>` +
      `<div class="lcs-big"><b style="color:${col}">${Math.round(c.lcs_score)}</b><span>/ 100</span>` +
      `<span class="pill" style="background:${col}">${c.lcs_grade}</span></div>` +
      `<div class="progress"><i style="width:${c.lcs_score}%;background:${col}"></i></div>` +
      `<div class="vf-metrics">${metrics(c, base)}</div></div>`;
  }

  function render() {
    const o = orig(line);
    $("cardOrig").innerHTML = card(o, null, "원본");
    $("cardCase").innerHTML = card(picked, o, "가상 마모");
    $("bevOrig").src = o.bev;
    $("bevCase").src = picked.bev;
    $("bevCaseCap").textContent = picked.name;
    $("howText").textContent = picked.how;

    const drops = MW_CONFIG.METRICS
      .map((m) => ({ name: m.name, from: o[m.key], to: picked[m.key] }))
      .filter((x) => x.from - x.to >= DROP_MIN);
    $("diff").innerHTML =
      `<li><b>LCS ${Math.round(o.lcs_score)} → ${Math.round(picked.lcs_score)}</b> (${o.lcs_grade} → ${picked.lcs_grade})</li>` +
      (drops.length
        ? drops.map((x) => `<li>${x.name} ${Math.round(x.from)} → <b>${Math.round(x.to)}</b></li>`).join("")
        : "<li>크게 내려간 지표가 없습니다.</li>");

    [...$("tabs").children].forEach((b) => b.setAttribute("aria-selected", b.dataset.id === line.id));
    [...$("cases").children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === picked.id));
  }

  function drawCases() {
    $("cases").innerHTML = others(line).map((c) =>
      `<button class="chip" type="button" data-id="${c.id}" aria-pressed="false">` +
      `<i class="dot" style="background:${MW.color(c.lcs_grade)}"></i>${c.name}</button>`).join("");
    [...$("cases").children].forEach((b) => b.addEventListener("click", () => {
      picked = line.cases.find((c) => c.id === b.dataset.id);
      render();
    }));
  }

  $("tabs").innerHTML = doc.lines.map((ln) =>
    `<button class="vf-tab" type="button" role="tab" data-id="${ln.id}" aria-selected="false">${ln.name}</button>`).join("");
  [...$("tabs").children].forEach((b) => b.addEventListener("click", () => {
    line = doc.lines.find((ln) => ln.id === b.dataset.id);
    picked = others(line)[0];
    drawCases();
    render();
  }));

  // 전체 표 — 선 종류마다 한 장
  $("tables").innerHTML = doc.lines.map((ln) => {
    const rows = ln.cases.map((c) => {
      const col = MW.color(c.lcs_grade);
      const cells = MW_CONFIG.METRICS.map((m) =>
        `<td style="color:${MW.color(MW.gradeOf(c[m.key]))}">${Math.round(c[m.key])}</td>`).join("");
      return `<tr><th>${c.name}</th>` +
        `<td class="lcs"><div class="bar"><i style="width:${c.lcs_score}%;background:${col}"></i></div>` +
        `<b style="color:${col}">${Math.round(c.lcs_score)}</b></td>` +
        `<td><span class="pill" style="background:${col}">${c.lcs_grade}</span></td>${cells}</tr>`;
    }).join("");
    const head = MW_CONFIG.METRICS.map((m) => `<th>${m.name}</th>`).join("");
    return `<div class="vf-table-wrap"><h3>${ln.name}</h3><div class="vf-scroll"><table class="vf-table">` +
      `<thead><tr><th></th><th>LCS</th><th>등급</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join("");

  picked = others(line)[0];
  drawCases();
  render();
})();
