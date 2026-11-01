const fs = require('fs-extra')
const path = require('path')
const crypto = require('crypto')
const got = require('got')
const AdmZip = require('adm-zip')
const { execFile } = require('child_process')
const { promisify } = require('util')
const pack = require('../modpack/modpack.json')

async function checksum(file, algorithm){
    const hash = crypto.createHash(algorithm)
    for await (const chunk of fs.createReadStream(file)){
        hash.update(chunk)
    }
    return hash.digest('hex')
}

async function matches(file, expected, algorithm = 'sha256'){
    return await fs.pathExists(file) && await checksum(file, algorithm) === expected
}

async function getManagedMods(modules){
    const mods = []
    for(const module of modules){
        if(module.rawModule.type === 'File' && /^mods\/.+\.(jar|zip|litemod)$/i.test(module.rawModule.artifact.path?.replaceAll('\\', '/') || '')){
            const filePath = module.getPath()
            let installed = false
            try {
                const file = await fs.stat(filePath)
                installed = file.isFile() && file.size === module.rawModule.artifact.size
            } catch(error){
                if(error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
            }
            mods.push({ name: module.rawModule.name, fileName: path.basename(filePath), path: filePath, installed })
        }
        if(module.subModules?.length) mods.push(...await getManagedMods(module.subModules))
    }
    return mods
}

async function ensureDownload(spec, target){
    if(await matches(target, spec.sha256)){
        return
    }
    if(new URL(spec.url).protocol !== 'https:' || !/^[a-f0-9]{64}$/.test(spec.sha256)){
        throw new Error('모드팩 다운로드 정보가 올바르지 않습니다.')
    }
    const bytes = await got(spec.url, { timeout: { request: 180000 } }).buffer()
    if(crypto.createHash('sha256').update(bytes).digest('hex') !== spec.sha256){
        throw new Error('다운로드한 파일의 무결성 검증에 실패했습니다. 다시 시도해 주세요.')
    }
    const temporary = `${target}.${crypto.randomBytes(8).toString('hex')}.part`
    try {
        await fs.outputFile(temporary, bytes)
        await fs.move(temporary, target, { overwrite: true })
    } finally {
        await fs.remove(temporary)
    }
}

async function extractOverrides(archive, instanceDir){
    const entries = new AdmZip(archive).getEntries().filter(entry => {
        const name = entry.entryName.replaceAll('\\', '/')
        return name.startsWith('overrides/') && !(name === 'overrides/' && entry.isDirectory)
    })
    for(const entry of entries){
        const relative = entry.entryName.replaceAll('\\', '/').slice('overrides/'.length).replace(/\/$/, '')
        if(!relative || relative.split('/').some(part => !part || /[. ]$/.test(part)) || /[:\0]/.test(relative) || ((entry.attr >>> 16) & 0xf000) === 0xa000){
            throw new Error('모드팩 압축 파일에 안전하지 않은 경로가 있습니다.')
        }
    }
    if(!entries.some(entry => !entry.isDirectory)){
        throw new Error('모드팩 설정 파일을 찾을 수 없습니다.')
    }
    const parent = path.dirname(path.resolve(instanceDir))
    await fs.ensureDir(parent)
    const staging = await fs.mkdtemp(path.join(parent, '.mlkc-overrides-'))
    try {
        for(const entry of entries){
            if(!entry.isDirectory){
                await fs.outputFile(path.join(staging, entry.entryName.replaceAll('\\', '/').slice('overrides/'.length)), entry.getData())
            }
        }
        await fs.copy(staging, instanceDir, {
            overwrite: false,
            filter: async (_source, destination) => {
                const stat = await fs.lstat(destination).catch(error => {
                    if(error.code === 'ENOENT'){
                        return null
                    }
                    throw error
                })
                return stat == null || stat.isDirectory() && !stat.isSymbolicLink()
            }
        })
    } finally {
        if(path.dirname(staging) === parent){
            await fs.remove(staging)
        }
    }
}

async function prepareModpack({ commonDir, instanceDir, cacheDir, javaExecutable, onProgress }){
    const readyFile = path.join(instanceDir, '.mlkc-pack-version')
    if(!await fs.pathExists(readyFile) || await fs.readFile(readyFile, 'utf8') !== pack.version){
        onProgress('서버 접속에 필요한 설정 파일을 준비하고 있습니다…')
        const archive = path.join(cacheDir, `society-${pack.version}.zip`)
        await ensureDownload(pack.archive, archive)
        const manifest = JSON.parse(new AdmZip(archive).readAsText('manifest.json'))
        if(manifest.minecraft.version !== pack.minecraftVersion || !manifest.minecraft.modLoaders.some(loader => loader.id === `forge-${pack.forgeVersion}`)){
            throw new Error('모드팩의 Minecraft 또는 Forge 버전이 일치하지 않습니다.')
        }
        await extractOverrides(archive, instanceDir)
        await fs.outputFile(readyFile, pack.version, 'utf8')
    }
    let forgeReady = true
    for(const file of pack.generated){
        if(!await matches(path.join(commonDir, 'libraries', file.path), file.sha1, 'sha1')){
            forgeReady = false
            break
        }
    }
    if(!forgeReady){
        onProgress('Forge 47.4.0을 설치하고 있습니다. 잠시 기다려 주세요…')
        const installer = path.join(cacheDir, `forge-${pack.forgeVersion}-installer.jar`)
        await ensureDownload(pack.installer, installer)
        const profiles = path.join(commonDir, 'launcher_profiles.json')
        if(!await fs.pathExists(profiles)){
            await fs.outputJson(profiles, {})
        }
        try {
            await promisify(execFile)(javaExecutable, ['-jar', path.resolve(installer), '--installClient', path.resolve(commonDir)], { cwd: path.resolve(cacheDir), windowsHide: true, timeout: 600000, maxBuffer: 32 * 1024 * 1024 })
        } catch(error){
            console.error('Forge installer failed:', error)
            throw new Error('Forge 설치에 실패했습니다. 네트워크 연결과 Java 설정을 확인하고 다시 시도해 주세요.')
        }
        for(const file of pack.generated){
            if(!await matches(path.join(commonDir, 'libraries', file.path), file.sha1, 'sha1')){
                throw new Error('Forge 설치 파일의 무결성 검증에 실패했습니다.')
            }
        }
    }
    const versionId = `${pack.minecraftVersion}-forge-${pack.forgeVersion}`
    await fs.copy(path.join(__dirname, '..', 'modpack', 'forge-version.json'), path.join(commonDir, 'versions', versionId, `${versionId}.json`))
}

module.exports = { prepareModpack, extractOverrides, ensureDownload, matches, getManagedMods }
