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

// signal이 중단되면 다음 단계로 넘어가지 않고 Forge 설치 프로세스도 끝낸다.
async function prepareModpack({ commonDir, instanceDir, cacheDir, javaExecutable, onProgress, signal }){
    const readyFile = path.join(instanceDir, '.mlkc-pack-version')
    if(!await fs.pathExists(readyFile) || await fs.readFile(readyFile, 'utf8') !== pack.version){
        onProgress('서버 접속에 필요한 설정 파일을 준비하고 있습니다…')
        const archive = path.join(cacheDir, `society-${pack.version}.zip`)
        await ensureDownload(pack.archive, archive)
        signal?.throwIfAborted()
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
        signal?.throwIfAborted()
        const profiles = path.join(commonDir, 'launcher_profiles.json')
        if(!await fs.pathExists(profiles)){
            await fs.outputJson(profiles, {})
        }
        try {
            await promisify(execFile)(javaExecutable, ['-jar', path.resolve(installer), '--installClient', path.resolve(commonDir)], { cwd: path.resolve(cacheDir), windowsHide: true, timeout: 600000, maxBuffer: 32 * 1024 * 1024, signal })
        } catch(error){
            signal?.throwIfAborted()
            console.error('Forge installer failed:', error)
            throw new Error('Forge 설치에 실패했습니다. 네트워크 연결과 Java 설정을 확인하고 다시 시도해 주세요.')
        }
        for(const file of pack.generated){
            if(!await matches(path.join(commonDir, 'libraries', file.path), file.sha1, 'sha1')){
                throw new Error('Forge 설치 파일의 무결성 검증에 실패했습니다.')
            }
        }
    }
    signal?.throwIfAborted()
    const versionId = `${pack.minecraftVersion}-forge-${pack.forgeVersion}`
    await fs.copy(path.join(__dirname, '..', 'modpack', 'forge-version.json'), path.join(commonDir, 'versions', versionId, `${versionId}.json`))
}

/* 게임 서버 목록(servers.dat, 압축하지 않은 NBT) */

// NBT 값 하나의 끝 위치를 구한다. 기존 항목은 해석하지 않고 바이트 그대로 보존한다.
function skipNbt(buf, pos, type){
    switch(type){
        case 1: return pos + 1
        case 2: return pos + 2
        case 3: case 5: return pos + 4
        case 4: case 6: return pos + 8
        case 7: return pos + 4 + buf.readInt32BE(pos)
        case 8: return pos + 2 + buf.readUInt16BE(pos)
        case 9: {
            const itemType = buf[pos], count = buf.readInt32BE(pos + 1)
            pos += 5
            for(let i = 0; i < count; i++) pos = skipNbt(buf, pos, itemType)
            return pos
        }
        case 10: {
            for(const entry of nbtEntries(buf, pos)) pos = entry.end
            return pos + 1
        }
        case 11: return pos + 4 + 4 * buf.readInt32BE(pos)
        case 12: return pos + 4 + 8 * buf.readInt32BE(pos)
        default: throw new Error(`알 수 없는 NBT 태그 ${type}`)
    }
}

// 컴파운드 안의 항목을 { type, name, start(태그 시작), value(값 시작), end }로 나열한다.
function* nbtEntries(buf, pos){
    while(buf[pos] !== 0){
        if(pos >= buf.length) throw new RangeError('NBT가 중간에 끝났습니다.')
        const type = buf[pos], nameLength = buf.readUInt16BE(pos + 1)
        const value = pos + 3 + nameLength
        const end = skipNbt(buf, value, type)
        yield { type, name: buf.toString('utf8', pos + 3, value), start: pos, value, end }
        pos = end
    }
}

const nbtString = text => {
    const bytes = Buffer.from(text, 'utf8')
    const length = Buffer.alloc(2)
    length.writeUInt16BE(bytes.length)
    return Buffer.concat([length, bytes])
}
const nbtNamed = (type, name, payload) => Buffer.concat([Buffer.from([type]), nbtString(name), payload])

/**
 * 게임의 멀티플레이 서버 목록 맨 위에 서버를 추가한다. 같은 주소가 이미 있으면 그대로 둔다.
 * 다른 서버 항목은 바이트 그대로 보존하고, 파일을 읽을 수 없으면 오류를 던져 건드리지 않는다.
 *
 * @returns {Promise<boolean>} 파일을 바꿨으면 true.
 */
async function ensureServerListed(instanceDir, name, address){
    const file = path.join(instanceDir, 'servers.dat')
    const entry = Buffer.concat([nbtNamed(8, 'name', nbtString(name)), nbtNamed(8, 'ip', nbtString(address)), Buffer.from([0])])
    const same = ip => ip.trim().toLowerCase().replace(/:25565$/, '') === address.toLowerCase().replace(/:25565$/, '')
    let output
    if(!await fs.pathExists(file)){
        output = Buffer.concat([Buffer.from([10]), nbtString(''), serverList([entry]), Buffer.from([0])])
    } else {
        const buf = await fs.readFile(file)
        if(buf[0] !== 10) throw new Error('servers.dat 형식이 올바르지 않습니다.')
        const rootStart = 3 + buf.readUInt16BE(1)
        const rootEntries = [...nbtEntries(buf, rootStart)]
        const rootEnd = (rootEntries.at(-1)?.end ?? rootStart)
        const list = rootEntries.find(e => e.name === 'servers')
        if(list == null){
            output = Buffer.concat([buf.subarray(0, rootEnd), serverList([entry]), buf.subarray(rootEnd)])
        } else {
            const itemType = buf[list.value], count = buf.readInt32BE(list.value + 1)
            if(list.type !== 9 || (count > 0 && itemType !== 10)) throw new Error('servers.dat 형식이 올바르지 않습니다.')
            let pos = list.value + 5
            for(let i = 0; i < count; i++){
                const ip = [...nbtEntries(buf, pos)].find(e => e.name === 'ip' && e.type === 8)
                if(ip != null && same(buf.toString('utf8', ip.value + 2, ip.end))){
                    return false
                }
                pos = skipNbt(buf, pos, 10)
            }
            output = Buffer.concat([buf.subarray(0, list.start), serverList([entry, buf.subarray(list.value + 5, list.end)], count + 1), buf.subarray(list.end)])
        }
    }
    const temporary = `${file}.${crypto.randomBytes(8).toString('hex')}.part`
    await fs.outputFile(temporary, output)
    await fs.move(temporary, file, { overwrite: true })
    return true
}

function serverList(parts, count = parts.length){
    const header = Buffer.alloc(5)
    header[0] = 10
    header.writeInt32BE(count, 1)
    return nbtNamed(9, 'servers', Buffer.concat([header, ...parts]))
}

module.exports = { prepareModpack, extractOverrides, ensureDownload, matches, getManagedMods, ensureServerListed }
