import React from 'react';
import { CheckSquare, ChevronDown, ChevronUp, FileText, Plus, Square, Trash2 } from 'lucide-react';
import {
  OPS_ANALISTA,
  OPS_SITUACAO,
  OPS_TIPO_BARRAGEM,
  OPS_TIPO_CLASSIFICACAO,
} from '../../constants';
import { DocItem, ParecerData } from '../../types';
import { buildAutomaticIntroText } from '../../src/utils/opinionCalculations';

interface DocItemRowProps {
  item: DocItem;
  listKey: keyof ParecerData;
  hasExtraInput?: boolean;
  extraPlaceholder?: string;
  artMode?: boolean;
  readOnly?: boolean;
  onDocChange: (listKey: keyof ParecerData, id: string, field: keyof DocItem, value: any) => void;
  onRemove?: () => void;
}

const DocItemRow: React.FC<DocItemRowProps> = ({
  item,
  listKey,
  hasExtraInput,
  extraPlaceholder,
  artMode = false,
  readOnly = false,
  onDocChange,
  onRemove,
}) => {
  const isOutroItem = item.label === 'OUTRO';

  return (
    <div
      className={`flex flex-wrap items-start gap-4 p-3 rounded-md transition-colors ${
        item.checked ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-slate-50 border border-transparent'
      }`}
    >
      <button
        type="button"
        disabled={readOnly}
        onClick={() => {
          if (!readOnly) onDocChange(listKey, item.id, 'checked', !item.checked);
        }}
        className="flex items-center gap-3 cursor-pointer mt-1 w-full sm:w-auto text-left disabled:cursor-default"
      >
        {item.checked ? (
          <CheckSquare className="text-emerald-600 shrink-0" size={20} />
        ) : (
          <Square className="text-slate-400 shrink-0" size={20} />
        )}
        <span className={`text-sm ${item.checked ? 'text-slate-900 font-medium' : 'text-slate-600'} leading-snug`}>
          {item.label}
        </span>
      </button>

      {item.checked && (
        <div className="flex flex-wrap gap-2 flex-1 ml-8 sm:ml-0 w-full sm:w-auto">
          {artMode && (
            <>
              <div className="flex items-center gap-1 w-full sm:w-auto">
                <span className="text-xs text-slate-500 whitespace-nowrap">ART nº:</span>
                <input
                  type="text"
                  placeholder="123456"
                  className="text-xs border border-slate-400 bg-[#F5F5F5] rounded px-2 py-1 w-full sm:w-28 focus:bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 shadow-sm transition-all outline-none"
                  value={item.extraInput || ''}
                  onChange={(e) => onDocChange(listKey, item.id, 'extraInput', e.target.value)}
                />
              </div>
              {isOutroItem && (
                <input
                  type="text"
                  placeholder={extraPlaceholder || 'Atividade técnica / descrição complementar...'}
                  className="text-xs border border-slate-400 bg-[#F5F5F5] rounded px-2 py-1 flex-1 min-w-[180px] w-full sm:w-auto focus:bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 shadow-sm transition-all outline-none"
                  value={item.extraSelect || ''}
                  onChange={(e) => onDocChange(listKey, item.id, 'extraSelect', e.target.value)}
                />
              )}
            </>
          )}

          {!artMode && hasExtraInput && (
            <input
              type="text"
              placeholder={extraPlaceholder || (isOutroItem ? 'Descrição do documento...' : 'Detalhes...')}
              className="text-xs border border-slate-400 bg-[#F5F5F5] rounded px-2 py-1 flex-1 min-w-[160px] w-full sm:w-auto focus:bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 shadow-sm transition-all outline-none"
              value={item.extraInput || ''}
              onChange={(e) => onDocChange(listKey, item.id, 'extraInput', e.target.value)}
            />
          )}

          <div className="flex items-center gap-1 w-full sm:w-auto">
            <span className="text-xs text-slate-500 whitespace-nowrap">Folha(s):</span>
            <input
              type="text"
              placeholder="Ex: 15"
              className="text-xs border border-slate-400 bg-[#F5F5F5] rounded px-2 py-1 w-20 focus:bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 shadow-sm transition-all outline-none"
              value={item.pageNumber || ''}
              onChange={(e) => onDocChange(listKey, item.id, 'pageNumber', e.target.value)}
            />
          </div>

          {!readOnly && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
              title="Remover"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface Topic1IntroducaoProps {
  formData: ParecerData;
  isOpen: boolean;
  docGroupsOpen: {
    geral: boolean;
    ident: boolean;
    espolio: boolean;
    art: boolean;
    tecnico: boolean;
  };
  readOnly?: boolean;
  onToggleSection: () => void;
  onToggleDocGroup: (group: 'geral' | 'ident' | 'espolio' | 'art' | 'tecnico') => void;
  onInputChange: (field: keyof ParecerData, value: any) => void;
  onDocChange: (listKey: keyof ParecerData, id: string, field: keyof DocItem, value: any) => void;
  onAddOtherDoc: (listKey: keyof ParecerData, prefix: string) => void;
  onRemoveOtherDoc: (listKey: keyof ParecerData, id: string) => void;
}

export const Topic1Introducao: React.FC<Topic1IntroducaoProps> = ({
  formData,
  isOpen,
  docGroupsOpen,
  readOnly = false,
  onToggleSection,
  onToggleDocGroup,
  onInputChange,
  onDocChange,
  onAddOtherDoc,
  onRemoveOtherDoc,
}) => {
  const autoIntroText = buildAutomaticIntroText(formData);
  const analystNotInList =
    formData.analista &&
    formData.analista !== 'OUTRO' &&
    !OPS_ANALISTA.includes(formData.analista);

  return (
    <section id="introducao" className="scroll-mt-56">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <button
          type="button"
          onClick={onToggleSection}
          className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
        >
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              1
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                IDENTIFICAÇÃO DO PARECER E INTRODUÇÃO
              </h2>
              <p className="text-xs text-slate-500">
                Processo, analista, objeto da classificação, introdução e documentos analisados
              </p>
            </div>
          </div>
          <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
            {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </div>
        </button>

        {isOpen && (
          <div className="space-y-6">
            {/* Identificação do Parecer */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h3 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
                <FileText size={16} className="text-emerald-600" />
                Identificação do Parecer
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Número do Processo / Protocolo
                  </label>
                  <input
                    type="text"
                    value={formData.protocolo}
                    onChange={(e) => onInputChange('protocolo', e.target.value)}
                    placeholder="Ex: 123456/2025"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Data de Recebimento do Processo
                  </label>
                  <input
                    type="date"
                    value={formData.dataRecebimentoProcesso || ''}
                    onChange={(e) => onInputChange('dataRecebimentoProcesso', e.target.value)}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Analista Responsável
                  </label>
                  <select
                    value={formData.analista}
                    onChange={(e) => onInputChange('analista', e.target.value)}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  >
                    <option value="">Selecione o analista...</option>
                    {analystNotInList && (
                      <option value={formData.analista}>{formData.analista}</option>
                    )}
                    {OPS_ANALISTA.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  {formData.analista === 'OUTRO' && (
                    <input
                      type="text"
                      value={formData.analistaOutro || ''}
                      onChange={(e) => onInputChange('analistaOutro', e.target.value)}
                      placeholder="Nome completo do analista..."
                      className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Tipo de Classificação
                  </label>
                  <select
                    value={formData.tipoClassificacao}
                    onChange={(e) => onInputChange('tipoClassificacao', e.target.value)}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  >
                    {OPS_TIPO_CLASSIFICACAO.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  {formData.tipoClassificacao === 'OUTRO' && (
                    <input
                      type="text"
                      placeholder="Especifique o tipo de classificação..."
                      value={formData.tipoClassificacaoOutro}
                      onChange={(e) => onInputChange('tipoClassificacaoOutro', e.target.value)}
                      className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Tipo de Barragem
                  </label>
                  <select
                    value={formData.tipoBarragem}
                    onChange={(e) => onInputChange('tipoBarragem', e.target.value)}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  >
                    {OPS_TIPO_BARRAGEM.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  {formData.tipoBarragem === 'OUTRO' && (
                    <input
                      type="text"
                      placeholder="Especifique o tipo de barragem..."
                      value={formData.tipoBarragemOutro}
                      onChange={(e) => onInputChange('tipoBarragemOutro', e.target.value)}
                      className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Situação do Empreendimento
                  </label>
                  <select
                    value={formData.situacaoEmpreendimento}
                    onChange={(e) => onInputChange('situacaoEmpreendimento', e.target.value)}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  >
                    <option value="">Selecione...</option>
                    {OPS_SITUACAO.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  {formData.situacaoEmpreendimento === 'OUTRO' && (
                    <input
                      type="text"
                      placeholder="Especifique a situação..."
                      value={formData.situacaoEmpreendimentoOutro}
                      onChange={(e) => onInputChange('situacaoEmpreendimentoOutro', e.target.value)}
                      className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Texto da Introdução */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Texto da Introdução (editável)
                </label>
                {!readOnly && formData.introducao.trim() === '' && (
                  <button
                    type="button"
                    onClick={() => onInputChange('introducao', autoIntroText)}
                    className="text-xs px-2.5 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-semibold transition-colors"
                  >
                    Carregar texto automático para editar
                  </button>
                )}
              </div>

              <textarea
                rows={7}
                className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                value={formData.introducao}
                onChange={(e) => onInputChange('introducao', e.target.value)}
                placeholder="Se deixado em branco, o texto automático abaixo será utilizado no parecer..."
              />

              {formData.introducao.trim() === '' && (
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Prévia do texto automático de introdução (campo vazio)
                  </span>
                  <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                    {autoIntroText}
                  </p>
                </div>
              )}
            </div>

            {/* Relação de Documentos Analisados */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                Relação de Documentos Analisados
              </h3>

              {/* Gerais */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => onToggleDocGroup('geral')}
                  className="w-full flex justify-between items-center p-3 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <span className="font-bold text-sm text-slate-700">Documentos Gerais</span>
                  {docGroupsOpen.geral ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {docGroupsOpen.geral && (
                  <div className="p-3 bg-white space-y-2">
                    {formData.docsGerais.map((item) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsGerais"
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                      />
                    ))}
                    {formData.docsGeraisOutro.map((item, index) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsGeraisOutro"
                        hasExtraInput={true}
                        extraPlaceholder="Nome/descrição do documento..."
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                        onRemove={
                          index > 0 ? () => onRemoveOtherDoc('docsGeraisOutro', item.id) : undefined
                        }
                      />
                    ))}
                    {!readOnly && formData.docsGeraisOutro.some((d) => d.checked) && (
                      <button
                        type="button"
                        onClick={() => onAddOtherDoc('docsGeraisOutro', 'geral')}
                        className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                      >
                        <Plus size={14} /> Adicionar outro documento
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Identificação */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => onToggleDocGroup('ident')}
                  className="w-full flex justify-between items-center p-3 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <span className="font-bold text-sm text-slate-700">
                    Documentos de Identificação
                  </span>
                  {docGroupsOpen.ident ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {docGroupsOpen.ident && (
                  <div className="p-3 bg-white space-y-2">
                    {formData.docsIdentificacao.map((item) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsIdentificacao"
                        hasExtraInput={item.extraInput !== undefined}
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                      />
                    ))}
                    {formData.docsIdentificacaoOutro.map((item, index) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsIdentificacaoOutro"
                        hasExtraInput={true}
                        extraPlaceholder="Descrição do documento de identificação..."
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                        onRemove={
                          index > 0
                            ? () => onRemoveOtherDoc('docsIdentificacaoOutro', item.id)
                            : undefined
                        }
                      />
                    ))}
                    {!readOnly && formData.docsIdentificacaoOutro.some((d) => d.checked) && (
                      <button
                        type="button"
                        onClick={() => onAddOtherDoc('docsIdentificacaoOutro', 'ident')}
                        className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                      >
                        <Plus size={14} /> Adicionar outro documento
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Espólio */}
              <div className="border rounded-lg overflow-hidden">
                <div className="p-3 bg-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.espolio}
                      onChange={(e) => onInputChange('espolio', e.target.checked)}
                      className="rounded text-emerald-600 w-5 h-5"
                      id="checkEspolio"
                    />
                    <label
                      htmlFor="checkEspolio"
                      className="font-bold text-sm text-slate-700 cursor-pointer"
                    >
                      Solicitante falecido (Espólio)
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleDocGroup('espolio')}
                    disabled={!formData.espolio}
                    className="disabled:opacity-30"
                  >
                    {docGroupsOpen.espolio ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
                {formData.espolio && docGroupsOpen.espolio && (
                  <div className="p-3 bg-white space-y-2 border-t border-slate-200">
                    {formData.docsEspolio.map((item) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsEspolio"
                        hasExtraInput={item.extraInput !== undefined}
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                      />
                    ))}
                    {formData.docsEspolioOutro.map((item, index) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsEspolioOutro"
                        hasExtraInput={true}
                        extraPlaceholder="Descrição do documento de espólio..."
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                        onRemove={
                          index > 0 ? () => onRemoveOtherDoc('docsEspolioOutro', item.id) : undefined
                        }
                      />
                    ))}
                    {!readOnly && formData.docsEspolioOutro.some((d) => d.checked) && (
                      <button
                        type="button"
                        onClick={() => onAddOtherDoc('docsEspolioOutro', 'espolio')}
                        className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                      >
                        <Plus size={14} /> Adicionar outro documento
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ARTs */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => onToggleDocGroup('art')}
                  className="w-full flex justify-between items-center p-3 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <span className="font-bold text-sm text-slate-700">ARTs e Equipe Técnica</span>
                  {docGroupsOpen.art ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {docGroupsOpen.art && (
                  <div className="p-3 bg-white space-y-2">
                    {formData.docsArt.map((item) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsArt"
                        artMode={true}
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                      />
                    ))}
                    {formData.docsArtOutro.map((item, index) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsArtOutro"
                        artMode={true}
                        hasExtraInput={true}
                        extraPlaceholder="Descrição / atividade técnica da ART..."
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                        onRemove={
                          index > 0 ? () => onRemoveOtherDoc('docsArtOutro', item.id) : undefined
                        }
                      />
                    ))}
                    {!readOnly && formData.docsArtOutro.some((d) => d.checked) && (
                      <button
                        type="button"
                        onClick={() => onAddOtherDoc('docsArtOutro', 'art')}
                        className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                      >
                        <Plus size={14} /> Adicionar outra ART
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Técnicos */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => onToggleDocGroup('tecnico')}
                  className="w-full flex justify-between items-center p-3 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <span className="font-bold text-sm text-slate-700">Documentos Técnicos</span>
                  {docGroupsOpen.tecnico ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {docGroupsOpen.tecnico && (
                  <div className="p-3 bg-white space-y-2">
                    {formData.docsTecnicos.map((item) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsTecnicos"
                        hasExtraInput={item.extraInput !== undefined}
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                      />
                    ))}
                    {formData.docsTecnicosOutro.map((item, index) => (
                      <DocItemRow
                        key={item.id}
                        item={item}
                        listKey="docsTecnicosOutro"
                        hasExtraInput={true}
                        extraPlaceholder="Descrição do documento técnico..."
                        readOnly={readOnly}
                        onDocChange={onDocChange}
                        onRemove={
                          index > 0
                            ? () => onRemoveOtherDoc('docsTecnicosOutro', item.id)
                            : undefined
                        }
                      />
                    ))}
                    {!readOnly && formData.docsTecnicosOutro.some((d) => d.checked) && (
                      <button
                        type="button"
                        onClick={() => onAddOtherDoc('docsTecnicosOutro', 'tec')}
                        className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                      >
                        <Plus size={14} /> Adicionar outro documento
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
