import type { Metadata } from "next";

const placeholders = [
  "Active vehicles",
  "Available vehicles",
  "Vehicles in maintenance",
  "Active trips",
];

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div>
      <p className="text-sm font-semibold text-[var(--color-primary)]">
        Operational overview
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-2 max-w-3xl text-[var(--color-text-muted)]">
        Route composition is ready. Live values appear only after the Seat C
        read model is connected.
      </p>

      <section aria-labelledby="kpi-heading" className="mt-8">
        <h2 id="kpi-heading" className="text-xl font-bold">
          Fleet status
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {placeholders.map((label) => (
            <article
              key={label}
              className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm"
            >
              <h3 className="font-semibold text-[var(--color-text-muted)]">
                {label}
              </h3>
              <p
                className="mt-3 text-3xl font-bold"
                aria-label={`${label}: awaiting data`}
              >
                —
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Awaiting data connection
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
