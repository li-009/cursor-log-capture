import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LogStorage } from './logStorage';

/**
 * IDEA 日志监控器
 * 监控 IntelliJ IDEA 输出的日志文件，实时同步到插件
 */
export class IdeaLogWatcher {
    private storage: LogStorage;
    private watchers: Map<string, fs.FSWatcher> = new Map();
    private filePositions: Map<string, number> = new Map();
    private workspaceRoot: string;

    // 常见的 IDEA 日志位置
    private static readonly IDEA_LOG_PATTERNS = [
        // Maven/Gradle 输出
        'target/logs/*.log',
        'build/logs/*.log',
        // Spring Boot
        'logs/*.log',
        'log/*.log',
        // 通用
        '*.log',
        'output.log',
        'console.log',
        'application.log',
        // IDEA 运行输出（如果配置了输出到文件）
        '.idea/logs/*.log',
        'out/*.log'
    ];

    constructor(storage: LogStorage) {
        this.storage = storage;
        const folders = vscode.workspace.workspaceFolders;
        this.workspaceRoot = folders ? folders[0].uri.fsPath : '';
    }

    /**
     * 开始监控所有常见的日志位置
     */
    async startWatching(): Promise<void> {
        if (!this.workspaceRoot) {
            vscode.window.showWarningMessage('请先打开一个工作区');
            return;
        }

        // 创建 .cursor-logs 目录
        const cursorLogsDir = path.join(this.workspaceRoot, '.cursor-logs');
        if (!fs.existsSync(cursorLogsDir)) {
            fs.mkdirSync(cursorLogsDir, { recursive: true });
        }

        // 搜索并监控所有日志文件
        await this.findAndWatchLogFiles();

        // 监控新创建的日志文件
        this.watchForNewLogFiles();

        vscode.window.showInformationMessage('📡 开始监控 IDEA 日志文件...');
    }

    /**
     * 查找并监控现有的日志文件
     */
    private async findAndWatchLogFiles(): Promise<void> {
        const logPatterns = [
            '**/*.log',
            '**/logs/**',
            '**/target/**/*.log',
            '**/build/**/*.log'
        ];

        for (const pattern of logPatterns) {
            const files = await vscode.workspace.findFiles(
                pattern,
                '**/node_modules/**',
                50 // 最多50个文件
            );

            for (const file of files) {
                this.watchFile(file.fsPath);
            }
        }
    }

    /**
     * 监控单个日志文件
     */
    watchFile(filePath: string): void {
        if (this.watchers.has(filePath)) {
            return; // 已经在监控了
        }

        try {
            // 记录当前文件位置（从末尾开始，只读新内容）
            const stats = fs.statSync(filePath);
            this.filePositions.set(filePath, stats.size);

            const watcher = fs.watch(filePath, (eventType) => {
                if (eventType === 'change') {
                    this.readNewContent(filePath);
                }
            });

            this.watchers.set(filePath, watcher);
            console.log(`监控日志文件: ${filePath}`);

        } catch (error) {
            // 文件可能不存在
        }
    }

    /**
     * 读取文件新增的内容
     */
    private readNewContent(filePath: string): void {
        try {
            const stats = fs.statSync(filePath);
            const lastPosition = this.filePositions.get(filePath) || 0;

            if (stats.size <= lastPosition) {
                // 文件可能被清空或截断
                this.filePositions.set(filePath, stats.size);
                return;
            }

            // 读取新增的内容
            const fd = fs.openSync(filePath, 'r');
            const newSize = stats.size - lastPosition;
            const buffer = Buffer.alloc(newSize);
            fs.readSync(fd, buffer, 0, newSize, lastPosition);
            fs.closeSync(fd);

            this.filePositions.set(filePath, stats.size);

            // 处理新内容
            const newContent = buffer.toString('utf-8');
            const lines = newContent.split('\n');
            const fileName = path.basename(filePath);

            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed) {
                    this.storage.addLog(trimmed, 'idea', fileName);
                }
            });

        } catch (error) {
            // 忽略读取错误
        }
    }

    /**
     * 监控新创建的日志文件
     */
    private watchForNewLogFiles(): void {
        const dirsToWatch = [
            this.workspaceRoot,
            path.join(this.workspaceRoot, 'logs'),
            path.join(this.workspaceRoot, 'target'),
            path.join(this.workspaceRoot, 'build'),
            path.join(this.workspaceRoot, 'out')
        ];

        dirsToWatch.forEach(dir => {
            if (fs.existsSync(dir)) {
                try {
                    fs.watch(dir, { recursive: true }, (eventType, filename) => {
                        if (filename && filename.endsWith('.log')) {
                            const fullPath = path.join(dir, filename);
                            if (fs.existsSync(fullPath)) {
                                this.watchFile(fullPath);
                            }
                        }
                    });
                } catch (error) {
                    // 忽略监控错误
                }
            }
        });
    }

    /**
     * 手动指定要监控的日志文件
     */
    async addCustomLogFile(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: true,
            filters: {
                'Log files': ['log', 'txt', 'out'],
                'All files': ['*']
            },
            title: '选择要监控的日志文件'
        });

        if (result) {
            result.forEach(uri => {
                this.watchFile(uri.fsPath);
                vscode.window.showInformationMessage(`📄 已添加监控: ${path.basename(uri.fsPath)}`);
            });
        }
    }

    /**
     * 读取 IDEA 控制台输出（如果用户复制过来）
     */
    async importFromClipboard(): Promise<void> {
        const text = await vscode.env.clipboard.readText();
        if (text) {
            const lines = text.split('\n');
            let errorCount = 0;
            
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed) {
                    this.storage.addLog(trimmed, 'clipboard', 'IDEA Console');
                    if (trimmed.toLowerCase().includes('error') || 
                        trimmed.toLowerCase().includes('exception')) {
                        errorCount++;
                    }
                }
            });

            vscode.window.showInformationMessage(
                `📋 已导入 ${lines.length} 行日志，发现 ${errorCount} 个错误`
            );
        }
    }

    /**
     * 停止所有监控
     */
    stopWatching(): void {
        this.watchers.forEach((watcher, path) => {
            watcher.close();
        });
        this.watchers.clear();
        this.filePositions.clear();
        vscode.window.showInformationMessage('⏹️ 已停止监控日志文件');
    }

    /**
     * 获取当前监控的文件列表
     */
    getWatchedFiles(): string[] {
        return Array.from(this.watchers.keys());
    }
}

