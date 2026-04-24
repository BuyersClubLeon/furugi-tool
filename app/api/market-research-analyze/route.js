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
      .select("id, user_id, status, summary_json")
      .eq("id", runId)
      .maybeSingle();

    if (runError) {
      return NextResponse.json(
        { error: "market_research_run_read_failed", details: runError },
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

    const {
      data: fixedSampleSnapshotRow,
      error: fixedSampleSnapshotReadError,
    } = await supabaseAdmin
      .from("market_item_snapshots")
      .select("price_yen, title, raw_json")
      .eq("run_id", runId)
      .eq("status_text", "fixed_sample_single_item")
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fixedSampleSnapshotReadError) {
      return NextResponse.json(
        { error: "market_item_snapshot_read_failed", details: fixedSampleSnapshotReadError },
        { status: 500 }
      );
    }

    const fixedSampleRawJson =
      fixedSampleSnapshotRow?.raw_json &&
      typeof fixedSampleSnapshotRow.raw_json === "object" &&
      !Array.isArray(fixedSampleSnapshotRow.raw_json)
        ? fixedSampleSnapshotRow.raw_json
        : {};

    const analysisResultMinimum = fixedSampleSnapshotRow
      ? {
          analysis_mode: "fixed_sample_minimum",
          sample_item_found: true,
          sample_price_yen: fixedSampleSnapshotRow.price_yen ?? null,
          sample_title: fixedSampleSnapshotRow.title ?? null,
          sample_source:
            typeof fixedSampleRawJson.sample_source === "string"
              ? fixedSampleRawJson.sample_source
              : null,
          sample_mode:
            typeof fixedSampleRawJson.mode === "string"
              ? fixedSampleRawJson.mode
              : null,
        }
      : {
          analysis_mode: "fixed_sample_minimum",
          sample_item_found: false,
        };

    const nextSummaryJson = {
      ...currentSummaryJson,
      analysis_result_minimum: analysisResultMinimum,
      summary_version: 1,
      progress: {
        phase: "analyzing",
        step_index: 3,
        step_total: 5,
      },
      updated_at: new Date().toISOString(),
      status: "analyzing",
      next_step: "generate_market_insights",
    };

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("market_research_runs")
      .update({
        summary_json: nextSummaryJson,
        status: "analyzing",
      })
      .eq("id", runId)
      .select("id, status, summary_json");

    if (updateError) {
      return NextResponse.json(
        {
          error: "market_research_analyze_update_failed",
          details: updateError,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      run_id: runId,
      before_status: runRow.status ?? null,
      after_update_rows: updatedRows ?? [],
      status: "analyzing",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "unexpected_error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
