# 발전사업 허가·진행상황·취소현황 통합 대시보드

전기위원회 3MW 초과 발전사업 허가대장과 허가취소·청문 공고, 위원회 개최결과, 조직도를 정리한 정적 웹페이지입니다.
전기위원회의 공식 서비스가 아니며, 자동 정리 과정에서 오류가 있을 수 있으니 중요한 판단은 원문으로 확인하세요.

## 보는 법

GitHub Pages 주소를 열면 됩니다. 설치할 것은 없습니다.

## 올리는 법

1. 이 폴더를 새 저장소에 올립니다.
2. **Settings → Pages**에서 Source를 `Deploy from a branch`, Branch를 `main` / `/ (root)`로 정합니다.
3. **Settings → Actions → General → Workflow permissions**를 `Read and write permissions`로 정합니다.
4. (선택) 환경영향평가 자동 갱신: **Settings → Secrets and variables → Actions**에 `DATA_GO_KR_KEY` 이름으로 공공데이터포털 인증키를 넣습니다. 키를 파일에 직접 적지 마세요.

## 갱신

- 자동: 매일 08:44, 17:44(한국 시각)에 게시판과 조직도를 확인하고, 바뀐 것이 있을 때만 자료를 교체합니다.
- 수동: **Actions → 전기위원회 자료 갱신 → Run workflow**.
- 기준일과 D-day는 페이지를 연 날짜로 계산합니다.
- 첫 전체 수집은 첨부 파일을 모두 받으므로 오래 걸립니다.

## 자동으로 갱신되지 않는 자료

- `data/offshore_auctions.json`: 경쟁입찰 선정(기사·증권사 보고서를 옮긴 값, 원문 대조 전)
- `data/operating_farms.json`: 상업운전 해상풍력 단지
- `collector/eia_map.json`: 환경영향평가 코드와 허가번호 연결표(사람이 맞춤)

## 출처

전기위원회 누리집(www.korec.go.kr), 공공데이터포털 「환경영향평가 협의 현황정보 서비스」(국립환경과학원), 지도 바탕 southkorea-maps. 각 자료의 이용 조건은 원 출처를 따릅니다.
