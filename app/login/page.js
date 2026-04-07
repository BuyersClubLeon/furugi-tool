"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "../../lib/supabase";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // URLパラメータからエラーメッセージを取得
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get("error");
    if (errParam && !error) {
      if (errParam === "not_invited") setError("このアカウントは招待されていません。管理者にお問い合わせください。");
      else if (errParam === "too_many_devices") setError("端末数の上限（2台）に達しています。他の端末からログアウトしてください。");
      else if (errParam === "auth_failed") setError("認証に失敗しました。もう一度お試しください。");
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowser();
     const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
        redirectTo: "https://furugi-tool.vercel.app/auth/callback",
        },
      });
    if (error) {
      setError("ログインに失敗しました: " + error.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#EDE8DA", fontFamily: "'Noto Sans JP', sans-serif",
      padding: 20,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{
        background: "#1E2E1E", borderRadius: 16, padding: "48px 40px", maxWidth: 400,
        width: "100%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      }}>
        {/* ロゴ */}
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.08em", color: "#C5A44B", marginBottom: 8 }}>
          FURIGI TOOL
        </div>
        <div style={{ fontSize: 12, color: "#A8A28E", marginBottom: 40, letterSpacing: "0.04em" }}>
          古着出品アシスタント
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div style={{
            background: "#B0404020", border: "1px solid #B0404050", borderRadius: 8,
            padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#E8B4B4",
            lineHeight: 1.6, textAlign: "left",
          }}>
            {error}
          </div>
        )}

        {/* Googleログインボタン */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: "100%", padding: "14px 20px", borderRadius: 8,
            border: "1px solid #3A4D3A", background: "#2A3C2A",
            color: "#EDE8DA", fontSize: 14, fontWeight: 500,
            cursor: loading ? "wait" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            transition: "all 0.2s",
            opacity: loading ? 0.7 : 1,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? "接続中..." : "Googleアカウントでログイン"}
        </button>

        <div style={{ marginTop: 32, fontSize: 11, color: "#7A7662", lineHeight: 1.6 }}>
          招待制サービスです。<br />
          管理者から招待されたGoogleアカウントのみ<br />
          ログインが可能です。
        </div>
      </div>
    </div>
  );
}
