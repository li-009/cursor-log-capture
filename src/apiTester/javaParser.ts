import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint, ApiParameter, ApiField, ApiRequestBody, ParameterConstraints } from './types';

/**
 * Java Controller 解析器
 * 解析 Spring MVC 注解，提取接口信息
 */
export class JavaControllerParser {
    
    /**
     * 解析 Controller 文件
     */
    async parseControllerFile(filePath: string): Promise<ApiEndpoint[]> {
        const content = fs.readFileSync(filePath, 'utf-8');
        return this.parseControllerContent(content, filePath);
    }

    /**
     * 解析 Controller 内容
     */
    parseControllerContent(content: string, filePath: string): ApiEndpoint[] {
        const endpoints: ApiEndpoint[] = [];
        const controllerName = this.extractControllerName(content, filePath);
        const basePath = this.extractBasePath(content);

        // 匹配所有方法
        const methodPattern = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(\([^)]*\))?\s*\n\s*(public\s+\S+\s+(\w+)\s*\([^)]*\))/g;
        
        let match;
        while ((match = methodPattern.exec(content)) !== null) {
            const annotation = match[1];
            const annotationParams = match[2] || '';
            const methodSignature = match[3];
            const methodName = match[4];

            const endpoint = this.parseMethodToEndpoint(
                annotation,
                annotationParams,
                methodSignature,
                methodName,
                controllerName,
                basePath,
                content
            );

            if (endpoint) {
                endpoints.push(endpoint);
            }
        }

        return endpoints;
    }

    /**
     * 提取 Controller 名称
     */
    private extractControllerName(content: string, filePath: string): string {
        const classMatch = content.match(/public\s+class\s+(\w+)/);
        if (classMatch) {
            return classMatch[1];
        }
        return path.basename(filePath, '.java');
    }

    /**
     * 提取基础路径
     */
    private extractBasePath(content: string): string {
        const requestMappingMatch = content.match(/@RequestMapping\s*\(\s*["']([^"']+)["']\s*\)/);
        if (requestMappingMatch) {
            return requestMappingMatch[1];
        }
        
        const valueMatch = content.match(/@RequestMapping\s*\(\s*value\s*=\s*["']([^"']+)["']/);
        if (valueMatch) {
            return valueMatch[1];
        }

        return '';
    }

    /**
     * 解析方法为接口端点
     */
    private parseMethodToEndpoint(
        annotation: string,
        annotationParams: string,
        methodSignature: string,
        methodName: string,
        controllerName: string,
        basePath: string,
        fullContent: string
    ): ApiEndpoint | null {
        
        // 确定 HTTP 方法
        const httpMethod = this.getHttpMethod(annotation, annotationParams);
        
        // 提取路径
        const methodPath = this.extractMethodPath(annotationParams);
        const fullPath = this.combinePath(basePath, methodPath);

        // 解析参数
        const parameters = this.parseParameters(methodSignature, fullContent);
        
        // 解析请求体
        const requestBody = this.parseRequestBody(methodSignature, fullContent);

        // 提取描述（从注释或 @ApiOperation）
        const description = this.extractDescription(methodName, fullContent);

        return {
            method: httpMethod,
            path: fullPath,
            name: methodName,
            description,
            controller: controllerName,
            methodName,
            parameters,
            requestBody,
            responses: [
                { statusCode: 200, description: '成功' },
                { statusCode: 400, description: '参数错误' },
                { statusCode: 500, description: '服务器错误' }
            ]
        };
    }

    /**
     * 获取 HTTP 方法
     */
    private getHttpMethod(annotation: string, params: string): 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' {
        switch (annotation) {
            case 'GetMapping': return 'GET';
            case 'PostMapping': return 'POST';
            case 'PutMapping': return 'PUT';
            case 'DeleteMapping': return 'DELETE';
            case 'PatchMapping': return 'PATCH';
            case 'RequestMapping':
                if (params.includes('POST')) return 'POST';
                if (params.includes('PUT')) return 'PUT';
                if (params.includes('DELETE')) return 'DELETE';
                if (params.includes('PATCH')) return 'PATCH';
                return 'GET';
            default: return 'GET';
        }
    }

    /**
     * 提取方法路径
     */
    private extractMethodPath(annotationParams: string): string {
        if (!annotationParams) return '';
        
        // 匹配 value = "xxx" 或 "xxx"
        const valueMatch = annotationParams.match(/value\s*=\s*["']([^"']+)["']/);
        if (valueMatch) return valueMatch[1];

        const simpleMatch = annotationParams.match(/["']([^"']+)["']/);
        if (simpleMatch) return simpleMatch[1];

        return '';
    }

    /**
     * 组合路径
     */
    private combinePath(basePath: string, methodPath: string): string {
        const base = basePath.startsWith('/') ? basePath : '/' + basePath;
        const method = methodPath.startsWith('/') ? methodPath : '/' + methodPath;
        
        if (base === '/') return method;
        if (method === '/') return base;
        
        return base + method;
    }

    /**
     * 解析参数
     */
    private parseParameters(methodSignature: string, fullContent: string): ApiParameter[] {
        const parameters: ApiParameter[] = [];
        
        // 提取参数列表
        const paramsMatch = methodSignature.match(/\(([^)]*)\)/);
        if (!paramsMatch) return parameters;

        const paramsStr = paramsMatch[1];
        if (!paramsStr.trim()) return parameters;

        // 分割参数
        const paramParts = this.splitParameters(paramsStr);

        for (const paramPart of paramParts) {
            const param = this.parseParameter(paramPart.trim(), fullContent);
            if (param) {
                parameters.push(param);
            }
        }

        return parameters;
    }

    /**
     * 分割参数（处理泛型）
     */
    private splitParameters(paramsStr: string): string[] {
        const result: string[] = [];
        let current = '';
        let depth = 0;

        for (const char of paramsStr) {
            if (char === '<') depth++;
            else if (char === '>') depth--;
            else if (char === ',' && depth === 0) {
                result.push(current);
                current = '';
                continue;
            }
            current += char;
        }

        if (current.trim()) {
            result.push(current);
        }

        return result;
    }

    /**
     * 解析单个参数
     */
    private parseParameter(paramStr: string, fullContent: string): ApiParameter | null {
        // 跳过 HttpServletRequest 等
        if (paramStr.includes('HttpServlet') || paramStr.includes('BindingResult')) {
            return null;
        }

        let inType: 'path' | 'query' | 'header' | 'body' = 'query';
        let required = false;
        let name = '';
        let type = '';

        // 检查注解
        if (paramStr.includes('@PathVariable')) {
            inType = 'path';
            required = true;
            const nameMatch = paramStr.match(/@PathVariable\s*\(\s*["']?(\w+)["']?\s*\)/);
            if (nameMatch) name = nameMatch[1];
        } else if (paramStr.includes('@RequestParam')) {
            inType = 'query';
            const requiredMatch = paramStr.match(/required\s*=\s*(true|false)/);
            required = requiredMatch ? requiredMatch[1] === 'true' : true;
            const nameMatch = paramStr.match(/@RequestParam\s*\(\s*(?:value\s*=\s*)?["']?(\w+)["']?/);
            if (nameMatch) name = nameMatch[1];
        } else if (paramStr.includes('@RequestHeader')) {
            inType = 'header';
            const nameMatch = paramStr.match(/@RequestHeader\s*\(\s*["']?(\w+)["']?\s*\)/);
            if (nameMatch) name = nameMatch[1];
        } else if (paramStr.includes('@RequestBody')) {
            inType = 'body';
            required = true;
        }

        // 提取类型和变量名
        const typeNameMatch = paramStr.match(/(\S+)\s+(\w+)\s*$/);
        if (typeNameMatch) {
            type = typeNameMatch[1].replace(/@\w+(\([^)]*\))?\s*/g, '').trim();
            if (!name) name = typeNameMatch[2];
        }

        if (!name || !type) return null;

        // 提取约束
        const constraints = this.extractConstraints(paramStr, type, fullContent);

        return {
            name,
            type,
            in: inType,
            required,
            constraints
        };
    }

    /**
     * 解析请求体
     */
    private parseRequestBody(methodSignature: string, fullContent: string): ApiRequestBody | undefined {
        if (!methodSignature.includes('@RequestBody')) {
            return undefined;
        }

        // 提取 @RequestBody 后面的类型
        const bodyMatch = methodSignature.match(/@RequestBody\s+(\S+)\s+(\w+)/);
        if (!bodyMatch) return undefined;

        const typeName = bodyMatch[1];
        const fields = this.parseDtoFields(typeName, fullContent);

        return {
            type: typeName,
            contentType: 'application/json',
            fields
        };
    }

    /**
     * 解析 DTO 字段
     */
    private parseDtoFields(typeName: string, fullContent: string): ApiField[] {
        // 这里需要查找对应的 DTO 类文件
        // 简化处理：返回基本信息
        return [];
    }

    /**
     * 提取约束
     */
    private extractConstraints(paramStr: string, type: string, fullContent: string): ParameterConstraints {
        const constraints: ParameterConstraints = {};

        if (paramStr.includes('@NotNull')) constraints.notNull = true;
        if (paramStr.includes('@NotBlank')) constraints.notBlank = true;
        if (paramStr.includes('@NotEmpty')) constraints.notBlank = true;
        if (paramStr.includes('@Email')) constraints.email = true;

        // @Size
        const sizeMatch = paramStr.match(/@Size\s*\(\s*(?:min\s*=\s*(\d+))?\s*,?\s*(?:max\s*=\s*(\d+))?\s*\)/);
        if (sizeMatch) {
            if (sizeMatch[1]) constraints.minLength = parseInt(sizeMatch[1]);
            if (sizeMatch[2]) constraints.maxLength = parseInt(sizeMatch[2]);
        }

        // @Min @Max
        const minMatch = paramStr.match(/@Min\s*\(\s*(\d+)\s*\)/);
        if (minMatch) constraints.min = parseInt(minMatch[1]);

        const maxMatch = paramStr.match(/@Max\s*\(\s*(\d+)\s*\)/);
        if (maxMatch) constraints.max = parseInt(maxMatch[1]);

        // @Pattern
        const patternMatch = paramStr.match(/@Pattern\s*\(\s*regexp\s*=\s*"([^"]+)"/);
        if (patternMatch) constraints.pattern = patternMatch[1];

        return constraints;
    }

    /**
     * 提取描述
     */
    private extractDescription(methodName: string, fullContent: string): string {
        // 查找 @ApiOperation
        const apiOpMatch = fullContent.match(new RegExp(`@ApiOperation\\s*\\(\\s*(?:value\\s*=\\s*)?["']([^"']+)["'][^)]*\\)\\s*[^{]*${methodName}`));
        if (apiOpMatch) return apiOpMatch[1];

        // 查找 JavaDoc
        const javadocMatch = fullContent.match(new RegExp(`/\\*\\*([^*]|\\*[^/])*\\*/\\s*[^{]*${methodName}`));
        if (javadocMatch) {
            const doc = javadocMatch[0];
            const descMatch = doc.match(/\*\s+([^@\n]+)/);
            if (descMatch) return descMatch[1].trim();
        }

        return '';
    }
}

