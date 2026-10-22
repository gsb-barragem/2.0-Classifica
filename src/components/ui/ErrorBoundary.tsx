import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'Ocorreu um erro inesperado na aplicação.';
      
      try {
        // Tenta parsear o erro se for o JSON de erro do Supabase
        const errInfo = JSON.parse(this.state.error?.message || '');
        if (errInfo && errInfo.error) {
          errorMessage = `Erro de Banco de Dados: ${errInfo.error}`;
        }
      } catch (e) {
        // Se não for JSON, usa a mensagem original
        if (this.state.error?.message) {
          errorMessage = this.state.error.message;
        }
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[2rem] shadow-2xl p-10 text-center border border-slate-100">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-500/10">
              <AlertTriangle size={40} />
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Ops! Algo deu errado</h1>
            <p className="text-slate-500 mb-8 font-medium">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-slate-900/20 group"
            >
              <RotateCcw size={20} className="group-hover:rotate-180 transition-transform duration-500" />
              Recarregar Aplicação
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
