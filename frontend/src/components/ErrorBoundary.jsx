import { Component } from "react";

/**
 * Render-time error boundary. Tanpa ini, kalau ada exception di salah satu
 * child, React 18 akan unmount seluruh tree dan halaman tampak blank.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log lengkap ke console agar developer bisa lihat stack trace.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    this.setState({ info });
  }

  handleReset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { error, info } = this.state;
    return (
      <div className="h-full overflow-auto bg-red-950/40 p-8 text-red-100">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 text-xs uppercase tracking-widest text-red-300">
            Render error
          </div>
          <h1 className="mb-2 text-2xl font-bold">
            {error?.name || "Error"}: {error?.message || String(error)}
          </h1>
          <p className="mb-6 text-sm text-red-300">
            Komponen di bawah ini melempar error saat dirender. Buka DevTools
            Console (Cmd+Option+J) untuk stack trace lengkap.
          </p>

          {error?.stack && (
            <pre className="mb-4 overflow-auto rounded-md border border-red-500/30 bg-black/40 p-4 text-[11px] leading-relaxed text-red-200">
              {error.stack}
            </pre>
          )}

          {info?.componentStack && (
            <details className="mb-4 rounded-md border border-red-500/30 bg-black/40 p-4 text-[11px] text-red-200">
              <summary className="cursor-pointer font-semibold">
                Component stack
              </summary>
              <pre className="mt-2 overflow-auto">{info.componentStack}</pre>
            </details>
          )}

          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400"
          >
            Coba render ulang
          </button>
        </div>
      </div>
    );
  }
}
