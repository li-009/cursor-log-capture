import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LogStorage } from './logStorage';

/**
 * 终端日志记录器
 * 通过创建包装脚本来捕获命令输出
 */
export class TerminalLogger {
    private storage: LogStorage;
    private logDir: string;

    constructor(storage: LogStorage) {
        this.storage = storage;
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        this.logDir = workspaceFolders 
            ? path.join(workspaceFolders[0].uri.fsPath, '.cursor-logs')
            : '';
    }

    /**
     * 创建一个带日志记录的终端
     */
    async createLoggedTerminal(name: string, command?: string): Promise<vscode.Terminal> {
        // 确保日志目录存在
        if (this.logDir && !fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        const logFile = path.join(this.logDir, `${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.log`);

        // 创建终端，使用 script 命令（Unix）或其他方式来捕获输出
        const isWindows = process.platform === 'win32';
        
        let shellArgs: string[] = [];
        let shellPath: string | undefined;

        if (isWindows) {
            // Windows: 使用 PowerShell 的 Start-Transcript
            shellPath = 'powershell.exe';
            shellArgs = [
                '-NoExit',
                '-Command',
                `Start-Transcript -Path "${logFile}" -Append; Write-Host "日志记录已启动: ${logFile}"`
            ];
        } else {
            // Unix: 使用 script 命令
            shellPath = '/bin/bash';
            shellArgs = [
                '-c',
                `script -q "${logFile}" && echo "日志记录已启动: ${logFile}"`
            ];
        }

        const terminal = vscode.window.createTerminal({
            name: `📝 ${name}`,
            shellPath,
            shellArgs
        });

        terminal.show();

        // 如果有初始命令，发送它
        if (command) {
            terminal.sendText(command);
        }

        // 监控日志文件变化
        this.watchLogFile(logFile, name);

        return terminal;
    }

    /**
     * 监控日志文件变化并读取新内容
     */
    private watchLogFile(logFile: string, terminalName: string): void {
        let lastSize = 0;
        let debounceTimer: NodeJS.Timeout | null = null;

        const processNewContent = () => {
            try {
                if (!fs.existsSync(logFile)) {
                    return;
                }

                const stats = fs.statSync(logFile);
                if (stats.size <= lastSize) {
                    return;
                }

                // 读取新增的内容
                const fd = fs.openSync(logFile, 'r');
                const buffer = Buffer.alloc(stats.size - lastSize);
                fs.readSync(fd, buffer, 0, buffer.length, lastSize);
                fs.closeSync(fd);

                const newContent = buffer.toString('utf-8');
                lastSize = stats.size;

                // 分行处理
                const lines = newContent.split('\n');
                lines.forEach(line => {
                    const cleanedLine = this.cleanTerminalOutput(line);
                    if (cleanedLine) {
                        this.storage.addLog(cleanedLine, 'terminal', terminalName);
                    }
                });

            } catch (error) {
                // 忽略文件访问错误
            }
        };

        // 使用轮询方式检查文件变化（更可靠）
        const watcher = setInterval(() => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(processNewContent, 100);
        }, 500);

        // 10分钟后停止监控（避免内存泄漏）
        setTimeout(() => {
            clearInterval(watcher);
        }, 10 * 60 * 1000);
    }

    /**
     * 清理终端输出中的控制字符
     */
    private cleanTerminalOutput(line: string): string {
        // 移除 ANSI 转义序列
        let cleaned = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        
        // 移除其他控制字符
        cleaned = cleaned.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // 移除 PowerShell transcript 头部信息
        if (cleaned.includes('**********************') ||
            cleaned.includes('Windows PowerShell transcript') ||
            cleaned.includes('Start time:') ||
            cleaned.includes('Username:') ||
            cleaned.includes('Machine:')) {
            return '';
        }

        return cleaned.trim();
    }

    /**
     * 运行命令并捕获输出
     */
    async runAndCapture(command: string, name?: string): Promise<void> {
        const terminalName = name || `Run: ${command.substring(0, 30)}`;
        const terminal = await this.createLoggedTerminal(terminalName, command);
        
        vscode.window.showInformationMessage(
            `🚀 正在运行命令，日志将被自动捕获: ${command}`
        );
    }
}

