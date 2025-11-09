# Wolong Productivity Suite

An Electron + React desktop companion for Windows that bundles a fuzzy application launcher, clipboard history manager, and screenshot workflow backed by a Rust native module for high fidelity system access and Realm persistence.

## Features

- **Application Launcher** – scans Start Menu shortcuts and registry uninstall entries, indexes metadata with Realm, and exposes a palette (`Ctrl + Space`) with keyboard navigation.
- **Clipboard History** – listens for text and image updates through the Rust watcher, persists entries, and offers a quick selection window (`Ctrl + Shift + V`) to reapply clipboard content.
- **Screenshot Overlay** – global hotkey (`Ctrl + Shift + S`) captures the active monitor through the native module, shows an overlay for region selection, and sends the cropped image back to the clipboard.
- **Realm-backed Storage** – the Electron main process persists launcher, clipboard, and configuration records to a local Realm database under the user data folder.

## Prerequisites

- Node.js `>=18`
- Rust toolchain (for compiling the N-API module)
- Windows 10/11 with build tools for native compilation

## Getting Started

```bash
npm install
# Build the Rust addon once before starting Electron/React
npm run dev:native

# Start the Vite renderer and Electron main process
npm run dev
```

## Native Module

- Development build: `npm run dev:native`
- Release build (used by packaging): `npm run build:native`

The compiled `.node` binary is copied alongside the Electron build and bundled by `electron-builder`.

## Testing

The project uses [Vitest](https://vitest.dev/) for unit testing of shared helpers.

```bash
npm run test
```

## Building & Packaging

```bash
# Compile the Rust addon, TypeScript, and package with electron-builder
npm run build

# Bundled artifacts are emitted into release/<version>/
```

## Keyboard Shortcuts

| Shortcut            | Action                      |
| ------------------- | --------------------------- |
| `Ctrl + Space`      | Open application launcher   |
| `Ctrl + Shift + V`  | Open clipboard history      |
| `Ctrl + Shift + S`  | Capture screen & select area|

## Project Layout

```
native/core/      Rust N-API module (launcher, clipboard, screenshot)
electron/         Electron main & preload scripts
src/              React renderer (panels, overlay UI)
```

## License

This project is distributed under the MIT license. See `LICENSE` for details.
