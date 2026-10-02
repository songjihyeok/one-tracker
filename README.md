# ONE Vessel Tracker

[`doc/plan.md`](doc/plan.md)를 바탕으로 만든 ONE 컨테이너선 대시보드에 3D 항해 시뮬레이션을 추가했습니다. React + TypeScript + Vite + Tailwind CSS, MapLibre GL + Three.js, React Leaflet 프런트엔드와 Node.js + Express + AISStream 백엔드로 구성합니다.

Cloudflare 배포: **[one-tracker.greyzerocompany.workers.dev](https://one-tracker.greyzerocompany.workers.dev)** — 샘플 데이터 모드

## 3D 항해 시뮬레이션

기본 화면은 4척이 하나의 시뮬레이션 시간에 맞춰 이동하는 **3D simulation**입니다.

- 위성지도 위의 실제 좌표에 3D 컨테이너선, 선교, 컨테이너, 선수 파도와 항적을 표시합니다.
- **Follow vessel**은 선박을 비스듬히 내려다보며 따라가고, **Route overview**는 전체 해상 항로를 보여줍니다.
- **Overview**에서는 세계지도가 좌우로 반복되어 날짜변경선을 넘어 계속 드래그할 수 있습니다. 트랙패드 가로 스크롤은 지도 이동, 세로 스크롤은 확대·축소로 동작합니다. 반복된 지도에서도 항로와 선박 위치를 유지합니다.
- 재생/일시정지, 배속, 시간 탐색, 다시 시작, 선박 선택 및 자유 카메라를 지원합니다.
- 선박을 바꿔도 공통 시간이 유지됩니다. 목적지에 도달하면 멈추며 출발지로 순간이동하지 않습니다.
- **AIS tracker** 버튼 또는 `/?view=tracker`에서 기존 수신 위치 화면으로 돌아갈 수 있습니다.

시뮬레이션 위치는 AIS 관측값과 별개의 합성 데이터입니다. 시뮬레이션은 실제 선박이 그 시각에 해당 경로로 항해하고 있음을 의미하지 않으며, 원본 AIS 데이터와 마지막 수신 시각을 덮어쓰지 않습니다.

### 육지를 가로지르지 않는 항로

도심에 있던 항구 좌표를 **항만의 해상 접근점**으로 수정하고, 직선 연결을 명시적인 해상 경유점 경로로 교체했습니다. 싱가포르 서쪽 항로는 말라카 해협을, 아시아–유럽 항로는 희망봉을 돌아갑니다. 선박은 이 경로의 누적 거리에 따라 이동하며 경유점 사이를 곡선으로 잘라 통과하지 않습니다. 지원하지 않는 항구 조합은 직선으로 대체하지 않습니다.

경로 테스트는 Natural Earth 1:10m 육지 경계와 선분의 교차, 항만 접근점 및 이동 위치를 검사합니다. 항구에서의 끝점은 접안 위치가 아닌 해상 접근점입니다. 이 경로는 시각화용이며 수심·교통분리대·운항 제한을 검증한 항해용 경로가 아닙니다.

위성영상 출처는 Esri, Vantor, Earthstar Geographics 및 GIS User Community입니다. 네트워크 장애 시 로컬 Natural Earth 지형으로 대체되며, WebGL을 지원하지 않는 환경에는 안내가 표시됩니다. 정밀 모델의 성능은 기기의 GPU에 따라 달라집니다.

## 실행

Node.js 22.12 이상이 필요합니다.

```sh
npm install
cp .env.example .env
npm run dev
```

브라우저에서 **http://localhost:5173**을 엽니다. 개발 서버는 프런트엔드 5173번, API 3001번 포트를 사용하며 `/api` 요청을 프록시합니다.

API 키가 없으면 **Demo data** 모드로 바로 실행됩니다. 선박 위치와 일정은 기능을 확인하기 위한 샘플입니다. 데모 위치의 수신 시각은 서버 시작 시 고정되므로 새로고침이 수신 시각을 임의로 갱신하지 않습니다.

## 실제 AIS 연결

1. [AISStream](https://aisstream.io)에서 API 키를 발급합니다.
2. `.env`의 `AISSTREAM_API_KEY=`에 키를 입력합니다.
3. 서버를 재시작합니다.

키는 Node.js 서버만 사용합니다. `VITE_` 접두사를 붙이거나 프런트엔드 코드에 넣지 마세요. 서버는 등록된 선박의 MMSI를 한 WebSocket 연결로 구독하고 마지막으로 수신한 위치를 메모리에 보관합니다. 데이터베이스나 과거 항적 저장은 없습니다.

키를 설정한 상태에서는 실제 수신 전까지 위치가 없는 대기 상태를 보여줍니다. 연결 장애나 AIS 미수신을 샘플 위치로 대체하지 않습니다. 마지막 AIS 수신 시각과 오래된 데이터 경고를 확인할 수 있습니다. 해역 및 수신 범위에 따라 AIS가 오랫동안 수신되지 않을 수 있습니다.

**기항 순서와 ETA는 모든 모드에서 샘플 일정입니다.** ONE 공식 운항 일정에 연동하지 않았습니다. 지도에 표시하는 해상 경유점 경로는 시뮬레이션용이며, 실제 수신된 과거 항적이 아닙니다. AIS 마커와 경로 사이에 임의의 직선을 연결하지 않습니다.

## 주요 기능

- ONE INNOVATION / ONE HAMBURG / ONE HOUSTON / ONE APUS 선택
- 현재 위치, 속력, 진행 방향, 선수 방향, IMO / MMSI, 마지막 수신 시각
- 지도 이동 및 확대·축소, 선박 위치로 이동, 전체 항로 보기
- 기항지 마커와 정보, 예정 항로 표시, 기항 일정
- 자동 갱신 및 수동 새로고침, 로딩·오류·미수신 상태
- 모바일 대응 화면과 키보드 접근성

## 검증 및 프로덕션 실행

```sh
npm test
npm run typecheck
npm run build
npm start
```

프로덕션에서는 **http://localhost:3001**에서 API와 빌드된 화면을 함께 제공합니다. `PORT`로 포트를 바꿀 수 있습니다. 개발 중 API 포트를 바꾸면 `vite.config.ts`의 프록시 대상도 맞춰야 합니다.

브라우저 회귀 테스트:

```sh
npx playwright install chromium
npm run test:e2e
```

실제 AIS 수신은 유효한 API 키와 해당 선박의 수신 범위가 필요합니다. 로컬 자동 검증은 샘플 모드, API 응답, AIS 메시지 처리, 육지 교차 검사 및 시뮬레이션 동작을 대상으로 합니다. 브라우저 테스트는 위성 타일을 단색 테스트 이미지로 대체하고 실제 WebGL 렌더러를 실행합니다. 실제 위성영상은 브라우저에서 별도로 확인합니다.

## API

| 요청 | 응답 |
| --- | --- |
| `GET /api/vessels` | 선박 목록, 데모/실시간 모드, 스트림 상태 |
| `GET /api/vessels/:imo` | 선박 정보, 마지막 위치, 샘플 기항 일정, 데이터 출처 |
| `GET /api/health` | 서버 및 스트림 상태 |

응답 타입은 [`shared/types.ts`](shared/types.ts)에 정의합니다. 모르는 IMO는 404 응답을 반환합니다.

## 배포 구조

### Cloudflare Workers

`wrangler.jsonc`와 `worker/index.ts`가 화면과 API를 하나의 Worker로 제공합니다. `dist`의 화면·지도 워커·정적 파일은 Workers Static Assets에서 제공하고, `/api`와 `/api/*`는 API 처리기로 보냅니다. 따라서 잘못된 API 주소가 앱 HTML로 바뀌지 않습니다.

```sh
npx wrangler login
npm run deploy
```

기존 Cloudflare 로그인이 있으면 로그인 명령을 생략할 수 있습니다. `npm run deploy`는 바인딩 타입 생성, 타입 검사, 프런트엔드 빌드 후 배포합니다. 배포 주소는 Wrangler 출력에서 확인합니다.

```sh
# Cloudflare 런타임으로 로컬 검증
npm run dev:cloudflare

# 업로드 없이 배포 파일 검증
npx wrangler deploy --dry-run

# 배포 주소에서 브라우저 테스트
PLAYWRIGHT_BASE_URL=https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev npm run test:e2e
```

**Cloudflare 배포는 현재 샘플 데이터 모드입니다.** 3D 시뮬레이션과 기존 대시보드가 모두 동작하며, API는 데이터 출처를 `demo`로 표시합니다. `DEMO_STARTED_AT`을 기준으로 샘플 수신 시각과 일정을 생성하므로 요청이나 Worker 재시작만으로 시각을 갱신하지 않습니다. 이 Worker에는 지속적인 AISStream 수집기를 연결하지 않았으며, AIS 키를 추가하는 것만으로 실시간 수신이 활성화되지는 않습니다.

### Node.js 서버

`npm run build && npm start`를 실행할 수 있는 Node.js 호스트에서도 전체 앱을 구동할 수 있습니다. 기존 Node 서버의 `AISSTREAM_API_KEY` 설정과 실시간 AIS 수집 기능은 유지합니다. 실시간 AIS를 Cloudflare 화면과 함께 운영하려면 지속 실행되는 수집 백엔드와 저장소를 연결해야 합니다.

## 참고

- [AISStream 개발 문서](https://aisstream.io/documentation)
- [React Leaflet 문서](https://react-leaflet.js.org/docs/start-introduction/)
- [Vite 문서](https://vite.dev/guide/)
- [Tailwind CSS Vite 설치](https://tailwindcss.com/docs/installation/using-vite)
- [MapLibre의 Three.js 모델 렌더링](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/)
- [Three.js 문서](https://threejs.org/docs/)
- [Natural Earth 1:10m 육지 데이터](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/)

ONE INNOVATION은 기획서 예시의 MMSI 대신 현재 등록된 `636022889`를 사용합니다. ONE HOUSTON은 일본 선적으로 변경된 식별자 `431042000`을 사용합니다. 선박 식별자는 변경될 수 있으므로 운영 시 확인이 필요합니다.

- [ONE INNOVATION · Port of Hamburg](https://www.hafen-hamburg.de/de/schiffe/one-innovation/)
- [ONE HAMBURG · Port of Hamburg](https://www.hafen-hamburg.de/de/schiffe/one-hamburg-3810/)
- [ONE HOUSTON · MyShipTracking](https://www.myshiptracking.com/vessels/one-houston-mmsi-431042000-imo-9566382)

독립적인 MVP이며 Ocean Network Express의 공식 서비스가 아닙니다.
