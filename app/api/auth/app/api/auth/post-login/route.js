import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const body = await request.json();
    const accessToken = body?.access_token;
    const deviceId = body?.device_id;
    const userAgent = body?.user_agent || "";

    if (!accessToken || !deviceId) {
      return NextResponse.json(
        { error: "bad_request" },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "invalid_user" },
        { status: 401 }
      );
    }

    const email = (user.email || "").toLowerCase().trim();

    if (!email) {
      return NextResponse.json(
        { error: "email_not_found" },
        { status: 400 }
      );
    }

    const { data: invitedUser, error: inviteError } = await supabaseAdmin
      .from("allowed_emails")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (inviteError) {
      return NextResponse.json(
        { error: "invite_check_failed" },
        { status: 500 }
      );
    }

    if (!invitedUser) {
      return NextResponse.json(
        { error: "not_invited" },
        { status: 403 }
      );
    }

    const displayName =
      user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      "";

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email,
          display_name: displayName,
          role: "member",
          plan_status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (profileError) {
      return NextResponse.json(
        { error: "profile_upsert_failed" },
        { status: 500 }
      );
    }

    const { data: activeSessions, error: sessionError } = await supabaseAdmin
      .from("device_sessions")
      .select("id, device_id")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (sessionError) {
      return NextResponse.json(
        { error: "device_session_read_failed" },
        { status: 500 }
      );
    }

    const sameDevice = activeSessions.find(
      (session) => session.device_id === deviceId
    );

    if (sameDevice) {
      const { error: updateError } = await supabaseAdmin
        .from("device_sessions")
        .update({
          user_agent: userAgent,
          last_active: new Date().toISOString(),
          is_active: true,
        })
        .eq("id", sameDevice.id);

      if (updateError) {
        return NextResponse.json(
          { error: "device_session_update_failed" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (activeSessions.length >= 2) {
      return NextResponse.json(
        { error: "device_limit" },
        { status: 403 }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("device_sessions")
      .insert({
        user_id: user.id,
        device_id: deviceId,
        user_agent: userAgent,
        last_active: new Date().toISOString(),
        is_active: true,
      });

    if (insertError) {
      return NextResponse.json(
        { error: "device_session_insert_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}
