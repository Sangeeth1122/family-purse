"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

export function useGoBack(fallback: string) {
  const router = useRouter();
  return useCallback(() => {
    if (
      typeof document !== "undefined" &&
      document.referrer &&
      document.referrer.startsWith(window.location.origin)
    ) {
      router.back();
    } else {
      router.replace(fallback);
    }
  }, [router, fallback]);
}