# Log Capture for AI

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visualstudiocode)](https://code.visualstudio.com/)
[![Cursor](https://img.shields.io/badge/Cursor-Compatible-green)](https://cursor.sh/)
[![Windsurf](https://img.shields.io/badge/Windsurf-Compatible-green)](https://codeium.com/windsurf)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.0.0-blue)](https://github.com/li-009/cursor-log-capture/releases)

🔍 **自动捕获程序运行日志 + API 自动化测试，让 AI 快速了解项目运行时的异常和情况**

> 支持 **Cursor** | **Windsurf** | **VS Code** | **Trae** 等基于 VS Code 的编辑器

---

## 📥 快速安装

### 方法 1：下载 Release（推荐）

1. 前往 [Releases 页面](https://github.com/li-009/cursor-log-capture/releases)
2. 下载最新的 `cursor-log-capture-x.x.x.vsix` 文件
3. 在 Cursor/Windsurf/VS Code 中：
   - 按 `Ctrl+Shift+P`
   - 输入 `Install from VSIX`
   - 选择下载的 `.vsix` 文件

### 方法 2：从源码构建

```bash
git clone https://github.com/li-009/cursor-log-capture.git
cd cursor-log-capture
npm install
npm run compile
npx vsce package --allow-missing-repository
```

然后安装生成的 `.vsix` 文件。

---

## 🎯 特别适用于

- 在 **IntelliJ IDEA** 中运行程序，使用 **Cursor/Windsurf** 分析日志
- 需要让 AI 快速理解程序运行状态和错误信息
- 跨编辑器的日志共享和分析
- **自动测试 Java API 接口**（v2.0 新增）

## 功能特点

- ✅ **自动捕获** - 自动捕获终端输出和程序日志
- ✅ **智能识别** - 自动识别错误、异常、警告
- ✅ **持久存储** - 日志保存到文件，随时可查
- ✅ **一键复制** - 快速复制日志给 AI 分析
- ✅ **侧边栏视图** - 可视化查看所有日志

## 安装

### 方法 1: 安装 .vsix 文件（推荐）

**适用于 Cursor / Windsurf / VS Code：**

1. 按 `Ctrl+Shift+P`（Mac: `Cmd+Shift+P`）
2. 输入 **"Install from VSIX"**
3. 选择 `cursor-log-capture-1.0.1.vsix` 文件
4. 重新加载编辑器

### 方法 2: 从源码构建

```bash
# 克隆或进入项目目录
cd cursor-log-capture

# 安装依赖
npm install

# 编译
npm run compile

# 打包成 .vsix
npx vsce package --allow-missing-repository
```

### 方法 3: 开发模式

1. 在编辑器中打开此项目
2. 按 `F5` 启动扩展开发主机

### 各编辑器扩展目录

| 编辑器 | Windows 扩展目录 |
|--------|------------------|
| Cursor | `%USERPROFILE%\.cursor\extensions\` |
| Windsurf | `%USERPROFILE%\.windsurf\extensions\` |
| VS Code | `%USERPROFILE%\.vscode\extensions\` |

## 🆕 v2.0 新功能：API 自动化测试

### API 测试命令

按 `Ctrl+Shift+P` 并输入 "API Tester"：

| 命令 | 说明 |
|------|------|
| `API Tester: ⚙️ 配置测试环境` | 设置 baseUrl、Token |
| `API Tester: 🧪 测试当前Controller` | 测试当前文件所有接口 |
| `API Tester: 🎯 测试选中的接口` | 测试单个接口 |
| `API Tester: ⚡ 快速测试` | 只测试功能正确性 |
| `API Tester: 📊 查看测试报告` | 查看历史测试报告 |

### 测试类型

| 类型 | 说明 |
|------|------|
| ✅ 功能测试 | 正常参数调用 |
| 📋 参数校验 | 必填、类型、格式验证 |
| ⚠️ 边界测试 | 最大/最小值、空值、超长字符串 |
| 💥 异常测试 | SQL注入、XSS、特殊字符 |
| 🔄 并发测试 | 多线程同时请求 |
| ⚡ 性能测试 | 响应时间统计 |

### 测试报告

报告保存到 `.cursor-logs/test/` 目录：

```
.cursor-logs/test/report_xxx/
├── report.md          # 主报告
├── report.json        # JSON 格式
├── detailed-logs.md   # 详细日志
├── failed-cases.md    # 失败分析
└── sql-queries.md     # SQL 查询记录
```

---

## 使用方法

### 日志捕获命令

按 `Ctrl+Shift+P` 并输入 "Log Capture"：

| 命令 | 说明 |
|------|------|
| `Log Capture: 开始捕获日志` | 开始捕获终端输出 |
| `Log Capture: 停止捕获日志` | 停止捕获 |
| `Log Capture: 查看日志` | 在编辑器中查看所有日志 |
| `Log Capture: 只看错误日志` | 只查看错误和异常 |
| `Log Capture: 复制日志到剪贴板` | 复制所有日志，可粘贴给 AI |
| `Log Capture: 复制错误日志到剪贴板` | 只复制错误日志给 AI |
| `Log Capture: 清空日志` | 清空所有捕获的日志 |
| `Log Capture: 监控IDEA日志文件` | 监控 IntelliJ IDEA 日志 |
| `Log Capture: 从剪贴板导入日志` | 从 IDEA 复制日志导入 |

### 侧边栏

点击活动栏的 "运行日志" 图标，可以：
- 查看错误列表
- 查看警告列表
- 查看最近日志
- 一键复制给 AI

### 配合 AI 使用

1. 运行你的程序
2. 当出现问题时，执行 `Log Capture: 复制错误日志到剪贴板`
3. 在 AI 对话中粘贴日志
4. AI 就能了解运行时的情况并帮助你调试！

## 配置选项

在 Settings 中搜索 "Log Capture"：

```json
{
  // 最大保存日志行数
  "logCapture.maxLogLines": 1000,
  
  // 启动时自动开始捕获
  "logCapture.autoCapture": true,
  
  // 日志文件保存路径（相对于工作区）
  "logCapture.logFilePath": ".cursor-logs/runtime.log",
  
  // 需要特别标记的关键词
  "logCapture.capturePatterns": ["error", "exception", "warn", "fail", "crash"]
}
```

## 日志文件位置

日志自动保存到工作区的 `.cursor-logs/` 目录：

```
.cursor-logs/
├── runtime.log        # 所有日志
└── runtime.errors.log # 只有错误
```

建议将 `.cursor-logs/` 添加到 `.gitignore`。

## 最佳实践

### 1. 让程序输出结构化日志

```python
# Python 示例
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("Server started")
logger.error("Database connection failed", exc_info=True)
```

```javascript
// JavaScript 示例
console.error('[ERROR] Failed to connect:', error.message);
console.warn('[WARN] Deprecated API usage');
```

### 2. 运行前开始捕获

在运行程序之前，确保日志捕获已开始（默认自动开始）。

### 3. 出问题时快速复制

遇到问题 → `Ctrl+Shift+P` → "复制错误日志" → 粘贴给 AI

## 技术实现

- 使用 VS Code Extension API 监听终端事件
- 通过文件系统监控日志文件变化
- 使用正则表达式识别错误模式
- 支持 JavaScript、Python、Java 等多种语言的堆栈跟踪

## 限制

- VS Code 的终端 API 有限，无法直接获取所有输出
- 某些程序可能需要配置日志输出到文件
- Windows 和 Unix 系统的实现方式略有不同

## License

MIT

