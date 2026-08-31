import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center px-6 py-16">
      <section
        aria-labelledby="sign-in-title"
        className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm"
      >
        <p className="text-sm font-semibold text-[var(--color-primary)]">
          Secure access
        </p>
        <h1
          id="sign-in-title"
          className="mt-1 text-3xl font-bold tracking-tight"
        >
          Sign in to TransitOps
        </h1>
        <div
          className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-950"
          role="status"
        >
          <p className="font-semibold">Authentication connection pending</p>
          <p className="mt-1 text-sm">
            Managed sign-in is intentionally unavailable until the Phase 1
            Supabase session boundary is connected. No credentials are collected
            by this foundation screen.
          </p>
        </div>
        <Link
          className="mt-6 inline-flex min-h-11 items-center font-semibold text-[var(--color-primary)] underline decoration-2 underline-offset-4"
          href="/"
        >
          Return to the public home page
        </Link>
      </section>
    </div>
  );
}
