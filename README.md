<p align="center"><img src="./app/assets/images/Icon.png" width="150px" height="150px" alt="밀튜디오 로고"></p>

<h1 align="center">mlkc Client</h1>

## 밀튜디오 클라이언트

`mc.mlkc.kr` 서버에 필요한 모드와 실행 환경을 자동으로 준비하는 밀튜디오 전용 클라이언트입니다. Minecraft **1.20.1**, Forge **47.4.0**, Java **17**을 사용합니다. MRS Launcher와 Helios Launcher의 출처 및 라이선스를 유지합니다. 아래 MRS 소개와 다운로드 링크는 원본 프로젝트의 참고 자료입니다.

Node.js 24에서 프로젝트 루트의 PowerShell로 실행하세요.

```powershell
npm.cmd ci
node node_modules/electron/install.js
npm.cmd test
npm.cmd run lint
npm.cmd run dist:win
```

클라이언트 버전은 **1.0.2**입니다. Windows x64 설치 파일은 `dist/mlkc-Client-setup-1.0.2.exe`에 생성됩니다. 빌드 전에 실행 중인 클라이언트를 종료하세요. `electron/install.js`는 npm에서 설치 스크립트를 생략한 환경에서도 Electron 실행 파일을 준비합니다. 로컬 빌드 명령은 릴리스를 게시하지 않습니다. 코드 서명 인증서는 별도로 설정해야 합니다.

1.0.0에서 물방울 로고에 멈춘다면 `mlkc-Client-setup-1.0.1.exe`를 직접 실행해 업데이트하세요. 1.0.1은 화면 준비 전에 모드팩 로딩 완료 신호가 전달되어 로그인 화면이 열리지 않던 문제를 수정합니다. 기존 계정·게임 설정을 삭제할 필요가 없습니다. 1.0.0은 멈춘 상태에서 자동 업데이터도 초기화되지 않으므로 이 수정본을 수동으로 설치해야 합니다.

Windows에서 `winCodeSign` 압축 해제 중 `Cannot create symbolic link` 오류가 발생하면 macOS용 파일의 링크 생성이 원인일 수 있습니다. 이번 환경은 빌더가 내려받은 도구에서 `darwin`, `linux` 항목을 제외하고 Windows 도구만 `%LOCALAPPDATA%/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0`에 풀어 해결했습니다. 시스템 권한 설정은 변경하지 않았습니다.

개발용 앱은 필요할 때 직접 `npm.cmd start`로 실행하세요.

- 앱 표시 이름: **mlkc Client**, 한글 이름: **밀튜디오 클라이언트**
- Microsoft 계정 로그인만 지원합니다. Mojang 로그인 화면·계정 추가·인증 코드를 제거했습니다. 기존 Mojang 저장 기록은 삭제하지 않으며 계정 선택 목록에서 제외합니다.
- 로고: 제공된 `mlkclogo.png`를 `app/assets/images/Icon.png`, `build/icon.png`에 반영했습니다. Windows용 다중 해상도 아이콘은 `app/assets/images/Icon.ico`, `build/icon.ico`입니다.
- 배경: 직접 제작한 연필화 `app/assets/images/backgrounds/mlkc-pencil.png`를 모든 화면에 고정 적용합니다. 기존 무작위 배경은 빌드에서 제외합니다.
- 앱 ID: 기존 설치와의 연속성을 위해 `kr.mlkc.modlauncher`를 유지합니다. 실행 파일은 `mlkc-Client.exe`입니다. 이전 `밀튜디오 - 모드런처` 설정 폴더가 있으면 계속 사용해 계정과 설정을 보존합니다.
- 기본 게임 데이터: Windows의 `%APPDATA%/.milkstudio-modlauncher`. 기존 MRS 데이터는 이동하거나 삭제하지 않습니다.
- 서버는 **mc.mlkc.kr**, 기본 모드팩 버전은 **4.1.5A**입니다. 서버도 같은 버전으로 준비해야 합니다. 홈페이지 버튼은 모드팩 원본 페이지로 연결되며, 전용 주소가 없는 지도·디스코드 버튼은 숨깁니다. 모드팩 이름은 설치 화면·앱 소개·서버 표시 이름에 넣지 않습니다.
- Microsoft 로그인 후 **게임 시작**을 누르면 필요한 모드를 자동으로 다운로드한 뒤 게임을 실행합니다. 정상 파일은 재사용하고 누락·손상 파일만 다시 받으므로 모드를 직접 찾아 설치할 필요가 없습니다.
- `app/assets/modpack/distribution.json`은 설치본에 포함된 전용 배포 구성입니다. 별도 웹 호스팅 없이 367개 모드를 원본 CDN에서 받아 기존 Helios 파일 검증·다운로드 기능으로 설치합니다. MRS 배포 서버는 사용하지 않습니다.
- `modpack.js`는 첫 실행 준비 시 원본 모드팩 ZIP의 SHA-256을 검증하고 설정·리소스팩을 추출합니다. 기존 사용자 파일은 덮어쓰지 않습니다. 버전별 인스턴스 `mlkc-society-4.1.5A`를 사용합니다.
- Forge는 공식 설치 파일을 검증해 Java 17로 설치하고, 생성된 게임 파일의 해시를 확인합니다. Minecraft 및 Forge가 생성하는 게임 바이너리는 이 저장소나 설치 파일에 재배포하지 않습니다. 최초 준비 시 인터넷 연결과 다운로드 시간이 필요합니다.
- Windows 설치본은 `milkchan128/mclauncher`의 GitHub Releases에서 새 버전을 시작 시점과 30분마다 확인합니다. 새 버전은 자동으로 다운로드하고, 사용자가 재시작 버튼을 누르거나 앱을 종료하면 설치합니다. 설정에서도 수동으로 확인할 수 있습니다. 개발용 실행에서는 자동 업데이트하지 않습니다.
- GitHub Releases의 해당 버전 릴리스 노트를 표시합니다. 아직 릴리스가 없거나 네트워크 오류가 나면 다시 확인할 수 있도록 안내합니다.
- 배포 전에 `app/assets/js/ipcconstants.js`의 Microsoft 인증 클라이언트 ID를 전용 값으로 설정해야 합니다. 설정 방법은 `docs/MicrosoftAuth.md`를 참고하세요.

### 자동 업데이트 릴리스 게시

공개 저장소 `milkchan128/mclauncher`를 사용하며, 앱에 GitHub 토큰을 포함하지 않습니다. `electron-builder.yml`의 `publish` 설정으로 설치본의 `app-update.yml`과 배포용 `latest.yml`을 생성합니다. 업데이트 파일은 electron-updater의 SHA-512 검증을 거칩니다.

GitHub Releases가 비어 있으면 실제 업데이트를 제공할 수 없으므로 첫 릴리스를 게시해야 합니다. 기존 3.0.x 테스트 설치본에서 1.0.0으로 처음 전환할 때는 수동 설치하세요. 이후 버전부터는 1.0.1처럼 번호를 높여 배포합니다. 자동 다운그레이드는 허용하지 않습니다.

`npm.cmd run dist:win`은 NSIS 설치 엔진을 먼저 빌드한 뒤 전용 WPF 설치 화면과 함께 단일 EXE로 묶습니다. Windows의 .NET Framework 컴파일러를 사용하므로 별도 SDK나 추가 런타임 설치는 필요하지 않습니다. 기본 창 장식과 버튼을 사용하지 않으며 **환영 → EULA 동의 → 설치 대상 → 설치 위치 → 진행 → 완료** 순서를 유지합니다. EULA에는 기존 `LICENSE.txt`를 표시하고 Minecraft 공식 EULA 링크를 제공합니다.

최종 배포물은 `dist/mlkc-Client-setup-1.0.2.exe`, `.exe.blockmap`, `.exe.sha256`, `dist/latest.yml`입니다. `dist/setup-engine/`의 내부 설치 파일은 배포하지 않습니다. 전용 설치 EXE가 `/S`, `--updated`, `--force-run`을 처리하므로 자동 업데이트 때는 화면 없이 기존 설치 엔진으로 진행합니다. 최종 EXE 기준으로 블록맵과 SHA-512 정보를 다시 생성합니다.

게시할 때는 `package.json`과 일치하는 릴리스 태그(예: `v1.0.0`)에 최종 배포물 네 개를 함께 업로드하세요. Build 워크플로는 검증용 빌드만 수행하며 릴리스를 자동 게시하지 않습니다. 소스 빌드 시 Microsoft 인증 ID는 배포 환경에 맞게 설정해야 합니다.

설치 디자인과 단계는 `installer/Window.xaml`, `installer/Setup.cs`, Windows 패키징은 `scripts/build-windows.js`에서 관리합니다. 단계 전환은 160ms의 페이드·슬라이드 효과를 사용하며 이전 단계에서는 반대 방향으로 움직입니다. Windows에서 애니메이션을 끄면 전환 효과도 생략합니다. 경로는 비어 있는 폴더나 기존 클라이언트 폴더만 허용하고, 내장 설치 엔진의 SHA-256을 검증한 뒤 실행합니다. 설치 중에는 닫기를 막으며 실패 시 다시 시도할 수 있습니다.

### 모드팩 구성 출처

- [Society: Sunlit Valley 4.1.5A](https://www.curseforge.com/minecraft/modpacks/society-sunlit-valley/files/8980840), 파일 ID `8980840`
- [원본 pakku-lock.json](https://github.com/Chakyl/society-sunlit-valley/blob/f00b8473bbf16ac0d0d3f3afbc01be0519f9dd9b/pakku-lock.json)의 다운로드 주소·크기·MD5와 공식 ZIP의 367개 모드 목록을 대조했습니다. 버전과 원본 해시는 `app/assets/modpack/modpack.json`에 고정합니다.
- Forge 구성은 공식 `forge-1.20.1-47.4.0-installer.jar`의 `version.json`과 실제 설치 결과에서 추출했습니다. 모드 및 모드팩의 권리와 라이선스는 각 제작자에게 있습니다.

---

<h3 align="center"><a href="https://github.com/dscalzi/HeliosLauncher">Forked from Helios Launcher</a></h3>

<p align="center"><a href="https://github.com/peunsu/MRSLauncher/actions"><img src="https://img.shields.io/github/actions/workflow/status/peunsu/MRSLauncher/build.yml?branch=master&style=for-the-badge" alt="gh actions"></a> <a href="https://github.com/peunsu/MRSLauncher/releases"><img src="https://img.shields.io/github/downloads/peunsu/MRSLauncher/total.svg?style=for-the-badge" alt="downloads"></a>

[<p align="center"><img src="https://img.shields.io/endpoint?url=https://minecraft-server-status-badge.vercel.app/api/server/mc1.mysticred.space?port=25565&logo=curseforge&label=MRS%20Server&color=28231d&style=for-the-badge" alt="homepage">](https://mysticred.space) [<img src="https://img.shields.io/discord/330997213255827457?style=for-the-badge&logo=discord&logoColor=ffffff&label=Discord&labelColor=6173f4&color=28231d" alt="discord">](https://discord.gg/Z8j6ahF4MJ)

<p align="center">Java, Forge, 모드 설치 걱정 없이 서버에 접속하세요. MRS 런처 하나로 준비 끝!</p>

![Screenshot 1](https://i.imgur.com/44esaa9.png)
![Screenshot 2](https://i.imgur.com/NxUAzlL.png)

## 기능

* 🔒 통합 계정 관리
  * 여러 계정을 등록하고 쉽게 계정 전환을 할 수 있어요.
  * Microsoft (OAuth 2.0) 계정 인증을 지원해요.
  * 비밀번호는 클라이언트에 저장하지 않으며, 재로그인을 위한 인증 토큰은 로컬 설정에 저장돼요.
* 📂 효율적인 데이터 관리
  * 클라이언트 업데이트를 빠르게 받아보세요.
  * 게임 실행 전에 파일 유효성을 검사하고 문제가 있으면 다시 다운로드해요.
* ☕ **자동 Java 유효성 검사**
  * 호환되지 않는 Java 버전이 설치되어 있으면 올바른 버전을 **자동으로** 설치해요.
  * 런처를 실행하기 위해 Java를 설치할 필요가 없어요.
* 📰 런처에 내장된 뉴스 피드
* ⚙️ Java 설정이 가능한 직관적인 설정 화면
* MRS 서버에 쉽게 접속할 수 있어요.
  * 모드팩이 여러 개 설치되어 있어도 쉽게 전환할 수 있어요.
  * 서버에 접속한 플레이어 수를 확인할 수 있어요.
* 런처는 자동으로 업데이트돼요.
* Mojang 서비스 상태를 확인할 수 있어요.

이 외에도 런처가 할 수 있는 일은 많아요. 지금 다운로드해서 사용해보세요!

#### 도움이 필요하신가요? [위키를 확인해보세요.][wiki]

#### 프로젝트가 마음에 드셨나요? [원작자(dscalzi)](https://github.com/dscalzi)의 [원본 레포지토리(HeliosLauncher)](https://github.com/dscalzi/HeliosLauncher)에 ⭐ 스타를 남겨주세요!

## 다운로드

[GitHub Releases](https://github.com/peunsu/MRSLauncher/releases)에서 다운로드할 수 있어요.

#### 최신 릴리즈 버전

[![](https://img.shields.io/github/v/release/peunsu/MRSLauncher?style=flat-square)](https://github.com/peunsu/MRSLauncher/releases/latest)

#### 최신 프리릴리즈 버전

[![](https://img.shields.io/github/v/release/peunsu/MRSLauncher?include_prereleases&style=flat-square&label=pre-release)](https://github.com/peunsu/MRSLauncher/releases)

**지원하는 플랫폼**

[Releases](https://github.com/peunsu/MRSLauncher/releases) 탭에서 시스템 OS에 맞는 설치 파일을 선택해서 다운로드하세요.

| 플랫폼 | 파일 |
| -------- | ---- |
| Windows x64 | `MRS-Launcher-setup-VERSION.exe` |
| macOS x64[^1] | `MRS-Launcher-setup-VERSION-x64.dmg` |
| macOS arm64[^1] | `MRS-Launcher-setup-VERSION-arm64.dmg` |
| Linux x64 | `MRS-Launcher-setup-VERSION.AppImage` |
[^1]: macOS 설치 파일은 서명되지 않아서 보안 경고가 뜰 수 있으며 정상 작동을 보장하지 않아요.

## 콘솔

콘솔창을 열려면 아래 단축키를 사용하세요.

```console
ctrl + shift + i
```

콘솔창이 열리면 콘솔 탭이 선택되어 있는지 확인하세요. 개발자가 아니라면 콘솔에 아무거나 입력하지 마세요. 인터넷이나 타인이 알려준 코드를 함부로 입력하면 민감한 정보가 노출될 수 있어요.

#### 콘솔 출력을 파일로 내보내기

콘솔 출력을 내보내려면 콘솔 어디에서든 마우스 오른쪽 버튼을 클릭하고 **다른 이름으로 저장**을 클릭하세요.

![console example](https://i.imgur.com/ry2Disn.png)


## 개발

이 섹션에서는 기본 개발 환경 설정 방법을 설명해요.

### 시작하기

**시스템 요구사항**

* [Node.js][nodejs] v24

---

**레포지토리 클론 및 의존 패키지 설치**

```console
> git clone https://github.com/peunsu/MRSLauncher.git
> cd MRSLauncher
> npm install
```

---

**어플리케이션 실행**

```console
> npm start
```

---

**인스톨러 빌드**

현재 개발하고 있는 플랫폼에 맞는 인스톨러를 빌드하려면 아래 명령어를 사용하세요.

```console
> npm run dist
```

특정 플랫폼에 맞게 빌드하려면 아래 명령어를 사용하세요.

| 플랫폼    | 명령어              |
| ----------- | -------------------- |
| Windows x64 | `npm run dist:win`   |
| macOS       | `npm run dist:mac`   |
| Linux x64   | `npm run dist:linux` |

macOS 빌드는 macOS에서만 가능해요. Windows나 Linux에서 macOS 빌드를 시도하면 제대로 빌드되지 않아요.

---

### Visual Studio Code

런처 개발은 [Visual Studio Code][vscode]를 사용해서 진행해야 해요.

아래 내용을 `.vscode/launch.json`에 붙여넣기하세요.

```JSON
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "program": "${workspaceFolder}/node_modules/electron/cli.js",
      "args" : ["."],
      "outputCapture": "std"
    },
    {
      "name": "Debug Renderer Process",
      "type": "chrome",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "windows": {
        "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron.cmd"
      },
      "runtimeArgs": [
        "${workspaceFolder}/.",
        "--remote-debugging-port=9222"
      ],
      "webRoot": "${workspaceFolder}"
    }
  ]
}
```

이렇게 하면 두 개의 디버그 설정이 추가돼요.

#### 메인 프로세스 디버그

Electron의 [메인 프로세스][mainprocess]를 디버깅할 수 있어요. [렌더러 프로세스][rendererprocess]의 스크립트를 디버깅하려면 DevTools 창을 열어야 해요.

#### Debug Renderer Process

Electron의 [렌더러 프로세스][rendererprocess]를 디버깅할 수 있어요. 이 디버그 설정을 사용하려면 [Debugger for Chrome][chromedebugger] 확장을 설치해야 해요.

이 디버그 설정을 사용하는 동안에는 DevTools 창을 열 수 없어요. Chromium은 하나의 디버거만 허용하고 두 번째 디버거를 열면 프로그램 충돌이 발생해요.

---

### 제 3자 사용에 대한 주의사항

원작자([dscalzi](https://github.com/dscalzi))와 원본 레포지토리 링크([Helios Launcher](https://github.com/dscalzi/HeliosLauncher))를 표기하여 출처를 명시하면 무료로 사용할 수 있어요.

Microsoft 인증 설정 방법은 [여기](https://github.com/dscalzi/HeliosLauncher/blob/master/docs/MicrosoftAuth.md)를 참고하세요.

---

## 리소스

* [위키][wiki]
* [Nebula (Distribution.json 생성)][nebula]
* [v2 Rewrite Branch (비활성화)][v2branch]

아래 디스코드에서 개발자들과 소통할 수 있어요.

[![discord](https://discordapp.com/api/guilds/211524927831015424/embed.png?style=banner3)][discord]

---

## Mystic Red Space

[![discord](https://discordapp.com/api/guilds/330997213255827457/embed.png?style=banner3)][discord]

[nodejs]: https://nodejs.org/en/ 'Node.js'
[vscode]: https://code.visualstudio.com/ 'Visual Studio Code'
[mainprocess]: https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes 'Main Process'
[rendererprocess]: https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes 'Renderer Process'
[chromedebugger]: https://marketplace.visualstudio.com/items?itemName=msjsdiag.debugger-for-chrome 'Debugger for Chrome'
[discord]: https://discord.gg/zNWUXdt 'Discord'
[wiki]: https://github.com/peunsu/MRSLauncher/wiki 'wiki'
[nebula]: https://github.com/dscalzi/Nebula 'dscalzi/Nebula'
[v2branch]: https://github.com/dscalzi/HeliosLauncher/tree/ts-refactor 'v2 branch'
