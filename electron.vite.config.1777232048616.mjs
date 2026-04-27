// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
var __electron_vite_injected_dirname = "C:\\Users\\arman\\OneDrive\\Bureau\\Projet\\Sites1CC\\1CCOverlay";
var r = (...args) => resolve(__electron_vite_injected_dirname, ...args);
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: r("src/main/main.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: r("src/main/preload.ts")
        }
      }
    }
  },
  renderer: {
    root: r("src/renderer"),
    plugins: [vue()],
    resolve: {
      alias: {
        "@shared": r("src/shared"),
        "@renderer": r("src/renderer")
      }
    },
    server: {
      proxy: {
        "/compagnon": { target: "https://www.preprod.1ercorpscolonial.fr", changeOrigin: true, secure: true },
        "/starmap": { target: "https://www.preprod.1ercorpscolonial.fr", changeOrigin: true, secure: true },
        "/market": { target: "https://www.preprod.1ercorpscolonial.fr", changeOrigin: true, secure: true }
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: r("src/renderer/index.html")
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
