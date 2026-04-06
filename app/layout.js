// app/layout.js
export const metadata = {
  title: "FURIGI TOOL - 古着出品アシスタント",
  description: "メルカリ向け古着出品の文章生成・分析ツール",
  robots: "noindex, nofollow",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #EDE8DA; color: #1A2A1A; font-family: 'Noto Sans JP', sans-serif; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #D1CBBA; border-radius: 3px; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // 右クリックメニューを無効化
              document.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                return false;
              });

              // 開発者ツール系のショートカットキーを無効化
              document.addEventListener('keydown', function(e) {
                // F12
                if (e.key === 'F12') { e.preventDefault(); return false; }
                // Ctrl+Shift+I / Cmd+Option+I（要素の検証）
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') { e.preventDefault(); return false; }
                // Ctrl+Shift+J / Cmd+Option+J（コンソール）
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') { e.preventDefault(); return false; }
                // Ctrl+U / Cmd+U（ソース表示）
                if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); return false; }
                // Ctrl+Shift+C（要素選択）
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') { e.preventDefault(); return false; }
              });

              // テキスト選択を無効化（コピー防止）
              document.addEventListener('selectstart', function(e) {
                // input, textareaは選択を許可
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return true;
                e.preventDefault();
                return false;
              });

              // ドラッグを無効化
              document.addEventListener('dragstart', function(e) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return true;
                e.preventDefault();
                return false;
              });
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
