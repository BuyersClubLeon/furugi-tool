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
    const featureType = body?.feature_type || "";
    const rating = body?.rating || "";
    const limit = Math.min(Math.max(Number(body?.limit || 20), 1), 100);
    const offset = Math.max(Number(body?.offset || 0), 0);

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

const { data: profile, error: profileError } = await supabaseAdmin
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .maybeSingle();

if (profileError) {
  return NextResponse.json(
    { error: "profiles_read_failed" },
    { status: 500 }
  );
}

if (profile?.role !== "admin") {
  return NextResponse.json(
    { error: "forbidden" },
    { status: 403 }
  );
}

let feedbackQuery = supabaseAdmin
  .from("analysis_feedback")
      .select(
        `
          id,
          request_id,
          user_id,
          feature_type,
          rating,
          issue_type,
          comment,
          corrected_brand,
          corrected_category,
          corrected_era,
          corrected_condition,
          created_at
        `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (featureType) {
      feedbackQuery = feedbackQuery.eq("feature_type", featureType);
    }

    if (rating) {
      feedbackQuery = feedbackQuery.eq("rating", rating);
    }

    const {
      data: feedbackRows,
      error: feedbackError,
      count,
    } = await feedbackQuery;

    if (feedbackError) {
      return NextResponse.json(
        { error: "feedback_list_read_failed" },
        { status: 500 }
      );
    }

    const safeFeedbackRows = Array.isArray(feedbackRows) ? feedbackRows : [];

    if (safeFeedbackRows.length === 0) {
      return NextResponse.json({
        ok: true,
        total: count || 0,
        items: [],
      });
    }

    const requestIds = [
      ...new Set(
        safeFeedbackRows
          .map((row) => row.request_id)
          .filter(Boolean)
      ),
    ];

    const userIds = [
      ...new Set(
        safeFeedbackRows
          .map((row) => row.user_id)
          .filter(Boolean)
      ),
    ];

   const [{ data: requestRows, error: requestError }, { data: profileRows, error: profileRowsError }] =
  await Promise.all([
    supabaseAdmin
      .from("analysis_requests")
      .select(`
        id,
        feature_type,
        input_images_json,
        input_text_json,
        output_json,
        created_at
      `)
      .in("id", requestIds),
    supabaseAdmin
      .from("profiles")
      .select(`
        id,
        email,
        display_name,
        role
      `)
      .in("id", userIds),
  ]);

if (requestError) {
  return NextResponse.json(
    { error: "analysis_requests_read_failed" },
    { status: 500 }
  );
}

if (profileRowsError) {
  return NextResponse.json(
    { error: "profiles_read_failed" },
    { status: 500 }
  );
}
    if (profileError) {
      return NextResponse.json(
        { error: "profiles_read_failed" },
        { status: 500 }
      );
    }

    const requestMap = Object.fromEntries(
      (requestRows || []).map((row) => [row.id, row])
    );

    const profileMap = Object.fromEntries(
      (profileRows || []).map((row) => [row.id, row])
    );

    const items = safeFeedbackRows.map((row) => ({
      ...row,
      request: requestMap[row.request_id] || null,
      profile: profileMap[row.user_id] || null,
    }));

    return NextResponse.json({
      ok: true,
      total: count || 0,
      items,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}
