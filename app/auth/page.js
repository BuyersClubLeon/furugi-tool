"use client";

import { useEffect } from "react";
import { createSupabaseBrowser } from "../../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.exchangeCodeForSession(
        window.location.href
      );

      if (error) {
        router.push("/login?error=auth_failed");
        return;
      }

      router.push("/");
    };

    handleCallback();
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#EDE8DA",
      fontFamily: "'Noto Sans JP', sans-serif",
      color: "#1A2A1A"
    }}>
      <div>認証中...</div>
    </div>
  );
}
