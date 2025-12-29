/**
 * API 测试器类型定义
 */

// 接口信息
export interface ApiEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    name: string;
    description?: string;
    controller: string;
    methodName: string;
    parameters: ApiParameter[];
    requestBody?: ApiRequestBody;
    responses: ApiResponse[];
}

// 参数信息
export interface ApiParameter {
    name: string;
    type: string;
    in: 'path' | 'query' | 'header' | 'body';
    required: boolean;
    description?: string;
    defaultValue?: any;
    constraints?: ParameterConstraints;
}

// 参数约束
export interface ParameterConstraints {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: string[];
    notNull?: boolean;
    notBlank?: boolean;
    email?: boolean;
    phone?: boolean;
}

// 请求体
export interface ApiRequestBody {
    type: string;
    contentType: string;
    fields: ApiField[];
    example?: any;
}

// 字段信息
export interface ApiField {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    constraints?: ParameterConstraints;
    children?: ApiField[]; // 嵌套对象
}

// 响应信息
export interface ApiResponse {
    statusCode: number;
    description: string;
    schema?: any;
}

// 测试配置
export interface TestConfig {
    baseUrl: string;
    token?: string;
    headers?: Record<string, string>;
    timeout?: number;
    database?: DatabaseConfig;
}

// 数据库配置
export interface DatabaseConfig {
    type: 'mysql' | 'postgresql' | 'oracle';
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    useMcp?: boolean; // 使用 MCP 配置的数据库
    mcpServerName?: string;
}

// 测试用例
export interface TestCase {
    id: string;
    name: string;
    description: string;
    endpoint: ApiEndpoint;
    category: TestCategory;
    input: TestInput;
    expected: TestExpectation;
    setup?: TestSetup;
    teardown?: TestTeardown;
}

// 测试分类
export type TestCategory = 
    | 'functional'      // 功能正确性
    | 'validation'      // 参数校验
    | 'exception'       // 异常处理
    | 'boundary'        // 边界测试
    | 'transaction'     // 事务测试
    | 'concurrent'      // 并发测试
    | 'performance';    // 性能测试

// 测试输入
export interface TestInput {
    pathParams?: Record<string, any>;
    queryParams?: Record<string, any>;
    headers?: Record<string, string>;
    body?: any;
    files?: TestFile[];
}

// 测试文件
export interface TestFile {
    fieldName: string;
    fileName: string;
    content: Buffer | string;
    contentType: string;
}

// 测试期望
export interface TestExpectation {
    statusCode?: number;
    statusCodes?: number[];
    responseContains?: string[];
    responseNotContains?: string[];
    responseSchema?: any;
    responseTime?: number; // 最大响应时间(ms)
    dbAssertions?: DbAssertion[];
}

// 数据库断言
export interface DbAssertion {
    description: string;
    sql: string;
    expected: 'exists' | 'notExists' | 'count' | 'value';
    expectedValue?: any;
}

// 测试前置
export interface TestSetup {
    sqls?: string[];
    description?: string;
}

// 测试后置
export interface TestTeardown {
    sqls?: string[];
    description?: string;
}

// 测试结果
export interface TestResult {
    testCase: TestCase;
    passed: boolean;
    startTime: Date;
    endTime: Date;
    duration: number; // ms
    request: TestRequestInfo;
    response: TestResponseInfo;
    dbResults?: DbQueryResult[];
    error?: TestError;
    logs: string[];
}

// 请求信息
export interface TestRequestInfo {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
}

// 响应信息
export interface TestResponseInfo {
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
    responseTime: number;
}

// 数据库查询结果
export interface DbQueryResult {
    sql: string;
    result: any;
    rowCount: number;
    executionTime: number;
}

// 测试错误
export interface TestError {
    type: 'connection' | 'timeout' | 'assertion' | 'exception' | 'unknown';
    message: string;
    stack?: string;
    details?: any;
}

// 测试报告
export interface TestReport {
    id: string;
    name: string;
    generatedAt: Date;
    config: TestConfig;
    summary: TestSummary;
    results: TestResult[];
    endpoints: ApiEndpoint[];
}

// 测试摘要
export interface TestSummary {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    passRate: string;
    categories: Record<TestCategory, CategorySummary>;
}

// 分类摘要
export interface CategorySummary {
    total: number;
    passed: number;
    failed: number;
}

// 图片识别结果
export interface ImageRecognitionResult {
    fields: RecognizedField[];
    rawText: string;
    confidence: number;
}

// 识别出的字段
export interface RecognizedField {
    name: string;
    type: string;
    value?: string;
    required?: boolean;
    description?: string;
}

