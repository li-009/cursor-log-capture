import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 运行时上下文收集器
 * 收集程序运行时的完整上下文信息
 */
export interface RuntimeContext {
    // 启动信息
    command: string;
    args: string[];
    cwd: string;
    startTime: string;
    
    // 环境信息
    env: Record<string, string>;
    nodeVersion?: string;
    pythonVersion?: string;
    
    // 项目信息
    projectName: string;
    packageJson?: any;
    dependencies?: Record<string, string>;
    
    // 配置文件
    configFiles: ConfigFile[];
    
    // 运行日志
    logs: string[];
    errors: string[];
}

export interface ConfigFile {
    name: string;
    path: string;
    content: string;
}

export class RuntimeContextCollector {
    private context: Partial<RuntimeContext> = {};
    private workspaceRoot: string;

    constructor() {
        const folders = vscode.workspace.workspaceFolders;
        this.workspaceRoot = folders ? folders[0].uri.fsPath : '';
    }

    /**
     * 收集完整的运行时上下文
     */
    async collectFullContext(): Promise<RuntimeContext> {
        await Promise.all([
            this.collectProjectInfo(),
            this.collectConfigFiles(),
            this.collectEnvironment()
        ]);

        return this.context as RuntimeContext;
    }

    /**
     * 记录启动命令
     */
    recordCommand(command: string, args: string[] = []): void {
        this.context.command = command;
        this.context.args = args;
        this.context.cwd = this.workspaceRoot;
        this.context.startTime = new Date().toISOString();
    }

    /**
     * 收集项目信息
     */
    private async collectProjectInfo(): Promise<void> {
        try {
            // 读取 package.json
            const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const content = fs.readFileSync(packageJsonPath, 'utf-8');
                const pkg = JSON.parse(content);
                this.context.projectName = pkg.name || 'unknown';
                this.context.packageJson = pkg;
                this.context.dependencies = {
                    ...pkg.dependencies,
                    ...pkg.devDependencies
                };
            }

            // 读取 requirements.txt (Python)
            const requirementsPath = path.join(this.workspaceRoot, 'requirements.txt');
            if (fs.existsSync(requirementsPath)) {
                const content = fs.readFileSync(requirementsPath, 'utf-8');
                this.context.dependencies = this.context.dependencies || {};
                content.split('\n').forEach(line => {
                    const match = line.match(/^([a-zA-Z0-9_-]+)==?(.*)$/);
                    if (match) {
                        this.context.dependencies![match[1]] = match[2] || '*';
                    }
                });
            }

            // 读取 pom.xml (Java/Maven)
            const pomPath = path.join(this.workspaceRoot, 'pom.xml');
            if (fs.existsSync(pomPath)) {
                this.context.projectName = this.context.projectName || 'maven-project';
            }

        } catch (error) {
            console.error('收集项目信息失败:', error);
        }
    }

    /**
     * 收集配置文件
     */
    private async collectConfigFiles(): Promise<void> {
        const configPatterns = [
            '.env',
            '.env.local',
            '.env.development',
            'config.json',
            'config.yaml',
            'config.yml',
            'application.properties',
            'application.yml',
            'settings.json',
            'tsconfig.json',
            'vite.config.ts',
            'vite.config.js',
            'webpack.config.js',
            'next.config.js',
            'nuxt.config.ts'
        ];

        this.context.configFiles = [];

        for (const pattern of configPatterns) {
            const filePath = path.join(this.workspaceRoot, pattern);
            if (fs.existsSync(filePath)) {
                try {
                    let content = fs.readFileSync(filePath, 'utf-8');
                    
                    // 隐藏敏感信息
                    content = this.maskSensitiveData(content);
                    
                    this.context.configFiles.push({
                        name: pattern,
                        path: filePath,
                        content: content.substring(0, 2000) // 限制长度
                    });
                } catch (error) {
                    // 忽略读取错误
                }
            }
        }
    }

    /**
     * 收集环境信息
     */
    private async collectEnvironment(): Promise<void> {
        // 收集安全的环境变量（排除敏感信息）
        const safeEnvKeys = [
            'NODE_ENV',
            'NODE_VERSION',
            'PATH',
            'LANG',
            'SHELL',
            'TERM',
            'USER',
            'HOME',
            'PWD',
            'JAVA_HOME',
            'PYTHON',
            'PYTHONPATH',
            'GOPATH',
            'GOROOT'
        ];

        this.context.env = {};
        for (const key of safeEnvKeys) {
            if (process.env[key]) {
                this.context.env[key] = process.env[key]!;
            }
        }

        // 获取 Node 版本
        this.context.nodeVersion = process.version;
    }

    /**
     * 隐藏敏感数据
     */
    private maskSensitiveData(content: string): string {
        // 隐藏常见的敏感字段
        const patterns = [
            /("?password"?\s*[:=]\s*)"[^"]*"/gi,
            /("?secret"?\s*[:=]\s*)"[^"]*"/gi,
            /("?api_?key"?\s*[:=]\s*)"[^"]*"/gi,
            /("?token"?\s*[:=]\s*)"[^"]*"/gi,
            /("?private_?key"?\s*[:=]\s*)"[^"]*"/gi,
            /(PASSWORD\s*=\s*).*/gi,
            /(SECRET\s*=\s*).*/gi,
            /(API_KEY\s*=\s*).*/gi,
            /(TOKEN\s*=\s*).*/gi,
        ];

        let masked = content;
        for (const pattern of patterns) {
            masked = masked.replace(pattern, '$1"[MASKED]"');
        }

        return masked;
    }

    /**
     * 添加日志
     */
    addLog(log: string): void {
        if (!this.context.logs) {
            this.context.logs = [];
        }
        this.context.logs.push(log);
        
        // 限制日志数量
        if (this.context.logs.length > 500) {
            this.context.logs = this.context.logs.slice(-500);
        }
    }

    /**
     * 添加错误
     */
    addError(error: string): void {
        if (!this.context.errors) {
            this.context.errors = [];
        }
        this.context.errors.push(error);
    }

    /**
     * 格式化为 AI 可读的文本
     */
    formatForAI(): string {
        const ctx = this.context;
        let output = '=== 程序运行时上下文 ===\n\n';

        // 启动信息
        if (ctx.command) {
            output += '## 🚀 启动命令\n';
            output += '```bash\n';
            output += `${ctx.command} ${(ctx.args || []).join(' ')}\n`;
            output += '```\n';
            output += `工作目录: ${ctx.cwd}\n`;
            output += `启动时间: ${ctx.startTime}\n\n`;
        }

        // 项目信息
        if (ctx.projectName) {
            output += '## 📦 项目信息\n';
            output += `项目名称: ${ctx.projectName}\n`;
            if (ctx.nodeVersion) {
                output += `Node版本: ${ctx.nodeVersion}\n`;
            }
            output += '\n';
        }

        // 依赖
        if (ctx.dependencies && Object.keys(ctx.dependencies).length > 0) {
            output += '## 📚 主要依赖\n';
            output += '```\n';
            const deps = Object.entries(ctx.dependencies).slice(0, 20);
            deps.forEach(([name, version]) => {
                output += `${name}: ${version}\n`;
            });
            if (Object.keys(ctx.dependencies).length > 20) {
                output += `... 还有 ${Object.keys(ctx.dependencies).length - 20} 个依赖\n`;
            }
            output += '```\n\n';
        }

        // 配置文件
        if (ctx.configFiles && ctx.configFiles.length > 0) {
            output += '## ⚙️ 配置文件\n';
            ctx.configFiles.forEach(file => {
                output += `\n### ${file.name}\n`;
                output += '```\n';
                output += file.content.substring(0, 500);
                if (file.content.length > 500) {
                    output += '\n... (截断)\n';
                }
                output += '```\n';
            });
            output += '\n';
        }

        // 环境变量
        if (ctx.env && Object.keys(ctx.env).length > 0) {
            output += '## 🌍 环境变量\n';
            output += '```\n';
            Object.entries(ctx.env).forEach(([key, value]) => {
                // 截断过长的值
                const displayValue = value.length > 100 ? value.substring(0, 100) + '...' : value;
                output += `${key}=${displayValue}\n`;
            });
            output += '```\n\n';
        }

        // 错误日志
        if (ctx.errors && ctx.errors.length > 0) {
            output += '## ❌ 错误日志\n';
            output += '```\n';
            ctx.errors.slice(-20).forEach(err => {
                output += `${err}\n`;
            });
            output += '```\n\n';
        }

        // 最近日志
        if (ctx.logs && ctx.logs.length > 0) {
            output += '## 📝 最近日志 (最后50条)\n';
            output += '```\n';
            ctx.logs.slice(-50).forEach(log => {
                output += `${log}\n`;
            });
            output += '```\n';
        }

        return output;
    }

    /**
     * 保存上下文到文件
     */
    saveToFile(): void {
        if (!this.workspaceRoot) return;

        const contextDir = path.join(this.workspaceRoot, '.cursor-logs');
        if (!fs.existsSync(contextDir)) {
            fs.mkdirSync(contextDir, { recursive: true });
        }

        // 保存 JSON 格式
        const jsonPath = path.join(contextDir, 'runtime-context.json');
        fs.writeFileSync(jsonPath, JSON.stringify(this.context, null, 2), 'utf-8');

        // 保存 AI 可读格式
        const textPath = path.join(contextDir, 'runtime-context.md');
        fs.writeFileSync(textPath, this.formatForAI(), 'utf-8');
    }
}

