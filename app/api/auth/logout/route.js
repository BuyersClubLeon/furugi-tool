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

    const { data: { user } } = await supabase.auth.getUser(accessToken);

    if (user && deviceId) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      await supabaseAdmin
        .from("device_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("device_id", deviceId);
    }

    await supabase.auth.signOut();
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://furugi-tool.vercel.app";
  const response = NextResponse.redirect(`${siteUrl}/login`);
  response.cookies.delete("furigi_device_id");
  return response;
}
