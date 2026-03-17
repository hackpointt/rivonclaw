import { BrowserWindow, app } from "electron";

type Locale = "zh" | "en";

const i18n = {
  en: {
    starting: "Starting...",
  },
  zh: {
    starting: "正在启动...",
  },
} as const;

function buildHtml(locale: Locale): string {
  const t = i18n[locale];
  return `<!DOCTYPE html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8">
<title>EasyClaw</title>
<style>
  :root {
    --bg-primary: #1a1a2e;
    --text-primary: #e0e0e0;
    --text-secondary: #a0a0b0;
    --accent: #4a9eff;
    --bar-bg: #2a2a4a;
    --radius: 6px;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    -webkit-app-region: drag;
    user-select: none;
    overflow: hidden;
  }

  .title {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.5px;
    margin-bottom: 24px;
  }

  .message {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 16px;
    min-height: 18px;
    text-align: center;
    padding: 0 24px;
  }

  .progress-track {
    width: 280px;
    height: 4px;
    background: var(--bar-bg);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: var(--radius);
    width: 40%;
    animation: indeterminate 1.4s ease-in-out infinite;
  }

  @keyframes indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }
</style>
</head>
<body>
  <div class="title">EasyClaw</div>
  <div class="message">${t.starting}</div>
  <div class="progress-track">
    <div class="progress-fill"></div>
  </div>
</body>
</html>`;
}

export interface BootstrapWindow {
  show: () => void;
  close: () => void;
}

/**
 * Create a frameless splash window that shows a brief "Starting..." message.
 * Used only as a visual indicator during app initialization — no progress
 * reporting needed since ASAR loading is near-instant.
 */
export function createBootstrapWindow(): BootstrapWindow {
  const locale: Locale = app.getLocale().startsWith("zh") ? "zh" : "en";

  const win = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    transparent: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const html = buildHtml(locale);
  const encoded = Buffer.from(html, "utf-8").toString("base64");
  win.loadURL(`data:text/html;base64,${encoded}`);

  return {
    show() {
      win.show();
    },

    close() {
      if (!win.isDestroyed()) {
        win.close();
      }
    },
  };
}
