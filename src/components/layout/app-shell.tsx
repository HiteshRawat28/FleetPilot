import Link from "next/link";

const navigation = [
  { label: "Dashboard", href: "/dashboard", available: true },
  { label: "Vehicles", href: "/vehicles", available: false },
  { label: "Drivers", href: "/drivers", available: false },
  { label: "Trips", href: "/trips", available: false },
  { label: "Maintenance", href: "/maintenance", available: false },
  { label: "Reports", href: "/reports", available: false },
] as const;

export function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-[var(--color-border)] bg-slate-950 px-4 py-4 text-white lg:min-h-screen lg:border-r lg:border-b-0 lg:px-5 lg:py-6">
        <Link
          className="inline-flex min-h-11 items-center text-xl font-bold"
          href="/dashboard"
        >
          Transit<span className="text-green-400">Ops</span>
        </Link>
        <nav aria-label="Primary navigation" className="mt-4 lg:mt-8">
          <ul
            className="flex gap-2 overflow-x-auto pb-2 lg:grid lg:overflow-visible"
            role="list"
          >
            {navigation.map((item) => (
              <li key={item.href}>
                {item.available ? (
                  <Link
                    className="flex min-h-11 min-w-max items-center rounded-lg bg-white/10 px-4 font-semibold"
                    href={item.href}
                    aria-current="page"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className="flex min-h-11 min-w-max cursor-not-allowed items-center rounded-lg px-4 text-slate-400"
                    aria-disabled="true"
                    title="Available after its Phase 1 or Phase 2 feature handoff"
                  >
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main id="main-content" className="min-w-0 px-6 py-8 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}
