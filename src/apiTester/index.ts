import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { JavaControllerParser } from './javaParser';
import { TestDataGenerator } from './testDataGenerator';
import { TestExecutor } from './testExecutor';
import { ReportGenerator } from './reportGenerator';
import {
    TestConfig,
    TestCase,
    TestResult,
    ApiEndpoint,
    TestCategory
} from './types';

/**
 * API 测试管理器
 * 整合所有测试功能
 */
export class ApiTestManager {
    private parser: JavaControllerParser;
    private dataGenerator: TestDataGenerator;
    private reportGenerator: ReportGenerator;
    private config: TestConfig;
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.parser = new JavaControllerParser();
        this.dataGenerator = new TestDataGenerator();
        this.reportGenerator = new ReportGenerator();
        this.config = this.loadDefaultConfig();
        this.outputChannel = vscode.window.createOutputChannel('API Tester');
    }

    /**
     * 配置测试环境
     */
    async configure(): Promise<void> {
        // 获取基础 URL
        const baseUrl = await vscode.window.showInputBox({
            prompt: '请输入接口基础 URL',
            placeHolder: 'http://localhost:8080',
            value: this.config.baseUrl
        });

        if (baseUrl) {
            this.config.baseUrl = baseUrl;
        }

        // 获取 Token
        const token = await vscode.window.showInputBox({
            prompt: '请输入认证 Token（可选）',
            placeHolder: 'Bearer xxx 或直接输入 token',
            password: true
        });

        if (token) {
            this.config.token = token.replace(/^Bearer\s+/i, '');
        }

        // 保存配置
        this.saveConfig();

        vscode.window.showInformationMessage('✅ 测试配置已保存');
    }

    /**
     * 测试当前打开的 Controller
     */
    async testCurrentController(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请先打开一个 Controller 文件');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        if (!filePath.endsWith('.java')) {
            vscode.window.showWarningMessage('请打开一个 Java Controller 文件');
            return;
        }

        this.outputChannel.show();
        this.outputChannel.appendLine(`\n${'='.repeat(60)}`);
        this.outputChannel.appendLine(`开始测试: ${path.basename(filePath)}`);
        this.outputChannel.appendLine(`${'='.repeat(60)}\n`);

        try {
            // 1. 解析 Controller
            this.outputChannel.appendLine('📝 解析 Controller...');
            const endpoints = await this.parser.parseControllerFile(filePath);
            this.outputChannel.appendLine(`   找到 ${endpoints.length} 个接口\n`);

            if (endpoints.length === 0) {
                vscode.window.showWarningMessage('未找到可测试的接口');
                return;
            }

            // 显示接口列表
            for (const ep of endpoints) {
                this.outputChannel.appendLine(`   - ${ep.method} ${ep.path} (${ep.name})`);
            }

            // 2. 选择测试类型
            const testTypes = await vscode.window.showQuickPick([
                { label: '🧪 全部测试', value: 'all' },
                { label: '✅ 功能测试', value: 'functional' },
                { label: '📋 参数校验测试', value: 'validation' },
                { label: '⚠️ 边界测试', value: 'boundary' },
                { label: '💥 异常测试', value: 'exception' },
                { label: '🔄 并发测试', value: 'concurrent' },
                { label: '⚡ 性能测试', value: 'performance' }
            ], {
                placeHolder: '选择测试类型',
                canPickMany: true
            });

            if (!testTypes || testTypes.length === 0) {
                return;
            }

            const selectedCategories = testTypes.map(t => t.value);

            // 3. 生成测试用例
            this.outputChannel.appendLine('\n📦 生成测试用例...');
            let testCases: TestCase[] = [];

            for (const endpoint of endpoints) {
                const cases = this.dataGenerator.generateTestCases(endpoint);
                testCases.push(...cases);
            }

            // 过滤测试类型
            if (!selectedCategories.includes('all')) {
                testCases = testCases.filter(tc => 
                    selectedCategories.includes(tc.category)
                );
            }

            this.outputChannel.appendLine(`   生成 ${testCases.length} 个测试用例\n`);

            // 4. 确认执行
            const confirm = await vscode.window.showWarningMessage(
                `将执行 ${testCases.length} 个测试用例，是否继续？`,
                '执行',
                '取消'
            );

            if (confirm !== '执行') {
                return;
            }

            // 5. 执行测试
            this.outputChannel.appendLine('🚀 开始执行测试...\n');
            const executor = new TestExecutor(this.config);
            
            const results = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在执行 API 测试',
                cancellable: true
            }, async (progress, token) => {
                const allResults: TestResult[] = [];
                
                for (let i = 0; i < testCases.length; i++) {
                    if (token.isCancellationRequested) {
                        break;
                    }

                    progress.report({
                        message: `${i + 1}/${testCases.length}: ${testCases[i].name}`,
                        increment: 100 / testCases.length
                    });

                    const result = await executor.executeTest(testCases[i]);
                    allResults.push(result);

                    // 实时输出结果
                    const icon = result.passed ? '✅' : '❌';
                    this.outputChannel.appendLine(
                        `${icon} ${result.testCase.name} (${result.duration}ms)`
                    );
                }

                return allResults;
            });

            // 6. 生成报告
            this.outputChannel.appendLine('\n📊 生成测试报告...');
            const report = this.reportGenerator.generateReport(results, endpoints, this.config);
            const reportDir = await this.reportGenerator.saveReport(report);

            // 7. 显示结果
            const passed = results.filter(r => r.passed).length;
            const failed = results.filter(r => !r.passed).length;

            this.outputChannel.appendLine(`\n${'='.repeat(60)}`);
            this.outputChannel.appendLine('📊 测试完成');
            this.outputChannel.appendLine(`${'='.repeat(60)}`);
            this.outputChannel.appendLine(`   ✅ 通过: ${passed}`);
            this.outputChannel.appendLine(`   ❌ 失败: ${failed}`);
            this.outputChannel.appendLine(`   📈 通过率: ${((passed / results.length) * 100).toFixed(1)}%`);
            this.outputChannel.appendLine(`   📁 报告: ${reportDir}`);

            // 打开报告
            const openReport = await vscode.window.showInformationMessage(
                `测试完成！通过 ${passed}/${results.length}，报告已保存`,
                '查看报告',
                '查看失败用例'
            );

            if (openReport === '查看报告') {
                const reportFile = path.join(reportDir, 'report.md');
                const doc = await vscode.workspace.openTextDocument(reportFile);
                await vscode.window.showTextDocument(doc);
            } else if (openReport === '查看失败用例') {
                const failedFile = path.join(reportDir, 'failed-cases.md');
                const doc = await vscode.workspace.openTextDocument(failedFile);
                await vscode.window.showTextDocument(doc);
            }

        } catch (error: any) {
            this.outputChannel.appendLine(`\n❌ 错误: ${error.message}`);
            vscode.window.showErrorMessage(`测试失败: ${error.message}`);
        }
    }

    /**
     * 测试选中的接口
     */
    async testSelectedEndpoint(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请先打开一个 Controller 文件');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const endpoints = await this.parser.parseControllerFile(filePath);

        if (endpoints.length === 0) {
            vscode.window.showWarningMessage('未找到可测试的接口');
            return;
        }

        // 让用户选择接口
        const items = endpoints.map(ep => ({
            label: `${ep.method} ${ep.path}`,
            description: ep.name,
            detail: ep.description,
            endpoint: ep
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要测试的接口'
        });

        if (!selected) {
            return;
        }

        // 生成测试用例
        const testCases = this.dataGenerator.generateTestCases(selected.endpoint);

        // 执行测试
        this.outputChannel.show();
        this.outputChannel.appendLine(`\n🧪 测试接口: ${selected.label}`);

        const executor = new TestExecutor(this.config);
        const results: TestResult[] = [];

        for (const testCase of testCases) {
            const result = await executor.executeTest(testCase);
            results.push(result);

            const icon = result.passed ? '✅' : '❌';
            this.outputChannel.appendLine(`${icon} ${result.testCase.name}`);
        }

        // 生成报告
        const report = this.reportGenerator.generateReport(results, [selected.endpoint], this.config);
        await this.reportGenerator.saveReport(report);

        const passed = results.filter(r => r.passed).length;
        vscode.window.showInformationMessage(
            `接口测试完成！通过 ${passed}/${results.length}`
        );
    }

    /**
     * 快速测试（只测试功能正确性）
     */
    async quickTest(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请先打开一个 Controller 文件');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const endpoints = await this.parser.parseControllerFile(filePath);

        if (endpoints.length === 0) {
            vscode.window.showWarningMessage('未找到可测试的接口');
            return;
        }

        this.outputChannel.show();
        this.outputChannel.appendLine(`\n⚡ 快速测试: ${path.basename(filePath)}`);

        const executor = new TestExecutor(this.config);
        const results: TestResult[] = [];

        for (const endpoint of endpoints) {
            // 只生成功能测试用例
            const testCases = this.dataGenerator.generateTestCases(endpoint)
                .filter(tc => tc.category === 'functional');

            for (const testCase of testCases) {
                const result = await executor.executeTest(testCase);
                results.push(result);

                const icon = result.passed ? '✅' : '❌';
                this.outputChannel.appendLine(
                    `${icon} ${endpoint.method} ${endpoint.path} (${result.duration}ms)`
                );
            }
        }

        const passed = results.filter(r => r.passed).length;
        vscode.window.showInformationMessage(
            `快速测试完成！通过 ${passed}/${results.length}`
        );
    }

    /**
     * 从图片识别接口参数
     */
    async testFromImage(): Promise<void> {
        // 选择图片文件
        const imageUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp']
            },
            title: '选择接口参数截图'
        });

        if (!imageUri || imageUri.length === 0) {
            return;
        }

        vscode.window.showInformationMessage(
            '🔍 图片识别功能需要配合 AI 使用。\n' +
            '请将图片发送给 AI，并说明需要测试的接口信息。'
        );

        // TODO: 集成图片识别 AI
        // 这里需要调用视觉 AI 来识别图片中的表单字段
    }

    /**
     * 查看测试报告
     */
    async viewTestReports(): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return;
        }

        const testDir = path.join(folders[0].uri.fsPath, '.cursor-logs', 'test');
        
        if (!fs.existsSync(testDir)) {
            vscode.window.showInformationMessage('还没有测试报告');
            return;
        }

        const reports = fs.readdirSync(testDir)
            .filter(f => f.startsWith('report_'))
            .sort()
            .reverse();

        if (reports.length === 0) {
            vscode.window.showInformationMessage('还没有测试报告');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            reports.map(r => ({
                label: r,
                description: '点击查看报告'
            })),
            { placeHolder: '选择测试报告' }
        );

        if (selected) {
            const reportFile = path.join(testDir, selected.label, 'report.md');
            if (fs.existsSync(reportFile)) {
                const doc = await vscode.workspace.openTextDocument(reportFile);
                await vscode.window.showTextDocument(doc);
            }
        }
    }

    /**
     * 加载默认配置
     */
    private loadDefaultConfig(): TestConfig {
        const folders = vscode.workspace.workspaceFolders;
        if (folders) {
            const configPath = path.join(folders[0].uri.fsPath, '.cursor-logs', 'test-config.json');
            if (fs.existsSync(configPath)) {
                try {
                    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                } catch {
                    // 忽略解析错误
                }
            }
        }

        return {
            baseUrl: 'http://localhost:8080',
            timeout: 30000
        };
    }

    /**
     * 保存配置
     */
    private saveConfig(): void {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) return;

        const configDir = path.join(folders[0].uri.fsPath, '.cursor-logs');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        const configPath = path.join(configDir, 'test-config.json');
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    }

    /**
     * 获取输出通道
     */
    getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }
}

// 导出所有模块
export * from './types';
export { JavaControllerParser } from './javaParser';
export { TestDataGenerator } from './testDataGenerator';
export { TestExecutor } from './testExecutor';
export { ReportGenerator } from './reportGenerator';

