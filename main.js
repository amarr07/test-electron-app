/**
 * Electron main process entry point.
 * Manages application lifecycle, window creation, IPC handlers, and system integration.
 */
const {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  desktopCapturer,
  session,
} = require("electron");
const path = require("path");
const ElectronStore = require("electron-store");
const Store = ElectronStore.default || ElectronStore;

/**
 * Enable hot reload in development mode.
 */
if (process.env.NODE_ENV === "development" || !app.isPackaged) {
  try {
    require("electron-reload")(__dirname, {
      electron: path.join(__dirname, "node_modules", ".bin", "electron"),
      hardResetMethod: "exit",
    });
  } catch (e) {}
}

/**
 * Persistent storage for app settings (theme, auto-launch, etc).
 */
const store = new Store();

/**
 * Disable hardware acceleration and GPU features for compatibility.
 */
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");
app.commandLine.appendSwitch("log-level", "3");

let mainWindow = null;
let oauthWindow = null;

/**
 * Gets stored theme preference from persistent storage.
 */
const getStoredTheme = () => {
  const stored = store.get("theme", "light");
  return stored === "dark" ? "dark" : "light";
};

/**
 * Configures auto-launch on system startup and persists setting.
 */
const syncAutoLaunch = (enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: !!enabled,
    });
    store.set("autoLaunch", !!enabled);
  } catch (error) {}
};

/**
 * Creates and configures the main application window.
 */
function createWindow() {
  const savedTheme = getStoredTheme();
  nativeTheme.themeSource = savedTheme;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    icon: path.join(__dirname, "assets", "logo.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false,
    },
    crossOriginOpenerPolicy: { value: "unsafe-none" },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: savedTheme === "dark" ? "#0a0a0a" : "#ffffff",
    show: false,
  });

  /**
   * Modifies response headers to set permissive CSP for development.
   */
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data:; style-src * 'unsafe-inline'; font-src * data:; frame-src *;",
          ],
        },
      });
    },
  );

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    (details, callback) => {
      callback({ requestHeaders: { ...details.requestHeaders } });
    },
  );

  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Creates OAuth authentication window for Google/Apple sign-in.
 */
function createOAuthWindow(url, callbackUrl) {
  if (oauthWindow) {
    oauthWindow.focus();
    return oauthWindow;
  }

  oauthWindow = new BrowserWindow({
    width: 500,
    height: 700,
    modal: true,
    parent: mainWindow,
    icon: path.join(__dirname, "assets", "logo.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // Keep security enabled, handle CSP below
      sandbox: true, // Enable sandbox for OAuth window too
    },
  });

  oauthWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: ["https://appleid.apple.com/*"] },
    (details, callback) => {
      const headers = details.responseHeaders;

      // Remove or modify CSP headers that block blob workers.
      if (headers["content-security-policy"]) {
        delete headers["content-security-policy"];
      }
      if (headers["Content-Security-Policy"]) {
        delete headers["Content-Security-Policy"];
      }

      callback({ responseHeaders: headers });
    },
  );

  // Intercept web requests to capture POST data from Apple.
  oauthWindow.webContents.session.webRequest.onBeforeRequest(
    { urls: [callbackUrl + "*"] },
    (details, callback) => {
      if (details.method === "POST" && details.uploadData) {
        try {
          // Parse form POST data.
          const postData = details.uploadData
            .map((data) => {
              const text = data.bytes ? data.bytes.toString("utf8") : "";
              return text;
            })
            .join("");

          const params = new URLSearchParams(postData);
          const idToken = params.get("id_token");
          const code = params.get("code");

          if (idToken || code) {
            authCallbackHandled = true;
            const dataUrl = callbackUrl + "?" + postData;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("auth-callback", { url: dataUrl });
            }
            callback({});
            setTimeout(() => {
              if (oauthWindow && !oauthWindow.isDestroyed()) {
                oauthWindow.close();
              }
            }, 100);
            return;
          }
        } catch (error) {
          console.error("Error parsing POST data:", error);
        }
      }
      callback({});
    },
  );

  let authCallbackHandled = false;

  const checkForTokens = async () => {
    if (authCallbackHandled || !oauthWindow || oauthWindow.isDestroyed()) {
      return;
    }

    try {
      const url = await oauthWindow.webContents.executeJavaScript(
        "window.location.href",
        true,
      );

      if (url.startsWith(callbackUrl)) {
        if (
          url.includes("id_token") ||
          url.includes("idToken") ||
          url.includes("access_token") ||
          url.includes("accessToken") ||
          url.includes("code=")
        ) {
          authCallbackHandled = true;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("auth-callback", { url });
          }
          oauthWindow.close();
          return;
        }

        try {
          const bodyText = await oauthWindow.webContents.executeJavaScript(
            "document.body ? document.body.innerText : ''",
            true,
          );

          if (
            bodyText &&
            (bodyText.includes("idToken") || bodyText.includes("accessToken"))
          ) {
            authCallbackHandled = true;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("auth-callback", { url, bodyText });
            }
            oauthWindow.close();
            return;
          }
        } catch (e) {}
      }
    } catch (error) {}
  };

  oauthWindow.loadURL(url);

  oauthWindow.webContents.on("did-finish-load", async () => {
    if (authCallbackHandled || !oauthWindow || oauthWindow.isDestroyed())
      return;

    try {
      const currentUrl = await oauthWindow.webContents.executeJavaScript(
        "window.location.href",
        true,
      );

      if (currentUrl.includes(callbackUrl)) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!oauthWindow || oauthWindow.isDestroyed()) return;
        const authData = await oauthWindow.webContents.executeJavaScript(
          `
              (function() {
                try {
                  const hash = window.location.hash.substring(1);
                  const search = window.location.search.substring(1);
                  
                  if (hash && (hash.includes('id_token') || hash.includes('code'))) {
                    return window.location.href;
                  }
                  
                  if (search && (search.includes('id_token') || search.includes('code'))) {
                    return window.location.href;
                  }
                  
                  // Check document title for success indicators.
                  if (document.title && (document.title.includes('Success') || document.title.includes('Close'))) {
                    try {
                      const keys = Object.keys(localStorage);
                      for (let key of keys) {
                        const value = localStorage.getItem(key);
                        if (value && (value.includes('idToken') || value.includes('id_token'))) {
                          return value;
                        }
                      }
                    } catch (e) {}
                  }
                  
                  const bodyText = document.body ? document.body.innerText : '';
                  
                  if (bodyText.includes('Success') || bodyText.includes('You can now close')) {
                    return '__AUTH_SUCCESS__'
                  }
                  
                  return null;
                } catch (e) {
                  return null;
                }
              })()
            `,
          true,
        );

        if (authData) {
          authCallbackHandled = true;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("auth-callback", {
              url: authData === "__AUTH_SUCCESS__" ? currentUrl : authData,
            });
          }
          if (oauthWindow && !oauthWindow.isDestroyed()) {
            oauthWindow.close();
          }
          return;
        }
      }
    } catch (e) {
      console.error("Injection error:", e);
    }

    if (!oauthWindow || oauthWindow.isDestroyed()) return;
    await checkForTokens();

    const interval = setInterval(async () => {
      if (authCallbackHandled || !oauthWindow || oauthWindow.isDestroyed()) {
        clearInterval(interval);
        return;
      }
      await checkForTokens();
    }, 500);

    setTimeout(() => clearInterval(interval), 120000);
  });

  oauthWindow.webContents.on("did-navigate-in-page", checkForTokens);
  oauthWindow.webContents.on("did-navigate", checkForTokens);

  oauthWindow.on("closed", () => {
    oauthWindow = null;
  });

  return oauthWindow;
}

/**
 * Initializes app when Electron is ready.
 */
app.whenReady().then(async () => {
  const savedAutoLaunch = store.get("autoLaunch", false);
  syncAutoLaunch(savedAutoLaunch);

  // System audio capture handler - captures all system audio including:
  // - Meet/Zoom calls (both parties), Bluetooth/wired devices, all apps.
  // Windows: automatic loopback | macOS: requires Screen Recording permission.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => {
        if (sources.length === 0) {
          // Fallback: if no sources, still allow audio-only capture.
          callback({
            video: null,
            audio: process.platform === "win32" ? "loopback" : true,
          });
          return;
        }

        callback({
          video: sources[0],
          audio: process.platform === "win32" ? "loopback" : true,
        });
      })
      .catch((error) => {
        console.error("Desktop capturer failed:", error?.message || error);
        // Allow audio-only capture even if video enumeration fails.
        callback({
          video: null,
          audio: process.platform === "win32" ? "loopback" : true,
        });
      });
  });

  createWindow();

  /**
   * Recreates window on macOS when dock icon is clicked.
   */
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Quits app when all windows are closed (except on macOS).
 */
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/**
 * IPC handler: Opens OAuth window for authentication.
 */
ipcMain.handle("open-oauth-window", async (event, { url, callbackUrl }) => {
  return new Promise((resolve) => {
    const oauthWin = createOAuthWindow(url, callbackUrl);
    oauthWin.once("closed", () => {
      resolve({ closed: true });
    });
  });
});

/**
 * IPC handler: Gets value from persistent storage.
 */
ipcMain.handle("get-storage", async (event, key) => {
  return store.get(key, null);
});

/**
 * IPC handler: Sets value in persistent storage.
 */
ipcMain.handle("set-storage", async (event, key, value) => {
  store.set(key, value);
  return true;
});

/**
 * IPC handler: Removes key from persistent storage.
 */
ipcMain.handle("remove-storage", async (event, key) => {
  store.delete(key);
  return true;
});

/**
 * IPC handler: Sets theme preference and updates native theme.
 */
ipcMain.handle("set-theme", (event, theme) => {
  const normalized = theme === "dark" ? "dark" : "light";
  store.set("theme", normalized);
  nativeTheme.themeSource = normalized;
  if (mainWindow) {
    mainWindow.setBackgroundColor(
      normalized === "dark" ? "#0a0a0a" : "#ffffff",
    );
  }
  return true;
});

/**
 * IPC handler: Gets available audio sources for system audio capture.
 */
ipcMain.handle("get-audio-sources", async () => {
  const sources = await mainWindow.webContents.getMediaSourceId({
    audio: true,
    video: false,
  });
  return sources;
});

/**
 * IPC handler: Returns application version.
 */
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

/**
 * IPC handler: Gets current auto-launch setting from system or storage.
 */
ipcMain.handle("get-auto-launch", () => {
  try {
    const settings = app.getLoginItemSettings();
    if (typeof settings?.openAtLogin === "boolean") {
      return settings.openAtLogin || settings.openAsHidden || false;
    }
  } catch (error) {}
  return store.get("autoLaunch", false);
});

/**
 * IPC handler: Sets auto-launch on system startup.
 */
ipcMain.handle("set-auto-launch", (event, enabled) => {
  syncAutoLaunch(!!enabled);
  return !!enabled;
});
