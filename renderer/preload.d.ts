import { IpcHandler, RobotControl } from '../main/preload'

declare global {
  interface Window {
    ipc: IpcHandler
    robot: RobotControl
  }
}
