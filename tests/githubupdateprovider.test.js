const { test } = require('node:test')
const assert = require('node:assert/strict')
const { GitHubUpdateProvider } = require('../app/assets/js/githubupdateprovider')

function fixture(apiFails = false){
    const calls = []
    const executor = { async request(options){
        calls.push(options)
        if(options.hostname === 'github.com' || apiFails) throw new Error('504 Gateway Time-out')
        assert.equal(options.headers.authorization, undefined)
        if(options.path.endsWith('/releases/latest')){
            return JSON.stringify({ assets: [
                { name: 'latest.yml', url: 'https://api.github.com/metadata' },
                { name: 'client.exe', url: 'https://api.github.com/installer' }
            ] })
        }
        assert.equal(options.path, '/metadata')
        assert.equal(options.headers.accept, 'application/octet-stream')
        return 'version: 1.0.19\nfiles:\n  - url: client.exe\n    sha512: original-checksum\n'
    } }
    return { calls, provider: new GitHubUpdateProvider(
        { owner: 'milkchan128', repo: 'mclauncher' },
        { allowPrerelease: false },
        { executor, platform: 'win32' }
    ) }
}

test('GitHub 웹 장애 시 인증 없이 API로 메타데이터·설치 파일을 조회하고 해시를 보존한다', async () => {
    const { provider, calls } = fixture()
    const info = await provider.getLatestVersion()
    assert.equal(info.version, '1.0.19')
    const [file] = provider.resolveFiles(info)
    assert.equal(file.url.href, 'https://api.github.com/installer')
    assert.equal(file.info.sha512, 'original-checksum')
    assert.deepEqual(provider.fileExtraDownloadHeaders, { accept: 'application/octet-stream' })
    assert.equal(calls.length, 3)
    assert.equal(calls[0].hostname, 'github.com')
    assert.equal(calls[1].path, '/repos/milkchan128/mclauncher/releases/latest')
})

test('API도 실패하면 업데이트 확인을 성공으로 처리하지 않고 다음 시도에서 복구한다', async () => {
    const { provider } = fixture(true)
    await assert.rejects(provider.getLatestVersion(), /504/)
    assert.equal(provider.usingApi, false)
    assert.equal(provider.fileExtraDownloadHeaders, null)
    provider.api = fixture().provider.api
    assert.equal((await provider.getLatestVersion()).version, '1.0.19')
})

test('웹 경로가 정상이면 기존 GitHub 다운로드 주소를 사용한다', async () => {
    const { provider } = fixture()
    provider.httpRequest = async url => url.pathname.endsWith('.atom')
        ? '<feed><entry><link href="https://github.com/milkchan128/mclauncher/releases/tag/v1.0.19"/><title>Release</title></entry></feed>'
        : JSON.stringify({ tag_name: 'v1.0.19' })
    provider.executor = { request: async () => 'version: 1.0.19\nfiles:\n  - url: client.exe\n    sha512: original-checksum\n' }
    provider.api.getLatestVersion = () => assert.fail('정상 경로에서는 API를 사용하지 않는다')
    const info = await provider.getLatestVersion()
    assert.equal(provider.resolveFiles(info)[0].url.href, 'https://github.com/milkchan128/mclauncher/releases/download/v1.0.19/client.exe')
    assert.equal(provider.fileExtraDownloadHeaders, null)
})
