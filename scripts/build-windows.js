const fs = require('fs-extra')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const yaml = require('js-yaml')
const { appBuilderPath } = require('app-builder-bin')
const pkg = require('../package.json')

const root = path.join(__dirname, '..')
const framework = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319')
const compiler = path.join(framework, 'csc.exe')

function compileSetup(payload, output){
    const work = path.join(root, 'dist', 'setup-build')
    fs.ensureDirSync(work)
    fs.ensureDirSync(path.dirname(output))
    const digest = crypto.createHash('sha256').update(fs.readFileSync(payload)).digest('hex')
    const numericVersion = pkg.version.split('-')[0] + '.0'
    const metadata = path.join(work, 'AssemblyInfo.cs')
    fs.writeFileSync(metadata, `using System.Reflection;\n[assembly: AssemblyTitle("mlkc Client Setup")]\n[assembly: AssemblyProduct("mlkc Client")]\n[assembly: AssemblyVersion("${numericVersion}")]\n[assembly: AssemblyFileVersion("${numericVersion}")]\ninternal static class SetupBuild { internal const string Version = "${pkg.version}"; internal const string PayloadSha256 = "${digest}"; }\n`, 'utf8')
    const references = ['PresentationFramework.dll', 'PresentationCore.dll', 'WindowsBase.dll'].map(file => '/reference:' + path.join(framework, 'WPF', file))
    execFileSync(compiler, [
        '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
        '/out:' + output,
        '/win32icon:' + path.join(root, 'build', 'icon.ico'),
        '/win32manifest:' + path.join(root, 'installer', 'setup.manifest'),
        ...references, '/reference:' + path.join(framework, 'System.Xaml.dll'),
        '/resource:' + payload + ',backend.exe',
        '/resource:' + path.join(root, 'installer', 'Window.xaml') + ',Window.xaml',
        '/resource:' + path.join(root, 'LICENSE.txt') + ',LICENSE.txt',
        '/resource:' + path.join(root, 'app/assets/images/Icon.png') + ',logo.png',
        '/resource:' + path.join(root, 'app/assets/images/backgrounds/mlkc-dusk.jpg') + ',scene.jpg',
        path.join(root, 'installer', 'Setup.cs'), metadata
    ], { cwd: root, stdio: 'inherit', windowsHide: true })
    execFileSync(output, ['--self-test'], { windowsHide: true, timeout: 30000 })
}

async function main(){
    if(process.platform !== 'win32'){
        throw new Error('Windows 전용 설치 파일은 Windows에서 빌드해 주세요.')
    }
    const engineDir = path.join(root, 'dist', 'setup-engine')
    execFileSync(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'), 'build', '--win', '--publish', 'never', '--config.directories.output=' + engineDir], { cwd: root, stdio: 'inherit', windowsHide: true })
    const fileName = `mlkc-Client-setup-${pkg.version}.exe`
    const output = path.join(root, 'dist', fileName)
    compileSetup(path.join(engineDir, fileName), output)
    execFileSync(appBuilderPath, ['blockmap', '--input', output, '--output', output + '.blockmap'], { stdio: 'inherit', windowsHide: true })
    const bytes = await fs.readFile(output)
    const sha512 = crypto.createHash('sha512').update(bytes).digest('base64')
    const metadata = {
        version: pkg.version,
        files: [{ url: fileName, sha512, size: bytes.length }],
        path: fileName,
        sha512,
        releaseDate: new Date().toISOString()
    }
    await fs.writeFile(path.join(root, 'dist', 'latest.yml'), yaml.dump(metadata), 'utf8')
    await fs.writeFile(output + '.sha256', crypto.createHash('sha256').update(bytes).digest('hex') + '  ' + fileName + '\n', 'utf8')
    console.log('Custom installer and update metadata verified:', output)
}

module.exports = { compileSetup, compiler, main }
if(require.main === module){
    main().catch(error => { console.error(error); process.exitCode = 1 })
}
