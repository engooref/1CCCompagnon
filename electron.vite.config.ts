import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

const r = (...args: string[]) => resolve(__dirname, ...args)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: r('src/main/main.ts')
        }
      }
    }
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: r('src/main/preload.ts')
        }
      }
    }
  },

  renderer: {
    root: r('src/renderer'),
    plugins: [vue()],
    resolve: {
      alias: {
        '@shared': r('src/shared'),
        '@renderer': r('src/renderer'),
      }
    },
    server: {
      proxy: {
        '/compagnon':  { target: 'https://www.preprod.1ercorpscolonial.fr', changeOrigin: true, secure: true },
        '/starmap':  { target: 'https://www.preprod.1ercorpscolonial.fr', changeOrigin: true, secure: true },
        '/market':   { target: 'https://www.preprod.1ercorpscolonial.fr', changeOrigin: true, secure: true },
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: r('src/renderer/index.html')
        }
      }
    }
  }
})