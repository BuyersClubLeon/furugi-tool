import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://furugi-tool.vercel.app";

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/login?error=no_code`);
  }

  // Supabase Admin client for checks
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Exchange code for session using admin client
  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: authData, error: authError } = await supabaseAuth.auth.exchangeCodeForSession(code);

  if (authError || !authData?.user) {
    return NextResponse.redirect(`${siteUrl}/login?error=auth_failed`);
  }

  const userEmail = authData.user.email;

  // 招待チェック
  const { data: allowed } = await supabaseAdmin
    .from("allowed_emails")
    .select("email")
    .eq("email", userEmail)
    .single();

  if (!allowed) {
    await supabaseAuth.auth.signOut();
    return NextResponse.redirect(`${siteUrl}/login?error=not_invited`);
  }

  // セッションをcookieで渡すためリダイレクト
  const response = NextResponse.redirect(siteUrl);
  
  // Set session cookies
  if (authData.session) {
    response.cookies.set("sb-access-token", authData.session.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
    response.cookies.set("sb-refresh-token", authData.session.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}
