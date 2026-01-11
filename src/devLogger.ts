/**
 * Development Logger - Captures console output for download
 * Only active when dev mode is enabled
 */

interface LogEntry {
    timestamp: string;
    level: 'log' | 'warn' | 'error' | 'info' | 'debug';
    message: string;
    data?: unknown;
}

class DevLogger {
    private logs: LogEntry[] = [];
    private maxLogs = 10000; // Limit to prevent memory issues
    private isEnabled = false;
    
    // Store original console methods
    private originalLog: typeof console.log;
    private originalWarn: typeof console.warn;
    private originalError: typeof console.error;
    private originalInfo: typeof console.info;
    private originalDebug: typeof console.debug;

    constructor() {
        this.originalLog = console.log.bind(console);
        this.originalWarn = console.warn.bind(console);
        this.originalError = console.error.bind(console);
        this.originalInfo = console.info.bind(console);
        this.originalDebug = console.debug.bind(console);
    }

    /**
     * Enable log capturing
     */
    enable(): void {
        if (this.isEnabled) return;
        this.isEnabled = true;
        
        // Override console methods to capture logs
        console.log = (...args: unknown[]) => {
            this.capture('log', args);
            this.originalLog(...args);
        };
        console.warn = (...args: unknown[]) => {
            this.capture('warn', args);
            this.originalWarn(...args);
        };
        console.error = (...args: unknown[]) => {
            this.capture('error', args);
            this.originalError(...args);
        };
        console.info = (...args: unknown[]) => {
            this.capture('info', args);
            this.originalInfo(...args);
        };
        console.debug = (...args: unknown[]) => {
            this.capture('debug', args);
            this.originalDebug(...args);
        };
        
        this.logs.push({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: '=== Dev logging enabled ==='
        });
    }

    /**
     * Disable log capturing
     */
    disable(): void {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        
        // Restore original console methods
        console.log = this.originalLog;
        console.warn = this.originalWarn;
        console.error = this.originalError;
        console.info = this.originalInfo;
        console.debug = this.originalDebug;
    }

    /**
     * Capture a log entry
     */
    private capture(level: LogEntry['level'], args: unknown[]): void {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        this.logs.push({
            timestamp: new Date().toISOString(),
            level,
            message
        });

        // Keep logs within limit
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
    }

    /**
     * Get all captured logs as a string
     */
    getLogsAsText(): string {
        if (this.logs.length === 0) {
            return 'No logs captured yet. Enable dev mode and interact with the game to generate logs.';
        }
        
        return this.logs.map(entry => {
            const levelPrefix = `[${entry.level.toUpperCase()}]`.padEnd(8);
            return `${entry.timestamp} ${levelPrefix} ${entry.message}`;
        }).join('\n');
    }

    /**
     * Download logs as a text file
     */
    downloadLogs(): void {
        const logText = this.getLogsAsText();
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `ochoxocho-dev-log-${timestamp}.txt`;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Clear all captured logs
     */
    clear(): void {
        this.logs = [];
    }

    /**
     * Get the number of captured logs
     */
    getLogCount(): number {
        return this.logs.length;
    }

    /**
     * Check if logging is enabled
     */
    isLoggingEnabled(): boolean {
        return this.isEnabled;
    }
}

// Singleton instance
export const devLogger = new DevLogger();

