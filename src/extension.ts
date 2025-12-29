import * as vscode from 'vscode';
import { LogCapture } from './logCapture';
import { LogStorage } from './logStorage';
import { LogViewProvider } from './logViewProvider';
import { RuntimeContextCollector } from './runtimeContext';
import { IdeaLogWatcher } from './ideaLogWatcher';
import { ApiTestManager } from './apiTester';
import { UpdateChecker } from './updateChecker';

let logCapture: LogCapture;
let logStorage: LogStorage;
let runtimeContext: RuntimeContextCollector;
let ideaLogWatcher: IdeaLogWatcher;
let apiTestManager: ApiTestManager;
let updateChecker: UpdateChecker;

export function activate(context: vscode.ExtensionContext) {
    console.log('Log Capture 插件已激活');

    // 初始化日志存储
    logStorage = new LogStorage(context);
    
    // 初始化日志捕获
    logCapture = new LogCapture(logStorage);
    
    // 初始化运行时上下文收集器
    runtimeContext = new RuntimeContextCollector();
    
    // 初始化 IDEA 日志监控器
    ideaLogWatcher = new IdeaLogWatcher(logStorage);
    
    // 初始化 API 测试管理器
    apiTestManager = new ApiTestManager();
    
    // 初始化更新检查器
    updateChecker = new UpdateChecker(context);
    
    // 启动时检查更新（静默模式）
    if (updateChecker.shouldCheckUpdate()) {
        updateChecker.checkForUpdates(true);
    }

    // 注册视图提供者
    const logViewProvider = new LogViewProvider(logStorage);
    vscode.window.registerTreeDataProvider('logCaptureView', logViewProvider);

    // 注册命令
    const commands = [
        vscode.commands.registerCommand('logCapture.startCapture', () => {
            logCapture.start();
            vscode.window.showInformationMessage('✅ 日志捕获已开始');
        }),

        vscode.commands.registerCommand('logCapture.stopCapture', () => {
            logCapture.stop();
            vscode.window.showInformationMessage('⏹️ 日志捕获已停止');
        }),

        vscode.commands.registerCommand('logCapture.viewLogs', () => {
            showLogsInEditor(logStorage.getAllLogs());
        }),

        vscode.commands.registerCommand('logCapture.viewErrors', () => {
            showLogsInEditor(logStorage.getErrorLogs());
        }),

        vscode.commands.registerCommand('logCapture.clearLogs', () => {
            logStorage.clear();
            logViewProvider.refresh();
            vscode.window.showInformationMessage('🗑️ 日志已清空');
        }),

        vscode.commands.registerCommand('logCapture.copyLogsToClipboard', async () => {
            const logs = logStorage.getAllLogs();
            const text = formatLogsForAI(logs);
            await vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage(`📋 已复制 ${logs.length} 条日志到剪贴板，可粘贴给AI分析`);
        }),

        vscode.commands.registerCommand('logCapture.copyErrorsToClipboard', async () => {
            const logs = logStorage.getErrorLogs();
            const text = formatLogsForAI(logs);
            await vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage(`📋 已复制 ${logs.length} 条错误日志到剪贴板，可粘贴给AI分析`);
        }),

        vscode.commands.registerCommand('logCapture.refresh', () => {
            logViewProvider.refresh();
        }),

        // 新增：收集完整运行时上下文
        vscode.commands.registerCommand('logCapture.collectContext', async () => {
            await runtimeContext.collectFullContext();
            runtimeContext.saveToFile();
            vscode.window.showInformationMessage('📊 运行时上下文已收集并保存');
        }),

        // 新增：复制完整上下文给 AI
        vscode.commands.registerCommand('logCapture.copyFullContextToClipboard', async () => {
            await runtimeContext.collectFullContext();
            
            // 合并日志
            const logs = logStorage.getAllLogs();
            logs.forEach(log => runtimeContext.addLog(log.content));
            
            const errorLogs = logStorage.getErrorLogs();
            errorLogs.forEach(log => runtimeContext.addError(log.content));
            
            const text = runtimeContext.formatForAI();
            await vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage('📋 完整运行时上下文已复制到剪贴板，可粘贴给AI分析');
        }),

        // 新增：记录并运行命令
        vscode.commands.registerCommand('logCapture.runAndCapture', async () => {
            const command = await vscode.window.showInputBox({
                prompt: '输入要运行的命令',
                placeHolder: 'npm run dev / python main.py / java -jar app.jar'
            });
            
            if (command) {
                runtimeContext.recordCommand(command);
                await runtimeContext.collectFullContext();
                
                // 创建终端并运行
                const terminal = vscode.window.createTerminal({
                    name: `📝 ${command.substring(0, 20)}`
                });
                terminal.show();
                terminal.sendText(command);
                
                vscode.window.showInformationMessage(`🚀 正在运行: ${command}`);
            }
        }),

        // 新增：复制单条日志内容
        vscode.commands.registerCommand('logCapture.copyLogContent', async (content: string) => {
            await vscode.env.clipboard.writeText(content);
            vscode.window.showInformationMessage('📋 已复制日志内容');
        }),

        // IDEA 集成：开始监控日志文件
        vscode.commands.registerCommand('logCapture.watchIdeaLogs', async () => {
            await ideaLogWatcher.startWatching();
        }),

        // IDEA 集成：停止监控
        vscode.commands.registerCommand('logCapture.stopWatchingIdeaLogs', () => {
            ideaLogWatcher.stopWatching();
        }),

        // IDEA 集成：添加自定义日志文件
        vscode.commands.registerCommand('logCapture.addLogFile', async () => {
            await ideaLogWatcher.addCustomLogFile();
        }),

        // IDEA 集成：从剪贴板导入日志（从IDEA复制）
        vscode.commands.registerCommand('logCapture.importFromClipboard', async () => {
            await ideaLogWatcher.importFromClipboard();
            logViewProvider.refresh();
        }),

        // IDEA 集成：查看正在监控的文件
        vscode.commands.registerCommand('logCapture.showWatchedFiles', () => {
            const files = ideaLogWatcher.getWatchedFiles();
            if (files.length === 0) {
                vscode.window.showInformationMessage('当前没有监控任何日志文件');
            } else {
                vscode.window.showQuickPick(files, {
                    title: '正在监控的日志文件',
                    placeHolder: `共 ${files.length} 个文件`
                });
            }
        }),

        // 初始化项目：创建 AI 规则文件
        vscode.commands.registerCommand('logCapture.setupProject', async () => {
            await setupProjectForAI();
        }),

        // ========== API 测试功能 ==========
        
        // 配置测试环境
        vscode.commands.registerCommand('apiTester.configure', async () => {
            await apiTestManager.configure();
        }),

        // 测试当前 Controller
        vscode.commands.registerCommand('apiTester.testCurrentController', async () => {
            await apiTestManager.testCurrentController();
        }),

        // 测试选中的接口
        vscode.commands.registerCommand('apiTester.testSelectedEndpoint', async () => {
            await apiTestManager.testSelectedEndpoint();
        }),

        // 快速测试
        vscode.commands.registerCommand('apiTester.quickTest', async () => {
            await apiTestManager.quickTest();
        }),

        // 从图片识别测试
        vscode.commands.registerCommand('apiTester.testFromImage', async () => {
            await apiTestManager.testFromImage();
        }),

        // 查看测试报告
        vscode.commands.registerCommand('apiTester.viewReports', async () => {
            await apiTestManager.viewTestReports();
        }),

        // 检查更新
        vscode.commands.registerCommand('logCapture.checkForUpdates', async () => {
            await updateChecker.checkForUpdates(false);
        })
    ];

    // 自动检测是否需要设置
    checkAndPromptSetup();

    commands.forEach(cmd => context.subscriptions.push(cmd));

    // 自动开始捕获
    const config = vscode.workspace.getConfiguration('logCapture');
    if (config.get<boolean>('autoCapture', true)) {
        logCapture.start();
    }

    // 监听终端事件
    context.subscriptions.push(
        vscode.window.onDidOpenTerminal(terminal => {
            logCapture.attachToTerminal(terminal);
        })
    );

    // 附加到现有终端
    vscode.window.terminals.forEach(terminal => {
        logCapture.attachToTerminal(terminal);
    });
}

function formatLogsForAI(logs: import('./logStorage').LogEntry[]): string {
    if (logs.length === 0) {
        return '没有捕获到日志';
    }

    const header = `=== 运行日志 (${logs.length} 条) ===\n`;
    const errorCount = logs.filter(l => l.isError).length;
    const warnCount = logs.filter(l => l.isWarning).length;
    
    let summary = `📊 统计: 错误 ${errorCount} | 警告 ${warnCount} | 总计 ${logs.length}\n\n`;

    const content = logs.map(log => {
        const prefix = log.isError ? '❌ ERROR' : log.isWarning ? '⚠️ WARN' : '📝 INFO';
        const time = new Date(log.timestamp).toLocaleTimeString();
        return `[${time}] ${prefix}: ${log.content}`;
    }).join('\n');

    return header + summary + content;
}

async function showLogsInEditor(logs: import('./logStorage').LogEntry[]) {
    const content = formatLogsForAI(logs);
    const doc = await vscode.workspace.openTextDocument({
        content,
        language: 'log'
    });
    await vscode.window.showTextDocument(doc);
}

async function setupProjectForAI(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showWarningMessage('请先打开一个项目文件夹');
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const fs = await import('fs');
    const path = await import('path');

    // 创建 .cursor-logs 目录
    const logsDir = path.join(rootPath, '.cursor-logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    // 创建 .cursorrules 文件
    const cursorRulesPath = path.join(rootPath, '.cursorrules');
    const cursorRulesContent = `# 项目运行日志配置

## 日志文件位置
当需要了解程序运行时的情况时，请查看以下文件：

1. **运行时上下文**: \`.cursor-logs/runtime-context.md\` - 包含启动参数、依赖、配置等
2. **完整日志**: \`.cursor-logs/runtime.log\` - 所有运行日志
3. **错误日志**: \`.cursor-logs/runtime.errors.log\` - 只有错误和异常

## 使用方法
- 如果用户提到"程序报错"、"运行出错"、"有bug"等，请先读取 \`.cursor-logs/runtime.errors.log\`
- 如果需要了解完整运行流程，读取 \`.cursor-logs/runtime.log\`
- 如果需要了解项目配置和环境，读取 \`.cursor-logs/runtime-context.md\`

## 日志格式
\`\`\`
[时间] [级别] [来源] 日志内容
\`\`\`
`;

    if (!fs.existsSync(cursorRulesPath)) {
        fs.writeFileSync(cursorRulesPath, cursorRulesContent, 'utf-8');
    }

    // 创建 .windsurfrules 文件
    const windsurfRulesPath = path.join(rootPath, '.windsurfrules');
    if (!fs.existsSync(windsurfRulesPath)) {
        fs.writeFileSync(windsurfRulesPath, cursorRulesContent, 'utf-8');
    }

    // 更新 .gitignore
    const gitignorePath = path.join(rootPath, '.gitignore');
    const gitignoreEntry = '\n# AI 日志捕获\n.cursor-logs/\n';
    
    if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        if (!content.includes('.cursor-logs')) {
            fs.appendFileSync(gitignorePath, gitignoreEntry);
        }
    } else {
        fs.writeFileSync(gitignorePath, gitignoreEntry, 'utf-8');
    }

    vscode.window.showInformationMessage(
        '✅ 项目已配置！AI 现在会自动读取 .cursor-logs/ 目录中的日志文件'
    );
}

async function checkAndPromptSetup(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const rootPath = workspaceFolders[0].uri.fsPath;
    const fs = await import('fs');
    const path = await import('path');

    const cursorRulesPath = path.join(rootPath, '.cursorrules');
    const logsDir = path.join(rootPath, '.cursor-logs');

    // 如果还没有配置，提示用户
    if (!fs.existsSync(cursorRulesPath) && !fs.existsSync(logsDir)) {
        const result = await vscode.window.showInformationMessage(
            '🔧 是否要配置此项目以支持 AI 日志分析？',
            '立即配置',
            '稍后'
        );

        if (result === '立即配置') {
            await setupProjectForAI();
        }
    }
}

export function deactivate() {
    if (logCapture) {
        logCapture.stop();
    }
    if (logStorage) {
        logStorage.save();
    }
}

