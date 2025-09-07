"use strict";
/**
 * Centralized logging utility with proper log levels
 * Replaces console.log statements throughout the app
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.logger = void 0;
class Logger {
    constructor() {
        this.config = {
            enabledInProduction: false,
            minLevel: 'info'
        };
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        this.isProduction = process.env.NODE_ENV === 'production';
    }
    shouldLog(level) {
        if (this.isProduction && !this.config.enabledInProduction) {
            return level === 'error'; // Only log errors in production
        }
        return this.levels[level] >= this.levels[this.config.minLevel];
    }
    debug(...args) {
        if (this.shouldLog('debug')) {
            console.debug('[DEBUG]', ...args);
        }
    }
    info(...args) {
        if (this.shouldLog('info')) {
            console.info('[INFO]', ...args);
        }
    }
    warn(...args) {
        if (this.shouldLog('warn')) {
            console.warn('[WARN]', ...args);
        }
    }
    error(...args) {
        if (this.shouldLog('error')) {
            console.error('[ERROR]', ...args);
        }
    }
    // Performance logging
    time(label) {
        if (this.shouldLog('debug')) {
            console.time(label);
        }
    }
    timeEnd(label) {
        if (this.shouldLog('debug')) {
            console.timeEnd(label);
        }
    }
    // Group logging for better organization
    group(label) {
        if (this.shouldLog('debug')) {
            console.group(label);
        }
    }
    groupEnd() {
        if (this.shouldLog('debug')) {
            console.groupEnd();
        }
    }
    configure(config) {
        this.config = { ...this.config, ...config };
    }
}
exports.Logger = Logger;
// Export singleton instance
exports.logger = new Logger();
