import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    TestReport,
    TestResult,
    TestSummary,
    TestCategory,
    CategorySummary,
    ApiEndpoint,
    TestConfig
} from './types';

/**
 * 测试报告生成器
 * 生成详细的测试报告并保存到文件
 */
export class ReportGenerator {
    private workspaceRoot: string;
    private testDir: string;

    constructor() {
        const folders = vscode.workspace.workspaceFolders;
        this.workspaceRoot = folders ? folders[0].uri.fsPath : '';
        this.testDir = path.join(this.workspaceRoot, '.cursor-logs', 'test');
    }

    /**
     * 生成完整的测试报告
     */
    generateReport(
        results: TestResult[],
        endpoints: ApiEndpoint[],
        config: TestConfig
    ): TestReport {
        const report: TestReport = {
            id: this.generateReportId(),
            name: `API 接口测试报告`,
            generatedAt: new Date(),
            config: this.sanitizeConfig(config),
            summary: this.generateSummary(results),
            results,
            endpoints
        };

        return report;
    }

    /**
     * 保存报告到文件
     */
    async saveReport(report: TestReport): Promise<string> {
        // 确保目录存在
        if (!fs.existsSync(this.testDir)) {
            fs.mkdirSync(this.testDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportDir = path.join(this.testDir, `report_${timestamp}`);
        fs.mkdirSync(reportDir, { recursive: true });

        // 1. 保存 Markdown 报告
        const mdPath = path.join(reportDir, 'report.md');
        fs.writeFileSync(mdPath, this.generateMarkdownReport(report), 'utf-8');

        // 2. 保存 JSON 报告
        const jsonPath = path.join(reportDir, 'report.json');
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

        // 3. 保存详细日志
        const logsPath = path.join(reportDir, 'detailed-logs.md');
        fs.writeFileSync(logsPath, this.generateDetailedLogs(report), 'utf-8');

        // 4. 保存失败用例
        const failedPath = path.join(reportDir, 'failed-cases.md');
        fs.writeFileSync(failedPath, this.generateFailedCasesReport(report), 'utf-8');

        // 5. 保存 SQL 查询记录
        const sqlPath = path.join(reportDir, 'sql-queries.md');
        fs.writeFileSync(sqlPath, this.generateSqlReport(report), 'utf-8');

        return reportDir;
    }

    /**
     * 生成 Markdown 报告
     */
    private generateMarkdownReport(report: TestReport): string {
        const { summary, config, results } = report;
        
        let md = `# 🧪 API 接口测试报告

## 📊 测试概览

| 指标 | 值 |
|------|-----|
| 📅 生成时间 | ${report.generatedAt.toLocaleString()} |
| 🌐 测试环境 | ${config.baseUrl} |
| ⏱️ 总耗时 | ${summary.duration}ms |
| 📈 通过率 | ${summary.passRate} |

## 📈 测试统计

| 状态 | 数量 | 占比 |
|------|------|------|
| ✅ 通过 | ${summary.passed} | ${this.percentage(summary.passed, summary.total)} |
| ❌ 失败 | ${summary.failed} | ${this.percentage(summary.failed, summary.total)} |
| ⏭️ 跳过 | ${summary.skipped} | ${this.percentage(summary.skipped, summary.total)} |
| **总计** | **${summary.total}** | **100%** |

## 📋 分类测试结果

| 测试类型 | 总数 | 通过 | 失败 | 通过率 |
|----------|------|------|------|--------|
`;

        const categoryNames: Record<TestCategory, string> = {
            functional: '功能测试',
            validation: '参数校验',
            exception: '异常处理',
            boundary: '边界测试',
            transaction: '事务测试',
            concurrent: '并发测试',
            performance: '性能测试'
        };

        for (const [category, stats] of Object.entries(summary.categories)) {
            const catStats = stats as CategorySummary;
            const name = categoryNames[category as TestCategory] || category;
            const rate = catStats.total > 0 
                ? ((catStats.passed / catStats.total) * 100).toFixed(1) + '%'
                : 'N/A';
            md += `| ${name} | ${catStats.total} | ${catStats.passed} | ${catStats.failed} | ${rate} |\n`;
        }

        // 失败用例列表
        const failedResults = results.filter(r => !r.passed);
        if (failedResults.length > 0) {
            md += `\n## ❌ 失败用例 (${failedResults.length} 个)\n\n`;
            
            for (const result of failedResults) {
                md += `### ${result.testCase.name}\n\n`;
                md += `- **接口**: \`${result.testCase.endpoint.method} ${result.testCase.endpoint.path}\`\n`;
                md += `- **分类**: ${categoryNames[result.testCase.category]}\n`;
                md += `- **耗时**: ${result.duration}ms\n`;
                
                if (result.error) {
                    md += `- **错误类型**: ${result.error.type}\n`;
                    md += `- **错误信息**: ${result.error.message}\n`;
                }

                md += `\n**请求参数**:\n\`\`\`json\n${JSON.stringify(result.testCase.input, null, 2)}\n\`\`\`\n\n`;
                
                md += `**响应结果**:\n\`\`\`json\n${JSON.stringify(result.response.body, null, 2).substring(0, 1000)}\n\`\`\`\n\n`;

                md += `---\n\n`;
            }
        }

        // 通过用例列表
        const passedResults = results.filter(r => r.passed);
        md += `\n## ✅ 通过用例 (${passedResults.length} 个)\n\n`;
        md += `| 用例名称 | 接口 | 分类 | 耗时 |\n`;
        md += `|----------|------|------|------|\n`;
        
        for (const result of passedResults) {
            const name = categoryNames[result.testCase.category] || result.testCase.category;
            md += `| ${result.testCase.name} | \`${result.testCase.endpoint.method} ${result.testCase.endpoint.path}\` | ${name} | ${result.duration}ms |\n`;
        }

        // 接口覆盖
        md += `\n## 📌 接口覆盖\n\n`;
        md += `| 接口 | 方法 | 测试数 | 状态 |\n`;
        md += `|------|------|--------|------|\n`;

        for (const endpoint of report.endpoints) {
            const endpointResults = results.filter(
                r => r.testCase.endpoint.path === endpoint.path && 
                     r.testCase.endpoint.method === endpoint.method
            );
            const passed = endpointResults.every(r => r.passed);
            const status = endpointResults.length === 0 ? '⚠️ 未测试' : (passed ? '✅ 通过' : '❌ 失败');
            md += `| ${endpoint.path} | ${endpoint.method} | ${endpointResults.length} | ${status} |\n`;
        }

        return md;
    }

    /**
     * 生成详细日志
     */
    private generateDetailedLogs(report: TestReport): string {
        let md = `# 📝 详细测试日志\n\n`;
        md += `生成时间: ${report.generatedAt.toLocaleString()}\n\n`;

        for (const result of report.results) {
            md += `## ${result.passed ? '✅' : '❌'} ${result.testCase.name}\n\n`;
            md += `**时间**: ${result.startTime.toLocaleTimeString()} - ${result.endTime.toLocaleTimeString()} (${result.duration}ms)\n\n`;
            
            md += `### 请求详情\n`;
            md += `\`\`\`\n`;
            md += `${result.request.method} ${result.request.url}\n`;
            md += `Headers: ${JSON.stringify(result.request.headers, null, 2)}\n`;
            if (result.request.body) {
                md += `Body: ${JSON.stringify(result.request.body, null, 2)}\n`;
            }
            md += `\`\`\`\n\n`;

            md += `### 响应详情\n`;
            md += `\`\`\`\n`;
            md += `Status: ${result.response.statusCode} ${result.response.statusText}\n`;
            md += `Response Time: ${result.response.responseTime}ms\n`;
            md += `Body: ${JSON.stringify(result.response.body, null, 2)}\n`;
            md += `\`\`\`\n\n`;

            if (result.dbResults && result.dbResults.length > 0) {
                md += `### 数据库查询\n`;
                for (const dbResult of result.dbResults) {
                    md += `\`\`\`sql\n${dbResult.sql}\n\`\`\`\n`;
                    md += `结果: ${JSON.stringify(dbResult.result)} (${dbResult.rowCount} 行, ${dbResult.executionTime}ms)\n\n`;
                }
            }

            if (result.logs.length > 0) {
                md += `### 执行日志\n`;
                md += `\`\`\`\n${result.logs.join('\n')}\n\`\`\`\n\n`;
            }

            md += `---\n\n`;
        }

        return md;
    }

    /**
     * 生成失败用例报告
     */
    private generateFailedCasesReport(report: TestReport): string {
        const failedResults = report.results.filter(r => !r.passed);
        
        let md = `# ❌ 失败用例分析\n\n`;
        md += `共 ${failedResults.length} 个失败用例\n\n`;

        if (failedResults.length === 0) {
            md += `🎉 恭喜！所有测试用例都通过了！\n`;
            return md;
        }

        // 按错误类型分组
        const errorGroups: Record<string, TestResult[]> = {};
        for (const result of failedResults) {
            const errorType = result.error?.type || 'unknown';
            if (!errorGroups[errorType]) {
                errorGroups[errorType] = [];
            }
            errorGroups[errorType].push(result);
        }

        for (const [errorType, results] of Object.entries(errorGroups)) {
            md += `## ${this.getErrorTypeName(errorType)} (${results.length} 个)\n\n`;
            
            for (const result of results) {
                md += `### ${result.testCase.name}\n\n`;
                md += `- **接口**: \`${result.testCase.endpoint.method} ${result.testCase.endpoint.path}\`\n`;
                md += `- **错误信息**: ${result.error?.message || '未知错误'}\n`;
                
                md += `\n**问题分析**:\n`;
                md += this.analyzeFailure(result);
                
                md += `\n**建议修复**:\n`;
                md += this.suggestFix(result);
                
                md += `\n---\n\n`;
            }
        }

        return md;
    }

    /**
     * 生成 SQL 查询报告
     */
    private generateSqlReport(report: TestReport): string {
        let md = `# 🗃️ SQL 查询记录\n\n`;
        md += `生成时间: ${report.generatedAt.toLocaleString()}\n\n`;

        let sqlCount = 0;
        for (const result of report.results) {
            if (result.dbResults && result.dbResults.length > 0) {
                md += `## ${result.testCase.name}\n\n`;
                
                for (const dbResult of result.dbResults) {
                    sqlCount++;
                    md += `### SQL #${sqlCount}\n`;
                    md += `\`\`\`sql\n${dbResult.sql}\n\`\`\`\n\n`;
                    md += `| 指标 | 值 |\n`;
                    md += `|------|----|\n`;
                    md += `| 返回行数 | ${dbResult.rowCount} |\n`;
                    md += `| 执行时间 | ${dbResult.executionTime}ms |\n`;
                    md += `\n**结果**:\n\`\`\`json\n${JSON.stringify(dbResult.result, null, 2)}\n\`\`\`\n\n`;
                }
            }
        }

        if (sqlCount === 0) {
            md += `本次测试没有执行任何 SQL 查询。\n`;
        } else {
            md += `\n---\n\n共执行 ${sqlCount} 条 SQL 查询。\n`;
        }

        return md;
    }

    /**
     * 生成测试摘要
     */
    private generateSummary(results: TestResult[]): TestSummary {
        const total = results.length;
        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;
        const duration = results.reduce((sum, r) => sum + r.duration, 0);

        // 分类统计
        const categories: Record<TestCategory, CategorySummary> = {
            functional: { total: 0, passed: 0, failed: 0 },
            validation: { total: 0, passed: 0, failed: 0 },
            exception: { total: 0, passed: 0, failed: 0 },
            boundary: { total: 0, passed: 0, failed: 0 },
            transaction: { total: 0, passed: 0, failed: 0 },
            concurrent: { total: 0, passed: 0, failed: 0 },
            performance: { total: 0, passed: 0, failed: 0 }
        };

        for (const result of results) {
            const cat = result.testCase.category;
            categories[cat].total++;
            if (result.passed) {
                categories[cat].passed++;
            } else {
                categories[cat].failed++;
            }
        }

        return {
            total,
            passed,
            failed,
            skipped: 0,
            duration,
            passRate: total > 0 ? ((passed / total) * 100).toFixed(1) + '%' : '0%',
            categories
        };
    }

    /**
     * 分析失败原因
     */
    private analyzeFailure(result: TestResult): string {
        let analysis = '';

        if (result.error) {
            switch (result.error.type) {
                case 'connection':
                    analysis = '- 无法连接到服务器，请检查服务是否启动\n';
                    analysis += '- 请检查 baseUrl 配置是否正确\n';
                    break;
                case 'timeout':
                    analysis = '- 请求超时，可能是服务响应过慢\n';
                    analysis += '- 考虑增加超时时间或优化接口性能\n';
                    break;
                case 'assertion':
                    analysis = '- 断言失败，实际结果与预期不符\n';
                    break;
                default:
                    analysis = '- 发生未知错误\n';
            }
        }

        // 分析响应状态码
        if (result.response.statusCode >= 500) {
            analysis += '- 服务器内部错误 (5xx)，请检查后端日志\n';
        } else if (result.response.statusCode >= 400) {
            analysis += '- 客户端错误 (4xx)，请检查请求参数\n';
        }

        return analysis || '- 需要进一步调查\n';
    }

    /**
     * 建议修复方案
     */
    private suggestFix(result: TestResult): string {
        let suggestion = '';

        if (result.error?.type === 'connection') {
            suggestion = '1. 确保服务已启动\n2. 检查防火墙设置\n3. 验证网络连接\n';
        } else if (result.error?.type === 'timeout') {
            suggestion = '1. 增加超时时间配置\n2. 检查数据库查询性能\n3. 优化接口实现\n';
        } else if (result.response.statusCode === 401) {
            suggestion = '1. 检查 Token 是否有效\n2. 确认认证信息正确\n';
        } else if (result.response.statusCode === 403) {
            suggestion = '1. 检查用户权限\n2. 确认接口访问控制配置\n';
        } else if (result.response.statusCode === 404) {
            suggestion = '1. 检查接口路径是否正确\n2. 确认接口是否已部署\n';
        } else if (result.response.statusCode === 500) {
            suggestion = '1. 查看服务器错误日志\n2. 检查空指针异常\n3. 验证数据库操作\n';
        }

        return suggestion || '请查看详细日志进行分析\n';
    }

    /**
     * 获取错误类型名称
     */
    private getErrorTypeName(errorType: string): string {
        const names: Record<string, string> = {
            connection: '🔌 连接错误',
            timeout: '⏱️ 超时错误',
            assertion: '❗ 断言失败',
            exception: '💥 异常错误',
            unknown: '❓ 未知错误'
        };
        return names[errorType] || errorType;
    }

    /**
     * 生成报告 ID
     */
    private generateReportId(): string {
        return `report_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    /**
     * 计算百分比
     */
    private percentage(value: number, total: number): string {
        if (total === 0) return '0%';
        return ((value / total) * 100).toFixed(1) + '%';
    }

    /**
     * 清理敏感配置
     */
    private sanitizeConfig(config: TestConfig): TestConfig {
        return {
            ...config,
            token: config.token ? '***' : undefined,
            database: config.database ? {
                ...config.database,
                password: '***'
            } : undefined
        };
    }
}

