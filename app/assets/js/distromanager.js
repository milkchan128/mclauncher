const { DistributionAPI, RestResponseStatus } = require('helios-core/common')
const fs = require('fs-extra')
const path = require('path')
const { pathToFileURL } = require('url')
const ConfigManager = require('./configmanager')

const api = new DistributionAPI(ConfigManager.getLauncherDirectory(), null, null, null, false)

// 전용 배포 서버 없이도 설치본에 고정된 모드팩 구성을 사용한다.
api.pullRemote = async () => {
    const data = await fs.readJson(path.join(__dirname, '..', 'modpack', 'distribution.json'))
    const server = data.servers[0]
    server.icon = pathToFileURL(path.join(__dirname, '..', 'images', 'Icon.png')).href
    const manifest = server.modules[0].subModules.find(module => module.type === 'VersionManifest')
    manifest.artifact.url = pathToFileURL(path.join(__dirname, '..', 'modpack', 'forge-version.json')).href
    return { data, responseStatus: RestResponseStatus.SUCCESS }
}

exports.DistroAPI = api
