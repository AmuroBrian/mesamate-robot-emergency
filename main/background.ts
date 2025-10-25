import path from 'path'
import { app, ipcMain, powerSaveBlocker } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import { arduinoController } from './arduino-communication'

// On Raspberry Pi and some Linux ARM devices, GPU acceleration can cause
// Chromium to fail VSync queries and render a white screen. Prefer EGL and
// disable GPU acceleration early to improve compatibility.
const isLinuxArm =
  process.platform === 'linux' && (process.arch === 'arm' || process.arch === 'arm64')
if (isLinuxArm) {
  console.log('🍓 Raspberry Pi detected - applying compatibility fixes')
  
  // Disable all GPU/hardware acceleration
  app.disableHardwareAcceleration()
  
  // Core GPU disabling flags
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-gpu-rasterization')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  
  // Disable 2D/3D acceleration
  app.commandLine.appendSwitch('disable-accelerated-2d-canvas')
  app.commandLine.appendSwitch('disable-accelerated-video-decode')
  app.commandLine.appendSwitch('disable-accelerated-mjpeg-decode')
  
  // Disable WebGL and related features
  app.commandLine.appendSwitch('disable-webgl')
  app.commandLine.appendSwitch('disable-webgl2')
  
  // Disable complex rendering features
  app.commandLine.appendSwitch('disable-features', 
    'VizDisplayCompositor,' +
    'VaapiVideoDecoder,' +
    'UseSkiaRenderer,' +
    'Vulkan,' +
    'HardwareMediaKeyHandling,' +
    'GpuMemoryBufferVideoFrames,' +
    'UseChromeOSDirectVideoDecoder'
  )
  
  // Critical: Use software rendering for maximum compatibility
  app.commandLine.appendSwitch('use-gl', 'swiftshader')
  app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
  
  // Disable sandbox (can cause issues on ARM)
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-setuid-sandbox')
  
  // Use in-process GPU to reduce overhead
  app.commandLine.appendSwitch('in-process-gpu')
  
  // Force Xwayland/X11 backend (Wayland causes issues)
  app.commandLine.appendSwitch('ozone-platform', 'x11')
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform')
  
  // Disable shared memory (can cause crashes)
  app.commandLine.appendSwitch('disable-dev-shm-usage')
  
  // Force disk cache location (avoid /tmp issues)
  const userHome = require('os').homedir()
  app.commandLine.appendSwitch('disk-cache-dir', `${userHome}/.cache/mesamate-robot`)
  
  // Disable more features that use shared memory
  app.commandLine.appendSwitch('disable-shared-workers')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  
  // Additional Raspberry Pi stability flags
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-ipc-flooding-protection')
  app.commandLine.appendSwitch('max_old_space_size', '512')
  
  // Even more aggressive stability flags
  app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor')
  app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames')
  app.commandLine.appendSwitch('disable-accelerated-video-encode')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  app.commandLine.appendSwitch('force-gpu-mem-available-mb', '256')
  
  // Allow more time for renderer initialization
  app.commandLine.appendSwitch('renderer-process-limit', '1')
  
  // Logging for debugging
  app.commandLine.appendSwitch('enable-logging')
  app.commandLine.appendSwitch('v', '1')
  
  console.log('✅ Raspberry Pi compatibility flags applied')
  console.log('   Using ANGLE/SwiftShader for software rendering')
  console.log('   Using X11 backend (not Wayland)')
}

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

;(async () => {
  await app.whenReady()

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      sandbox: false,
    },
  })

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

    // If initial load fails (race with Next dev server), retry once when it becomes available
    let retried = false
    mainWindow.webContents.on('did-fail-load', async () => {
      if (retried) return
      retried = true
      const retryUrl = `http://localhost:${port || '8888'}/home`
      try {
        await mainWindow.loadURL(retryUrl)
      } catch {}
    })
  }

  mainWindow.once('ready-to-show', () => {
    console.log('✅ Window ready to show')
    mainWindow.show()
  })

  // Force-show in case 'ready-to-show' never fires due to GPU/GL issues
  // On Raspberry Pi, give extra time for software rendering to initialize
  const forceShowTimeout = isLinuxArm ? 15000 : 8000
  setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log('⚠️  Force-showing window (ready-to-show never fired)')
      mainWindow.show()
    }
  }, forceShowTimeout)

  // Diagnostics for renderer issues
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('========================================')
    console.error('❌ RENDERER PROCESS CRASHED')
    console.error('========================================')
    console.error('Reason:', details.reason)
    console.error('Exit code:', details.exitCode)
    console.error('Timestamp:', new Date().toISOString())
    console.error('Platform:', process.platform)
    console.error('Architecture:', process.arch)
    
    // Exit code meanings:
    // 0 = Clean exit (not really a crash)
    // 1 = General error / unhandled exception
    // 5 = GPU/rendering/hung renderer (most common on Raspberry Pi)
    // 11 = Segmentation fault
    // 134 = Abort signal
    
    if (details.exitCode === 5) {
      console.error('⚠️  Exit code 5: GPU/Rendering issue or hung renderer')
      console.error('   This usually means:')
      console.error('   - Graphics rendering failed (GPU issue)')
      console.error('   - Renderer was unresponsive for too long')
      console.error('   - Chromium security violation')
      
      if (isLinuxArm) {
        console.error('')
        console.error('🍓 RASPBERRY PI DETECTED')
        console.error('   Try these system-level fixes:')
        console.error('   1. Increase GPU memory: sudo raspi-config → Advanced → Memory Split → 256')
        console.error('   2. Increase swap: sudo dphys-swapfile swapoff && edit /etc/dphys-swapfile')
        console.error('   3. Disable desktop compositor if running X11')
        console.error('   4. Run in console mode (no X11): sudo systemctl set-default multi-user.target')
        console.error('   5. Update firmware: sudo rpi-update')
      }
    }
    
    console.error('========================================')
    
    // Only auto-reload on initial load failures (exitCode 0 = clean exit, not a crash)
    // For actual crashes (especially exit code 5), DON'T auto-reload - it just crashes again
    if (details.exitCode === 0 && !mainWindow.isDestroyed()) {
      console.log('Clean exit detected, reloading...')
      const url = mainWindow.webContents.getURL()
      if (url) {
        setTimeout(() => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.loadURL(url).catch(() => {})
          }
        }, 1000)
      }
    } else {
      console.error('⚠️  NOT auto-reloading (would just crash again)')
      console.error('   Please fix the underlying issue first')
    }
  })
  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer became unresponsive')
    console.error('⚠️  This usually means a long-running operation is blocking the UI')
  })
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log('Renderer console:', { level, message, line, sourceId })
  })

  // Prevent display sleep/blanking on Raspberry Pi
  try {
    const id = powerSaveBlocker.start('prevent-display-sleep')
    app.on('before-quit', () => {
      if (powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id)
    })
  } catch {}
})()

app.on('window-all-closed', () => {
  app.quit()
})

// IPC handlers for Arduino communication
ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})

// Helper function to safely get error message
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error occurred'
}

// Robot movement commands
ipcMain.handle('robot-move-forward', async (event, duration: number) => {
  try {
    await arduinoController.moveForward(duration)
    return { success: true, position: arduinoController.getCurrentPosition() }
  } catch (error) {
    console.error('robot-move-forward error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('robot-turn-left', async () => {
  try {
    await arduinoController.turnLeft()
    return { success: true, position: arduinoController.getCurrentPosition() }
  } catch (error) {
    console.error('robot-turn-left error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('robot-turn-right', async () => {
  try {
    await arduinoController.turnRight()
    return { success: true, position: arduinoController.getCurrentPosition() }
  } catch (error) {
    console.error('robot-turn-right error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('robot-stop', async () => {
  try {
    await arduinoController.stop()
    return { success: true }
  } catch (error) {
    console.error('robot-stop error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('robot-reset', async () => {
  try {
    await arduinoController.reset()
    return { success: true }
  } catch (error) {
    console.error('robot-reset error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('robot-execute-path', async (event, path: Array<{x: number, y: number}>) => {
  try {
    const commands = arduinoController.convertPathToCommands(path)
    await arduinoController.executeMovementSequence(commands)
    return { success: true, position: arduinoController.getCurrentPosition() }
  } catch (error) {
    console.error('robot-execute-path error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('robot-get-position', async () => {
  try {
    return arduinoController.getCurrentPosition()
  } catch (error) {
    console.error('robot-get-position error:', error)
    return { x: 0, y: 0, direction: 'north' }
  }
})

ipcMain.handle('robot-is-connected', async () => {
  try {
    return arduinoController.isArduinoConnected()
  } catch (error) {
    console.error('robot-is-connected error:', error)
    return false
  }
})

// Precision movement commands
ipcMain.handle('robot-move-distance', async (event, inches: number, speed?: 'normal' | 'precision' | 'fast') => {
  try {
    await arduinoController.moveDistance(inches, speed)
    return { success: true, position: arduinoController.getCurrentPosition() }
  } catch (error) {
    console.error('robot-move-distance error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('robot-turn-angle', async (event, degrees: number, speed?: 'normal' | 'precision' | 'fast') => {
  try {
    await arduinoController.turnAngle(degrees, speed)
    return { success: true, position: arduinoController.getCurrentPosition() }
  } catch (error) {
    console.error('robot-turn-angle error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('robot-move-to-position', async (event, x: number, y: number) => {
  try {
    await arduinoController.moveToPosition(x, y)
    return { success: true, position: arduinoController.getCurrentPosition() }
  } catch (error) {
    console.error('robot-move-to-position error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

// Table LED control commands
ipcMain.handle('robot-table-arrived', async (event, tableNumber: number) => {
  try {
    await arduinoController.tableArrived(tableNumber)
    return { success: true }
  } catch (error) {
    console.error('robot-table-arrived error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})

ipcMain.handle('robot-table-received', async (event, tableNumber: number) => {
  try {
    await arduinoController.tableReceived(tableNumber)
    return { success: true }
  } catch (error) {
    console.error('robot-table-received error:', error)
    return { success: false, error: getErrorMessage(error) }
  }
})
