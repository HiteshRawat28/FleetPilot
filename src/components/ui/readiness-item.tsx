export function ReadinessItem({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-3">
      <svg
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-[var(--color-success)]"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="m5 12 4 4L19 6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
      <span>{label}</span>
    </li>
  );
}
