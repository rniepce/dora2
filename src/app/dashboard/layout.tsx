import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import { DashboardHeader } from "@/components/dashboard-header";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    const userName =
        user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário";

    return (
        <div className="gradient-bg min-h-screen">
            <DashboardHeader userName={userName} />
            <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        </div>
    );
}
