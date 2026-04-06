import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://furugi-tool.vercel.app";

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/login?error=no_code`);
  }

  const cookieStore = cookies();
  const response = NextResponse.redirect(siteUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: authData, error: authError } = await supabase.auth.exchangeCodeForSession(code);

  if (authError || !authData?.user) {
    return NextResponse.redirect(`${siteUrl}/login?error=auth_failed`);
  }

  return response;
}
