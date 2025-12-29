import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface LogEntry {
    id: string;
    timestamp: number;
    content: string;
    source: string;
    isError: boolean;
    isWarning: boolean;
    terminalName?: string;
}

export class LogStorage {
    private logs: LogEntry[] = [];
    private context: vscode.ExtensionContext;
    private maxLines: number;
    private errorPatterns: string[];
    private warningPatterns: string[];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        
        const config = vscode.workspace.getConfiguration('logCapture');
        this.maxLines = config.get<number>('maxLogLines', 1000);
        
        const patterns = config.get<string[]>('capturePatterns', ['error', 'exception', 'fail', 'crash']);
        this.errorPatterns = patterns.filter(p => ['error', 'exception', 'fail', 'crash'].includes(p.toLowerCase()));
        this.warningPatterns = ['warn', 'warning'];

        // 加载之前保存的日志
        this.load();
    }

    addLog(content: string, source: string = 'terminal', terminalName?: string): void {
        // 跳过空行
        if (!content.trim()) {
            return;
        }

        const lowerContent = content.toLowerCase();
        
        const isError = this.errorPatterns.some(pattern => 
            lowerContent.includes(pattern.toLowerCase())
        ) || this.isStackTrace(content);

        const isWarning = this.warningPatterns.some(pattern => 
            lowerContent.includes(pattern.toLowerCase())
        );

        const entry: LogEntry = {
            id: this.generateId(),
            timestamp: Date.now(),
            content: content.trim(),
            source,
            isError,
            isWarning,
            terminalName
        };

        this.logs.push(entry);

        // 限制日志数量
        if (this.logs.length > this.maxLines) {
            this.logs = this.logs.slice(-this.maxLines);
        }

        // 如果是错误，立即保存
        if (isError) {
            this.save();
        }
    }

    private isStackTrace(content: string): boolean {
        // 检测常见的堆栈跟踪模式
        const stackPatterns = [
            /at\s+.+\(.+:\d+:\d+\)/,  // JavaScript/TypeScript
            /File ".+", line \d+/,     // Python
            /at .+\(.+\.java:\d+\)/,   // Java
            /^\s+at\s+/m,              // 通用 "at" 开头
            /Traceback \(most recent call last\)/i,  // Python traceback
            /Exception in thread/i,     // Java exception
            /panic:/i,                  // Go panic
            /FATAL/i,
            /Unhandled/i
        ];

        return stackPatterns.some(pattern => pattern.test(content));
    }

    getAllLogs(): LogEntry[] {
        return [...this.logs];
    }

    getErrorLogs(): LogEntry[] {
        return this.logs.filter(log => log.isError);
    }

    getWarningLogs(): LogEntry[] {
        return this.logs.filter(log => log.isWarning);
    }

    getRecentLogs(count: number = 50): LogEntry[] {
        return this.logs.slice(-count);
    }

    getLogsByTerminal(terminalName: string): LogEntry[] {
        return this.logs.filter(log => log.terminalName === terminalName);
    }

    clear(): void {
        this.logs = [];
        this.save();
    }

    save(): void {
        try {
            // 保存到扩展存储
            this.context.globalState.update('capturedLogs', this.logs);

            // 同时保存到工作区文件
            this.saveToFile();
        } catch (error) {
            console.error('保存日志失败:', error);
        }
    }

    private load(): void {
        try {
            const saved = this.context.globalState.get<LogEntry[]>('capturedLogs');
            if (saved) {
                this.logs = saved;
            }
        } catch (error) {
            console.error('加载日志失败:', error);
        }
    }

    private saveToFile(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const config = vscode.workspace.getConfiguration('logCapture');
        const relativePath = config.get<string>('logFilePath', '.cursor-logs/runtime.log');
        const logPath = path.join(workspaceFolders[0].uri.fsPath, relativePath);
        const logDir = path.dirname(logPath);

        try {
            // 确保目录存在
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            // 写入日志文件
            const content = this.logs.map(log => {
                const time = new Date(log.timestamp).toISOString();
                const level = log.isError ? 'ERROR' : log.isWarning ? 'WARN' : 'INFO';
                return `[${time}] [${level}] [${log.terminalName || 'unknown'}] ${log.content}`;
            }).join('\n');

            fs.writeFileSync(logPath, content, 'utf-8');

            // 同时保存一份只有错误的日志
            const errorPath = logPath.replace('.log', '.errors.log');
            const errorContent = this.getErrorLogs().map(log => {
                const time = new Date(log.timestamp).toISOString();
                return `[${time}] [${log.terminalName || 'unknown'}] ${log.content}`;
            }).join('\n');

            fs.writeFileSync(errorPath, errorContent, 'utf-8');

        } catch (error) {
            console.error('写入日志文件失败:', error);
        }
    }

    getStats(): { total: number; errors: number; warnings: number } {
        return {
            total: this.logs.length,
            errors: this.logs.filter(l => l.isError).length,
            warnings: this.logs.filter(l => l.isWarning).length
        };
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

