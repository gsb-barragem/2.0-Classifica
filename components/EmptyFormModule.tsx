import React from 'react';
import { FileText } from 'lucide-react';

export const EmptyFormModule: React.FC<{title: string}> = ({ title }) => (
  <section className="min-h-[60vh] p-6 md:p-12 flex items-center justify-center">
    <div className="max-w-xl w-full rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><FileText size={30} /></div>
      <h2 className="text-2xl font-black text-slate-900">{title}</h2>
      <p className="mt-3 text-slate-500">Módulo reservado para a nova estrutura. O formulário será desenvolvido em uma etapa posterior.</p>
    </div>
  </section>
);
