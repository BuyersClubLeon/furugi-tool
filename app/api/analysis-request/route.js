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
    const featureType = body?.feature_type || "listing";
    const inputImagesJson = Array.isArray(body?.input_images_json)
      ? body.input_images_json
      : [];
    const inputTextJson =
      body?.input_text_json && typeof body.input_text_json === "object"
        ? body.input_text_json
        : {};
    const outputJson =
      body?.output_json && typeof body.output_json === "object"
        ? body.output_json
        : {};

    if (!accessToken) {
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

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("analysis_requests")
      .insert({
        user_id: user.id,
        feature_type: featureType,
        input_images_json: inputImagesJson,
        input_text_json: inputTextJson,
        output_json: outputJson,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: "analysis_request_insert_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      request_id: inserted.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}
