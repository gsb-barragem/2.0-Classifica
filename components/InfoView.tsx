
import React, { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../src/supabaseClient';
import { 
  Cpu, Shield, Zap, Info, Building2, Target, Wand2, ListChecks, 
  Mail, Phone, ArrowRight, ExternalLink, FileText, Scale, BookOpen,
  ChevronRight, Download, Globe, Award, Users, Briefcase, UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface InfoViewProps {
  currentUser: any;
  getGreeting: () => string;
}

const InfoView: React.FC<InfoViewProps> = ({ currentUser, getGreeting }) => {
  const [activeInfo, setActiveInfo] = useState<string | null>(null);

  const legislations = [
    {
      title: "PNSB (Política Nacional de Segurança de Barragens)",
      subtitle: "LEI Nº 12.334, DE 20 DE SETEMBRO DE 2010",
      description: "Estabelece a Política Nacional de Segurança de Barragens destinadas à acumulação de água para quaisquer usos, à disposição final ou temporária de rejeitos e à acumulação de resíduos industriais, cria o Sistema Nacional de Informações sobre Segurança de Barragens e altera a redação do art. 35 da Lei no 9.433, de 8 de janeiro de 1997, e do art. 4o da Lei no 9.984, de 17 de julho de 2000.",
      link: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12334.htm",
      type: "Lei Federal",
      icon: <Scale className="text-blue-500" size={20} />
    },
    {
      title: "RESOLUÇÃO CNRH Nº 241, DE 10 DE SETEMBRO DE 2024",
      subtitle: "Critérios Gerais de Classificação",
      description: "Estabelece critérios gerais de classificação de barragens por dano potencial associado, por volume e por categoria de risco, em atendimento ao art. 7° da Lei n. 12.334, de 20 de setembro de 2010.",
      link: "https://www.gov.br/anm/pt-br/assuntos/barragens/legislacao/cnrh-no-241-2024.pdf",
      type: "Resolução",
      icon: <FileText className="text-emerald-500" size={20} />
    },
    {
      title: "RESOLUÇÃO CEHIDRO Nº 163 DE 11 DE MAIO DE 2023",
      subtitle: "Revoga a Resolução 99",
      description: "Estabelece a periodicidade de execução ou atualização, a qualificação dos responsáveis técnicos, o conteúdo mínimo e o nível de detalhamento do Plano de Segurança da Barragem, das Inspeções de Segurança Regular e Especial, da Revisão Periódica de Segurança de Barragem e do Plano de Ação de Emergência, das Barragens fiscalizadas pela SEMA.",
      link: "http://www.sema.mt.gov.br/site/phocadownload/Portarias_barragens_2021/RESOLUO%20CEHIDRO%20N%20163%20DE%2011%20DE%20MAIO%20DE%202023%20Revoga%20a%20Resoluo%2099.pdf",
      type: "Resolução Estadual",
      icon: <BookOpen className="text-amber-500" size={20} />
    },
    {
      title: "Instrução Normativa nº 08, de 18 de dezembro de 2023",
      subtitle: "Procedimentos de Classificação",
      description: "Dispõe sobre os procedimentos referentes à Classificação quanto à Segurança de Barragens para usos múltiplos, exceto para geração de energia, em corpos hídricos de dominialidade do Estado de Mato Grosso e dá outras providências.",
      link: "http://www.sema.mt.gov.br/site/phocadownload/Barragem/Instruo%20Normativa%20n%2008%20de%2019%20de%20dezembro%20de%202023.pdf",
      type: "Instrução Normativa",
      icon: <Shield className="text-purple-500" size={20} />
    },
    {
      title: "TR 17 - SURH - CLASSIFICAÇÃO DE BARRAGEM",
      subtitle: "Termo de Referência",
      description: "Classificação quanto à Segurança de barragem de acumulação de água para usos múltiplos, exceto para geração de energia, com ou sem captação de água.",
      link: "http://www.sema.mt.gov.br/site/phocadownload/Barragem/TR%2017-%20SURH%20-%20CLASSIFICAO%20DE%20BARRAGEM%20-%20Atualizado%2005.07.2024.pdf",
      type: "Termo de Referência",
      icon: <Award className="text-rose-500" size={20} />
    },
    {
      title: "ANEXO I - REQUERIMENTO PARA CADASTRO SNISB",
      subtitle: "Cadastro Nacional",
      description: "Formulário de requerimento para cadastro no Sistema Nacional de Informações sobre Segurança de Barragens.",
      link: "https://drive.google.com/file/d/1VNem6xR6DHJS_SHuTiMuMHQ3BV-cgBpX/view?usp=sharing",
      type: "Formulário",
      icon: <Download className="text-blue-400" size={20} />
    },
    {
      title: "TR 18 - SURH - Descomissionamento de barragem",
      subtitle: "Termo de Referência",
      description: "Descomissionamento de barragens de acumulação de água para usos múltiplos, exceto para geração de energia, com ou sem captação de água. (Análise quanto a segurança)",
      link: "http://www.sema.mt.gov.br/site/phocadownload/Barragem_2025/TR18%20-%20SURH%20-%20Descomissionamento%20de%20barragem%20-%20Atualizado%2006_10_2025%201.pdf",
      type: "Termo de Referência",
      icon: <Zap className="text-orange-500" size={20} />
    }
  ];

  const [team, setTeam] = useState<{sector: string; icon: React.ReactNode; members: {name: string; role: string}[]}[]>([]);
  const [teamError, setTeamError] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }
    let alive = true;
    const sectors = [
      { name: 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS', icon: <ListChecks className="text-emerald-500" size={20} /> },
      { name: 'SETOR DE FISCALIZAÇÃO E MONITORAMENTO', icon: <Shield className="text-blue-500" size={20} /> },
      { name: 'SETOR ADMINISTRATIVO', icon: <Briefcase className="text-amber-500" size={20} /> },
      { name: 'COORDENADOR', icon: <UserCheck className="text-rose-500" size={20} /> },
      { name: 'SETOR NÃO INFORMADO', icon: <Users className="text-slate-500" size={20} /> },
    ];
    const loadTeam = async () => {
      const { data, error } = await supabase.rpc('classifica_public_team');
      if (!alive) return;
      if (error) { setTeamError(true); return; }
      const rows = data || [];
      setTeam(sectors.map((sector) => ({
        sector: sector.name,
        icon: sector.icon,
        members: rows.filter((u: any) => (u.setor || 'SETOR NÃO INFORMADO') === sector.name)
          .map((u: any) => ({ name: u.name, role: u.role })),
      })).filter(group => group.members.length > 0));
      setTeamError(false);
    };
    loadTeam();
    const channel = supabase.channel('classifica-users-info')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, loadTeam)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="p-6 md:p-12 max-w-[1600px] mx-auto w-full space-y-12">
      
      {/* Hero / Header Section - Technical & Modern */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-slate-900 rounded-[3rem] p-10 md:p-20 overflow-hidden shadow-2xl border border-slate-800"
      >
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-emerald-500 rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-blue-600 rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-12">
          <div className="max-w-3xl text-center lg:text-left">
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-8">
              <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest border border-slate-800 px-3 py-1.5 rounded-full">Sistema Institucional</span>
            </div>
            
            <div className="mb-4">
              <span className="text-emerald-400/80 font-medium text-lg">
                Olá <span className="text-white font-bold">{currentUser?.name || 'Analista'}</span>, {getGreeting()}!
              </span>
            </div>
            
            <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter mb-8 leading-[0.85]">
              Classifica <span className="text-emerald-500">CSB</span>
            </h1>
            
            <p className="text-slate-400 text-xl md:text-2xl leading-relaxed font-medium max-w-2xl">
              Plataforma técnica de alta performance para automação, análise e monitoramento da segurança de barragens no estado de Mato Grosso.
            </p>
          </div>
          
          <div className="hidden lg:block relative">
            <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full"></div>
            <div className="relative p-12 bg-slate-800/30 rounded-[3rem] border border-slate-700/50 backdrop-blur-md shadow-inner">
              <Building2 className="text-emerald-500 w-32 h-32 opacity-90" strokeWidth={1} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Column - Info & Features */}
        <div className="lg:col-span-8 space-y-12">
          
          {/* Institutional Info */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700"></div>
            <div className="relative z-10">
              <h3 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3 tracking-tight">
                <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
                  <Info size={24} />
                </div>
                Sobre a Instituição
              </h3>
              <p className="text-slate-600 leading-relaxed text-lg text-justify font-medium">
                A <strong>Coordenadoria de Segurança de Barragens (CSB)</strong>, setor integrante da <strong>Superintendência de Recursos Hídricos (SURH)</strong> da <strong>Secretaria de Estado de Meio Ambiente (SEMA-MT)</strong>, é responsável por regular e fiscalizar a segurança das estruturas de barramento estaduais. Este sistema foi desenvolvido para padronizar procedimentos, garantir conformidade com a Lei 12.334/2010 e atualizações, e promover a eficiência na gestão hídrica.
              </p>
            </div>
          </motion.div>

          {/* Corpo Técnico Section - NEW */}
          <div className="space-y-8">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
                <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
                  <Users size={24} />
                </div>
                Corpo Técnico CSB/SURH/SEMA-MT
              </h3>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Equipe Especializada</span>
            </div>

            {teamError ? (
              <p className="bg-amber-50 border border-amber-200 text-amber-800 p-5 rounded-2xl">Não foi possível carregar a equipe agora. Confira a conexão e se a coluna setor está disponível na tabela users.</p>
            ) : team.length === 0 ? (
              <p className="bg-white border border-slate-200 text-slate-500 p-5 rounded-2xl">Nenhum usuário ativo cadastrado para exibição.</p>
            ) : <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {team.map((group, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                    {group.icon}
                  </div>
                  
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-emerald-50 transition-colors">
                      {group.icon}
                    </div>
                    <h4 className="font-black text-slate-900 text-sm tracking-tight uppercase">
                      {group.sector}
                    </h4>
                  </div>

                  <div className="space-y-4">
                    {group.members.map((member, mIdx) => (
                      <div key={mIdx} className="flex flex-col border-l-2 border-slate-100 pl-4 hover:border-emerald-500 transition-colors">
                        <span className="text-slate-900 font-bold text-sm">{member.name}</span>
                        <span className="text-slate-500 text-xs font-medium">{member.role}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>}
          </div>

          {/* Legislations Block - NEW & MODERN */}
          <div className="space-y-8">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
                <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                  <Scale size={24} />
                </div>
                Legislações e Normativas
              </h3>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Documentação Técnica</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {legislations.map((leg, idx) => (
                <motion.a
                  key={idx}
                  href={leg.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 }}
                  className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-emerald-500/30 transition-all duration-300 flex flex-col md:flex-row gap-6 items-start md:items-center relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  
                  <div className="p-4 bg-slate-50 rounded-2xl group-hover:bg-white transition-colors shadow-inner group-hover:shadow-sm relative z-10">
                    {leg.icon}
                  </div>
                  
                  <div className="flex-1 relative z-10">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                        {leg.type}
                      </span>
                    </div>
                    <h4 className="font-black text-slate-900 text-lg group-hover:text-emerald-600 transition-colors tracking-tight">
                      {leg.title}
                    </h4>
                    <p className="text-slate-400 text-xs font-bold mb-2 uppercase tracking-tighter">{leg.subtitle}</p>
                    <p className="text-slate-500 text-sm leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all duration-500">
                      {leg.description}
                    </p>
                  </div>
                  
                  <div className="p-3 bg-slate-50 rounded-full text-slate-300 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300 relative z-10">
                    <ExternalLink size={18} />
                  </div>
                </motion.a>
              ))}
            </div>
          </div>

          {/* Funcionalidades Principais */}
          <div className="space-y-8">
            <h3 className="text-2xl font-black text-slate-900 px-2 flex items-center gap-3 tracking-tight">
              <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
                <Wand2 size={24} />
              </div>
              Funcionalidades Principais
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { 
                  icon: <ListChecks size={24} />, 
                  title: "Seleções pré-definidas", 
                  desc: "Reduz erros humanos com opções padronizadas conforme normas técnicas.",
                  color: "blue"
                },
                { 
                  icon: <Cpu size={24} />, 
                  title: "Cálculos automáticos", 
                  desc: "DPA (Dano Potencial Associado) e CRI (Categoria de Risco) processados instantaneamente.",
                  color: "purple"
                },
                { 
                  icon: <Shield size={24} />, 
                  title: "Enquadramento PNSB", 
                  desc: "Classificação automática se a barragem se enquadra ou não na Política Nacional de Segurança de Barragens.",
                  color: "emerald"
                },
                { 
                  icon: <Zap size={24} />, 
                  title: "Otimização total", 
                  desc: "Geração rápida e confiável de documentos técnicos padronizados.",
                  color: "amber"
                }
              ].map((item, idx) => (
                <motion.div 
                  key={idx}
                  whileHover={{ y: -5 }}
                  className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-lg transition-all hover:border-emerald-200 group"
                >
                  <div className={`w-14 h-14 bg-${item.color}-50 text-${item.color}-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    {item.icon}
                  </div>
                  <h4 className="font-black text-slate-900 text-xl mb-3 tracking-tight">{item.title}</h4>
                  <p className="text-slate-500 leading-relaxed font-medium">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Sidebar & Contact */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Development Note - Technical Style */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden border border-slate-800"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 space-y-8">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-500 text-white p-3 rounded-2xl shadow-lg shadow-emerald-500/20">
                  <Cpu size={24} />
                </div>
                <div>
                  <h3 className="text-white font-black text-xl tracking-tight">Nota Técnica</h3>
                  <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em]">Desenvolvimento Nativo</p>
                </div>
              </div>

              <p className="text-slate-400 leading-relaxed font-medium text-sm">
                Este ecossistema digital foi concebido e arquitetado por uma <span className="text-white font-bold underline decoration-emerald-500/50 decoration-2 underline-offset-4">servidora efetiva</span> da SEMA-MT. O projeto une conhecimento jurídico-normativo à engenharia de software de ponta.
              </p>

              <div className="space-y-4">
                {[
                  { label: "Performance", value: "99.9%", color: "emerald" },
                  { label: "Segurança", value: "AES-256", color: "blue" }
                ].map((stat, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{stat.label}</span>
                      <span className={`text-${stat.color}-400 text-xs font-mono`}>{stat.value}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        whileInView={{ width: idx === 0 ? "99.9%" : "95%" }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className={`h-full bg-${stat.color}-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]`}
                      ></motion.div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                <span className="text-white text-[10px] font-black uppercase tracking-widest block mb-3">Stack Tecnológica</span>
                <div className="flex flex-wrap gap-2">
                  {['React 19', 'TypeScript', 'Tailwind', 'Vite', 'Firebase'].map(tech => (
                    <span key={tech} className="text-[9px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-700">{tech}</span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Contact Block */}
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-8">
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-xl text-slate-600">
                <Mail size={20} />
              </div>
              Contato CSB
            </h3>
            
            <div className="space-y-4">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 hover:border-emerald-500/30 transition-colors group">
                <div className="flex items-center gap-3 mb-2 text-emerald-600">
                  <Mail size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">E-mail Oficial</span>
                </div>
                <a href="mailto:csb@sema.mt.gov.br" className="text-sm font-bold text-slate-700 group-hover:text-emerald-600 transition-colors">
                  csb@sema.mt.gov.br
                </a>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 hover:border-emerald-500/30 transition-colors group">
                <div className="flex items-center gap-3 mb-2 text-emerald-600">
                  <Phone size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Telefone</span>
                </div>
                <span className="text-sm font-bold text-slate-700">
                  (65) 3613-7257
                </span>
              </div>
            </div>

            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
              <h4 className="font-black text-emerald-800 mb-4 text-xs uppercase tracking-widest">Links Institucionais</h4>
              <ul className="space-y-3">
                {[
                  { label: "Portal SEMA", link: "http://www.sema.mt.gov.br" },
                  { label: "Legislação de Barragens", link: "#" },
                  { label: "Manual do Usuário", link: "#" }
                ].map((link, idx) => (
                  <li key={idx}>
                    <a href={link.link} className="flex items-center justify-between group text-sm font-bold text-emerald-700 hover:text-emerald-900 transition-colors">
                      {link.label}
                      <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Goal Block */}
          <div className="bg-emerald-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Target size={120} />
            </div>
            <h3 className="text-xl font-black mb-4 flex items-center gap-3 relative z-10">
              <Target size={24} />
              Missão
            </h3>
            <p className="text-emerald-50 text-lg leading-relaxed font-medium relative z-10">
              Garantir a segurança hídrica e ambiental em Mato Grosso através da excelência técnica e inovação tecnológica.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default InfoView;
