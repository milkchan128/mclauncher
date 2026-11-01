const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const http = require('node:http')
const crypto = require('node:crypto')
const { EventEmitter, once } = require('node:events')
const { createRequire } = require('node:module')
const yaml = require('js-yaml')
const { NsisUpdater } = require('electron-updater')
const { NodeHttpExecutor } = require('builder-util/out/nodeHttpExecutor')
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor')
const { createStartupUpdater } = require('../app/assets/js/startupupdater')

const root = path.join(__dirname, '..')
const quietLogger = { log() {}, info() {}, warn() {}, error() {}, debug() {} }

function loadWithMocks(file, mocks, globals = {}){
    const filename = path.join(root, file)
    const localRequire = createRequire(filename)
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, __dirname: path.dirname(filename),
        require: id => Object.hasOwn(mocks, id) ? mocks[id] : localRequire(id),
        ...globals
    })
    return module.exports
}

function loadConfig(folder){
    const config = loadWithMocks('app/assets/js/configmanager.js', {
        '@electron/remote': { app: { getPath: () => folder } },
        'helios-core': { LoggerUtil: { getLogger: () => quietLogger } }
    }, { process: { env: { APPDATA: folder }, platform: 'win32' } })
    config.load()
    return config
}

function loadAuth(config, methods = {}){
    return loadWithMocks('app/assets/js/authmanager.js', {
        './configmanager': config,
        './ipcconstants': { AZURE_CLIENT_ID: 'fixture' },
        './langloader': { queryJS: key => key },
        'helios-core': { LoggerUtil: { getLogger: () => quietLogger } },
        'helios-core/microsoft': { MicrosoftAuth: methods, MicrosoftErrorCode: require('helios-core/microsoft').MicrosoftErrorCode }
    })
}

test('Mojang 저장 기록을 삭제하지 않고 Microsoft 계정만 선택할 수 있다', async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-auth-'))
    t.after(() => fs.remove(folder))
    const legacy = { type: 'mojang', uuid: 'legacy', accessToken: 'fixture-token' }
    await fs.writeJson(path.join(folder, 'config.json'), {
        selectedAccount: 'legacy',
        authenticationDatabase: { legacy, microsoft: { type: 'microsoft', uuid: 'microsoft' } }
    })
    const config = loadWithMocks('app/assets/js/configmanager.js', {
        '@electron/remote': { app: { getPath: () => folder } },
        'helios-core': { LoggerUtil: { getLogger: () => quietLogger } }
    }, { process: { env: { APPDATA: folder }, platform: 'win32' } })
    config.load()
    assert.deepEqual(Object.keys(config.getAuthAccounts()), ['microsoft'])
    assert.equal(config.getSelectedAccount().uuid, 'microsoft')
    assert.equal(config.setSelectedAccount('legacy'), undefined)
    config.removeAuthAccount('microsoft')
    assert.equal(config.getSelectedAccount(), undefined)
    config.save()
    assert.deepEqual((await fs.readJson(path.join(folder, 'config.json'))).authenticationDatabase.legacy, legacy)
})

test('인증 관리자는 Mojang 로그인을 제공하지 않고 유효한 Microsoft 세션을 유지한다', async () => {
    let account = { type: 'mojang' }
    const auth = loadWithMocks('app/assets/js/authmanager.js', {
        './configmanager': { getSelectedAccount: () => account },
        './ipcconstants': { AZURE_CLIENT_ID: 'fixture' },
        'helios-core': { LoggerUtil: { getLogger: () => quietLogger } }
    })
    assert.equal(auth.addMojangAccount, undefined)
    assert.equal(auth.removeMojangAccount, undefined)
    assert.equal(await auth.validateSelected(), false)
    account = { type: 'microsoft', accessToken: 'fixture-token', expiresAt: Date.now() + 60000 }
    assert.equal(await auth.validateSelected(), true)
    account = { type: 'microsoft' }
    assert.equal(await auth.validateSelected(), false)
})

test('업데이터를 한 번만 초기화하고 다운로드 상태와 설치 동작을 전달한다', async () => {
    const listeners = {}
    const notices = []
    const updater = new EventEmitter()
    let checks = 0
    let installs = 0
    updater.checkForUpdates = async () => { checks++ }
    updater.quitAndInstall = (...args) => { installs++; assert.deepEqual(args, [true, true]) }
    loadWithMocks('index.js', {
        '@electron/remote/main': { initialize() {} },
        electron: { app: { on() {}, getPath: () => root, disableHardwareAcceleration() {} }, ipcMain: {
            on: (name, fn) => { listeners[name] = fn }, handle() {}
        } },
        'electron-updater': { autoUpdater: updater },
        'ejs-electron': {},
        fs: { existsSync: file => file.endsWith('app-update.yml') },
        './app/assets/js/isdev': false,
        './app/assets/js/langloader': { setupLanguage() {} }
    }, { process: { resourcesPath: root, platform: 'win32' }, console: quietLogger })
    const event = { sender: { send: (...args) => notices.push(args) } }
    listeners.autoUpdateAction(event, 'initAutoUpdater', false)
    listeners.autoUpdateAction(event, 'initAutoUpdater', false)
    assert.equal(notices.filter(n => n[1] === 'ready').length, 1)
    assert.equal(updater.autoDownload, true)
    assert.equal(updater.autoInstallOnAppQuit, true)
    assert.equal(updater.allowDowngrade, false)
    listeners.autoUpdateAction(event, 'checkForUpdate')
    updater.emit('download-progress', { percent: 57 })
    updater.emit('update-downloaded', { version: '1.0.1' })
    updater.emit('error', Object.assign(new Error('offline'), { code: 'ENOTFOUND' }))
    listeners.autoUpdateAction(event, 'installUpdateNow')
    assert.equal(checks, 1)
    assert.equal(installs, 1)
    assert.ok(notices.some(n => n[1] === 'download-progress' && n[2].percent === 57))
    assert.ok(notices.some(n => n[1] === 'update-downloaded' && n[2].version === '1.0.1'))
    assert.ok(notices.some(n => n[1] === 'realerror' && n[2].code === 'ENOTFOUND'))
})

test('저장된 Microsoft 세션을 재실행 후 복원하고 명시적 로그아웃은 유지한다', async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-remember-auth-'))
    t.after(() => fs.remove(folder))
    const config = loadConfig(folder)
    config.addMicrosoftAuthAccount('fixture-user', 'fixture-mc', 'FixtureUser', Date.now() + 60000, 'fixture-ms', 'fixture-refresh', Date.now() + 60000)
    config.save()
    const restored = loadConfig(folder)
    const auth = loadAuth(restored)
    assert.equal(restored.getSelectedAccount().uuid, 'fixture-user')
    assert.equal(await auth.validateSelected(), true)
    await auth.removeMicrosoftAccount('fixture-user')
    assert.equal(loadConfig(folder).getSelectedAccount(), undefined)
})

test('만료된 세션을 자동 갱신하고 새 refresh token을 저장하거나 기존 값을 보존한다', async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-refresh-auth-'))
    t.after(() => fs.remove(folder))
    const success = data => ({ responseStatus: 0, data })
    for(const mode of ['full', 'no-rotation', 'minecraft-only']){
        const config = loadConfig(folder)
        const msExpiry = mode === 'minecraft-only' ? Date.now() + 60000 : Date.now() - 1000
        config.addMicrosoftAuthAccount('fixture-user', 'old-mc', 'FixtureUser', Date.now() - 1000, 'old-ms', 'old-refresh', msExpiry)
        config.save()
        let refreshes = 0
        const auth = loadAuth(loadConfig(folder), {
            getAccessToken: async (token, refresh) => {
                assert.equal(token, 'old-refresh')
                assert.equal(refresh, true)
                refreshes++
                return success({ access_token: 'new-ms', refresh_token: mode === 'full' ? 'new-refresh' : undefined, expires_in: 3600 })
            },
            getXBLToken: async () => success({}),
            getXSTSToken: async () => success({}),
            getMCAccessToken: async () => success({ access_token: 'new-mc', expires_in: 3600 }),
            getMCProfile: async () => success({ id: 'fixture-user', name: 'FixtureUser' })
        })
        assert.equal(await auth.validateSelected(), true)
        const saved = loadConfig(folder).getSelectedAccount()
        assert.equal(saved.accessToken, 'new-mc')
        assert.ok(saved.expiresAt > Date.now())
        assert.equal(saved.microsoft.refresh_token, mode === 'full' ? 'new-refresh' : 'old-refresh')
        assert.equal(refreshes, mode === 'minecraft-only' ? 0 : 1)
    }
})

test('세션 갱신 실패 시 저장된 계정과 토큰을 삭제하지 않는다', async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-offline-auth-'))
    t.after(() => fs.remove(folder))
    const config = loadConfig(folder)
    config.addMicrosoftAuthAccount('fixture-user', 'old-mc', 'FixtureUser', Date.now() - 1000, 'old-ms', 'old-refresh', Date.now() - 1000)
    config.save()
    const auth = loadAuth(loadConfig(folder), { getAccessToken: async () => ({ responseStatus: 1, microsoftErrorCode: 0 }) })
    assert.equal(await auth.validateSelected(), false)
    assert.equal(loadConfig(folder).getSelectedAccount().microsoft.refresh_token, 'old-refresh')
})

test('실제 NSIS 시작 업데이터가 파일 검증 후 설치를 요청하고 손상 파일은 로그인 전에 거부한다', async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-update-'))
    t.after(() => fs.remove(folder))
    const payload = Buffer.from('update fixture, never executed')
    const digest = crypto.createHash('sha512').update(payload).digest('base64')
    let corrupt = false
    const server = http.createServer((req, res) => {
        if(req.url.startsWith('/latest.yml')){
            res.end(yaml.dump({ version: '1.0.1', files: [{ url: 'client.exe', sha512: corrupt ? Buffer.alloc(64).toString('base64') : digest, size: payload.length }], path: 'client.exe', sha512: digest }))
        } else {
            res.writeHead(200, { 'Content-Length': payload.length })
            res.end(payload)
        }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => new Promise(resolve => server.close(resolve)))
    const url = `http://127.0.0.1:${server.address().port}/`
    for(const shouldCorrupt of [false, true]){
        corrupt = shouldCorrupt
        const cache = path.join(folder, String(shouldCorrupt))
        const configFile = path.join(cache, 'app-update.yml')
        await fs.outputFile(configFile, yaml.dump({ provider: 'generic', url, updaterCacheDirName: 'fixture-cache' }))
        const app = { version: '1.0.0', name: 'mlkc Client', isPackaged: true, appUpdateConfigPath: configFile, userDataPath: cache, baseCachePath: cache, whenReady: async () => {}, onQuit() {} }
        const updater = new NsisUpdater(null, app)
        updater.httpExecutor = new NodeHttpExecutor()
        // Electron 없이도 실제 다운로드·해시 검증 코드를 실행한다.
        updater.httpExecutor.download = ElectronHttpExecutor.prototype.download
        updater.setFeedURL({ provider: 'generic', url })
        updater.autoDownload = false
        updater.autoInstallOnAppQuit = false
        updater.disableDifferentialDownload = true
        updater.disableWebInstaller = true
        updater.logger = null
        const installs = []
        updater.quitAndInstall = (...args) => installs.push(args)
        const states = []
        const startup = createStartupUpdater(updater, state => states.push(state))
        await startup.start()
        assert.ok(states.some(state => state.version === '1.0.1'))
        assert.ok(!states.some(state => state.phase === 'ready'))
        if(shouldCorrupt){
            assert.equal(startup.getState().phase, 'error')
            assert.match(startup.getState().message, /sha512 checksum mismatch/)
            assert.equal(installs.length, 0)
        } else {
            assert.equal(startup.getState().phase, 'installing')
            assert.deepEqual(installs, [[true, true]])
            assert.deepEqual(await fs.readFile(updater.installerPath), payload)
        }
    }
})
