import { writeFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

// 双格式 + 依赖内联（本库零运行时依赖，bundle 仅起单文件合并作用）。
// dts 各自产到 cjs/esm 自己的目录（与该目录 package.json 的模块语义一致），
// 不共享单份 .d.ts，避免被 attw 判定为 "Masquerading as ESM"。
//
// platform: 'neutral' —— 不引入 Node 专属全局，让产物在小程序与 Node 都能跑。
// target 显式 es2017 —— 不依赖自动推断（见 npm-publish-config「target 被 engines.node 接管」坑）。
// dts.sourcemap 必须与该 pass 顶层 sourcemap 保持一致（rolldown 在输出层统一追加
// sourceMappingURL 注释，两者不一致会悬空引用）。
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
    target: 'es2017',
    outDir: 'dist/cjs',
    outExtensions: () => ({ js: '.js' }),
    dts: { sourcemap: true },
    sourcemap: true,
    clean: false,
    onSuccess: async () => {
      writeFileSync(
        'dist/cjs/package.json',
        JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
      );
    },
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'es2017',
    outDir: 'dist/esm',
    outExtensions: () => ({ js: '.js' }),
    dts: { sourcemap: true },
    sourcemap: true,
    clean: false,
    onSuccess: async () => {
      writeFileSync(
        'dist/esm/package.json',
        JSON.stringify({ type: 'module' }, null, 2) + '\n',
      );
    },
  },
]);
