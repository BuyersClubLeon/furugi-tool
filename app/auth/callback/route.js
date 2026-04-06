import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://furugi-tool.vercel.app";

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/login?error=no_code`);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: authData, error: authError } = await supabase.auth.exchangeCodeForSession(code);

  if (authError || !authData?.user) {
    return NextResponse.redirect(`${siteUrl}/login?error=auth_failed`);
  }

  const userEmail = authData.user.email;

  // 招待チェック
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: allowed } = await supabaseAdmin
    .from("allowed_emails")
    .select("email")
    .eq("email", userEmail)
    .single();

  if (!allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${siteUrl}/login?error=not_invited`);
  }

  // 端末チェック（2台制限）
  const deviceId = uuidv4();
  const userId = authData.user.id;

  const { data: sessions } = await supabaseAdmin
    .from("device_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("last_active", { ascending: false });

  if (sessions && sessions.length >= 2) {
    // 最も古いセッションを削除
    await supabaseAdmin
      .from("device_sessions")
      .delete()
      .eq("id", sessions[sessions.length - 1].id);
  }

  // 新しいデバイスセッションを登録
  await supabaseAdmin.from("device_sessions").insert({
    user_id: userId,
    device_id: deviceId,
    last_active: new Date().toISOString(),
  });

  const response = NextResponse.redirect(siteUrl);
  response.cookies.set("furigi_device_id", deviceId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
