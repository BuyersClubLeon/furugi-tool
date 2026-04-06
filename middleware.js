import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // ログインページ、認証コールバック、APIルートはスキップ
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Cookieからアクセストークンを取得
  const accessToken = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;

  if (!accessToken) {
    // トークンなし → ログインページへ
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // トークンの有効性を確認
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    // トークン無効 → ログインページへ（Cookieもクリア）
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("sb-access-token");
    response.cookies.delete("sb-refresh-token");
    return response;
  }

  // デバイスIDチェック
  const deviceId = request.cookies.get("furigi_device_id")?.value;
  if (deviceId) {
    // セッションのlast_activeを更新（サーバーサイドで非同期実行）
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    await supabaseAdmin
      .from("device_sessions")
      .update({ last_active: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("device_id", deviceId);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
