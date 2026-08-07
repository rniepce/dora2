import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import { DashboardHeader } from "@/components/dashboard-header";
import { Sidebar, type SidebarRecent } from "@/components/sidebar";

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

    // Últimas degravações — alimentam a lista "Degravações Recentes" da lateral
    const { data: recentRows } = await supabase
        .from("transcriptions")
        .select("id, title, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12);

    const recents: SidebarRecent[] = (recentRows ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.status === "completed",
    }));

    const userName = user.email?.split("@")[0] ?? "Usuário";

    return (
        <div className="min-h-screen bg-background p-0 lg:p-3">
            <div className="app-shell flex min-h-screen overflow-hidden max-lg:rounded-none max-lg:border-0 lg:min-h-[calc(100vh-1.5rem)]">
                <Sidebar
                    userName={userName}
                    userEmail={user.email ?? ""}
                    recents={recents}
                />

                <div className="flex min-w-0 flex-1 flex-col border-border lg:border-l">
                    <DashboardHeader />
                    <main
                        className="flex-1 px-5 pb-8 sm:px-8"
                        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
                    >
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
