const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const root = path.resolve(__dirname, '..')
const run = promisify(execFile)

test('배포 구성의 로딩 완료 신호는 화면 준비 후 한 번만 전달된다', async () => {
    for(const readyState of ['loading', 'interactive', 'complete']){
        for(const failed of [false, true]){
            const sent = []
            const listeners = new Map()
            const document = { readyState, addEventListener: (name, fn, options) => {
                assert.equal(options.once, true)
                listeners.set(name, fn)
            } }
            const logger = { info() {}, error() {}, warn() {} }
            const config = {
                load() {}, getCommonDirectory() {}, getInstanceDirectory() {},
                getSelectedServer: () => 'server', getTempNativeFolder: () => 'fixture'
            }
            const data = { getServerById: () => ({}) }
            const mocks = {
                electron: { ipcRenderer: { send: (...args) => sent.push(args) } },
                'fs-extra': { remove: (_dir, callback) => callback(null) },
                os, path,
                './configmanager': config,
                './distromanager': { DistroAPI: { getDistribution: () => failed ? Promise.reject(new Error('fixture')) : Promise.resolve(data) } },
                './langloader': { setupLanguage() {} },
                'helios-core': { LoggerUtil: { getLogger: () => logger } },
                'helios-core/common': {}
            }
            vm.runInNewContext(fs.readFileSync(path.join(root, 'app/assets/js/preloader.js'), 'utf8'), { require: name => mocks[name], document })
            await new Promise(resolve => setImmediate(resolve))
            if(readyState === 'loading'){
                assert.equal(sent.length, 0, '렌더러가 준비되기 전에 완료 신호를 보내면 안 된다')
                document.readyState = 'interactive'
                listeners.get('DOMContentLoaded')()
            }
            assert.equal(sent.length, 1)
            assert.deepEqual(sent[0], ['distributionIndexDone', !failed])
        }
    }
})

test('실제 Electron에서 첫 실행·재실행 모두 로고를 벗어나 Microsoft 로그인 화면에 도달한다', { timeout: 60000 }, async t => {
    const electron = require('electron')
    if(!await fs.pathExists(electron)){
        t.skip('Electron 실행 파일이 설치되어 있지 않다')
        return
    }
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-startup-test-'))
    t.after(() => fs.remove(folder))
    const fixture = path.join(folder, 'startup.cjs')
    await fs.writeFile(fixture, `
const { app } = require('electron')
const fs = require('fs')
const path = require('path')
process.env.APPDATA = __dirname
const profile = path.join(__dirname, 'profile')
fs.mkdirSync(profile, { recursive: true })
app.on('browser-window-created', (_event, win) => {
    win.hide()
    win.webContents.on('preload-error', (_event, _file, error) => { console.error(error); app.exit(1) })
    win.webContents.on('console-message', event => {
        if(event.level === 'error' && /Uncaught|Unhandled/.test(event.message)){ console.error(event.message); app.exit(1) }
    })
    win.webContents.on('did-finish-load', async () => {
        for(let i = 0; i < 150; i++){
            const state = await win.webContents.executeJavaScript(\`
                (() => {
                    const visible = id => getComputedStyle(document.getElementById(id)).display !== 'none'
                    if(visible('loadingContainer')) return 'loading'
                    if(visible('welcomeContainer')) { document.getElementById('welcomeButton').click(); return 'welcome' }
                    if(visible('loginOptionsContainer') && !document.getElementById('loginOptionMicrosoft').disabled
                        && typeof document.getElementById('loginOptionMicrosoft').onclick === 'function') return 'login'
                    return 'unexpected'
                })()
            \`)
            if(state === 'login'){ console.log('STARTUP_LOGIN_READY'); app.exit(0); return }
            await new Promise(resolve => setTimeout(resolve, 100))
        }
        console.error('Startup remained on the loading screen'); app.exit(1)
    })
})
require(path.join(process.argv[2], 'index.js'))
app.setPath('userData', profile)
setTimeout(() => app.exit(2), 20000).unref()
`, 'utf8')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    for(let attempt = 0; attempt < 2; attempt++){
        const { stdout } = await run(electron, [fixture, process.env.MLKC_STARTUP_APP || root], { env, windowsHide: true, timeout: 25000 })
        assert.ok(stdout.includes('STARTUP_LOGIN_READY'))
    }
})
