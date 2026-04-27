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
    const runId = body?.run_id;

    if (!accessToken || !runId) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "invalid_user" }, { status: 401 });
    }

    const { data: runRow, error: runError } = await supabaseAdmin
      .from("market_research_runs")
      .select("id, user_id, summary_json")
      .eq("id", runId)
      .maybeSingle();

    if (runError) {
      return NextResponse.json(
        { error: "market_research_run_read_failed" },
        { status: 500 }
      );
    }

    if (!runRow) {
      return NextResponse.json({ error: "run_not_found" }, { status: 404 });
    }

    if (runRow.user_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const currentSummaryJson =
      runRow.summary_json &&
      typeof runRow.summary_json === "object" &&
      !Array.isArray(runRow.summary_json)
        ? runRow.summary_json
        : {};
    const analysisResultMinimum =
      currentSummaryJson.analysis_result_minimum &&
      typeof currentSummaryJson.analysis_result_minimum === "object" &&
      !Array.isArray(currentSummaryJson.analysis_result_minimum)
        ? currentSummaryJson.analysis_result_minimum
        : null;
    const insightResultMinimum =
      currentSummaryJson.insight_result_minimum &&
      typeof currentSummaryJson.insight_result_minimum === "object" &&
      !Array.isArray(currentSummaryJson.insight_result_minimum)
        ? currentSummaryJson.insight_result_minimum
        : null;

    const nextSummaryJson = {
      ...currentSummaryJson,
      highlights: {
        sample_title:
          typeof analysisResultMinimum?.sample_title === "string"
            ? analysisResultMinimum.sample_title
            : null,
        sample_price_yen:
          typeof analysisResultMinimum?.sample_price_yen === "number"
            ? analysisResultMinimum.sample_price_yen
            : null,
        insight_ready:
          typeof insightResultMinimum?.insight_ready === "boolean"
            ? insightResultMinimum.insight_ready
            : null,
        collection_mode:
          typeof insightResultMinimum?.mode_reference === "string"
            ? insightResultMinimum.mode_reference
            : typeof analysisResultMinimum?.sample_mode === "string"
              ? analysisResultMinimum.sample_mode
              : null,
      },
      status: "completed_market_research",
      next_step: null,
    };

    const { error: updateError } = await supabaseAdmin
      .from("market_research_runs")
      .update({ summary_json: nextSummaryJson })
      .eq("id", runId);

    if (updateError) {
      return NextResponse.json(
        { error: "market_research_complete_update_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      run_id: runId,
      status: "completed_market_research",
    });
  } catch (error) {
    return NextResponse.json({ error: "unexpected_error" }, { status: 500 });
  }
}
