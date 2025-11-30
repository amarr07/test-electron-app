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
const http = require("http");
const url = require("url");
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
 * Uses a local HTTP server for reliable callback handling.
 */
function createOAuthWindow(authUrl, callbackUrl) {
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
      webSecurity: true,
      sandbox: true,
    },
  });

  // Remove CSP headers for Apple OAuth compatibility
  oauthWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: ["https://appleid.apple.com/*"] },
    (details, callback) => {
      const headers = details.responseHeaders || {};
      delete headers["content-security-policy"];
      delete headers["Content-Security-Policy"];
      callback({ responseHeaders: headers });
    },
  );

  // Intercept POST requests to capture Apple OAuth responses
  oauthWindow.webContents.session.webRequest.onBeforeRequest(
    { urls: [callbackUrl + "*"] },
    (details, callback) => {
      if (details.method === "POST" && details.uploadData && !authCallbackHandled) {
        try {
          // Parse form POST data from Apple
          const postData = details.uploadData
            .map((data) => {
              const text = data.bytes ? data.bytes.toString("utf8") : "";
              return text;
            })
            .join("");

          const params = new URLSearchParams(postData);
          const idToken = params.get("id_token");
          const code = params.get("code");
          const error = params.get("error");

          if (idToken || code || error) {
            authCallbackHandled = true;
            // Construct URL with POST data as query params
            const responseUrl = callbackUrl + "?" + postData;
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("auth-callback", { url: responseUrl });
            }
            
            setTimeout(() => {
              if (oauthWindow && !oauthWindow.isDestroyed()) {
                oauthWindow.close();
              }
            }, 100);
          }
        } catch (error) {
          console.error("Error parsing POST data:", error);
        }
      }
      callback({});
    },
  );

  // Track if callback has been handled
  let authCallbackHandled = false;

  // Listen for page load completion
  oauthWindow.webContents.on("did-finish-load", async () => {
    if (authCallbackHandled || !oauthWindow || oauthWindow.isDestroyed()) {
      return;
    }

    try {
      // Get the current URL
      const currentUrl = await oauthWindow.webContents.executeJavaScript(
        "window.location.href",
        true,
      );

      const parsedUrl = new url.URL(currentUrl);
      const callbackParsed = new url.URL(callbackUrl);

      // Check if this is our callback URL
      if (
        parsedUrl.origin === callbackParsed.origin &&
        parsedUrl.pathname === callbackParsed.pathname
      ) {
        // Extract the full URL including hash fragment using JavaScript
        const fullUrlWithHash = await oauthWindow.webContents.executeJavaScript(
          `(function() {
            // Return the complete URL including hash
            return window.location.href;
          })()`,
          true,
        );

        authCallbackHandled = true;

        // Send the full URL (including hash) to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auth-callback", {
            url: fullUrlWithHash,
          });
        }

        setTimeout(() => {
          if (oauthWindow && !oauthWindow.isDestroyed()) {
            oauthWindow.close();
          }
        }, 100);
      }
    } catch (error) {
      console.error("Page load check error:", error);
    }
  });

  // Load the OAuth URL
  oauthWindow.loadURL(authUrl);

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
