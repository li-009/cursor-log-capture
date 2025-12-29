# Log Capture for AI

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visualstudiocode)](https://code.visualstudio.com/)
[![Cursor](https://img.shields.io/badge/Cursor-Compatible-green)](https://cursor.sh/)
[![Windsurf](https://img.shields.io/badge/Windsurf-Compatible-green)](https://codeium.com/windsurf)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🔍 **自动捕获程序运行日志，让 AI 快速了解项目运行时的异常和情况**

> 支持 **Cursor** | **Windsurf** | **VS Code** | **Trae** 等基于 VS Code 的编辑器

## 🎯 特别适用于

- 在 **IntelliJ IDEA** 中运行程序，使用 **Cursor/Windsurf** 分析日志
- 需要让 AI 快速理解程序运行状态和错误信息
- 跨编辑器的日志共享和分析

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

## 使用方法

### 命令面板

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

