import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Supabaseクライアント（anon key でコード交換）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // 認証コードをセッションに交換
  const { data: { session }, error: authError } = await supabase.auth.exchangeCodeForSession(code);

  if (authError || !session) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const userEmail = session.user.email;
  const userId = session.user.id;

  // 管理者用クライアント（service_role key）
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ① 招待チェック: allowed_emails テーブルにメールがあるか確認
  const { data: allowedEmail } = await supabaseAdmin
    .from("allowed_emails")
    .select("email")
    .eq("email", userEmail)
    .single();

  if (!allowedEmail) {
    // 招待されていない → ログアウトさせてエラーページへ
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_invited`);
  }

  // ② 端末チェック: 現在のアクティブセッション数を確認
  const { data: sessions } = await supabaseAdmin
    .from("device_sessions")
    .select("id, device_id")
    .eq("user_id", userId);

  const currentDeviceCount = sessions?.length || 0;

  // デバイスIDをCookieから取得（なければ新規発行）
  const cookies = request.cookies;
  let deviceId = cookies.get("furigi_device_id")?.value;

  // 既存デバイスかチェック
  const isExistingDevice = sessions?.some((s) => s.device_id === deviceId);

  if (!isExistingDevice && currentDeviceCount >= 2) {
    // 新しい端末で、既に2台登録済み → 拒否
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=too_many_devices`);
  }

  // 新しいデバイスIDを発行（まだない場合）
  if (!deviceId) {
    deviceId = crypto.randomUUID();
  }

  // デバイスセッションを登録/更新
  await supabaseAdmin
    .from("device_sessions")
    .upsert(
      { user_id: userId, device_id: deviceId, last_active: new Date().toISOString() },
      { onConflict: "user_id,device_id" }
    );

  // レスポンスにCookieとセッションを設定してリダイレクト
  const response = NextResponse.redirect(`${origin}/`);

  // デバイスIDをCookieに保存（1年間有効）
  response.cookies.set("furigi_device_id", deviceId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  // Supabaseセッショントークンをcookieに保存
  response.cookies.set("sb-access-token", session.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60, // 1時間
    path: "/",
  });

  response.cookies.set("sb-refresh-token", session.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30日
    path: "/",
  });

  return response;
}
