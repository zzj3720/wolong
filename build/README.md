# 图标文件说明

图标文件已自动生成！使用 `pnpm run build:icons` 可以重新生成。

## 已生成的图标文件

- **icon.png** (512x512) - Linux 和通用图标
- **icon.ico** (多尺寸) - Windows 图标，包含 16x16, 32x32, 64x64, 128x128, 256x256 多个尺寸

## 重新生成图标

如果需要重新生成图标（例如修改了 SVG 源文件），运行：

```bash
pnpm run build:icons
```

或者直接运行脚本：

```bash
node scripts/generate-icons.mjs
```

## macOS 图标

macOS 的 `.icns` 文件会在构建时由 electron-builder 自动从 `icon.png` 生成，无需手动创建。

## 文件位置

所有图标文件位于 `build/` 目录下：
- `build/icon.png` - Linux 和通用图标
- `build/icon.ico` - Windows 图标

