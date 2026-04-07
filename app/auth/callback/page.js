"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "../../../lib/supabase";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowser();

    const checkSession = async () => {
      setTimeout(async () => {
        const { data } = await supabase.auth.getSession();

        if (data.session) {
          router.replace("/");
        } else {
          router.replace("/login?error=session_not_found");
        }
      }, 1500);
    };

    checkSession();
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#EDE8DA",
        fontFamily: "'Noto Sans JP', sans-serif",
        color: "#1A2A1A",
      }}
    >
      <div>認証中...</div>
    </div>
  );
}
