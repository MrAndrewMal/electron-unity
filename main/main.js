const { app, BrowserWindow } = require('electron')
const path = require('path')
const { endianness } = require('os')
const { spawn } = require('child_process')
const ref = require('ref-napi')
const ffi = require('ffi-napi')

let electronWindow = null
let childElectronWindow = null
let hwndClient = null

const OFFSET_Y = 100

const GW_STYLE = {
  WS_CLIPSIBLINGS: 0x004000000,
  WS_CLIPCHILDREN: 0x002000000
}

const voidPtr = ref.refType(ref.types.void)
const stringPtr = ref.refType(ref.types.CString)

const user32 = new ffi.Library('user32', {
  'MoveWindow': ['bool', ['int32', 'int', 'int', 'int', 'int', 'bool']],
  'EnumChildWindows': ['bool', ['int32', voidPtr, 'int32']],
  'GetWindowTextA': ['long', ['long', stringPtr, 'long']],
  'SendMessageA': ['int', ['int32', 'int32', 'int32', 'int32']],
  'SetParent': ['int32', ['int32', 'int32']],
  'GetWindowLongPtrA': ['int32', ['int32', 'int32']],
  'SetWindowLongPtrA': ['int', ['int', 'int', 'int']]
})

const startNewProcess = (hwnd) => {
  // Convert handler from Electron 
  const handler = endianness() == 'LE' ? hwnd.readInt32LE() : hwnd.readInt32BE()

  spawn('unity/Child.exe', [
      `-parentHWND ${handler} delayed`
  ], {
    windowsVerbatimArguments: true
  });

  const res = user32.GetWindowLongPtrA(handler, -16)
  // Fix flicker unity window when resize
  if (!(res & GW_STYLE.WS_CLIPCHILDREN)) {
    user32.SetWindowLongPtrA(handler, -16, res ^ GW_STYLE.WS_CLIPCHILDREN ^ GW_STYLE.WS_CLIPSIBLINGS)
  }

  const callback = ffi.Callback('bool', ['int32', 'int32'],
  (hwnd, param) => {
    const buf = new Buffer(255)
    user32.GetWindowTextA(hwnd, buf, 255)
    const name = ref.readCString(buf, 0)

    if (name === 'EmbeddedWindow') {
      hwndClient = hwnd
      user32.SetParent(hwnd, handler)
      user32.SendMessageA(hwnd, 0x0006, 1, 0)
    }

    return 0
  })

  setTimeout(() => {
    user32.EnumChildWindows(handler, callback, null) // Find hwnd to spawn application
  }, 1000)

}

/**
 * Spawn Unity application, in a separate electron window. 
 */

const createWindow = () => {
  electronWindow = new BrowserWindow({
    backgroundColor: '#ffffff',
    width: 800,
    height: 600,
  })

  // Spawn new electron window for unity application
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
    width: paranetBounds.width,
    height: (paranetBounds.height - OFFSET_Y)
  })

  const childBounds = childElectronWindow.getContentBounds()
  user32.MoveWindow(hwndClient, 0, 0, childBounds.width, childBounds.height, false)
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