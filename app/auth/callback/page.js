"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "../../../lib/supabase";

const DEVICE_KEY = "furugi_device_id";

function getDeviceId() {
  if (typeof window === "undefined") return "";

  let deviceId = localStorage.getItem(DEVICE_KEY);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }

  return deviceId;
}

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const supabase = createSupabaseBrowser();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session?.access_token) {
        router.replace("/login?error=session_not_found");
        return;
      }

      const response = await fetch("/api/auth/post-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: session.access_token,
          device_id: getDeviceId(),
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (result.error === "not_invited") {
          router.replace("/login?error=not_invited");
          return;
        }

        if (result.error === "device_limit") {
          router.replace("/login?error=too_many_devices");
          return;
        }

        router.replace("/login?error=auth_failed");
        return;
      }

      router.replace("/");
    };

    run();
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
