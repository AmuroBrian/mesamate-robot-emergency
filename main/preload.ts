import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value)
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
}

// Helper function to safely invoke IPC with error handling
const safeInvoke = async <T = any>(channel: string, ...args: any[]): Promise<T> => {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (error) {
    console.error(`IPC invoke failed for ${channel}:`, error)
    // Return a safe error response that won't crash the renderer
    return { success: false, error: error instanceof Error ? error.message : 'IPC communication failed' } as T
  }
}

// Robot control functions
const robotControl = {
  async moveForward(duration: number = 1000) {
    return await safeInvoke('robot-move-forward', duration)
  },
  async turnLeft() {
    return await safeInvoke('robot-turn-left')
  },
  async turnRight() {
    return await safeInvoke('robot-turn-right')
  },
  async stop() {
    return await safeInvoke('robot-stop')
  },
  async reset() {
    return await safeInvoke('robot-reset')
  },
  async executePath(path: Array<{x: number, y: number}>) {
    return await safeInvoke('robot-execute-path', path)
  },
  async getPosition() {
    return await safeInvoke('robot-get-position')
  },
  async isConnected() {
    return await safeInvoke('robot-is-connected')
  },
  // Precision movement methods
  async moveDistance(inches: number, speed?: 'normal' | 'precision' | 'fast') {
    return await safeInvoke('robot-move-distance', inches, speed)
  },
  async turnAngle(degrees: number, speed?: 'normal' | 'precision' | 'fast') {
    return await safeInvoke('robot-turn-angle', degrees, speed)
  },
  async moveToPosition(x: number, y: number) {
    return await safeInvoke('robot-move-to-position', x, y)
  },
  // Table LED control methods
  async tableArrived(tableNumber: number) {
    return await safeInvoke('robot-table-arrived', tableNumber)
  },
  async tableReceived(tableNumber: number) {
    return await safeInvoke('robot-table-received', tableNumber)
  }
}

contextBridge.exposeInMainWorld('ipc', handler)
contextBridge.exposeInMainWorld('robot', robotControl)

// Expose obstacle event subscription helper
contextBridge.exposeInMainWorld('robotEvents', {
  onObstacleEvent(callback: (event: string) => void) {
    const unsubscribe = handler.on('robot-obstacle-event', (msg: unknown) => {
      if (typeof msg === 'string') callback(msg)
    })
    return unsubscribe
  }
})

export type IpcHandler = typeof handler
export type RobotControl = typeof robotControl
