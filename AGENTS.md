## Development Map

- MRS Launcher/Helios Launcher 기반 Electron 39 앱. Node.js 24를 사용하며 Docker는 사용하지 않는다.
- `index.js`: 창 생성, Microsoft 인증 IPC, 외부 링크, 자동 업데이트를 관리한다. `app-update.yml`이 없으면 업데이트 IPC를 차단한다.
- `app/*.ejs`: 환영·로그인·런처·설정 화면. `app/assets/js/scripts/`가 화면 동작을 담당한다.
- `app/assets/lang/_custom.toml`: 마지막에 적용되는 브랜드 이름·환영 문구·외부 링크. 앱 이름은 `밀튜디오 - 모드런처`이며 `package.json`, `electron-builder.yml`과 일치시킨다.
- `app/assets/css/launcher.css`: 기존 화면 스타일. `brand.css`: 로고 표시, 브랜드 색상, 한글 줄바꿈, 모션 감소 설정을 덮어쓴다.
- 로고는 `app/assets/images/Icon.png`, `build/icon.png`, Windows 다중 해상도 아이콘은 각 디렉터리의 `Icon.ico`/`icon.ico`를 사용한다. 원본은 사용자가 제공한 `mlkclogo.png`다.
- `configmanager.js`: 기본 게임 데이터를 `.milkstudio-modlauncher`에 분리한다. `distromanager.js`는 전용 주소가 준비될 때까지 기존 MRS 배포 주소를 유지한다. Microsoft 인증 클라이언트 ID는 `ipcconstants.js`에서 설정한다.
- `electron-builder.yml`: 앱 ID `kr.mlkc.modlauncher`, Windows 실행 파일 `Milkstudio-ModLauncher.exe`, NSIS x64 설치 파일을 정의한다. 전용 업데이트 서버가 없어 `publish: null`이며 수동 업데이트를 사용한다. 원본 출처는 유지한다.
- 검증: `npm.cmd test`, `npm.cmd run lint`. Windows 빌드: `npm.cmd run dist:win`; 결과는 `dist/`에 생성한다. 빌드 명령은 게시하지 않는다. 개발용 실행은 사용자가 직접 `npm.cmd start`로 수행한다.
