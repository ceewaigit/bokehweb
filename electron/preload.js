"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electronAPI = {
    // Desktop capture - with proper constraint format
    getDesktopSources: async (options) => {
        // Validate and sanitize options to prevent IPC errors
        if (options && typeof options !== 'object') {
            return Promise.reject(new Error('Invalid options provided to getDesktopSources'));
        }
        return electron_1.ipcRenderer.invoke('get-desktop-sources', options);
    },
    getDesktopStream: (sourceId, hasAudio) => {
        // Simple pass-through - let main process handle it
        return electron_1.ipcRenderer.invoke('get-desktop-stream', sourceId, hasAudio);
    },
    getSources: () => electron_1.ipcRenderer.invoke('get-sources'),
    // Permission checking
    checkScreenRecordingPermission: () => electron_1.ipcRenderer.invoke('check-screen-recording-permission'),
    requestScreenRecordingPermission: () => electron_1.ipcRenderer.invoke('request-screen-recording-permission'),
    startPermissionMonitoring: () => electron_1.ipcRenderer.invoke('start-permission-monitoring'),
    stopPermissionMonitoring: () => electron_1.ipcRenderer.invoke('stop-permission-monitoring'),
    onPermissionStatusChanged: (callback) => {
        const wrappedCallback = (event, data) => {
            if (data && typeof data === 'object') {
                callback(event, data);
            }
        };
        electron_1.ipcRenderer.on('permission-status-changed', wrappedCallback);
        return () => electron_1.ipcRenderer.removeListener('permission-status-changed', wrappedCallback);
    },
    // Mouse tracking with type safety
    startMouseTracking: async (options) => {
        // Validate options
        if (options && typeof options !== 'object') {
            return Promise.reject(new Error('Invalid options provided to startMouseTracking'));
        }
        return electron_1.ipcRenderer.invoke('start-mouse-tracking', options);
    },
    stopMouseTracking: () => electron_1.ipcRenderer.invoke('stop-mouse-tracking'),
    getMousePosition: () => electron_1.ipcRenderer.invoke('get-mouse-position'),
    isNativeMouseTrackingAvailable: () => electron_1.ipcRenderer.invoke('is-native-mouse-tracking-available'),
    onMouseMove: (callback) => {
        const wrappedCallback = (event, data) => {
            // Validate data structure
            if (data && typeof data === 'object' && typeof data.x === 'number' && typeof data.y === 'number') {
                callback(event, data);
            }
        };
        electron_1.ipcRenderer.on('mouse-move', wrappedCallback);
        return () => electron_1.ipcRenderer.removeListener('mouse-move', wrappedCallback);
    },
    onMouseClick: (callback) => {
        const wrappedCallback = (event, data) => {
            // Validate data structure
            if (data && typeof data === 'object' && typeof data.x === 'number' && typeof data.y === 'number') {
                callback(event, data);
            }
        };
        electron_1.ipcRenderer.on('mouse-click', wrappedCallback);
        return () => electron_1.ipcRenderer.removeListener('mouse-click', wrappedCallback);
    },
    removeMouseListener: (event, callback) => {
        electron_1.ipcRenderer.removeListener(event, callback);
    },
    removeAllMouseListeners: () => {
        electron_1.ipcRenderer.removeAllListeners('mouse-move');
        electron_1.ipcRenderer.removeAllListeners('mouse-click');
    },
    // System information
    getPlatform: () => electron_1.ipcRenderer.invoke('get-platform'),
    getScreens: () => electron_1.ipcRenderer.invoke('get-screens'),
    // Recording and workspace control
    openWorkspace: () => electron_1.ipcRenderer.invoke('open-workspace'),
    startRecording: () => electron_1.ipcRenderer.invoke('start-recording'),
    stopRecording: () => electron_1.ipcRenderer.invoke('stop-recording'),
    minimizeRecordButton: () => electron_1.ipcRenderer.invoke('minimize-record-button'),
    showRecordButton: () => electron_1.ipcRenderer.invoke('show-record-button'),
    // Dialog APIs
    showMessageBox: (options) => electron_1.ipcRenderer.invoke('show-message-box', options),
    showSaveDialog: (options) => electron_1.ipcRenderer.invoke('show-save-dialog', options),
    showOpenDialog: (options) => electron_1.ipcRenderer.invoke('show-open-dialog', options),
    // Window controls
    minimize: () => electron_1.ipcRenderer.send('minimize'),
    maximize: () => electron_1.ipcRenderer.send('maximize'),
    quit: () => electron_1.ipcRenderer.send('quit'),
    // Countdown window
    showCountdown: (number) => electron_1.ipcRenderer.invoke('show-countdown', number),
    hideCountdown: () => electron_1.ipcRenderer.invoke('hide-countdown'),
    // File operations
    saveFile: (data, filepath) => electron_1.ipcRenderer.invoke('save-file', data, filepath),
    openFile: (filename) => electron_1.ipcRenderer.invoke('open-file', filename),
    // Recording events
    onRecordingStarted: (callback) => {
        electron_1.ipcRenderer.on('recording-started', callback);
        return () => electron_1.ipcRenderer.removeListener('recording-started', callback);
    },
    onRecordingStopped: (callback) => {
        electron_1.ipcRenderer.on('recording-stopped', callback);
        return () => electron_1.ipcRenderer.removeListener('recording-stopped', callback);
    },
    onRecordingError: (callback) => {
        const wrappedCallback = (_event, error) => callback(error);
        electron_1.ipcRenderer.on('recording-error', wrappedCallback);
        return () => electron_1.ipcRenderer.removeListener('recording-error', wrappedCallback);
    },
    removeAllListeners: (channel) => {
        electron_1.ipcRenderer.removeAllListeners(channel);
    }
};
// Expose the API to the renderer process
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPI);
//# sourceMappingURL=preload.js.map