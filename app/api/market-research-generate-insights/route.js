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
      return NextResponse.json(
        { error: "run_not_found" },
        { status: 404 }
      );
    }

    if (runRow.user_id !== user.id) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403 }
      );
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
      analysisResultMinimum?.sample_item_found === true
        ? {
            insight_mode: "fixed_sample_minimum",
            insight_ready: true,
            price_yen_reference: analysisResultMinimum.sample_price_yen ?? null,
            title_reference: analysisResultMinimum.sample_title ?? null,
            source_reference: analysisResultMinimum.sample_source ?? null,
            mode_reference: analysisResultMinimum.sample_mode ?? null,
          }
        : {
            insight_mode: "fixed_sample_minimum",
            insight_ready: false,
          };

    const nextSummaryJson = {
      ...currentSummaryJson,
      insight_result_minimum: insightResultMinimum,
      summary_version: 1,
      progress: {
        phase: "generating_market_insights",
        step_index: 4,
        step_total: 5,
      },
      updated_at: new Date().toISOString(),
      status: "generating_market_insights",
      next_step: "complete_market_research",
    };

    const { error: updateError } = await supabaseAdmin
      .from("market_research_runs")
      .update({ summary_json: nextSummaryJson })
      .eq("id", runId);

    if (updateError) {
      return NextResponse.json(
        { error: "market_research_generate_insights_update_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      run_id: runId,
      status: "generating_market_insights",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}
