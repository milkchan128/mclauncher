const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider')
const { PrivateGitHubProvider } = require('electron-updater/out/providers/PrivateGitHubProvider')

// 공개 릴리스도 API로 받을 수 있으므로 인증 토큰을 보내지 않는다.
class PublicGitHubApiProvider extends PrivateGitHubProvider {
    configureHeaders(accept){
        return { accept }
    }
}

class GitHubUpdateProvider extends GitHubProvider {
    constructor(options, updater, runtimeOptions){
        super(options, updater, runtimeOptions)
        this.api = new PublicGitHubApiProvider(options, updater, null, runtimeOptions)
        this.usingApi = false
    }

    async getLatestVersion(){
        this.usingApi = false
        try {
            return await super.getLatestVersion()
        } catch {
            const info = await this.api.getLatestVersion()
            this.usingApi = true
            return info
        }
    }

    get fileExtraDownloadHeaders(){
        return this.usingApi ? this.api.fileExtraDownloadHeaders : null
    }

    resolveFiles(info){
        return this.usingApi ? this.api.resolveFiles(info) : super.resolveFiles(info)
    }
}

module.exports = { GitHubUpdateProvider }
