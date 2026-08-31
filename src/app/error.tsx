"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="mx-auto max-w-3xl px-6 py-24 text-center"
    >
      <p className="text-sm font-bold tracking-wider text-[var(--color-danger)] uppercase">
        Page error
      </p>
      <h1 className="mt-2 text-4xl font-bold">This page could not be loaded</h1>
      <p className="mt-4 text-[var(--color-text-muted)]">
        Your saved information has not been reported as submitted. Retry the
        page when you are ready.
      </p>
      <button
        className="mt-8 min-h-11 rounded-lg bg-[var(--color-primary)] px-5 py-3 font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        onClick={reset}
        type="button"
      >
        Retry
      </button>
    </main>
  );
}
