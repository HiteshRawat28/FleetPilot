export default function Loading() {
  return (
    <main
      id="main-content"
      className="mx-auto max-w-6xl px-6 py-16"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="font-semibold text-[var(--color-text-muted)]">
        Loading TransitOps…
      </p>
    </main>
  );
}
