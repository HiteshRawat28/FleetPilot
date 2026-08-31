import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="border-b border-[var(--color-border)] bg-white">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
        <Link
          className="text-xl font-bold tracking-tight"
          href="/"
          aria-label="TransitOps home"
        >
          Transit<span className="text-[var(--color-primary)]">Ops</span>
        </Link>
        <Link
          className="inline-flex min-h-11 items-center font-semibold text-[var(--color-primary)]"
          href="/login"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}
