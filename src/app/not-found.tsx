import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto max-w-3xl px-6 py-24 text-center"
    >
      <p className="text-sm font-bold tracking-wider text-[var(--color-primary)] uppercase">
        404
      </p>
      <h1 className="mt-2 text-4xl font-bold">Page not found</h1>
      <p className="mt-4 text-[var(--color-text-muted)]">
        The address may be incorrect, or the page may have moved.
      </p>
      <Link
        className="mt-8 inline-flex min-h-11 items-center rounded-lg bg-[var(--color-primary)] px-5 py-3 font-semibold text-white"
        href="/"
      >
        Return home
      </Link>
    </main>
  );
}
