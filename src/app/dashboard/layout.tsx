import { AppHeader } from "@/components/app-header";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="flex-1 bg-muted/20 p-6">{children}</main>
    </div>
  );
}
