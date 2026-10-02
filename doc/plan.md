# ONE Vessel Tracker MVP 기획서

## 1. 프로젝트 개요

### 프로젝트명
**ONE Vessel Tracker**

### 목적
Ocean Network Express(ONE)의 컨테이너선을 대상으로 현재 선박 위치와 예정 기항지를 지도 위에서 간단하게 확인할 수 있는 웹 MVP를 개발한다.

본 프로젝트는 상용 서비스 수준의 정확도나 데이터 완전성을 목표로 하지 않는다.

핵심 검증 목표는 다음과 같다.

> **ONE 선박의 현재 위치와 예정 운항 루트를 하나의 지도에서 직관적으로 확인할 수 있는가?**

---

## 2. MVP 목표

사용자가 ONE 선박을 선택하면 다음 정보를 확인할 수 있도록 한다.

- 선박명
- IMO / MMSI
- 현재 위치
- 현재 속도
- 진행 방향
- AIS 마지막 수신 시간
- 이전 기항지
- 다음 기항지
- 향후 예정 기항지
- 지도 위 현재 선박 위치
- 예정 기항지 간 Route 표시

---

## 3. 주요 화면

### 3.1 메인 화면

```text
┌──────────────────────────────────────────┐
│ ONE Vessel Tracker                       │
│                                          │
│ Vessel                                   │
│ [ ONE INNOVATION ▼ ]                     │
├──────────────────────────────────────────┤
│                                          │
│                 MAP                      │
│                                          │
│ Busan ●                                  │
│        \                                 │
│         🚢 ONE INNOVATION                │
│               \                          │
│                ● Shanghai                │
│                     \                    │
│                      ● Singapore         │
│                                          │
├──────────────────────────────────────────┤
│ ONE INNOVATION                           │
│                                          │
│ Speed        17.2 knots                  │
│ Course       218°                        │
│ Last Update  2 min ago                   │
│                                          │
│ Previous     Busan                       │
│ Next         Shanghai                    │
│ ETA          2026-10-04 08:00            │
└──────────────────────────────────────────┘
```

---

## 4. 사용자 플로우

```text
서비스 접속

↓

ONE 선박 선택

↓

AIS 데이터 조회

↓

현재 선박 위치 표시

↓

예정 기항지 조회

↓

지도에 기항지 표시

↓

현재 위치 + 예정 Route 표시
```

---

# 5. MVP 기능

## 5.1 ONE 선박 선택

MVP에서는 전체 ONE 선박을 자동으로 수집하지 않는다.

초기에는 3~5척 정도를 직접 등록한다.

예:

```typescript
const vessels = [
  {
    name: "ONE INNOVATION",
    imo: "9939137",
    mmsi: "563195300"
  }
];
```

UI는 Select 형태로 제공한다.

```text
Vessel

[ ONE INNOVATION ▼ ]
[ ONE HAMBURG     ]
[ ONE HOUSTON     ]
```

---

## 5.2 현재 위치 조회

AIS 데이터를 이용한다.

### 데이터

- Latitude
- Longitude
- Speed Over Ground
- Course Over Ground
- Heading
- 마지막 AIS 수신 시간

예:

```json
{
  "name": "ONE INNOVATION",
  "latitude": 31.23,
  "longitude": 126.81,
  "speed": 17.2,
  "course": 218.3,
  "updatedAt": "2026-10-02T09:50:00+09:00"
}
```

---

# 6. AIS 데이터

## 사용 예정

**AISStream**

Website:

```text
https://aisstream.io
```

WebSocket:

```text
wss://stream.aisstream.io/v0/stream
```

### 구조

```text
Vessel

↓

AIS

↓

AISStream

↓

Backend

↓

Frontend

↓

Map
```

---

## 6.1 AIS 구독

MMSI 기준으로 특정 선박을 구독한다.

개념적인 요청:

```json
{
  "APIKey": "AISSTREAM_API_KEY",

  "FiltersShipMMSI": [
    "563195300"
  ],

  "FilterMessageTypes": [
    "PositionReport"
  ]
}
```

서버에서 AISStream WebSocket을 연결한다.

---

## 6.2 AIS 데이터 주의사항

무료 AIS 데이터는 모든 해역의 선박 위치를 항상 제공하지 않는다.

특히 다음 지역에서는 데이터가 누락될 수 있다.

```text
연안

→ 비교적 잘 잡힘


대양

→ AIS 수신이 없을 수 있음
```

따라서 화면에는 반드시 다음 정보를 표시한다.

```text
Last AIS Update

2026-10-02 09:51
```

오래된 위치라면:

```text
⚠ Last position received 12 hours ago
```

처럼 표시한다.

---

# 7. 선박 Schedule

## 7.1 MVP 1차

1차 버전에서는 ONE 공식 API와 직접 연동하지 않아도 된다.

기항 정보를 JSON으로 관리한다.

예:

```typescript
const routes = {
  "ONE INNOVATION": [
    {
      port: "Busan",
      portCode: "KRPUS"
    },
    {
      port: "Shanghai",
      portCode: "CNSHA"
    },
    {
      port: "Singapore",
      portCode: "SGSIN"
    },
    {
      port: "Rotterdam",
      portCode: "NLRTM"
    }
  ]
};
```

이 방식으로 먼저 UI와 AIS 연동을 검증한다.

---

# 8. Route 표시

실제 해상 Route 계산은 MVP에서 구현하지 않는다.

다음 데이터를 단순 연결한다.

```text
Busan

↓

Shanghai

↓

Singapore

↓

Rotterdam
```

지도에서는 다음처럼 표현한다.

```text
Busan ●
       \
        \
         🚢
           \
            ● Shanghai
                 \
                  \
                   ● Singapore
```

---

## 8.1 Route 정의

```typescript
type RoutePoint = {
  portCode: string;
  portName: string;

  latitude: number;
  longitude: number;

  eta?: string;
  etd?: string;
};
```

예:

```json
[
  {
    "portCode": "KRPUS",
    "portName": "Busan",
    "latitude": 35.1,
    "longitude": 129.04
  },

  {
    "portCode": "CNSHA",
    "portName": "Shanghai",
    "latitude": 31.23,
    "longitude": 121.47
  }
]
```

---

# 9. 지도

## 기술

```text
Leaflet

+

React Leaflet

+

OpenStreetMap
```

### 지도 구성

지도에는 세 종류의 데이터가 존재한다.

### Vessel

```text
🚢
```

현재 AIS 위치.

### Port

```text
● Busan

● Shanghai

● Singapore
```

### Route

```text
───────
```

기항지 간 Polyline.

---

# 10. Frontend

## 기술 Stack

```text
React

TypeScript

Vite

Tailwind CSS

React Leaflet
```

또는 기존 프로젝트 환경에 맞춰:

```text
Next.js

TypeScript

Tailwind CSS

React Leaflet
```

둘 중 하나를 사용한다.

---

# 11. Backend

초기 MVP에서는 아주 가볍게 구성한다.

```text
Node.js

or

Next.js API Route
```

역할은 AISStream WebSocket 연결이다.

---

# 12. 시스템 구조

```text
                 AISStream
                     │
                     │
                  WebSocket
                     │
                     ▼

               ┌────────────┐
               │   Backend  │
               └──────┬─────┘
                      │
                      │ REST
                      ▼

               ┌────────────┐
               │   React    │
               │            │
               │  Leaflet   │
               └──────┬─────┘
                      │
                      ▼

                OpenStreetMap
```

Route 데이터는 초기에는 Frontend 또는 JSON 파일에서 관리한다.

```text
routes.json

↓

React

↓

Leaflet
```

---

# 13. API

Frontend에서는 가능한 한 하나의 API만 사용한다.

```http
GET /api/vessels/:imo
```

예:

```http
GET /api/vessels/9939137
```

응답:

```json
{
  "name": "ONE INNOVATION",

  "imo": "9939137",

  "mmsi": "563195300",

  "position": {
    "latitude": 31.23,
    "longitude": 126.81,
    "speed": 17.2,
    "course": 218,

    "updatedAt": "2026-10-02T09:51:00+09:00"
  },

  "route": [
    {
      "port": "Busan",
      "status": "departed"
    },

    {
      "port": "Shanghai",
      "status": "next"
    },

    {
      "port": "Singapore",
      "status": "scheduled"
    }
  ]
}
```

---

# 14. 데이터 모델

```typescript
type Vessel = {
  name: string;

  imo: string;

  mmsi: string;

  carrier: "ONE";

  position?: {
    latitude: number;

    longitude: number;

    speed?: number;

    course?: number;

    heading?: number;

    updatedAt: string;
  };

  route: RoutePoint[];
};
```

---

# 15. 프로젝트 구조 예시

```text
src/

├─ components/
│  ├─ VesselMap.tsx
│  ├─ VesselMarker.tsx
│  ├─ PortMarker.tsx
│  ├─ VesselInfo.tsx
│  └─ VesselSelector.tsx
│
├─ data/
│  ├─ vessels.ts
│  ├─ ports.ts
│  └─ routes.ts
│
├─ services/
│  └─ vesselApi.ts
│
├─ pages/
│  └─ Home.tsx
│
└─ types/
   └─ vessel.ts
```

Backend:

```text
server/

├─ ais/
│  └─ aisStream.ts
│
└─ api/
   └─ vessels.ts
```

---

# 16. 개발 순서

## STEP 1

지도 표시.

```text
React

+

Leaflet

+

OpenStreetMap
```

완료 조건:

```text
세계지도가 정상적으로 표시된다.
```

---

## STEP 2

ONE 선박 데이터 하드코딩.

```text
ONE INNOVATION

ONE HAMBURG

ONE HOUSTON
```

완료 조건:

```text
Dropdown에서 선박을 선택할 수 있다.
```

---

## STEP 3

테스트 위치 표시.

```text
ONE INNOVATION

↓

35.12 / 129.12
```

완료 조건:

```text
선박 Marker가 지도에 표시된다.
```

---

## STEP 4

AISStream 연동.

```text
AISStream

↓

Backend

↓

Frontend
```

완료 조건:

```text
실제 AIS 위치가 지도에 표시된다.
```

---

## STEP 5

기항지 등록.

```text
Busan

↓

Shanghai

↓

Singapore
```

완료 조건:

```text
각 Port가 지도에 표시된다.
```

---

## STEP 6

Route 연결.

Leaflet Polyline 사용.

```text
Busan

──────

Shanghai

──────

Singapore
```

완료 조건:

```text
예정 기항지 사이에 선이 표시된다.
```

---

## STEP 7

Vessel 정보 Panel.

표시 정보:

```text
ONE INNOVATION

Speed
17.2kt

Course
218°

Previous
Busan

Next
Shanghai

Last AIS
2 min ago
```

---

# 17. MVP 범위

## 포함

- ONE 선박 3~5척
- Vessel 선택
- AIS 현재 위치
- 현재 속도
- 현재 Course
- 마지막 AIS 시간
- Leaflet 지도
- Port 표시
- 예정 기항지 표시
- Route Polyline
- Previous / Next Port

---

## 제외

다음 기능은 MVP에서 개발하지 않는다.

- 회원가입
- 로그인
- 결제
- DB
- 사용자 관리
- 전체 ONE Fleet 자동 수집
- 과거 AIS 저장
- 실제 항적 저장
- Satellite AIS
- 정확한 해상 Route 계산
- Container Tracking
- B/L Tracking
- Booking Tracking
- AI ETA 예측
- 날씨
- 태풍
- 해류 데이터
- 항만 Congestion
- 선박 알림

---

# 18. 비용

목표:

```text
0원
```

구성:

| 서비스 | 용도 | MVP 비용 |
|---|---|---:|
| React | Frontend | 무료 |
| Leaflet | Map Library | 무료 |
| OpenStreetMap | Map Tile | 무료 |
| AISStream | AIS | 무료 |
| Vercel | Hosting | 무료 |
| GitHub | Repository | 무료 |

따라서 트래픽이 적은 개인 MVP 수준에서는 별도의 인프라 비용 없이 구현하는 것을 목표로 한다.

---

# 19. 1차 완료 기준

다음 상황이 만들어지면 MVP 완료로 본다.

```text
ONE INNOVATION 선택

↓

지도 이동

↓

🚢 현재 위치 표시

↓

Speed / Course 표시

↓

Busan
   \
    🚢
       \
        Shanghai
             \
              Singapore

↓

예정 기항지 확인
```

즉,

> **ONE 컨테이너선이 현재 어디에 있고 앞으로 어느 항구들을 갈 예정인지 하나의 지도에서 확인할 수 있다.**

이 상태까지 구현한다.

---

# 20. 추후 확장

MVP 검증 이후 필요하면 다음 순서로 확장한다.

```text
MVP

↓

ONE 공식 Schedule 자동 연동

↓

ONE 전체 Fleet 등록

↓

실제 항적 History 저장

↓

Container / B/L Tracking 연결

↓

ETA 비교

Scheduled ETA

vs

AIS ETA

↓

Delay 감지

↓

알림
```

최종적으로는

```text
Container

↓

Vessel

↓

현재 위치

↓

항해 Route

↓

Next Port

↓

ETA

↓

도착 지연 여부
```

까지 연결할 수 있다.