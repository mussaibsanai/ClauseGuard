"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { authApi } from "@/lib/api";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    const accessToken = searchParams.get("accessToken");
    const refreshToken = searchParams.get("refreshToken");

    if (!accessToken || !refreshToken) {
      toast.error("Authentication failed");
      router.push("/login");
      return;
    }

    // Store tokens, fetch user profile, then redirect
    useAuthStore.getState().setTokens(accessToken, refreshToken);
    authApi
      .me()
      .then(({ data }) => {
        login(accessToken, refreshToken, data);
        toast.success("Signed in with Google");
        router.push("/dashboard");
      })
      .catch(() => {
        toast.error("Failed to fetch user profile");
        router.push("/login");
      });
  }, [searchParams, login, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Completing sign in...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
