"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { MessageSquare, Send, Loader2, Trash2, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Renderiza inline markdown: **bold** e *italic* */
function renderInline(text: string): ReactNode[] {
    const parts: ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        if (match[2]) {
            parts.push(
                <strong key={key++} className="font-semibold">
                    {match[2]}
                </strong>
            );
        } else if (match[3]) {
            parts.push(
                <em key={key++} className="italic">
                    {match[3]}
                </em>
            );
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
}

/** Renderiza markdown em bloco: headings, bullets, blockquotes, hr */
function renderMarkdown(text: string): ReactNode {
    const lines = text.split("\n");
    return (
        <div className="space-y-1">
            {lines.map((line, i) => {
                const trimmed = line.trim();

                if (!trimmed) return <div key={i} className="h-1.5" />;

                if (/^-{3,}$/.test(trimmed)) {
                    return <hr key={i} className="my-1.5 border-current opacity-20" />;
                }

                if (trimmed.startsWith("> ")) {
                    return (
                        <blockquote
                            key={i}
                            className="border-l-2 border-current/30 pl-2.5 text-sm italic opacity-80"
                        >
                            {renderInline(trimmed.slice(2))}
                        </blockquote>
                    );
                }

                if (trimmed.startsWith("### ")) {
                    return (
                        <p key={i} className="mt-1.5 text-sm font-bold">
                            {renderInline(trimmed.slice(4))}
                        </p>
                    );
                }

                if (trimmed.startsWith("## ")) {
                    return (
                        <p key={i} className="mt-1.5 text-sm font-bold">
                            {renderInline(trimmed.slice(3))}
                        </p>
                    );
                }

                if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
                    return (
                        <p key={i} className="pl-2 text-sm">
                            <span className="mr-1 opacity-50">•</span>
                            {renderInline(trimmed.slice(2))}
                        </p>
                    );
                }

                return (
                    <p key={i} className="text-sm">
                        {renderInline(line)}
                    </p>
                );
            })}
        </div>
    );
}

interface Message {
    role: "user" | "assistant";
    content: string;
}

interface ChatPanelProps {
    transcriptionId: string;
}

export function ChatPanel({ transcriptionId }: ChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || isStreaming) return;

        const userMessage: Message = { role: "user", content: trimmed };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput("");
        setIsStreaming(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
                    transcriptionId,
                }),
            });

            if (!res.ok) {
                throw new Error("Erro ao enviar mensagem");
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("Stream não disponível");

            const decoder = new TextDecoder();
            let assistantContent = "";

            // Add empty assistant message
            setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                assistantContent += chunk;

                setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        role: "assistant",
                        content: assistantContent,
                    };
                    return updated;
                });
            }
        } catch (err) {
            console.error("Chat error:", err);
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
                },
            ]);
        } finally {
            setIsStreaming(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const clearChat = () => {
        setMessages([]);
        setInput("");
    };

    return (
        <div className="flex h-full flex-col rounded-xl border border-border bg-white shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md gradient-primary">
                        <MessageSquare className="h-3.5 w-3.5 text-white" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">Chat</h3>
                </div>
                {messages.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearChat}
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                        title="Nova conversa"
                    >
                        <Trash2 className="h-3 w-3" />
                        Limpar
                    </Button>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                        <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">
                            Pergunte algo sobre a audiência
                        </p>
                        <p className="text-xs text-muted-foreground/60">
                            Ex: &quot;Quem são as partes envolvidas?&quot;
                        </p>
                    </div>
                )}

                <div className="space-y-3">
                    {messages.map((message, i) => (
                        <div
                            key={i}
                            className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            {message.role === "assistant" && (
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                                    <Bot className="h-3.5 w-3.5 text-primary" />
                                </div>
                            )}
                            <div
                                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${message.role === "user"
                                    ? "gradient-primary text-white"
                                    : "bg-gray-50 text-foreground border border-border/50"
                                    }`}
                            >
                                {!message.content ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                ) : message.role === "assistant" ? (
                                    renderMarkdown(message.content)
                                ) : (
                                    message.content
                                )}
                            </div>
                            {message.role === "user" && (
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                                    <User className="h-3.5 w-3.5 text-primary" />
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input */}
            <div className="border-t border-border p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                <form onSubmit={handleSubmit} className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Pergunte sobre a audiência..."
                        className="flex-1 resize-none rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                        rows={1}
                        disabled={isStreaming}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!input.trim() || isStreaming}
                        className="h-9 w-9 shrink-0 rounded-lg gradient-primary text-white shadow-sm disabled:opacity-40"
                    >
                        {isStreaming ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </form>
            </div>
        </div>
    );
}
