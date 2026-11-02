const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ejs = require('ejs')
const Lang = require('../app/assets/js/langloader')
const pkg = require('../package.json')

const root = path.join(__dirname, '..')
Lang.setupLanguage()

test('앱 제목과 모든 화면의 로고가 커스텀 브랜드를 사용한다', () => {
    assert.equal(pkg.productName, 'mlkc Client')
    assert.equal(Lang.queryEJS('app.title'), pkg.productName)
    const html = ejs.render(fs.readFileSync(path.join(root, 'app/app.ejs'), 'utf8'), {
        lang: (key, values) => Lang.queryEJS(key, values)
    }, { filename: path.join(root, 'app/app.ejs') })
    assert.ok(html.includes(`<title>${pkg.productName}</title>`))
    // 메인 화면 띠의 image_seal은 서버 로고를 쓴다.
    assert.match(html, /id="image_seal" src="assets\/images\/servers\/society-sunlit-valley\.png"/)
    for(const id of ['welcomeImageSeal', 'settingsAboutLogo', 'loadSpinnerImage']){
        assert.match(html, new RegExp(`id="${id}"[^>]*alt="밀튜디오 로고"`))
    }
    assert.ok(html.includes('id="loginOptionMicrosoft"'))
    assert.ok(!html.includes('id="loginOptionMojang"'))
    assert.ok(!html.includes('id="loginPassword"'))
    assert.ok(!html.includes('id="settingsAddMojangAccount"'))
    // 모드팩 이름은 서버 이름과 서버 주소에만 쓴다.
    const { name, address } = require('../app/assets/modpack/distribution.json').servers[0]
    const withoutServer = text => text.replaceAll(name, '').replaceAll(address, '')
    assert.doesNotMatch(withoutServer(html.replace(/<[^>]*>/g, '')), /Society|Sunlit Valley/i)
    assert.doesNotMatch(pkg.description, /Society|Sunlit Valley/i)
    // 서버 주소는 앱과 설치 화면 어디에도 보여 주지 않는다.
    assert.ok(!html.includes(address))
    assert.ok(!fs.readFileSync(path.join(root, 'installer/Window.xaml'), 'utf8').includes(address))
    assert.ok(!require('../app/assets/modpack/distribution.json').servers[0].description.includes(address))
    assert.doesNotMatch(withoutServer(fs.readFileSync(path.join(root, 'installer/Window.xaml'), 'utf8')), /Society|Sunlit Valley/i)
    assert.ok(html.includes('필요한 모드를 자동으로 설치한 뒤 게임을 시작합니다.'))
    assert.deepEqual(fs.readFileSync(path.join(root, 'app/assets/images/Icon.png')), fs.readFileSync(path.join(root, 'build/icon.png')))
})

test('Windows 아이콘에 작업 표시줄부터 설치 파일까지 필요한 해상도가 들어 있다', () => {
    const icon = fs.readFileSync(path.join(root, 'build/icon.ico'))
    assert.equal(icon.readUInt16LE(2), 1)
    assert.equal(icon.readUInt16LE(4), 7)
    const sizes = []
    for(let i = 0; i < 7; i++){
        const entry = 6 + 16 * i
        sizes.push(icon[entry] || 256)
        const length = icon.readUInt32LE(entry + 8)
        const offset = icon.readUInt32LE(entry + 12)
        assert.ok(offset + length <= icon.length)
        assert.equal(icon.toString('ascii', offset + 1, offset + 4), 'PNG')
    }
    assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256])
    assert.deepEqual(icon, fs.readFileSync(path.join(root, 'app/assets/images/Icon.ico')))
})

test('이름 변경 후 기존 설정을 보존하고 원본 자동 업데이트를 실행하지 않는다', () => {
    const listeners = {}
    let preservedPath
    const legacyPath = path.join(root, '밀튜디오 - 모드런처')
    const updater = new Proxy({}, {
        get: (_, key) => () => assert.fail(`업데이터 호출: ${String(key)}`)
    })
    const mocks = {
        '@electron/remote/main': { initialize() {} },
        electron: {
            app: { on() {}, disableHardwareAcceleration() {}, getPath: () => root, setPath: (name, value) => { preservedPath = { name, value } } },
            ipcMain: {
                on: (name, callback) => { listeners[name] = callback },
                handle() {}
            }
        },
        'electron-updater': { autoUpdater: updater },
        'ejs-electron': {},
        fs: { existsSync: file => file === legacyPath },
        './app/assets/js/isdev': false,
        './app/assets/js/langloader': { setupLanguage() {} }
    }
    vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), {
        require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id.startsWith('.') ? path.join(root, id) : id),
        __dirname: root,
        process: { platform: 'win32', resourcesPath: path.join(root, 'dist/resources') }
    })
    for(const action of ['initAutoUpdater', 'checkForUpdate', 'allowPrereleaseChange', 'installUpdateNow']){
        assert.doesNotThrow(() => listeners.autoUpdateAction({}, action))
    }
    assert.deepEqual(preservedPath, { name: 'userData', value: legacyPath })
})
