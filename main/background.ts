import path from 'path'
import { app, ipcMain } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

;(async () => {
  await app.whenReady()
  console.log('App is ready, creating window...')

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    backgroundColor: '#000000',
    show: true, // Show immediately
    center: true, // Center the window
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      sandbox: false,
    },
  })

  console.log('Window created:', mainWindow.isVisible())

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2] || process.env.PORT || '8888'
    const devUrl = `http://localhost:${port}/home`
    try {
      await mainWindow.loadURL(devUrl)
    } catch (e) {
      // Fallback to common Nextron port
      const fallbackUrl = 'http://localhost:8888/home'
      await mainWindow.loadURL(fallbackUrl)
    }
    mainWindow.webContents.openDevTools()
  }

  // Ensure window is visible
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show')
    mainWindow.show()
    mainWindow.focus()
  })

  // Force show after a short delay as backup
  setTimeout(() => {
    if (!mainWindow.isDestroyed()) {
      console.log('Force showing window')
      mainWindow.show()
      mainWindow.focus()
    }
  }, 2000)
})()

app.on('window-all-closed', () => {
  app.quit()
})

// Simple IPC handler for testing
ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})
