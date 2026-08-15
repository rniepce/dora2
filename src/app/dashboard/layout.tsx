import { DashboardHeader } from "@/components/dashboard-header";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-[#f8f9fc] xl:gradient-bg">
            <Sidebar />
            <div className="flex flex-1 flex-col">
                <DashboardHeader />
                <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:max-w-7xl" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
                    {children}
                </main>
            </div>
        </div>
    );
}
