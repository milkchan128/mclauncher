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
    assert.equal(pkg.productName, '밀튜디오 - 모드런처')
    assert.equal(Lang.queryEJS('app.title'), pkg.productName)
    const html = ejs.render(fs.readFileSync(path.join(root, 'app/app.ejs'), 'utf8'), {
        bkid: 0,
        lang: (key, values) => Lang.queryEJS(key, values)
    }, { filename: path.join(root, 'app/app.ejs') })
    assert.ok(html.includes(`<title>${pkg.productName}</title>`))
    for(const id of ['welcomeImageSeal', 'loginImageSeal', 'image_seal', 'settingsAboutLogo', 'loadSpinnerImage']){
        assert.match(html, new RegExp(`id="${id}"[^>]*alt="밀튜디오 로고"`))
    }
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

test('업데이트 배포 설정이 없으면 초기화·확인·설치 요청이 원본 업데이트를 실행하지 않는다', () => {
    const listeners = {}
    const updater = new Proxy({}, {
        get: (_, key) => () => assert.fail(`업데이터 호출: ${String(key)}`)
    })
    const mocks = {
        '@electron/remote/main': { initialize() {} },
        electron: {
            app: { on() {}, disableHardwareAcceleration() {} },
            ipcMain: {
                on: (name, callback) => { listeners[name] = callback },
                handle() {}
            }
        },
        'electron-updater': { autoUpdater: updater },
        'ejs-electron': {},
        fs: { existsSync: () => false },
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
})
