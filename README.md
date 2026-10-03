# MapWear

주행 영상을 AI로 분석해 차선 마모도를 **LCS(Lane Condition Score)** 로 바꾸고,
20m 구간 단위 지도로 보여주는 프로젝트입니다. — 비전패스(VisionPath), 경상국립대학교 창업동아리

| 페이지 | 내용 |
|---|---|
| `index.html` | 소개 — 기술 단계와 LCS 점수 설명 |
| `dashboard.html` | 대시보드 — 구간별 등급 지도, 상세 정보, CSV 다운로드 |

## 데이터 바꾸는 법

`data/` 에 같은 형식의 JSON 을 넣고 `assets/config.js` 의 `DATA_URL` 을 바꿉니다.
점수가 실제 값이 되면 `SHOW_SAMPLE_NOTICE` 를 `false` 로 바꿉니다.

지도 데이터 © OpenStreetMap contributors
