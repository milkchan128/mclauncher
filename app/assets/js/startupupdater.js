function createStartupUpdater(updater, notify){
    let state = { phase: 'idle' }
    let running = false
    const publish = next => { state = next; notify(state) }
    const fail = error => {
        if(state.phase !== 'error') publish({ phase: 'error', message: error.message, code: error.code })
    }
    updater.on('error', error => {
        if(['checking', 'downloading', 'installing'].includes(state.phase)) fail(error)
    })
    updater.on('download-progress', progress => {
        if(state.phase === 'downloading' && Number.isFinite(progress.percent)){
            publish({ ...state, percent: Math.max(0, Math.min(100, Math.floor(progress.percent))) })
        }
    })
    return {
        getState: () => state,
        async start(){
            if(running || state.phase === 'installing') return
            if(state.phase === 'ready'){ notify(state); return }
            running = true
            try {
                updater.autoDownload = false
                updater.autoInstallOnAppQuit = false
                updater.allowDowngrade = false
                updater.disableWebInstaller = true
                publish({ phase: 'checking' })
                const result = await updater.checkForUpdates()
                if(state.phase === 'error') return
                if(!result) throw new Error('업데이트 정보를 확인할 수 없습니다.')
                if(!result.isUpdateAvailable){
                    publish({ phase: 'ready' })
                    return
                }
                publish({ phase: 'downloading', version: result.updateInfo.version, percent: 0 })
                const files = await updater.downloadUpdate()
                if(state.phase === 'error') return
                if(!files?.length) throw new Error('업데이트 파일을 받지 못했습니다.')
                publish({ phase: 'installing' })
                updater.quitAndInstall(true, true)
            } catch(error){
                fail(error)
            } finally {
                running = false
            }
        }
    }
}

module.exports = { createStartupUpdater }
