const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const path = require('node:path')
const os = require('node:os')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

test('실제 Electron 재실행에서 메인 화면 진입·게임 시작 시 로그인 확인·연결 재시도·다른 계정 선택·로그아웃을 확인한다', { timeout: 90000 }, async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-auto-login-'))
    t.after(() => fs.remove(folder))
    const fixture = path.join(folder, 'startup.cjs')
    await fs.writeFile(fixture, `
const electron=require('electron')
const {app,BrowserWindow}=electron
const fs=require('fs'),path=require('path'),Module=require('module')
const root=process.argv[2],scenario=process.argv[3]
process.env.APPDATA=__dirname
process.env.ELECTRON_IS_DEV='0'
process.env.MLKC_AUTH_SCENARIO=scenario
const profile=path.join(__dirname,'profile')
fs.mkdirSync(profile,{recursive:true})
const preload=path.join(__dirname,'preload.cjs')
fs.writeFileSync(preload,'require('+JSON.stringify(path.join(root,'app/assets/js/preloader.js'))+');const auth=require('+JSON.stringify(path.join(root,'app/assets/js/authmanager.js'))+');const config=require('+JSON.stringify(path.join(root,'app/assets/js/configmanager.js'))+');let attempts=0;if(process.env.MLKC_AUTH_SCENARIO==="retry")auth.validateSelected=async()=>++attempts>1;if(process.env.MLKC_AUTH_SCENARIO==="multi")auth.validateSelected=async()=>config.getSelectedAccount()?.uuid==="other-fixture";')
class FixtureWindow extends BrowserWindow{
 constructor(options){if(options.webPreferences?.preload)options.webPreferences.preload=preload;super(options)}
}
const originalLoad=Module._load, fixtureElectron={...electron,BrowserWindow:FixtureWindow}
Module._load=function(request,parent,isMain){return request==='electron'?fixtureElectron:originalLoad.apply(this,arguments)}
let windows=0
app.on('browser-window-created',(_event,win)=>{
 windows++;win.hide()
 win.webContents.on('console-message',event=>{if(event.level==='error'&&/Uncaught|Unhandled/.test(event.message)){console.error(event.message);app.exit(1)}})
 win.webContents.on('did-finish-load',async()=>{
  let handled=false,clicked=false,stubbed=false
  const click=()=>{clicked=true;return win.webContents.executeJavaScript("document.getElementById('launch_button').click();0")}
  for(let i=0;i<180;i++){
   const state=await win.webContents.executeJavaScript("({loading:getComputedStyle(document.getElementById('loadingContainer')).display!=='none',welcome:getComputedStyle(document.getElementById('welcomeContainer')).display!=='none',login:getComputedStyle(document.getElementById('loginOptionsContainer')).display!=='none',landing:getComputedStyle(document.getElementById('landingContainer')).display!=='none',overlay:isOverlayVisible(),accounts:Object.keys(ConfigManager.getAuthAccounts()).length,launched:window.__launched===true})")
   if(state.welcome){console.error('Welcome screen shown before launcher');app.exit(1);return}
   const ready=state.landing&&!state.loading
   // 실제 Java·모드팩 준비 대신 계정 확인 뒤 실행이 이어졌는지만 기록한다.
   if(ready&&!stubbed){await win.webContents.executeJavaScript("window.asyncSystemScan=window.dlAsync=async()=>{window.__launched=true};0");stubbed=true}
   const done=()=>{if(windows!==1){console.error('Unexpected interactive login window');app.exit(1);return}console.log('AUTH_'+(scenario==='seed'?'SAVED':scenario.toUpperCase()));app.exit(0)}
   if(stubbed&&scenario==='logout'){await win.webContents.executeJavaScript("Promise.all(Object.keys(ConfigManager.getAuthAccounts()).map(uuid=>AuthManager.removeMicrosoftAccount(uuid)))");done();return}
   if(stubbed&&!clicked&&!state.overlay){
    if(['seed','signed-out'].includes(scenario)&&state.accounts!==0){console.error('Logout did not persist');app.exit(1);return}
    await click()
   }
   if(['seed','signed-out'].includes(scenario)&&clicked&&state.login){
    if(state.launched){console.error('Launch continued without an account');app.exit(1);return}
    if(scenario==='seed') await win.webContents.executeJavaScript("ConfigManager.addMicrosoftAuthAccount('fixture-user','fixture-mc','FixtureUser',Date.now()+600000,'fixture-ms','fixture-refresh',Date.now()+600000);ConfigManager.save()")
    done();return
   }
   if(scenario==='restore'&&state.launched){
    if(process.env.MLKC_AUTOLOGIN_SCREENSHOT) fs.writeFileSync(process.env.MLKC_AUTOLOGIN_SCREENSHOT,(await win.webContents.capturePage()).toPNG())
    done();return
   }
   if(['retry','multi'].includes(scenario)&&clicked&&state.overlay&&!handled){
    if(!state.landing||state.accounts<1||state.launched){console.error('Failed session was not preserved');app.exit(1);return}
    if(process.env.MLKC_AUTOLOGIN_SCREENSHOT){await new Promise(resolve=>setTimeout(resolve,300));fs.writeFileSync(process.env.MLKC_AUTOLOGIN_SCREENSHOT.replace('.png','-error.png'),(await win.webContents.capturePage()).toPNG())}
    if(scenario==='retry'){
     await win.webContents.executeJavaScript("document.getElementById('overlayAcknowledge').click()")
    }else{
     await win.webContents.executeJavaScript("document.getElementById('accountRestoreSelect').click();document.querySelector('.accountListing[uuid=other-fixture]').click();document.getElementById('accountSelectConfirm').click()")
    }
    handled=true
   }
   if(['retry','multi'].includes(scenario)&&handled&&ready&&!state.overlay){
    if(scenario==='retry') await win.webContents.executeJavaScript("ConfigManager.addMicrosoftAuthAccount('other-fixture','other-mc','OtherUser',Date.now()+600000,'other-ms','other-refresh',Date.now()+600000);ConfigManager.setSelectedAccount('fixture-user');ConfigManager.save()")
    done();return
   }
   await new Promise(resolve=>setTimeout(resolve,100))
  }
  console.error('Automatic login scenario timed out:',scenario);app.exit(1)
 })
})
require(path.join(root,'index.js'))
app.setPath('userData',profile)
setTimeout(()=>app.exit(2),25000).unref()
`, 'utf8')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    for(const scenario of ['seed', 'restore', 'retry', 'multi', 'logout', 'signed-out']){
        const { stdout } = await promisify(execFile)(require('electron'), [fixture, process.env.MLKC_STARTUP_APP || path.resolve(__dirname, '..'), scenario], { env, windowsHide: true, timeout: 30000 })
        assert.ok(stdout.includes('AUTH_' + (scenario === 'seed' ? 'SAVED' : scenario.toUpperCase())))
    }
})
