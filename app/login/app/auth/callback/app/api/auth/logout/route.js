import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request) {
  const accessToken = request.cookies.get("sb-access-token")?.value;
  const deviceId = request.cookies.get("furigi_device_id")?.value;

  if (accessToken) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // ユーザー情報を取得
    const { data: { user } } = await supabase.auth.getUser(accessToken);

    // デバイスセッションを削除
    if (user && deviceId) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      await supabaseAdmin
        .from("device_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("device_id", deviceId);
    }
  }

  // Cookieをクリアしてログインページへ
  const response = NextResponse.json({ success: true });
  response.cookies.delete("sb-access-token");
  response.cookies.delete("sb-refresh-token");
  response.cookies.delete("furigi_device_id");
  return response;
}
