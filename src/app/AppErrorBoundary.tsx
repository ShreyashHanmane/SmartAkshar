import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorScreen } from './ErrorScreen';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Development only: never log user content or details in production.
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <ErrorScreen /> : this.props.children;
  }
}
