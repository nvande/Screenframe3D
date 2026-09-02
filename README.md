# Screenframe3D

**[Live demo](https://nvande.github.io/Screenframe3D/)** — cinematic 3D phones with your screenshot on the glass.

**Screenframe3D** is a lightweight, framework-agnostic JavaScript library that lets you showcase app screenshots inside beautiful, interactive 3D device mockups. Perfect for product landing pages, portfolios, and live demos. Includes scroll-based tilt animation and smart fallbacks for low-end devices.

---

## ✨ Features

- 📱 Pre-installed, optimized 3D device models (e.g. iPhone 14)  
- 🖼️ Replace screen texture with your own screenshot dynamically  
- 🎢 Subtle scroll-based rotation effect  
- ⚡ Automatically falls back to static image on low-spec devices  
- 🔌 Works in any JavaScript environment (Vanilla, React, Vue, etc.)  
- 🧩 Optional React wrapper for easy integration  

---

## 📦 Installation

### Core JS Only (Vanilla)
```bash
npm install screenframe3d three
```

### With React Wrapper
```bash
npm install screenframe3d three react react-dom
```

---

## 🚀 Quick Start

### 🔹 Vanilla JS

```html
<div id="device-container"></div>
<script type="module">
  import { initDeviceShowcase } from 'screenframe3d';

  initDeviceShowcase({
    container: document.getElementById('device-container'),
    screenshot: '/screenshots/app-home.png',
    device: 'iphone14',
    scrollTilt: true
  });
</script>
```

### 🔹 React

```jsx
import DeviceShowcase from 'screenframe3d/react';

<DeviceShowcase
  screenshot="/screenshots/app-home.png"
  device="iphone14"
  scrollTilt={true}
/>
```

---

## ⚙️ Configuration Options

These options can be passed to either `initDeviceShowcase()` or the React component:

| Option              | Type      | Description                                                                 |
|---------------------|-----------|-----------------------------------------------------------------------------|
| `container`         | Element   | DOM element where the 3D canvas will be rendered (JS only)                  |
| `screenshot`        | string    | URL path to the image you want displayed on the device screen               |
| `device`            | string    | Device model name (currently only `'iphone14'`)                             |
| `scrollTilt`        | boolean   | Enables scroll-driven subtle Y-axis rotation                                |
| `fallbackImage`     | string    | Optional fallback image (defaults to `screenshot`)                          |
| `fallbackCondition` | function  | Optional function to determine if fallback mode should be triggered         |

---

## 🖼 Supported Devices

| Device     | Identifier   | Notes            |
|------------|--------------|------------------|
| iPhone 14  | `iphone14`   | Included default |

More devices coming soon.

---

## 📁 Project Structure

```
screenframe3d/
├── public/
│   └── models/
│       └── iphone14.glb
├── src/
│   ├── core/
│   │   ├── initDeviceShowcase.js
│   │   └── utils/
│   ├── react/
│   │   ├── DeviceShowcase.jsx
│   │   └── index.js
│   └── index.js
├── dist/
├── tsup.config.ts
├── package.json
└── README.md
```

---

## 🧪 Development

```bash
npm install
npm run dev      # Start development server or playground
npm run build    # Build core and React bundles
```

---

## 🔌 Framework Integration

You can use `initDeviceShowcase()` in any frontend environment — Vue, Svelte, Angular, etc. Simply pass a DOM element and screenshot URL.

---

## 🚧 Roadmap

- [ ] Add Android, iPad, MacBook, and other models
- [ ] Add screenshot carousels
- [ ] Add drag-to-rotate
- [ ] Add lighting presets and backgrounds
- [ ] Provide standalone script loader for no-build environments

---

## 📄 License

MIT

---

## 🙌 Acknowledgements

- Built with [Three.js](https://threejs.org/)
- GLB loading via `GLTFLoader`
- Inspired by countless product pages with static mockups — now made dynamic

---

## ⭐ Contributing

Pull requests welcome. If you find this project useful, consider giving it a ⭐ on GitHub.
