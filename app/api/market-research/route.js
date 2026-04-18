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
    const searchParamsJson =
      body?.search_params_json &&
      typeof body.search_params_json === "object" &&
      !Array.isArray(body.search_params_json)
        ? body.search_params_json
        : null;
    const source = typeof body?.source === "string" ? body.source : "manual";

    if (!accessToken || !searchParamsJson) {
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
      .from("market_research_runs")
      .insert({
        user_id: user.id,
        search_params_json: searchParamsJson,
        status: "queued",
        source,
      })
      .select("id, status")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: "market_research_run_insert_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      run_id: inserted.id,
      status: inserted.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}
