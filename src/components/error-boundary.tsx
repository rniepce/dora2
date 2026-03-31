"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
    children: ReactNode;
    fallbackMessage?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("ErrorBoundary caught:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                    <AlertCircle className="h-10 w-10 text-red-500" />
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">
                            {this.props.fallbackMessage ?? "Algo deu errado"}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {this.state.error?.message ?? "Erro inesperado. Tente recarregar a página."}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        Tentar novamente
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
