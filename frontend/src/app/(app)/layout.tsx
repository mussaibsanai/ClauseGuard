import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/layout/app-header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    </AuthGuard>
  );
}
