# 卧龙

未来将基于大模型成为你使用电脑时的智能军师，帮助你更高效地使用电脑。

目前卧龙已实现基本功能，让你可以快速启动应用、管理剪贴板历史和便捷截图。

> **注意**：卧龙目前仅支持 Windows 系统，且界面和文档仅提供中文版本。

> **重要说明**：本项目不会有任何一行代码是手写的，将全部由 AI 编写。

## 当前功能

- **应用启动器** – 快速启动已安装的应用，支持模糊搜索，通过 `Alt + Space` 随时呼出。
- **剪贴板历史** – 自动记录剪贴板内容，支持文本和图片，通过 `Ctrl + Shift + V` 快速查看和复用历史记录。
- **截图工具** – 一键截图并选择区域，截图后自动复制到剪贴板，快捷键 `Ctrl + Shift + S`。

## 未来愿景

卧龙将基于大模型技术，成为你使用电脑时的智能军师，提供更智能的决策建议和操作辅助。

## 系统要求

- **操作系统**：Windows 10/11（仅支持 Windows）
- **语言**：中文（界面和文档仅提供中文版本）

## 前置要求

- Node.js `>=18`
- Rust 工具链（用于编译 N-API 模块）
- Windows 构建工具（用于原生编译）

## 快速开始

```bash
npm install
# 在启动 Electron/React 之前先构建一次 Rust 插件
npm run dev:native

# 启动 Vite 渲染器和 Electron 主进程
npm run dev
```

## 原生模块

- 开发构建：`npm run dev:native`
- 发布构建（用于打包）：`npm run build:native`

编译后的 `.node` 二进制文件会与 Electron 构建一起复制，并由 `electron-builder` 打包。

## 测试

项目使用 [Vitest](https://vitest.dev/) 进行共享辅助函数的单元测试。

```bash
npm run test
```

## 构建与打包

```bash
# 编译 Rust 插件、TypeScript，并使用 electron-builder 打包
npm run build

# 打包产物会输出到 release/<version>/ 目录
```

## 键盘快捷键

| 快捷键            | 操作                      |
| ------------------- | --------------------------- |
| `Alt + Space`       | 打开应用启动器   |
| `Ctrl + Shift + V`  | 打开剪贴板历史      |
| `Ctrl + Shift + S`  | 捕获屏幕并选择区域|

> 在 `设置 → 全局快捷键` 中可以自定义上述组合键，保存后主进程会立即应用。若需要恢复出厂配置，可一键恢复默认值。

## 技术架构

卧龙基于 Electron + React 构建，使用 Rust 原生模块提供系统级功能，并通过 Realm 进行数据持久化。

### 项目结构

```
native/core/      Rust N-API 模块（启动器、剪贴板、截图）
electron/         Electron 主进程和预加载脚本
src/              React 渲染器（面板、覆盖层 UI）
```

## 许可证

本项目采用 MIT 许可证分发。详情请参阅 `LICENSE` 文件。
