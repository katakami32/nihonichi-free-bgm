module.exports = {
  server: {
    baseDir: '.',
    middleware: [
      // 開発環境専用：キャッシュ完全無効化
      function(req, res, next) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        next();
      }
    ]
  },
  files: [
    'index.html',
    'data/**/*.json',
    '*.css',
    '*.js'
  ],
  watchOptions: {
    ignoreInitial: true
  },
  // 0.0.0.0 にバインド → スマホ等 LAN 内デバイスからアクセス可能
  host: '0.0.0.0',
  port: 3000,
  open: false,        // ブラウザ自動起動しない
  notify: false,      // ページ内のbrowser-syncバナーを非表示
  ghostMode: false,   // 複数端末のスクロール同期は不要なのでOFF
  logLevel: 'info',
  logConnections: true
};
