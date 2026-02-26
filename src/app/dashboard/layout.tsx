import { DashboardHeader } from "@/components/dashboard-header";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="gradient-bg min-h-screen">
            <DashboardHeader userName="Teste" />
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}
