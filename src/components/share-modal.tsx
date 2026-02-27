"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Share2, Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
    shareTranscriptionAction,
    unshareTranscriptionAction,
    getSharesAction,
} from "@/lib/actions/sharing";
import type { ShareInfo } from "@/lib/types";

interface ShareModalProps {
    transcriptionId: string;
    transcriptionTitle: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ShareModal({
    transcriptionId,
    transcriptionTitle,
    open,
    onOpenChange,
}: ShareModalProps) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [sharing, setSharing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [shares, setShares] = useState<ShareInfo[]>([]);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const loadShares = useCallback(async () => {
        setLoading(true);
        const result = await getSharesAction(transcriptionId);
        if (result.shares) {
            setShares(result.shares);
        }
        setLoading(false);
    }, [transcriptionId]);

    useEffect(() => {
        if (open) {
            loadShares();
            setEmail("");
        }
    }, [open, loadShares]);

    const handleShare = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            toast.error("Digite o email do usuário.");
            return;
        }

        setSharing(true);
        const result = await shareTranscriptionAction(transcriptionId, trimmedEmail);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success(`Degravação compartilhada com ${trimmedEmail}!`);
            setEmail("");
            await loadShares();
            router.refresh();
        }
        setSharing(false);
    };

    const handleUnshare = async (sharedWithId: string, sharedEmail: string) => {
        setRemovingId(sharedWithId);
        const result = await unshareTranscriptionAction(transcriptionId, sharedWithId);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success(`Compartilhamento com ${sharedEmail} removido.`);
            setShares((prev) => prev.filter((s) => s.shared_with_id !== sharedWithId));
            router.refresh();
        }
        setRemovingId(null);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="h-5 w-5 text-primary" />
                        Compartilhar
                    </DialogTitle>
                    <DialogDescription className="line-clamp-1">
                        {transcriptionTitle}
                    </DialogDescription>
                </DialogHeader>

                {/* ─── Share form ─────────────────────────────────────── */}
                <form onSubmit={handleShare} className="flex gap-2">
                    <div className="flex-1">
                        <Label htmlFor="share-email" className="sr-only">
                            Email
                        </Label>
                        <Input
                            id="share-email"
                            type="email"
                            placeholder="email@exemplo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={sharing}
                            autoComplete="email"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={sharing || !email.trim()}
                        className="gradient-primary text-white font-semibold shrink-0"
                    >
                        {sharing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <UserPlus className="h-4 w-4" />
                        )}
                    </Button>
                </form>

                {/* ─── Shared users list ──────────────────────────────── */}
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        Compartilhado com
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    ) : shares.length === 0 ? (
                        <p className="py-3 text-center text-sm text-muted-foreground">
                            Nenhum compartilhamento ainda.
                        </p>
                    ) : (
                        <div className="max-h-48 space-y-1.5 overflow-y-auto">
                            {shares.map((share) => (
                                <div
                                    key={share.id}
                                    className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/40 px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {share.shared_with_email}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                            Somente leitura
                                        </p>
                                    </div>
                                    <button
                                        onClick={() =>
                                            handleUnshare(share.shared_with_id, share.shared_with_email)
                                        }
                                        disabled={removingId === share.shared_with_id}
                                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                                        title="Remover compartilhamento"
                                    >
                                        {removingId === share.shared_with_id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-3.5 w-3.5" />
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
