import * as vscode from 'vscode';
import { LogStorage } from './logStorage';

export class LogCapture {
    private storage: LogStorage;
    private isCapturing: boolean = false;
    private terminalListeners: Map<string, vscode.Disposable> = new Map();
    private outputChannel: vscode.OutputChannel;

    constructor(storage: LogStorage) {
        this.storage = storage;
        this.outputChannel = vscode.window.createOutputChannel('Log Capture');
    }

    start(): void {
        if (this.isCapturing) {
            return;
        }
        this.isCapturing = true;
        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 日志捕获已启动`);
        
        // 设置状态栏
        this.updateStatusBar();
    }

    stop(): void {
        this.isCapturing = false;
        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 日志捕获已停止`);
        
        // 保存日志
        this.storage.save();
    }

    isActive(): boolean {
        return this.isCapturing;
    }

    attachToTerminal(terminal: vscode.Terminal): void {
        const terminalName = terminal.name;
        
        // 避免重复附加
        if (this.terminalListeners.has(terminalName)) {
            return;
        }

        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 已附加到终端: ${terminalName}`);

        // 使用 shell integration 来捕获命令输出（如果可用）
        // 注意：VS Code 的终端 API 有限，我们需要使用其他方式来捕获输出
        
        // 监听终端关闭
        const closeListener = vscode.window.onDidCloseTerminal(closedTerminal => {
            if (closedTerminal === terminal) {
                this.terminalListeners.delete(terminalName);
                closeListener.dispose();
            }
        });

        this.terminalListeners.set(terminalName, closeListener);
    }

    /**
     * 手动添加日志条目（供其他扩展或脚本调用）
     */
    addManualLog(content: string, source: string = 'manual'): void {
        if (!this.isCapturing) {
            return;
        }
        this.storage.addLog(content, source);
    }

    /**
     * 从文件读取日志（用于读取程序输出的日志文件）
     */
    async watchLogFile(filePath: string): Promise<vscode.Disposable> {
        const uri = vscode.Uri.file(filePath);
        
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(uri, '*')
        );

        let lastSize = 0;

        const readNewContent = async () => {
            try {
                const content = await vscode.workspace.fs.readFile(uri);
                const text = Buffer.from(content).toString('utf-8');
                
                if (text.length > lastSize) {
                    const newContent = text.substring(lastSize);
                    const lines = newContent.split('\n').filter(line => line.trim());
                    
                    lines.forEach(line => {
                        this.storage.addLog(line, 'file', filePath);
                    });

                    lastSize = text.length;
                }
            } catch (error) {
                // 文件可能不存在
            }
        };

        watcher.onDidChange(readNewContent);
        watcher.onDidCreate(readNewContent);

        return watcher;
    }

    private updateStatusBar(): void {
        const stats = this.storage.getStats();
        const statusText = this.isCapturing 
            ? `$(record) 日志: ${stats.total} | 错误: ${stats.errors}`
            : `$(circle-slash) 日志捕获已停止`;
        
        // 可以创建一个状态栏项目来显示这个信息
        this.outputChannel.appendLine(statusText);
    }

    dispose(): void {
        this.stop();
        this.terminalListeners.forEach(listener => listener.dispose());
        this.terminalListeners.clear();
        this.outputChannel.dispose();
    }
}

