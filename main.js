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
     * Persistent storage for app settings (theme, auto-launch, etc.).
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

      if (process.env.NODE_ENV === "development" || !app.isPackaged) {
        mainWindow.loadURL("http://localhost:5173");
        mainWindow.webContents.openDevTools();
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
        },
        crossOriginOpenerPolicy: { value: "unsafe-none" },
      });

      /**
       * Detects OAuth callback URLs and forwards to renderer process.
       */
      let authCallbackHandled = false;

      const forwardAuthCallback = async (navigationUrl) => {
        if (!navigationUrl.includes("/__/auth/handler") || authCallbackHandled) {
          return;
        }

        for (let i = 0; i < 10; i++) {
          await new Promise((resolve) => setTimeout(resolve, 300));

          let fullUrl = navigationUrl;

          try {
            const evaluatedUrl = await oauthWindow.webContents.executeJavaScript(
              "window.location.href",
              true,
            );
            if (evaluatedUrl) {
              fullUrl = evaluatedUrl;
            }
          } catch (error) {
            break;
          }

          if (fullUrl.includes("id_token") || fullUrl.includes("access_token")) {
            authCallbackHandled = true;
            oauthWindow.close();
            if (mainWindow) {
              mainWindow.webContents.send("auth-callback", { url: fullUrl });
            }
            return;
          }
        }
      };

      if (process.env.NODE_ENV === "development" || !app.isPackaged) {
        oauthWindow.webContents.openDevTools();
      }

      oauthWindow.loadURL(url);

      oauthWindow.webContents.on("page-title-updated", async (event) => {
        const currentUrl = oauthWindow.webContents.getURL();
        await forwardAuthCallback(currentUrl);
      });

      oauthWindow.webContents.on("did-navigate", async (event, navUrl) => {
        await forwardAuthCallback(navUrl);
      });

      oauthWindow.webContents.on("did-navigate-in-page", async (event, navUrl) => {
        await forwardAuthCallback(navUrl);
      });

      oauthWindow.on("closed", () => {
        oauthWindow = null;
      });

      return oauthWindow;
    }

    /**
     * Initializes app when Electron is ready.
     */
    app.whenReady().then(() => {
      const savedAutoLaunch = store.get("autoLaunch", false);
      syncAutoLaunch(savedAutoLaunch);

      // System audio capture handler - captures all system audio including:
      // - Meet/Zoom calls (both parties), Bluetooth/wired devices, all apps
      // Windows: automatic loopback | macOS: requires Screen Recording permission
      session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer
          .getSources({ types: ["screen"] })
          .then((sources) => {
            if (sources.length === 0) {
              // Fallback: if no sources, still allow audio-only capture
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
            // Allow audio-only capture even if video enumeration fails
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
    ipcMain.handle("set-theme-preference", async (event, theme) => {
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
