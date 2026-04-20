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

function buildPlaceholderTitle(normalizedSearchParams) {
  const titleParts = [
    typeof normalizedSearchParams?.brand === "string" ? normalizedSearchParams.brand.trim() : "",
    typeof normalizedSearchParams?.keyword === "string" ? normalizedSearchParams.keyword.trim() : "",
  ].filter(Boolean);

  return titleParts.join(" ") || "manual placeholder item";
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

    const sourceSite = runRow.source_site || "mercari";
    const observedAt = new Date().toISOString();
    const placeholderTitle = buildPlaceholderTitle(normalizedSearchParams);
    const placeholderExternalItemId = `manual-placeholder-${runId}`;

    const { error: marketItemUpsertError } = await supabaseAdmin
      .from("market_items")
      .upsert(
        {
          source_site: sourceSite,
          external_item_id: placeholderExternalItemId,
          item_url: "",
          title: placeholderTitle,
          brand:
            typeof normalizedSearchParams.brand === "string"
              ? normalizedSearchParams.brand.trim()
              : "",
          category: "",
          size_text: "",
          color_text: "",
          condition_text: "",
          price_yen_latest: 0,
          thumbnail_url: "",
          seller_name: "",
          first_seen_at: observedAt,
          last_seen_at: observedAt,
          updated_at: observedAt,
        },
        {
          onConflict: "source_site,external_item_id",
        }
      );

    if (marketItemUpsertError) {
      return NextResponse.json(
        {
          error: "market_item_upsert_failed",
          detail: marketItemUpsertError.message || null,
        },
        { status: 500 }
      );
    }

    const { data: marketItemRow, error: marketItemReadError } = await supabaseAdmin
      .from("market_items")
      .select("id")
      .eq("source_site", sourceSite)
      .eq("external_item_id", placeholderExternalItemId)
      .maybeSingle();

    if (marketItemReadError || !marketItemRow) {
      return NextResponse.json(
        {
          error: "market_item_read_failed",
          detail: marketItemReadError?.message || null,
        },
        { status: 500 }
      );
    }

    const { error: snapshotError } = await supabaseAdmin
      .from("market_item_snapshots")
      .upsert(
        {
          run_id: runId,
          market_item_id: marketItemRow.id,
          observed_at: observedAt,
          title: placeholderTitle,
          price_yen: 0,
          status_text: "manual_placeholder",
          is_visible: true,
          raw_json: {
            mode: "manual_placeholder",
            source_site: sourceSite,
            normalized_search_params: normalizedSearchParams,
          },
        },
        {
          onConflict: "run_id,market_item_id",
        }
      );

    if (snapshotError) {
      return NextResponse.json(
        {
          error: "market_item_snapshot_upsert_failed",
          detail: snapshotError.message || null,
        },
        { status: 500 }
      );
    }

    const nextSummaryJson = {
      ...currentSummaryJson,
      status: "collecting",
      normalized_search_params: normalizedSearchParams,
      research_scope: currentSummaryJson.research_scope || {
        source_site: sourceSite,
        feature_type: runRow.feature_type || "market_research",
      },
      collection_scope: {
        source_site: sourceSite,
        mode: "manual_placeholder",
      },
      collected_counts: {
        market_items: 1,
        market_item_snapshots: 1,
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
      collected_counts: {
        market_items: 1,
        market_item_snapshots: 1,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}
