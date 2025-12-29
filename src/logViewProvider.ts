import * as vscode from 'vscode';
import { LogStorage, LogEntry } from './logStorage';

export class LogViewProvider implements vscode.TreeDataProvider<LogItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<LogItem | undefined | null | void> = 
        new vscode.EventEmitter<LogItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<LogItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private storage: LogStorage;
    private refreshInterval: NodeJS.Timeout | null = null;

    constructor(storage: LogStorage) {
        this.storage = storage;
        
        // 每5秒自动刷新一次
        this.refreshInterval = setInterval(() => {
            this.refresh();
        }, 5000);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: LogItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: LogItem): Thenable<LogItem[]> {
        if (!element) {
            // 根级别：显示分类
            return Promise.resolve(this.getRootItems());
        }

        if (element.contextValue === 'category') {
            // 显示该分类下的日志
            return Promise.resolve(this.getLogItems(element.category!));
        }

        return Promise.resolve([]);
    }

    private getRootItems(): LogItem[] {
        const stats = this.storage.getStats();
        
        const items: LogItem[] = [];

        // 错误日志分类
        if (stats.errors > 0) {
            const errorItem = new LogItem(
                `❌ 错误 (${stats.errors})`,
                vscode.TreeItemCollapsibleState.Expanded
            );
            errorItem.contextValue = 'category';
            errorItem.category = 'errors';
            errorItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
            items.push(errorItem);
        }

        // 警告日志分类
        if (stats.warnings > 0) {
            const warnItem = new LogItem(
                `⚠️ 警告 (${stats.warnings})`,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            warnItem.contextValue = 'category';
            warnItem.category = 'warnings';
            warnItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
            items.push(warnItem);
        }

        // 最近日志
        const recentItem = new LogItem(
            `📝 最近日志 (${Math.min(stats.total, 50)})`,
            vscode.TreeItemCollapsibleState.Collapsed
        );
        recentItem.contextValue = 'category';
        recentItem.category = 'recent';
        recentItem.iconPath = new vscode.ThemeIcon('history');
        items.push(recentItem);

        // 统计信息
        const statsItem = new LogItem(
            `📊 总计: ${stats.total} 条日志`,
            vscode.TreeItemCollapsibleState.None
        );
        statsItem.iconPath = new vscode.ThemeIcon('graph');
        items.push(statsItem);

        // 快捷操作
        const copyItem = new LogItem(
            `📋 复制错误日志给AI`,
            vscode.TreeItemCollapsibleState.None
        );
        copyItem.command = {
            command: 'logCapture.copyErrorsToClipboard',
            title: '复制错误日志'
        };
        copyItem.iconPath = new vscode.ThemeIcon('clippy');
        items.push(copyItem);

        return items;
    }

    private getLogItems(category: string): LogItem[] {
        let logs: LogEntry[] = [];
        
        switch (category) {
            case 'errors':
                logs = this.storage.getErrorLogs();
                break;
            case 'warnings':
                logs = this.storage.getWarningLogs();
                break;
            case 'recent':
                logs = this.storage.getRecentLogs(50);
                break;
            default:
                logs = this.storage.getAllLogs();
        }

        // 按时间倒序，最新的在前面
        logs = logs.reverse().slice(0, 100);

        return logs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const preview = log.content.length > 80 
                ? log.content.substring(0, 80) + '...' 
                : log.content;

            const item = new LogItem(
                `[${time}] ${preview}`,
                vscode.TreeItemCollapsibleState.None
            );

            item.tooltip = new vscode.MarkdownString();
            item.tooltip.appendCodeblock(log.content, 'log');
            item.tooltip.appendMarkdown(`\n\n---\n**时间**: ${new Date(log.timestamp).toLocaleString()}`);
            if (log.terminalName) {
                item.tooltip.appendMarkdown(`\n**终端**: ${log.terminalName}`);
            }

            item.contextValue = 'logEntry';
            item.logEntry = log;

            // 设置图标
            if (log.isError) {
                item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
            } else if (log.isWarning) {
                item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
            } else {
                item.iconPath = new vscode.ThemeIcon('info');
            }

            // 点击时复制内容
            item.command = {
                command: 'logCapture.copyLogContent',
                title: '复制日志内容',
                arguments: [log.content]
            };

            return item;
        });
    }

    dispose(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

class LogItem extends vscode.TreeItem {
    category?: string;
    logEntry?: LogEntry;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

