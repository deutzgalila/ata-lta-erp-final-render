import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center border-2 border-[#0A0A0A] bg-[#FAF9F5] rounded-none shadow-[4px_4px_0px_#0A0A0A]">
          <div className="rounded-none bg-[#FCE8E8] p-4 text-[#A81212] mb-4 border border-[#E61919]">
            <AlertCircle className="h-8 w-8 text-[#E61919]" />
          </div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-[#0A0A0A] mb-2 font-display">
            Execution Fault Intercepted
          </h2>
          <p className="font-mono text-xs text-[#4A4945] max-w-md mb-6 break-words">
            An unhandled runtime exception occurred during rendering.
            {this.state.error?.message ? ` [CODE: ${this.state.error.message}]` : ''}
          </p>
          <Button onClick={this.handleReset} className="gap-2 font-mono text-xs uppercase font-bold">
            <RefreshCw className="h-4 w-4" />
            Restart Application
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
