const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const http = require('node:http')
const { once } = require('node:events')
const Zip = require('adm-zip')
const { HeliosDistribution } = require('helios-core/common')
const { DistributionIndexProcessor, downloadQueue } = require('helios-core/dl')
const { extractOverrides, ensureDownload, getManagedMods, ensureServerListed } = require('../app/assets/js/modpack')
const raw = require('../app/assets/modpack/distribution.json')

test('Society 4.1.5A의 367개 모드와 Forge 47.4.0이 society-sunlit.vultr.sjh.kr 전용으로 구성된다', () => {
    const distro = new HeliosDistribution(raw, 'common', 'instances')
    assert.equal(distro.servers.length, 1)
    const server = distro.getMainServer()
    assert.equal(server.rawServer.name, '대충모인팀 Society: Sunlit Valley')
    assert.equal(server.hostname, 'society-sunlit.vultr.sjh.kr')
    assert.equal(server.rawServer.version, '4.1.5A')
    assert.equal(server.rawServer.minecraftVersion, '1.20.1')
    assert.equal(server.effectiveJavaOptions.suggestedMajor, 17)
    assert.equal(server.rawServer.autoconnect, true)
    const mods = server.modules.filter(m => m.rawModule.type === 'File')
    assert.equal(mods.length, 367)
    assert.equal(new Set(mods.map(m => m.getPath().toLowerCase())).size, mods.length)
    for(const mod of mods){
        assert.ok(mod.rawModule.artifact.path.startsWith('mods/'))
        assert.match(mod.rawModule.artifact.MD5, /^[a-f0-9]{32}$/)
        assert.equal(new URL(mod.rawModule.artifact.url).protocol, 'https:')
    }
    assert.equal(server.modules[0].rawModule.id, 'net.minecraftforge:lowcodelanguage:1.20.1-47.4.0')
})

test('설치 전에도 필수 모드 367개를 표시하고 파일 유무·크기로 설치 상태를 구분한다', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-mod-list-'))
    t.after(() => fs.remove(root))
    const distribution = new HeliosDistribution(raw, path.join(root, 'common'), path.join(root, 'instances'))
    const modules = distribution.getMainServer().modules
    let mods = await getManagedMods(modules)
    assert.equal(mods.length, 367)
    assert.ok(mods.every(mod => !mod.installed))
    assert.ok(mods.every(mod => mod.name && /\.(jar|zip|litemod)$/i.test(mod.fileName)))
    const target = mods[0].path
    await fs.ensureDir(target)
    assert.equal((await getManagedMods(modules))[0].installed, false)
    await fs.remove(target)
    await fs.outputFile(target, 'partial file')
    assert.equal((await getManagedMods(modules))[0].installed, false)
    await fs.outputFile(target, Buffer.alloc(modules.find(module => module.rawModule.type === 'File').rawModule.artifact.size))
    mods = await getManagedMods(modules)
    assert.equal(mods[0].installed, true)
    assert.equal(mods.filter(mod => mod.installed).length, 1)
    await fs.remove(target)
    assert.equal((await getManagedMods(modules))[0].installed, false)
})

test('실제 모드 다운로드 엔진이 누락·손상 파일만 받아 설치하고 사용자 파일은 보존한다', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-auto-mods-'))
    t.after(() => fs.remove(root))
    const files = [Buffer.from('required mod one'), Buffer.from('required mod two')]
    let requests = 0
    const server = http.createServer((req, res) => {
        const content = files[Number(req.url.slice(1))]
        if(!content){ res.writeHead(404); res.end(); return }
        requests++
        res.writeHead(200, { 'Content-Length': content.length })
        res.end(content)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => new Promise(resolve => server.close(resolve)))
    const fixture = structuredClone(raw)
    fixture.servers[0].modules = files.map((content, i) => ({
        id: `fixture-${i}`, name: `fixture ${i}`, type: 'File',
        artifact: { path: `mods/fixture-${i}.jar`, size: content.length, MD5: crypto.createHash('md5').update(content).digest('hex'), url: `http://127.0.0.1:${server.address().port}/${i}` }
    }))
    const distribution = new HeliosDistribution(fixture, path.join(root, 'common'), path.join(root, 'instances'))
    const processor = new DistributionIndexProcessor(path.join(root, 'common'), distribution, fixture.servers[0].id)
    const modules = distribution.getMainServer().modules
    const ownMod = path.join(path.dirname(modules[0].getPath()), 'my-mod.jar')
    await fs.outputFile(ownMod, 'user file')
    let missing = (await processor.validate(async () => {})).distribution
    assert.equal(missing.length, 2)
    await downloadQueue(missing, () => {})
    assert.equal((await processor.validate(async () => {})).distribution.length, 0)
    assert.equal(requests, 2)
    await fs.writeFile(modules[0].getPath(), Buffer.alloc(files[0].length))
    missing = (await processor.validate(async () => {})).distribution
    assert.equal(missing.length, 1)
    await downloadQueue(missing, () => {})
    assert.equal(requests, 3)
    assert.deepEqual(await fs.readFile(modules[0].getPath()), files[0])
    assert.equal(await fs.readFile(ownMod, 'utf8'), 'user file')
})

test('모드팩 설정을 추출할 때 기존 사용자 설정과 외부 경로를 보존한다', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-pack-test-'))
    t.after(() => fs.remove(root))
    const instance = path.join(root, 'instance')
    await fs.outputFile(path.join(instance, 'config/user.toml'), 'user settings')
    const zip = new Zip()
    zip.addFile('overrides/', Buffer.alloc(0))
    zip.addFile('manifest.json', Buffer.from('{}'))
    zip.addFile('overrides/config/user.toml', Buffer.from('default settings'))
    zip.addFile('overrides/kubejs/test.js', Buffer.from('pack script'))
    await extractOverrides(zip.toBuffer(), instance)
    assert.equal(await fs.readFile(path.join(instance, 'config/user.toml'), 'utf8'), 'user settings')
    assert.equal(await fs.readFile(path.join(instance, 'kubejs/test.js'), 'utf8'), 'pack script')
    assert.equal(await fs.pathExists(path.join(instance, 'manifest.json')), false)
    const unsafe = new Zip()
    unsafe.addFile('overrides/config/bad:stream', Buffer.from('blocked'))
    await assert.rejects(extractOverrides(unsafe.toBuffer(), instance), /안전하지 않은 경로/)
    assert.equal(await fs.pathExists(path.join(instance, 'config/bad:stream')), false)
})

test('모드팩 설정이 기존 디렉터리 링크를 따라 인스턴스 밖에 쓰이지 않는다', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-link-test-'))
    t.after(() => fs.remove(root))
    const instance = path.join(root, 'instance')
    const outside = path.join(root, 'outside')
    await fs.ensureDir(instance)
    await fs.ensureDir(outside)
    await fs.symlink(outside, path.join(instance, 'config'), 'junction')
    await fs.symlink(path.join(root, 'missing-outside'), path.join(instance, 'kubejs'), 'junction')
    const zip = new Zip()
    zip.addFile('overrides/config/test.txt', Buffer.from('blocked'))
    zip.addFile('overrides/kubejs/test.txt', Buffer.from('blocked'))
    await extractOverrides(zip.toBuffer(), instance)
    assert.equal(await fs.pathExists(path.join(outside, 'test.txt')), false)
    assert.equal(await fs.pathExists(path.join(root, 'missing-outside')), false)
})

test('검증된 캐시는 재사용하고 다운로드 해시가 다르면 기존 파일을 보존한다', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-hash-test-'))
    t.after(() => fs.remove(root))
    const target = path.join(root, 'cached.zip')
    const content = Buffer.from('verified cache')
    await fs.writeFile(target, content)
    await ensureDownload({ url: 'https://example.invalid/pack.zip', sha256: crypto.createHash('sha256').update(content).digest('hex') }, target)
    const filename = path.resolve(__dirname, '../app/assets/js/modpack.js')
    const localRequire = createRequire(filename)
    const exported = { exports: {} }
    vm.runInNewContext(await fs.readFile(filename, 'utf8'), {
        module: exported, __dirname: path.dirname(filename), Buffer, URL,
        require: id => id === 'got' ? () => ({ buffer: async () => Buffer.from('corrupted') }) : localRequire(id)
    })
    await assert.rejects(exported.exports.ensureDownload({ url: 'https://example.invalid/pack.zip', sha256: '0'.repeat(64) }, target), /무결성 검증/)
    assert.deepEqual(await fs.readFile(target), content)
})

test('게임 서버 목록 맨 위에 서버를 추가하고 기존 서버는 그대로 둔다', async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlkc-servers-'))
    t.after(() => fs.remove(dir))
    const file = path.join(dir, 'servers.dat')
    // 마인크래프트가 쓰는 형식: 루트 컴파운드 { servers: [ { name, ip, icon, acceptTextures } ] }
    const str = s => { const b = Buffer.from(s); const h = Buffer.alloc(2); h.writeUInt16BE(b.length); return Buffer.concat([h, b]) }
    const tag = (type, name, payload) => Buffer.concat([Buffer.from([type]), str(name), payload])
    const user = Buffer.concat([tag(8, 'name', str('친구 서버')), tag(8, 'ip', str('friend.example')), tag(8, 'icon', str('aWNvbg==')), tag(1, 'acceptTextures', Buffer.from([1])), Buffer.from([0])])
    const head = Buffer.from([10, 0, 0, 0, 1])
    const original = Buffer.concat([Buffer.from([10]), str(''), tag(9, 'servers', Buffer.concat([head, user])), Buffer.from([0])])
    await fs.writeFile(file, original)

    assert.equal(await ensureServerListed(dir, '대충모인팀 Society: Sunlit Valley', 'society-sunlit.vultr.sjh.kr'), true)
    const written = await fs.readFile(file)
    const ours = Buffer.concat([tag(8, 'name', str('대충모인팀 Society: Sunlit Valley')), tag(8, 'ip', str('society-sunlit.vultr.sjh.kr')), Buffer.from([0])])
    assert.deepEqual(written, Buffer.concat([Buffer.from([10]), str(''), tag(9, 'servers', Buffer.concat([Buffer.from([10, 0, 0, 0, 2]), ours, user])), Buffer.from([0])]))

    // 이미 있으면 다시 추가하지 않는다.
    assert.equal(await ensureServerListed(dir, '대충모인팀 Society: Sunlit Valley', 'Society-Sunlit.vultr.sjh.kr'), false)
    assert.deepEqual(await fs.readFile(file), written)

    // 파일이 없으면 새로 만든다.
    await fs.remove(file)
    assert.equal(await ensureServerListed(dir, 'A', 'a.example'), true)
    assert.equal(await ensureServerListed(dir, 'A', 'a.example:25565'), false)

    // 읽을 수 없는 파일은 건드리지 않는다.
    await fs.writeFile(file, original.subarray(0, 20))
    await assert.rejects(ensureServerListed(dir, 'A', 'a.example'))
    assert.deepEqual(await fs.readFile(file), original.subarray(0, 20))
})
