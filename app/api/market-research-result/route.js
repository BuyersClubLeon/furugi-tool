import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeSummaryJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
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

    console.log("[market-research-result] request validated", {
      hasAccessToken: Boolean(accessToken),
      runId,
    });

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

    console.log("[market-research-result] run lookup result", {
      hasRunRow: Boolean(runRow),
      runRowKeys: runRow ? Object.keys(runRow) : [],
      runError: runError
        ? { code: runError.code, message: runError.message }
        : null,
    });

    if (runError) {
      return NextResponse.json(
        {
          error: "market_research_run_read_failed",
          message: "failed_to_read_market_research_run",
        },
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

    const summaryJson = normalizeSummaryJson(runRow.summary_json);

    const responseStatus =
      typeof summaryJson.status === "string" && summaryJson.status.trim().length > 0
        ? summaryJson.status
        : typeof runRow.status === "string" && runRow.status.trim().length > 0
          ? runRow.status
          : "-";

    const nextStep =
      typeof summaryJson.next_step === "string" || summaryJson.next_step === null
        ? summaryJson.next_step
        : null;

    return NextResponse.json({
      ok: true,
      run_id: runRow.id,
      status: responseStatus,
      next_step: nextStep,
      summary_json: summaryJson,
    });
  } catch (error) {
    console.error("[market-research-result] unexpected error", error);

    return NextResponse.json(
      {
        error: "unexpected_error",
        message: "unexpected_error_in_market_research_result",
      },
      { status: 500 }
    );
  }
}
