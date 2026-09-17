"use client";

import { Toaster as Sonner } from "sonner";

/** Shared Sonner host for non-blocking user feedback. */
export function Toaster() {
  return <Sonner closeButton position="bottom-right" richColors />;
}
