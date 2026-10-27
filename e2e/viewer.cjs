// 檢視本機 HTML 用的極簡 Electron 視窗（測試與截圖用）
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => { const w = new BrowserWindow({ width: 1340, height: 1300, show: true }); w.loadFile(process.argv[process.argv.length - 1]); });
