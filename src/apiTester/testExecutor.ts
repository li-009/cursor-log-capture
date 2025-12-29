import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import {
    TestCase,
    TestConfig,
    TestResult,
    TestRequestInfo,
    TestResponseInfo,
    TestError,
    DbQueryResult
} from './types';

/**
 * 测试执行器
 * 执行测试用例并收集结果
 */
export class TestExecutor {
    private config: TestConfig;

    constructor(config: TestConfig) {
        this.config = config;
    }

    /**
     * 执行单个测试用例
     */
    async executeTest(testCase: TestCase): Promise<TestResult> {
        const startTime = new Date();
        const logs: string[] = [];
        let error: TestError | undefined;
        let response: TestResponseInfo | undefined;
        let dbResults: DbQueryResult[] = [];

        logs.push(`[${new Date().toISOString()}] 开始执行测试: ${testCase.name}`);

        try {
            // 1. 执行前置 SQL
            if (testCase.setup?.sqls) {
                logs.push(`[Setup] 执行前置 SQL...`);
                for (const sql of testCase.setup.sqls) {
                    const result = await this.executeSql(sql);
                    dbResults.push(result);
                    logs.push(`[Setup] SQL: ${sql.substring(0, 100)}...`);
                }
            }

            // 2. 构建请求
            const requestInfo = this.buildRequest(testCase);
            logs.push(`[Request] ${requestInfo.method} ${requestInfo.url}`);
            logs.push(`[Request] Headers: ${JSON.stringify(requestInfo.headers)}`);
            if (requestInfo.body) {
                logs.push(`[Request] Body: ${JSON.stringify(requestInfo.body)}`);
            }

            // 3. 发送请求
            const requestStartTime = Date.now();
            response = await this.sendRequest(requestInfo);
            response.responseTime = Date.now() - requestStartTime;

            logs.push(`[Response] Status: ${response.statusCode} ${response.statusText}`);
            logs.push(`[Response] Time: ${response.responseTime}ms`);
            logs.push(`[Response] Body: ${JSON.stringify(response.body).substring(0, 500)}`);

            // 4. 执行数据库断言
            if (testCase.expected.dbAssertions) {
                logs.push(`[DB] 执行数据库断言...`);
                for (const assertion of testCase.expected.dbAssertions) {
                    const result = await this.executeSql(assertion.sql);
                    dbResults.push(result);
                    logs.push(`[DB] ${assertion.description}: ${JSON.stringify(result.result)}`);
                }
            }

            // 5. 执行后置 SQL
            if (testCase.teardown?.sqls) {
                logs.push(`[Teardown] 执行后置清理 SQL...`);
                for (const sql of testCase.teardown.sqls) {
                    await this.executeSql(sql);
                }
            }

        } catch (e: any) {
            error = {
                type: this.categorizeError(e),
                message: e.message,
                stack: e.stack,
                details: e
            };
            logs.push(`[Error] ${error.type}: ${error.message}`);
        }

        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();

        // 验证结果
        const passed = this.validateResult(testCase, response, error, dbResults);

        logs.push(`[Result] ${passed ? '✅ 通过' : '❌ 失败'} (耗时: ${duration}ms)`);

        return {
            testCase,
            passed,
            startTime,
            endTime,
            duration,
            request: this.buildRequest(testCase),
            response: response || this.createEmptyResponse(),
            dbResults,
            error,
            logs
        };
    }

    /**
     * 执行多个测试用例
     */
    async executeTests(testCases: TestCase[], onProgress?: (current: number, total: number) => void): Promise<TestResult[]> {
        const results: TestResult[] = [];
        
        for (let i = 0; i < testCases.length; i++) {
            if (onProgress) {
                onProgress(i + 1, testCases.length);
            }
            
            const result = await this.executeTest(testCases[i]);
            results.push(result);

            // 短暂延迟避免请求过快
            await this.delay(100);
        }

        return results;
    }

    /**
     * 执行并发测试
     */
    async executeConcurrentTest(testCase: TestCase, concurrency: number = 10): Promise<TestResult[]> {
        const promises: Promise<TestResult>[] = [];
        
        for (let i = 0; i < concurrency; i++) {
            promises.push(this.executeTest({
                ...testCase,
                id: `${testCase.id}_concurrent_${i}`,
                name: `${testCase.name} (并发 ${i + 1}/${concurrency})`
            }));
        }

        return Promise.all(promises);
    }

    /**
     * 执行性能测试
     */
    async executePerformanceTest(testCase: TestCase, iterations: number = 100): Promise<{
        results: TestResult[];
        stats: {
            min: number;
            max: number;
            avg: number;
            p50: number;
            p90: number;
            p99: number;
        };
    }> {
        const results: TestResult[] = [];
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
            const result = await this.executeTest({
                ...testCase,
                id: `${testCase.id}_perf_${i}`,
                name: `${testCase.name} (性能测试 ${i + 1}/${iterations})`
            });
            results.push(result);
            times.push(result.response.responseTime);
        }

        // 计算统计
        times.sort((a, b) => a - b);
        const stats = {
            min: times[0],
            max: times[times.length - 1],
            avg: times.reduce((a, b) => a + b, 0) / times.length,
            p50: times[Math.floor(times.length * 0.5)],
            p90: times[Math.floor(times.length * 0.9)],
            p99: times[Math.floor(times.length * 0.99)]
        };

        return { results, stats };
    }

    /**
     * 构建请求信息
     */
    private buildRequest(testCase: TestCase): TestRequestInfo {
        let url = this.config.baseUrl + testCase.endpoint.path;
        
        // 替换路径参数
        if (testCase.input.pathParams) {
            for (const [key, value] of Object.entries(testCase.input.pathParams)) {
                url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
            }
        }

        // 添加查询参数
        if (testCase.input.queryParams && Object.keys(testCase.input.queryParams).length > 0) {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(testCase.input.queryParams)) {
                if (value !== undefined && value !== null) {
                    params.append(key, String(value));
                }
            }
            url += '?' + params.toString();
        }

        // 构建请求头
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...this.config.headers,
            ...testCase.input.headers
        };

        // 添加 Token
        if (this.config.token) {
            headers['Authorization'] = `Bearer ${this.config.token}`;
        }

        return {
            method: testCase.endpoint.method,
            url,
            headers,
            body: testCase.input.body
        };
    }

    /**
     * 发送 HTTP 请求
     */
    private sendRequest(requestInfo: TestRequestInfo): Promise<TestResponseInfo> {
        return new Promise((resolve, reject) => {
            const url = new URL(requestInfo.url);
            const isHttps = url.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: requestInfo.method,
                headers: requestInfo.headers,
                timeout: this.config.timeout || 30000,
                rejectUnauthorized: false // 允许自签名证书
            };

            const req = lib.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    let body: any;
                    try {
                        body = JSON.parse(data);
                    } catch {
                        body = data;
                    }

                    resolve({
                        statusCode: res.statusCode || 0,
                        statusText: res.statusMessage || '',
                        headers: res.headers as Record<string, string>,
                        body,
                        responseTime: 0 // 外部计算
                    });
                });
            });

            req.on('error', (e) => {
                reject(e);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (requestInfo.body) {
                req.write(JSON.stringify(requestInfo.body));
            }

            req.end();
        });
    }

    /**
     * 执行 SQL（通过 MCP 或直接连接）
     */
    private async executeSql(sql: string): Promise<DbQueryResult> {
        const startTime = Date.now();
        
        // TODO: 实现 MCP 数据库调用
        // 这里需要调用 MCP 的 sql_query 功能
        
        return {
            sql,
            result: null,
            rowCount: 0,
            executionTime: Date.now() - startTime
        };
    }

    /**
     * 验证测试结果
     */
    private validateResult(
        testCase: TestCase,
        response: TestResponseInfo | undefined,
        error: TestError | undefined,
        dbResults: DbQueryResult[]
    ): boolean {
        if (error) {
            return false;
        }

        if (!response) {
            return false;
        }

        const expected = testCase.expected;

        // 验证状态码
        if (expected.statusCode !== undefined) {
            if (response.statusCode !== expected.statusCode) {
                return false;
            }
        }

        if (expected.statusCodes !== undefined) {
            if (!expected.statusCodes.includes(response.statusCode)) {
                return false;
            }
        }

        // 验证响应内容
        if (expected.responseContains) {
            const responseStr = JSON.stringify(response.body).toLowerCase();
            for (const keyword of expected.responseContains) {
                if (!responseStr.includes(keyword.toLowerCase())) {
                    return false;
                }
            }
        }

        if (expected.responseNotContains) {
            const responseStr = JSON.stringify(response.body).toLowerCase();
            for (const keyword of expected.responseNotContains) {
                if (responseStr.includes(keyword.toLowerCase())) {
                    return false;
                }
            }
        }

        // 验证响应时间
        if (expected.responseTime !== undefined) {
            if (response.responseTime > expected.responseTime) {
                return false;
            }
        }

        // 验证数据库断言
        if (expected.dbAssertions && expected.dbAssertions.length > 0) {
            for (let i = 0; i < expected.dbAssertions.length; i++) {
                const assertion = expected.dbAssertions[i];
                const result = dbResults[i];

                if (!result) continue;

                switch (assertion.expected) {
                    case 'exists':
                        if (result.rowCount === 0) return false;
                        break;
                    case 'notExists':
                        if (result.rowCount > 0) return false;
                        break;
                    case 'count':
                        if (result.rowCount !== assertion.expectedValue) return false;
                        break;
                    case 'value':
                        if (JSON.stringify(result.result) !== JSON.stringify(assertion.expectedValue)) {
                            return false;
                        }
                        break;
                }
            }
        }

        return true;
    }

    /**
     * 分类错误类型
     */
    private categorizeError(error: any): 'connection' | 'timeout' | 'assertion' | 'exception' | 'unknown' {
        const message = error.message?.toLowerCase() || '';
        
        if (message.includes('timeout')) return 'timeout';
        if (message.includes('connect') || message.includes('econnrefused')) return 'connection';
        if (message.includes('assert')) return 'assertion';
        
        return 'exception';
    }

    /**
     * 创建空响应
     */
    private createEmptyResponse(): TestResponseInfo {
        return {
            statusCode: 0,
            statusText: 'No Response',
            headers: {},
            body: null,
            responseTime: 0
        };
    }

    /**
     * 延迟
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

