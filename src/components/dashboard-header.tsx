import { Bell } from "lucide-react";

export function DashboardHeader() {
    return (
        <header className="sticky top-0 z-50 border-b border-border bg-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="flex h-14 items-center justify-end px-3 sm:px-6 lg:px-8 w-full">
                <div className="flex items-center gap-4">
                    <button className="relative text-muted-foreground hover:text-foreground">
                        <Bell className="h-5 w-5" />
                        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-600 border border-white"></span>
                    </button>
                </div>
            </div>
        </header>
    );
}
