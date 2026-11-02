/* global document, window */
// 메인 화면 콘솔 창에 보여 줄 로그를 모은다. 로거는 만들어질 때 console 함수를 붙잡으므로
// 다른 모듈을 불러오기 전에 감싼다. 최근 2000줄만 보관한다.
if(typeof window !== 'undefined'){
    const { inspect } = require('util')
    window.launcherLogs = []
    for(const level of ['log', 'info', 'warn', 'error']){
        const original = console[level].bind(console)
        console[level] = (...args) => {
            original(...args)
            const entry = {
                level,
                text: args.map(a => typeof a === 'string' ? a : inspect(a)).join(' ').replace(/\x1b\[[0-9;]*m/g, '')
            }
            window.launcherLogs.push(entry)
            if(window.launcherLogs.length > 2000){
                window.launcherLogs.shift()
            }
            window.dispatchEvent(new CustomEvent('launcherlog', { detail: entry }))
        }
    }
}

const {ipcRenderer}  = require('electron')
const fs             = require('fs-extra')
const os             = require('os')
const path           = require('path')

const ConfigManager  = require('./configmanager')
const { DistroAPI }  = require('./distromanager')
const LangLoader     = require('./langloader')
const { LoggerUtil } = require('helios-core')
// eslint-disable-next-line no-unused-vars
const { HeliosDistribution } = require('helios-core/common')

const logger = LoggerUtil.getLogger('Preloader')

logger.info('Loading..')

// Load ConfigManager
ConfigManager.load()

// Yuck!
// TODO Fix this
DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()

// Load Strings
LangLoader.setupLanguage()

/**
 * 
 * @param {HeliosDistribution} data 
 */
function onDistroLoad(data){
    if(data != null){
        
        // Resolve the selected server if its value has yet to be set.
        if(ConfigManager.getSelectedServer() == null || data.getServerById(ConfigManager.getSelectedServer()) == null){
            logger.info('Determining default selected server..')
            ConfigManager.setSelectedServer(data.getMainServer().rawServer.id)
            ConfigManager.save()
        }
    }
    // 로컬 구성이 먼저 준비되어도 렌더러의 IPC 리스너가 등록된 뒤 알린다.
    const notifyRenderer = () => ipcRenderer.send('distributionIndexDone', data != null)
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', notifyRenderer, { once: true })
    } else {
        notifyRenderer()
    }
}

// Ensure Distribution is downloaded and cached.
DistroAPI.getDistribution()
    .then(heliosDistro => {
        logger.info('Loaded distribution index.')

        onDistroLoad(heliosDistro)
    })
    .catch(err => {
        logger.info('Failed to load an older version of the distribution index.')
        logger.info('Application cannot run.')
        logger.error(err)

        onDistroLoad(null)
    })

// Clean up temp dir incase previous launches ended unexpectedly. 
fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder()), (err) => {
    if(err){
        logger.warn('Error while cleaning natives directory', err)
    } else {
        logger.info('Cleaned natives directory.')
    }
})
