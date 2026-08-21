import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'cli': 'src/bin/cli.ts',
    'bash-complete': 'src/bin/bash-complete.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    build: true,
  },
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  shims: true,
  target: false,
})
