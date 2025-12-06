/**
 * IPC Bridge module exports
 */

export {
  type IpcBridge,
  getIpcBridge,
  setIpcBridge,
  resetIpcBridge,
  isIpcAvailable
} from './ipc-bridge'

export { ElectronIpcBridge } from './electron-ipc-bridge'

export { MockIpcBridge, createMockIpcBridge } from './mock-ipc-bridge'
