const fs = require('fs');
const path = require('path');

describe('Gaming PC Parts Guide Content Tests', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  test('does not contain unrendered LaTeX markup like $\\rightarrow$', () => {
    expect(htmlContent).not.toContain('$\\rightarrow$');
  });

  test('contains properly formatted arrow in frame time description', () => {
    expect(htmlContent).toContain('プレイヤーの操作検知 → 敵AIの移動計算 → 弾の当たり判定 → ポリゴンモデル配置 → 影と光のシェーディング → 画面出力');
  });
});
