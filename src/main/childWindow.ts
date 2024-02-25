import { BrowserWindow } from "electron";
import { endianness } from "os";
import { spawn } from "child_process";
import ref from "ref-napi";
import ffi from "ffi-napi";

const OFFSET_Y = 100;

const GW_STYLE = {
  WS_CLIPSIBLINGS: 0x004000000,
  WS_CLIPCHILDREN: 0x002000000,
};

const voidPtr = ref.refType(ref.types.void);
const stringPtr = ref.refType(ref.types.CString);

const user32 = new ffi.Library("user32", {
  MoveWindow: ["bool", ["int32", "int", "int", "int", "int", "bool"]],
  EnumChildWindows: ["bool", ["int32", voidPtr, "int32"]],
  GetWindowTextA: ["long", ["long", stringPtr, "long"]],
  SendMessageA: ["int", ["int32", "int32", "int32", "int32"]],
  SetParent: ["int32", ["int32", "int32"]],
  GetWindowLongPtrA: ["int32", ["int32", "int32"]],
  SetWindowLongPtrA: ["int", ["int", "int", "int"]],
});

export default class ChildUnityWindow {
  mainWindow: BrowserWindow;
  childElectronWindow: BrowserWindow;
  hwndClient: "";

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  startNewProcess(hwnd) {
    // Convert handler from Electron
    const handler =
      endianness() == "LE" ? hwnd.readInt32LE() : hwnd.readInt32BE();

    spawn("unity/Child.exe", [`-parentHWND ${handler} delayed`], {
      windowsVerbatimArguments: true,
    });

    const res = user32.GetWindowLongPtrA(handler, -16);
    // Fix flicker unity window when resize
    if (!(res & GW_STYLE.WS_CLIPCHILDREN)) {
      user32.SetWindowLongPtrA(
        handler,
        -16,
        res ^ GW_STYLE.WS_CLIPCHILDREN ^ GW_STYLE.WS_CLIPSIBLINGS
      );
    }

    const callback = ffi.Callback("bool", ["int32", "int32"], (hwnd) => {
      const buf = new Buffer(255);
      user32.GetWindowTextA(hwnd, buf, 255);
      const name = ref.readCString(buf, 0);

      if (name === "EmbeddedWindow") {
        this.hwndClient = hwnd;
        user32.SetParent(hwnd, handler);
        user32.SendMessageA(hwnd, 0x0006, 1, 0);
      }

      return 0;
    });

    setTimeout(() => {
      user32.EnumChildWindows(handler, callback, null); // Find hwnd to spawn application
    }, 1000);
  }

  createWindow() {
    // Spawn new electron window for unity application
    this.childElectronWindow = new BrowserWindow({
      parent: this.mainWindow,
      transparent: true,
      frame: false,
      resizable: false,
    });

    this.mainWindow.on("ready-to-show", () => {
      const hwnd = this.childElectronWindow.getNativeWindowHandle();
      this.startNewProcess(hwnd);
      this.subscribe();
      this.resizeChildWindow();
    });
  }

  resizeChildWindow() {
    const paranetBounds = this.mainWindow.getContentBounds();

    this.childElectronWindow.setBounds({
      x: paranetBounds.x,
      y: paranetBounds.y + OFFSET_Y,
      width: paranetBounds.width,
      height: paranetBounds.height - OFFSET_Y,
    });

    const childBounds = this.childElectronWindow.getContentBounds();
    user32.MoveWindow(
      this.hwndClient,
      0,
      0,
      childBounds.width,
      childBounds.height,
      false
    );
  }

  restoreChildWindow() {
    this.childElectronWindow.restore();
    this.resizeChildWindow();
  }

  subscribe() {
    this.mainWindow.on("move", this.resizeChildWindow);
    this.mainWindow.on("resize", this.resizeChildWindow);
    this.mainWindow.on("minimize", this.childElectronWindow.minimize);
    this.mainWindow.on("restore", this.restoreChildWindow);
  }

  unsubscribe() {
    this.mainWindow.removeListener("move", this.resizeChildWindow);
    this.mainWindow.removeListener("resize", this.resizeChildWindow);
    this.mainWindow.removeListener(
      "minimize",
      this.childElectronWindow.minimize
    );
    this.mainWindow.removeListener("restore", this.restoreChildWindow);
  }
}
