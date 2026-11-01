const { execFileSync } = require('child_process')
const path = require('path')

if(process.platform === 'win32'){
    require('./build-windows').main().catch(error => { console.error(error); process.exitCode = 1 })
} else {
    execFileSync(process.execPath, [path.resolve('node_modules/electron-builder/cli.js'), 'build', '--publish', 'never', ...process.argv.slice(2)], { stdio: 'inherit' })
}
