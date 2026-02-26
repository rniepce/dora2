import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import { DashboardHeader } from "@/components/dashboard-header";

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
        <div className="gradient-bg min-h-screen">
            <DashboardHeader userName={user.email?.split("@")[0] ?? "Usuário"} />
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}
