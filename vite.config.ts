import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import pkgConfig from './package.json';

export default defineConfig({
  plugins: [dts(), nodeResolve()],
  build: {
    lib: {
      formats: ['es', 'cjs'],
      entry: {
        index: './src/index.ts',
      },
      name: '[name]',
      fileName: '[name]',
    },
    outDir: 'lib',
    minify: false,
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map(mod => `node:${mod}`), ...Object.keys(pkgConfig.dependencies || {})],
    },
  },
});
