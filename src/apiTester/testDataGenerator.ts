import { 
    ApiEndpoint, 
    ApiParameter, 
    ApiField, 
    TestCase, 
    TestCategory, 
    TestInput,
    ParameterConstraints 
} from './types';

/**
 * 测试数据生成器
 * 根据接口定义自动生成各种测试数据
 */
export class TestDataGenerator {
    
    /**
     * 为接口生成完整的测试用例
     */
    generateTestCases(endpoint: ApiEndpoint): TestCase[] {
        const testCases: TestCase[] = [];

        // 1. 功能测试 - 正常数据
        testCases.push(...this.generateFunctionalTests(endpoint));

        // 2. 参数校验测试
        testCases.push(...this.generateValidationTests(endpoint));

        // 3. 边界测试
        testCases.push(...this.generateBoundaryTests(endpoint));

        // 4. 异常测试
        testCases.push(...this.generateExceptionTests(endpoint));

        return testCases;
    }

    /**
     * 生成功能测试用例
     */
    private generateFunctionalTests(endpoint: ApiEndpoint): TestCase[] {
        const testCases: TestCase[] = [];

        // 正常请求测试
        testCases.push({
            id: `${endpoint.methodName}_functional_normal`,
            name: `${endpoint.name} - 正常请求`,
            description: '使用有效参数调用接口，验证正常返回',
            endpoint,
            category: 'functional',
            input: this.generateNormalInput(endpoint),
            expected: {
                statusCode: 200,
                responseTime: 3000
            }
        });

        return testCases;
    }

    /**
     * 生成参数校验测试用例
     */
    private generateValidationTests(endpoint: ApiEndpoint): TestCase[] {
        const testCases: TestCase[] = [];
        const allParams = [...endpoint.parameters];
        
        if (endpoint.requestBody) {
            // 添加请求体字段作为参数
            for (const field of endpoint.requestBody.fields) {
                allParams.push({
                    name: field.name,
                    type: field.type,
                    in: 'body',
                    required: field.required,
                    constraints: field.constraints
                });
            }
        }

        for (const param of allParams) {
            // 必填参数缺失测试
            if (param.required) {
                testCases.push({
                    id: `${endpoint.methodName}_validation_missing_${param.name}`,
                    name: `${endpoint.name} - 缺少必填参数 ${param.name}`,
                    description: `不传递必填参数 ${param.name}，验证返回错误`,
                    endpoint,
                    category: 'validation',
                    input: this.generateInputWithoutParam(endpoint, param.name),
                    expected: {
                        statusCodes: [400, 422],
                        responseContains: [param.name]
                    }
                });
            }

            // 类型错误测试
            testCases.push({
                id: `${endpoint.methodName}_validation_type_${param.name}`,
                name: `${endpoint.name} - 参数类型错误 ${param.name}`,
                description: `传递错误类型的 ${param.name}，验证返回错误`,
                endpoint,
                category: 'validation',
                input: this.generateInputWithWrongType(endpoint, param),
                expected: {
                    statusCodes: [400, 422]
                }
            });

            // 约束验证测试
            if (param.constraints) {
                testCases.push(...this.generateConstraintTests(endpoint, param));
            }
        }

        return testCases;
    }

    /**
     * 生成边界测试用例
     */
    private generateBoundaryTests(endpoint: ApiEndpoint): TestCase[] {
        const testCases: TestCase[] = [];

        for (const param of endpoint.parameters) {
            const constraints = param.constraints || {};

            // 最小值边界
            if (constraints.min !== undefined) {
                // 最小值
                testCases.push({
                    id: `${endpoint.methodName}_boundary_min_${param.name}`,
                    name: `${endpoint.name} - ${param.name} 最小值`,
                    description: `使用最小值 ${constraints.min}`,
                    endpoint,
                    category: 'boundary',
                    input: this.generateInputWithValue(endpoint, param.name, constraints.min),
                    expected: { statusCode: 200 }
                });

                // 小于最小值
                testCases.push({
                    id: `${endpoint.methodName}_boundary_below_min_${param.name}`,
                    name: `${endpoint.name} - ${param.name} 小于最小值`,
                    description: `使用小于最小值 ${constraints.min - 1}`,
                    endpoint,
                    category: 'boundary',
                    input: this.generateInputWithValue(endpoint, param.name, constraints.min - 1),
                    expected: { statusCodes: [400, 422] }
                });
            }

            // 最大值边界
            if (constraints.max !== undefined) {
                // 最大值
                testCases.push({
                    id: `${endpoint.methodName}_boundary_max_${param.name}`,
                    name: `${endpoint.name} - ${param.name} 最大值`,
                    description: `使用最大值 ${constraints.max}`,
                    endpoint,
                    category: 'boundary',
                    input: this.generateInputWithValue(endpoint, param.name, constraints.max),
                    expected: { statusCode: 200 }
                });

                // 大于最大值
                testCases.push({
                    id: `${endpoint.methodName}_boundary_above_max_${param.name}`,
                    name: `${endpoint.name} - ${param.name} 大于最大值`,
                    description: `使用大于最大值 ${constraints.max + 1}`,
                    endpoint,
                    category: 'boundary',
                    input: this.generateInputWithValue(endpoint, param.name, constraints.max + 1),
                    expected: { statusCodes: [400, 422] }
                });
            }

            // 字符串长度边界
            if (constraints.maxLength !== undefined) {
                // 超长字符串
                testCases.push({
                    id: `${endpoint.methodName}_boundary_overlength_${param.name}`,
                    name: `${endpoint.name} - ${param.name} 超长字符串`,
                    description: `使用超过最大长度的字符串`,
                    endpoint,
                    category: 'boundary',
                    input: this.generateInputWithValue(endpoint, param.name, 'a'.repeat(constraints.maxLength + 10)),
                    expected: { statusCodes: [400, 422] }
                });
            }

            // 空字符串测试
            if (param.type === 'String') {
                testCases.push({
                    id: `${endpoint.methodName}_boundary_empty_${param.name}`,
                    name: `${endpoint.name} - ${param.name} 空字符串`,
                    description: `传递空字符串`,
                    endpoint,
                    category: 'boundary',
                    input: this.generateInputWithValue(endpoint, param.name, ''),
                    expected: { 
                        statusCodes: constraints.notBlank ? [400, 422] : [200] 
                    }
                });
            }
        }

        return testCases;
    }

    /**
     * 生成异常测试用例
     */
    private generateExceptionTests(endpoint: ApiEndpoint): TestCase[] {
        const testCases: TestCase[] = [];

        // SQL 注入测试
        testCases.push({
            id: `${endpoint.methodName}_exception_sql_injection`,
            name: `${endpoint.name} - SQL 注入测试`,
            description: '测试接口对 SQL 注入的防护',
            endpoint,
            category: 'exception',
            input: this.generateSqlInjectionInput(endpoint),
            expected: {
                statusCodes: [200, 400], // 应该正常处理或拒绝
                responseNotContains: ['sql', 'syntax', 'mysql', 'database error']
            }
        });

        // XSS 测试
        testCases.push({
            id: `${endpoint.methodName}_exception_xss`,
            name: `${endpoint.name} - XSS 攻击测试`,
            description: '测试接口对 XSS 攻击的防护',
            endpoint,
            category: 'exception',
            input: this.generateXssInput(endpoint),
            expected: {
                statusCodes: [200, 400],
                responseNotContains: ['<script>']
            }
        });

        // 特殊字符测试
        testCases.push({
            id: `${endpoint.methodName}_exception_special_chars`,
            name: `${endpoint.name} - 特殊字符测试`,
            description: '测试接口对特殊字符的处理',
            endpoint,
            category: 'exception',
            input: this.generateSpecialCharsInput(endpoint),
            expected: {
                statusCodes: [200, 400]
            }
        });

        return testCases;
    }

    /**
     * 生成约束验证测试
     */
    private generateConstraintTests(endpoint: ApiEndpoint, param: ApiParameter): TestCase[] {
        const testCases: TestCase[] = [];
        const constraints = param.constraints!;

        // 邮箱格式验证
        if (constraints.email) {
            testCases.push({
                id: `${endpoint.methodName}_constraint_invalid_email_${param.name}`,
                name: `${endpoint.name} - ${param.name} 无效邮箱`,
                description: '传递无效的邮箱格式',
                endpoint,
                category: 'validation',
                input: this.generateInputWithValue(endpoint, param.name, 'invalid-email'),
                expected: { statusCodes: [400, 422] }
            });
        }

        // 正则表达式验证
        if (constraints.pattern) {
            testCases.push({
                id: `${endpoint.methodName}_constraint_pattern_${param.name}`,
                name: `${endpoint.name} - ${param.name} 格式不匹配`,
                description: `不匹配正则: ${constraints.pattern}`,
                endpoint,
                category: 'validation',
                input: this.generateInputWithValue(endpoint, param.name, '!!!invalid!!!'),
                expected: { statusCodes: [400, 422] }
            });
        }

        return testCases;
    }

    /**
     * 生成正常输入
     */
    private generateNormalInput(endpoint: ApiEndpoint): TestInput {
        const input: TestInput = {};

        for (const param of endpoint.parameters) {
            const value = this.generateValueForType(param.type, param.constraints);
            
            switch (param.in) {
                case 'path':
                    input.pathParams = input.pathParams || {};
                    input.pathParams[param.name] = value;
                    break;
                case 'query':
                    input.queryParams = input.queryParams || {};
                    input.queryParams[param.name] = value;
                    break;
                case 'header':
                    input.headers = input.headers || {};
                    input.headers[param.name] = String(value);
                    break;
            }
        }

        if (endpoint.requestBody) {
            input.body = this.generateBodyFromFields(endpoint.requestBody.fields);
        }

        return input;
    }

    /**
     * 根据类型生成值
     */
    generateValueForType(type: string, constraints?: ParameterConstraints): any {
        const c = constraints || {};

        switch (type.toLowerCase()) {
            case 'string':
                if (c.email) return 'test@example.com';
                if (c.phone) return '13800138000';
                if (c.pattern) return 'test123';
                const maxLen = c.maxLength || 20;
                return 'test_' + Math.random().toString(36).substring(2, Math.min(maxLen, 10));

            case 'int':
            case 'integer':
            case 'long':
                const min = c.min || 1;
                const max = c.max || 100;
                return Math.floor(Math.random() * (max - min + 1)) + min;

            case 'double':
            case 'float':
            case 'bigdecimal':
                return parseFloat((Math.random() * 100).toFixed(2));

            case 'boolean':
                return true;

            case 'date':
            case 'localdate':
                return new Date().toISOString().split('T')[0];

            case 'datetime':
            case 'localdatetime':
                return new Date().toISOString();

            case 'list':
            case 'array':
                return [];

            case 'map':
            case 'object':
                return {};

            default:
                return 'test_value';
        }
    }

    /**
     * 生成请求体
     */
    private generateBodyFromFields(fields: ApiField[]): any {
        const body: any = {};
        for (const field of fields) {
            if (field.children && field.children.length > 0) {
                body[field.name] = this.generateBodyFromFields(field.children);
            } else {
                body[field.name] = this.generateValueForType(field.type, field.constraints);
            }
        }
        return body;
    }

    /**
     * 生成缺少某个参数的输入
     */
    private generateInputWithoutParam(endpoint: ApiEndpoint, excludeParam: string): TestInput {
        const input = this.generateNormalInput(endpoint);
        
        if (input.pathParams) delete input.pathParams[excludeParam];
        if (input.queryParams) delete input.queryParams[excludeParam];
        if (input.headers) delete input.headers[excludeParam];
        if (input.body && typeof input.body === 'object') {
            delete input.body[excludeParam];
        }

        return input;
    }

    /**
     * 生成错误类型的输入
     */
    private generateInputWithWrongType(endpoint: ApiEndpoint, param: ApiParameter): TestInput {
        const input = this.generateNormalInput(endpoint);
        
        let wrongValue: any;
        switch (param.type.toLowerCase()) {
            case 'int':
            case 'integer':
            case 'long':
                wrongValue = 'not_a_number';
                break;
            case 'boolean':
                wrongValue = 'not_a_boolean';
                break;
            case 'date':
            case 'localdate':
                wrongValue = 'invalid-date';
                break;
            default:
                wrongValue = { invalid: 'object' };
        }

        return this.generateInputWithValue(endpoint, param.name, wrongValue);
    }

    /**
     * 生成指定值的输入
     */
    private generateInputWithValue(endpoint: ApiEndpoint, paramName: string, value: any): TestInput {
        const input = this.generateNormalInput(endpoint);

        // 查找参数类型
        const param = endpoint.parameters.find(p => p.name === paramName);
        if (param) {
            switch (param.in) {
                case 'path':
                    input.pathParams = input.pathParams || {};
                    input.pathParams[paramName] = value;
                    break;
                case 'query':
                    input.queryParams = input.queryParams || {};
                    input.queryParams[paramName] = value;
                    break;
                case 'header':
                    input.headers = input.headers || {};
                    input.headers[paramName] = String(value);
                    break;
            }
        }

        // 也检查请求体
        if (input.body && typeof input.body === 'object') {
            if (paramName in input.body || endpoint.requestBody?.fields.some(f => f.name === paramName)) {
                input.body[paramName] = value;
            }
        }

        return input;
    }

    /**
     * 生成 SQL 注入测试输入
     */
    private generateSqlInjectionInput(endpoint: ApiEndpoint): TestInput {
        const input = this.generateNormalInput(endpoint);
        const sqlPayloads = [
            "'; DROP TABLE users; --",
            "1 OR 1=1",
            "1; SELECT * FROM users",
            "' UNION SELECT * FROM users --"
        ];

        const payload = sqlPayloads[Math.floor(Math.random() * sqlPayloads.length)];

        // 对第一个字符串参数注入
        for (const param of endpoint.parameters) {
            if (param.type.toLowerCase() === 'string') {
                return this.generateInputWithValue(endpoint, param.name, payload);
            }
        }

        return input;
    }

    /**
     * 生成 XSS 测试输入
     */
    private generateXssInput(endpoint: ApiEndpoint): TestInput {
        const input = this.generateNormalInput(endpoint);
        const xssPayloads = [
            '<script>alert("xss")</script>',
            '<img src=x onerror=alert("xss")>',
            '"><script>alert("xss")</script>',
            "javascript:alert('xss')"
        ];

        const payload = xssPayloads[Math.floor(Math.random() * xssPayloads.length)];

        for (const param of endpoint.parameters) {
            if (param.type.toLowerCase() === 'string') {
                return this.generateInputWithValue(endpoint, param.name, payload);
            }
        }

        return input;
    }

    /**
     * 生成特殊字符测试输入
     */
    private generateSpecialCharsInput(endpoint: ApiEndpoint): TestInput {
        const input = this.generateNormalInput(endpoint);
        const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';

        for (const param of endpoint.parameters) {
            if (param.type.toLowerCase() === 'string') {
                return this.generateInputWithValue(endpoint, param.name, specialChars);
            }
        }

        return input;
    }
}

