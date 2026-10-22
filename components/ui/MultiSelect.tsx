
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchable?: boolean;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, selected, onChange, searchable }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="flex items-end h-8 text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest leading-tight">
        {label}
      </label>
      <div 
        className="w-full border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between cursor-pointer hover:border-emerald-500 transition-all shadow-sm min-h-[46px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex flex-wrap gap-1 max-w-[90%] overflow-hidden">
          {selected.length === 0 ? (
            <span className="text-sm text-slate-400">Selecionar...</span>
          ) : (
            <span className="text-sm text-slate-700 font-bold">
              {selected.length === 1 ? selected[0] : `${selected.length} selecionados`}
            </span>
          )}
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
          {searchable && (
            <div className="p-3 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()} 
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto flex-1 p-1 scrollbar-thin scrollbar-thumb-slate-200">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt} 
                  className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-colors ${selected.includes(opt) ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                  onClick={() => toggleOption(opt)}
                >
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selected.includes(opt) ? 'bg-emerald-500 border-emerald-500 scale-110 shadow-sm' : 'border-slate-300 bg-white'}`}>
                    {selected.includes(opt) && <Check size={14} className="text-white stroke-[3px]" />}
                  </div>
                  {opt}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 font-medium italic">Nenhum resultado</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
