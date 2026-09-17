// ============================================================
// package.json 发布配置锁定 — 小程序「构建 npm」适配
// （见 minidev-npm-publish-config skill）
//
// miniprogram 必须是完整文件路径（dist/cjs/index.js），不能只写目录：
// 抖音小程序不识别目录形式（实测验证）；微信两种写法都能消费
// （目录 = 整目录拷贝，文件 = 从 main 打包单文件），完整文件路径是
// 两端交集。该字段与 main 指向同一份纯 CJS 入口。
// ============================================================

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as { main: string; miniprogram: string; files: string[] };

describe('package.json 小程序发布配置', () => {
  it('miniprogram 指向完整文件路径（目录形式抖音不识别）', () => {
    expect(pkg.miniprogram).toBe('dist/cjs/index.js');
  });

  it('miniprogram 与 main 同源 — 同一份纯 CJS 入口', () => {
    expect(pkg.main.endsWith(pkg.miniprogram)).toBe(true);
  });

  it('files 覆盖 dist — miniprogram 指向的产物随包分发', () => {
    expect(pkg.files).toContain('dist');
  });
});
