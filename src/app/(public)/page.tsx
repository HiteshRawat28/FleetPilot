import Link from "next/link";

import { ReadinessItem } from "@/components/ui/readiness-item";

export default function HomePage() {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
      <section aria-labelledby="hero-title">
        <p className="mb-4 text-sm font-bold tracking-[0.16em] text-[var(--color-primary)] uppercase">
          Operations control, without guesswork
        </p>
        <h1
          id="hero-title"
          className="max-w-3xl text-4xl leading-tight font-bold tracking-tight sm:text-5xl"
        >
          Keep every vehicle, driver, and trip in a valid state.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-[var(--color-text-muted)]">
          TransitOps gives transport teams one rule-driven workspace for fleet
          records, dispatch, maintenance, costs, and operational insight.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--color-primary)] px-5 py-3 font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            href="/login"
          >
            Sign in
          </Link>
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-5 py-3 font-semibold hover:border-slate-400"
            href="#foundation-status"
          >
            View foundation status
          </a>
        </div>
      </section>

      <aside
        id="foundation-status"
        aria-labelledby="status-title"
        className="rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-sm"
      >
        <p className="text-sm font-semibold text-[var(--color-primary)]">
          Phase 0
        </p>
        <h2 id="status-title" className="mt-1 text-2xl font-bold">
          Foundation ready
        </h2>
        <p className="mt-2 text-[var(--color-text-muted)]">
          The application shell is prepared for independent feature and data
          workstreams.
        </p>
        <ul className="mt-6 grid gap-4" role="list">
          <ReadinessItem label="Strict TypeScript application" />
          <ReadinessItem label="Public and protected route groups" />
          <ReadinessItem label="Responsive, accessible shell" />
          <ReadinessItem label="Repeatable validation commands" />
        </ul>
      </aside>
    </div>
  );
}
