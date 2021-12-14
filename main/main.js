const { app, BrowserWindow } = require('electron')
const path = require('path')
const { endianness } = require('os')
const { spawn } = require('child_process')

let electronWindow = null
let childElectronWindow = null

const OFFSET_Y = 100

const startNewProcess = (hwnd) => {
  // Convert handler from Electron 
  const handler = endianness() == 'LE' ? hwnd.readInt32LE() : hwnd.readInt32BE()

  spawn('unity/Child.exe', [
      `-parentHWND ${handler} delayed`
  ], {
    windowsVerbatimArguments: true
  });
}

/**
 * Spawn Unity application, in a separate electron window. 
 */

const createWindow = () => {
  electronWindow = new BrowserWindow({
    backgroundColor: '#3f3f3f',
    width: 800,
    height: 600,
  })

  childElectronWindow = new BrowserWindow({ 
    parent: electronWindow,
    transparent: true,
    frame: false,
  })

  electronWindow.show()
  electronWindow.loadFile(path.join(__dirname, 'index.html'))
  electronWindow.webContents.setFrameRate(60)

  electronWindow.on('ready-to-show', () => {
    const hwnd = childElectronWindow.getNativeWindowHandle()
    startNewProcess(hwnd)
    subscribe()
    resizeChildWindow()
  })
}

function resizeChildWindow() {
  const paranetBounds = electronWindow.getContentBounds()
  childElectronWindow.setBounds({
    x: paranetBounds.x,
    y: (paranetBounds.y + OFFSET_Y),
    width: 300,
    height: 300
  })
}

function restoreChildWindow() {
  childElectronWindow.restore()
  resizeChildWindow()
}

function subscribe() {
  electronWindow.on('move', resizeChildWindow)
  electronWindow.on('resize', resizeChildWindow)
  electronWindow.on('minimize', childElectronWindow.minimize)
  electronWindow.on('restore', restoreChildWindow)
}

function unsubscribe() {
  electronWindow.removeListener('move', resizeChildWindow)
  electronWindow.removeListener('resize', resizeChildWindow)
  electronWindow.removeListener('minimize', childElectronWindow.minimize)
  electronWindow.removeListener('restore', restoreChildWindow)
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    unsubscribe() // For example
    app.quit()
  }
})