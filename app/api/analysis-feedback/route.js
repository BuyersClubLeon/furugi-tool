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
    const requestId = body?.request_id;
    const featureType = body?.feature_type || "listing";

    const rating = body?.rating || "";
    const issueType = body?.issue_type || "";
    const comment = body?.comment || "";
    const correctedBrand = body?.corrected_brand || "";
    const correctedCategory = body?.corrected_category || "";
    const correctedEra = body?.corrected_era || "";
    const correctedCondition = body?.corrected_condition || "";

    if (!accessToken || !requestId) {
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

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from("analysis_requests")
      .select("id, user_id")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        { error: "analysis_request_read_failed" },
        { status: 500 }
      );
    }

    if (!requestRow) {
      return NextResponse.json(
        { error: "request_not_found" },
        { status: 404 }
      );
    }

    if (requestRow.user_id !== user.id) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403 }
      );
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("analysis_feedback")
      .insert({
        request_id: requestId,
        user_id: user.id,
        feature_type: featureType,
        rating,
        issue_type: issueType,
        comment,
        corrected_brand: correctedBrand,
        corrected_category: correctedCategory,
        corrected_era: correctedEra,
        corrected_condition: correctedCondition,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: "analysis_feedback_insert_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      feedback_id: inserted.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}
