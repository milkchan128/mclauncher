## Development Map

- MRS Launcher/Helios Launcher 기반 Electron 39 앱. 표시 이름은 `mlkc Client`, 한글 이름은 `밀튜디오 클라이언트`다. Node.js 24를 사용하며 Docker는 사용하지 않는다.
- `index.js`: 창 생성, Microsoft 인증 IPC, 외부 링크, 자동 업데이트를 관리한다. `app-update.yml`이 없으면 업데이트 IPC를 차단한다. 이름 변경 전 `밀튜디오 - 모드런처` 설정 폴더가 있으면 계속 사용해 계정과 설정을 보존한다.
- `app/*.ejs`: 환영·로그인·런처·설정 화면. `app/assets/js/scripts/`가 화면 동작을 담당한다.
- `app/assets/lang/_custom.toml`: 마지막에 적용되는 브랜드 이름·환영 문구·외부 링크. 앱 제목은 `package.json`, `electron-builder.yml`과 일치시킨다. 주소가 없는 지도·디스코드 버튼은 숨긴다.
- `app/assets/css/launcher.css`: 기존 화면 스타일. `brand.css`: 로고·브랜드 색상·한글 줄바꿈·모션 감소 설정과 연필화 배경 `images/backgrounds/mlkc-pencil.png`를 적용한다. 무작위 배경은 사용하지 않으며 기존 숫자 배경 파일은 빌드에서 제외한다.
- 로고는 `app/assets/images/Icon.png`, `build/icon.png`, Windows 다중 해상도 아이콘은 각 디렉터리의 `Icon.ico`/`icon.ico`를 사용한다. 원본은 사용자가 제공한 `mlkclogo.png`다.
- `configmanager.js`: 기본 게임 데이터를 `.milkstudio-modlauncher`에 분리한다. Microsoft 인증 클라이언트 ID는 `ipcconstants.js`에서 설정한다.
- `distromanager.js`: `assets/modpack/distribution.json`을 기존 DistributionAPI에 공급하고 검증 작업용 캐시를 저장한다. MRS 원격 배포 서버를 사용하지 않는다. 서버는 `mc.mlkc.kr`, 모드팩은 Society: Sunlit Valley 4.1.5A의 Minecraft 1.20.1/Forge 47.4.0/Java 17 조합으로 고정한다.
- `modpack.js`: 게임 실행 전 원본 ZIP·Forge 설치 파일의 SHA-256을 검증하고 안전하게 설정을 추출한다. 기존 파일은 보존하며 인스턴스 ID에 모드팩 버전을 포함한다. 공식 Forge 설치기로 생성한 파일의 SHA-1을 확인한 뒤 기존 Helios 검증·다운로드로 367개 모드를 설치한다. 게임 바이너리는 재배포하지 않는다.
- `assets/modpack/modpack.json`: 원본 출처·버전·해시. `forge-version.json`: 공식 설치기에서 추출한 런처 메타데이터. 모드팩을 변경할 때 서버 버전과 모든 메타데이터·해시를 함께 갱신한다.
- `electron-builder.yml`: 기존 설치와의 연속성을 위해 앱 ID `kr.mlkc.modlauncher`를 유지한다. Windows 실행 파일은 `mlkc-Client.exe`, 설치 파일은 `mlkc-Client-setup-${version}.exe`다. 전용 업데이트 서버가 없어 `publish: null`이며 수동 업데이트를 사용한다. 원본 출처는 유지한다.
- 검증: `npm.cmd test`, `npm.cmd run lint`. Windows 빌드: `npm.cmd run dist:win`; 결과는 `dist/`에 생성한다. 빌드 명령은 게시하지 않는다. 개발용 실행은 사용자가 직접 `npm.cmd start`로 수행한다.
