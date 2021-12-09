const { app, BrowserWindow } = require("electron");
const path = require("path");
const { endianness } = require("os");
const { spawn } = require("child_process");
const ref  = require('ref-napi');
const ffi = require('ffi-napi');

// Try with Napi 
// const voidPtr = ref.refType(ref.types.void)
// const stringPtr = ref.refType(ref.types.CString)

// const user32 = new ffi.Library('user32', {
//   'EnumChildWindows': ['bool', ['int32', voidPtr, 'int32']],
//   'SendMessageA': ['int', ['int32', 'int32', 'int32', 'int32']],
//   'SetForegroundWindow': ['bool', ['int32']],
//   'BringWindowToTop': ['bool', ['int32']],
//   'SetActiveWindow': ['bool', ['int32']],
//   'ShowWindow': ['bool', ['int32', 'int']],
//   'GetWindowTextA': ['long', ['long', stringPtr, 'long']],
// })

// const callback = ffi.Callback('bool', ['int32', 'int32'],
//     (hwnd, param) => {
//     // eslint-disable-next-line node/no-deprecated-api
//       const buf = new Buffer(255)
//       const ret = user32.GetWindowTextA(hwnd, buf, 255)
//       const name = ref.readCString(buf, 0)
//       console.log('hwnd', hwnd)
//       console.log('name', name)

//       if (name === '') {
//         hwndRenderer = hwnd
//       }

//       if (name === 'EmbeddedWindow') {
//         // user32.ShowWindow(hwndRenderer, 6) // Hide renderer
//         user32.ShowWindow(hwnd, 9)
//         user32.SetForegroundWindow(hwnd)
//         user32.BringWindowToTop(hwnd)
//         user32.SetActiveWindow(hwnd)
//         user32.SendMessageA(hwnd, 0x0006, 1, 0) // Activate unity
//       }

//       return 0
//     }
// )

const startNewProcess = (hwnd) => {
  const handler = endianness() == "LE" ? hwnd.readInt32LE() : hwnd.readInt32BE();
  spawn('unity/Child.exe', [
      `-parentHWND ${handler}`
  ], {
    windowsVerbatimArguments: true
  });

//   setTimeout(() => {
//     user32.EnumChildWindows(handler, callback, null);
//   }, 1000)
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600
  });

  win.loadFile(path.join(__dirname, "index.html"));
  win.webContents.setFrameRate(60);
  win.on("ready-to-show", () => {
    const hwnd = win.getNativeWindowHandle();
    startNewProcess(hwnd);
  });
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});