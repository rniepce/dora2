import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import { DashboardHeader } from "@/components/dashboard-header";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="flex min-h-screen bg-[#f8f9fc] xl:gradient-bg">
            <Sidebar />
            <div className="flex flex-1 flex-col">
                <DashboardHeader userName={user.email?.split("@")[0] ?? "Usuário"} />
                <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:max-w-7xl" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
                    {children}
                </main>
            </div>
        </div>
    );
}
