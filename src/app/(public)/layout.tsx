import { PublicHeader } from "@/components/layout/public-header";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main id="main-content">{children}</main>
    </div>
  );
}
