const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('fs-extra')
const path = require('node:path')
const os = require('node:os')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { createStartupUpdater } = require('../app/assets/js/startupupdater')

test('최신 버전일 때만 로그인 준비를 완료한다', async () => {
    const updater = new EventEmitter()
    let checks = 0
    updater.checkForUpdates = async () => { checks++; return { isUpdateAvailable: false } }
    updater.downloadUpdate = () => assert.fail('최신 버전에서는 다운로드하지 않는다')
    const states = []
    const startup = createStartupUpdater(updater, state => states.push(state.phase))
    await startup.start()
    await startup.start()
    assert.equal(checks, 1)
    assert.equal(startup.getState().phase, 'ready')
    assert.deepEqual(states, ['checking', 'ready', 'ready'])
})

test('새 버전은 로그인을 허용하지 않고 한 번만 다운로드·무인 설치·재실행한다', async () => {
    const updater = new EventEmitter()
    let checks = 0
    let finishDownload
    let installs = 0
    updater.checkForUpdates = async () => { checks++; return { isUpdateAvailable: true, updateInfo: { version: '9.0.0' } } }
    updater.downloadUpdate = () => new Promise(resolve => { finishDownload = resolve })
    updater.quitAndInstall = (...args) => { installs++; assert.deepEqual(args, [true, true]) }
    const states = []
    const startup = createStartupUpdater(updater, state => states.push(state.phase))
    const running = startup.start()
    await new Promise(resolve => setImmediate(resolve))
    await startup.start()
    assert.equal(checks, 1)
    assert.equal(startup.getState().phase, 'downloading')
    updater.emit('download-progress', { percent: 47.9 })
    assert.equal(startup.getState().percent, 47)
    assert.equal(updater.autoDownload, false)
    assert.equal(updater.autoInstallOnAppQuit, false)
    assert.equal(updater.allowDowngrade, false)
    finishDownload(['verified-fixture.exe'])
    await running
    await startup.start()
    assert.equal(installs, 1)
    assert.equal(startup.getState().phase, 'installing')
    assert.ok(!states.includes('ready'))
})

test('확인·다운로드·설치 오류에서는 로그인 대신 오류를 표시하고 다시 시도할 수 있다', async () => {
    for(const stage of ['checking', 'downloading', 'installing', 'invalid-response']){
        const updater = new EventEmitter()
        let fail = true
        updater.checkForUpdates = async () => {
            if(fail && stage === 'checking') throw new Error('offline fixture')
            if(fail && stage === 'invalid-response') return null
            return { isUpdateAvailable: !['checking', 'invalid-response'].includes(stage), updateInfo: { version: '9.0.0' } }
        }
        updater.downloadUpdate = async () => {
            if(fail && stage === 'downloading') throw new Error('checksum fixture')
            return ['verified-fixture.exe']
        }
        updater.quitAndInstall = () => { if(fail) updater.emit('error', new Error('install fixture')) }
        const states = []
        const startup = createStartupUpdater(updater, state => states.push(state.phase))
        await startup.start()
        assert.equal(startup.getState().phase, 'error')
        assert.ok(!states.includes('ready'))
        fail = false
        await startup.start()
        assert.equal(startup.getState().phase, ['checking', 'invalid-response'].includes(stage) ? 'ready' : 'installing')
    }
})

test('실제 Electron에서 로그인 전 업데이트·오류·재시도 화면을 거치고 설치를 요청한다', { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-startup-update-'))
    t.after(() => fs.remove(folder))
    const fixture = path.join(folder, 'startup.cjs')
    await fs.writeFile(fixture, `
const electron=require('electron')
const {app,BrowserWindow}=electron
const fs=require('fs'),path=require('path'),Module=require('module')
const {EventEmitter}=require('events')
const root=process.argv[2], scenario=process.argv[3]
process.env.APPDATA=__dirname
process.env.ELECTRON_IS_DEV='0'
Object.defineProperty(process,'resourcesPath',{value:__dirname})
fs.writeFileSync(path.join(__dirname,'app-update.yml'),'fixture')
const preload=path.join(__dirname,'preload.cjs')
fs.writeFileSync(preload,'Object.defineProperty(process,"resourcesPath",{value:'+JSON.stringify(__dirname)+'});require('+JSON.stringify(path.join(root,'app/assets/js/preloader.js'))+')')
class FixtureWindow extends BrowserWindow{
 constructor(options){if(options.webPreferences?.preload) options.webPreferences.preload=preload;super(options)}
}
const fixtureElectron={...electron,BrowserWindow:FixtureWindow}
const profile=path.join(__dirname,'profile-'+scenario)
fs.mkdirSync(profile,{recursive:true})
const updater=new EventEmitter()
let checks=0, window
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const hidden=()=>window.webContents.executeJavaScript("getComputedStyle(document.getElementById('main')).display==='none' && getComputedStyle(document.getElementById('loginOptionsContainer')).display==='none'")
updater.checkForUpdates=async()=>{
 checks++
 await pause(250)
 if(!await hidden()) throw new Error('Login appeared before the startup check')
 if(scenario==='retry' && checks===1) throw new Error('offline fixture')
 return {isUpdateAvailable:scenario==='update',updateInfo:{version:'9.0.0'}}
}
updater.downloadUpdate=async()=>{
 updater.emit('download-progress',{percent:42})
 await pause(150)
 if(!await hidden()) throw new Error('Login appeared during download')
 if(process.env.MLKC_STARTUP_UPDATE_SCREENSHOT) fs.writeFileSync(process.env.MLKC_STARTUP_UPDATE_SCREENSHOT,(await window.webContents.capturePage()).toPNG())
 return ['verified-fixture.exe']
}
updater.quitAndInstall=(silent,relaunch)=>{
 if(!silent||!relaunch){console.error('Missing silent/relaunch flags');app.exit(1);return}
 hidden().then(ok=>{console.log(ok?'STARTUP_INSTALL_BLOCKED_LOGIN':'LOGIN_LEAK');app.exit(ok?0:1)})
}
const originalLoad=Module._load
Module._load=function(request,parent,isMain){
 if(request==='electron-updater') return {autoUpdater:updater}
 if(request==='electron') return fixtureElectron
 return originalLoad.apply(this,arguments)
}
app.on('browser-window-created',(_event,win)=>{
 window=win;win.hide()
 win.webContents.on('console-message',event=>{if(event.level==='error'&&/Uncaught|Unhandled/.test(event.message)){console.error(event.message);app.exit(1)}})
 win.webContents.on('did-finish-load',async()=>{
  for(let i=0;i<150;i++){
   const state=await win.webContents.executeJavaScript("({error:!document.getElementById('startupUpdateActions').hidden,main:getComputedStyle(document.getElementById('main')).display,phase:document.getElementById('startupUpdateStatus').textContent})")
   if(scenario==='retry'&&state.error){
    if(!await hidden()){console.error('Login appeared after failed check');app.exit(1);return}
    if(process.env.MLKC_STARTUP_UPDATE_SCREENSHOT) fs.writeFileSync(process.env.MLKC_STARTUP_UPDATE_SCREENSHOT.replace('.png','-error.png'),(await win.webContents.capturePage()).toPNG())
    await win.webContents.executeJavaScript("document.getElementById('startupUpdateRetry').click()")
   }
   if(scenario!=='update'&&state.main!=='none'){
    if(scenario==='retry'&&checks!==2){console.error('Retry did not check again');app.exit(1);return}
    console.log('STARTUP_LOGIN_ALLOWED');app.exit(0);return
   }
   await pause(100)
  }
  console.error('Startup update timed out, checks:',checks);app.exit(1)
 })
})
require(path.join(root,'index.js'))
app.setPath('userData',profile)
setTimeout(()=>app.exit(2),20000).unref()
`, 'utf8')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    for(const scenario of ['update', 'current', 'retry']){
        const { stdout } = await promisify(execFile)(require('electron'), [fixture, process.env.MLKC_STARTUP_APP || path.resolve(__dirname, '..'), scenario], { env, windowsHide: true, timeout: 25000 })
        assert.ok(stdout.includes(scenario === 'update' ? 'STARTUP_INSTALL_BLOCKED_LOGIN' : 'STARTUP_LOGIN_ALLOWED'))
    }
})
