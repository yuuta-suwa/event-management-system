import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

describe('禁止文言・旧名称（F章・ブランド規則）', () => {
  const src = files(path.resolve('src')).filter((f) => /\.(tsx?|json|css)$/.test(f)).map((f) => [f, fs.readFileSync(f, 'utf8')] as const);
  const html = fs.readFileSync(path.resolve('index.html'), 'utf8');
  it.each([
    '14日で習慣', '必ず稼げ', '潜在意識を診断', '逃避タイプ', 'あなたは逃避', '自己実現率', '自己実現スコア', '命はあと', '死ぬまであと', '残り時間がない', '成功を保証',
  ])('「%s」を含まない', (w) => {
    for (const [f, t] of src) expect(t.includes(w), f).toBe(false);
  });
  it('旧名称（REFLOW / 誤表記 MetaEvo）をUI・コードに含まない', () => {
    for (const [f, t] of [...src, ['index.html', html] as const]) {
      expect(/REFLOW|Reflow/.test(t), f).toBe(false);
      expect(/MetaEvo(?!\w)|Metaevo /.test(t), f).toBe(false);
    }
  });
  it('正式表記 MetaEVO Shift をタイトル・マニフェストに使う', () => {
    expect(html).toContain('<title>MetaEVO Shift｜自分革命システム</title>');
    const cfg = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8');
    expect(cfg).toContain('brand.pwa.name');
  });
  it('外部APIのURL・解析ツールを含まない', () => {
    for (const [f, t] of src) expect(/https?:\/\/(?!schemas\.metaevo-shift\.invalid|json-schema\.org)/.test(t), f).toBe(false);
  });
});
