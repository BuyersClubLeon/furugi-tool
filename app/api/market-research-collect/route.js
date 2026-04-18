import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeSearchParams(searchParamsJson) {
  if (!searchParamsJson || typeof searchParamsJson !== "object" || Array.isArray(searchParamsJson)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(searchParamsJson).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return value.trim() !== "";
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object") return Object.keys(value).length > 0;
      return true;
    })
  );
}

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
      .select("id, user_id, feature_type, source_site, search_params_json, summary_json")
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

    const normalizedSearchParams =
      currentSummaryJson.normalized_search_params ||
      normalizeSearchParams(runRow.search_params_json);

    const nextSummaryJson = {
      ...currentSummaryJson,
      status: "collecting",
      normalized_search_params: normalizedSearchParams,
      research_scope: currentSummaryJson.research_scope || {
        source_site: runRow.source_site || "mercari",
        feature_type: runRow.feature_type || "market_research",
      },
      collection_scope: {
        source_site: runRow.source_site || "mercari",
        mode: "manual_placeholder",
      },
      collected_counts: {
        market_items: 0,
        market_item_snapshots: 0,
      },
      next_step: "analyze_market_items",
    };

    const { error: updateError } = await supabaseAdmin
      .from("market_research_runs")
      .update({
        summary_json: nextSummaryJson,
      })
      .eq("id", runId);

    if (updateError) {
      return NextResponse.json(
        { error: "market_research_collect_update_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      run_id: runId,
      status: "collecting",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}
