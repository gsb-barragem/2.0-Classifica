import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { ParecerData, OficioData, NoObligatoryData, RejectionData, TransferData } from '../../types';
import { supabase } from '../supabaseClient';
import { AuthContext } from './AuthContext';

export type AppDocument = (
  | (ParecerData & { tipo_documento: 'Parecer Técnico' }) 
  | (OficioData & { tipo_documento: 'Ofício de Pendências' })
  | (NoObligatoryData & { tipo_documento: 'Não Obrigatoriedade' })
  | (RejectionData & { tipo_documento: 'Indeferimento' })
  | (TransferData & { tipo_documento: 'Transferência de Titularidade' })
) & {
  protocolo?: string;
  processo?: string;
};

interface DataContextType {
  pareceres: ParecerData[];
  oficios: OficioData[];
  noObligatoriedades: NoObligatoryData[];
  indeferimentos: RejectionData[];
  transferencias: TransferData[];
  documents: AppDocument[];
  loading: boolean;
  refreshData: () => Promise<void>;
  deleteParecer: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteOficio: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteNoObligatoriedade: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteIndeferimento: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteTransferencia: (id: string) => Promise<{ success: boolean; message?: string }>;
}

export const DataContext = createContext<DataContextType>({
  pareceres: [],
  oficios: [],
  noObligatoriedades: [],
  indeferimentos: [],
  transferencias: [],
  documents: [],
  loading: true,
  refreshData: async () => {},
  deleteParecer: async () => ({ success: false }),
  deleteOficio: async () => ({ success: false }),
  deleteNoObligatoriedade: async () => ({ success: false }),
  deleteIndeferimento: async () => ({ success: false }),
  deleteTransferencia: async () => ({ success: false }),
});

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pareceres, setPareceres] = useState<ParecerData[]>([]);
  const [oficios, setOficios] = useState<OficioData[]>([]);
  const [noObligatoriedades, setNoObligatoriedades] = useState<NoObligatoryData[]>([]);
  const [indeferimentos, setIndeferimentos] = useState<RejectionData[]>([]);
  const [transferencias, setTransferencias] = useState<TransferData[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useContext(AuthContext);

  const fetchAllData = async () => {
    if (!currentUser) return;
    
    setLoading(true);
    try {
      // Fetch Pareceres
      const { data: pData, error: pError } = await supabase
        .from('pareceres')
        .select(`
          *,
          parecer_responsaveis (*),
          parecer_documentos (*),
          parecer_barramentos (
            *,
            parecer_estruturas (*)
          )
        `)
        .order('data_parecer', { ascending: false });

      if (pError) throw pError;

      const mappedPareceres: ParecerData[] = pData.map(p => {
        // Map database fields to ParecerData interface
        const principalBar = p.parecer_barramentos?.find((b: any) => b.is_principal);
        const montanteBars = p.parecer_barramentos?.filter((b: any) => !b.is_principal) || [];

        const baseData = p.data || {};

        return {
          ...baseData,
          id: p.id,
          userId: p.user_id,
          protocolo: p.protocolo || baseData.protocolo,
          analista: p.analista || baseData.analista,
          analistaOutro: p.analista_outro || baseData.analistaOutro,
          data: p.data_parecer || baseData.data,
          razaoSocial: p.razao_social || baseData.razaoSocial,
          cpfCnpj: p.cpf_cnpj || baseData.cpfCnpj,
          localizacao: p.localizacao || baseData.localizacao,
          numCAR: p.num_car || baseData.numCAR,
          municipio: p.municipio || baseData.municipio,
          finalidade: p.finalidade || baseData.finalidade,
          finalidadeOutro: p.finalidade_outro || baseData.finalidadeOutro,
          situacaoEmpreendimento: p.situacao_empreendimento || baseData.situacaoEmpreendimento,
          situacaoEmpreendimentoOutro: p.situacao_empreendimento_outro || baseData.situacaoEmpreendimentoOutro,
          cursoAgua: p.curso_agua || baseData.cursoAgua,
          propriedadesLimites: p.propriedades_limites || baseData.propriedadesLimites,
          subBacia: p.sub_bacia || baseData.subBacia,
          areaBacia: p.area_bacia || baseData.areaBacia,
          indicePluviosidade: p.indice_pluviosidade || baseData.indicePluviosidade,
          legendaTabela1: p.legenda_tabela1 || baseData.legendaTabela1,
          tipoClassificacao: p.tipo_classificacao || baseData.tipoClassificacao,
          tipoClassificacaoOutro: p.tipo_classificacao_outro || baseData.tipoClassificacaoOutro,
          tipoBarragem: p.tipo_barragem || baseData.tipoBarragem,
          tipoBarragemOutro: p.tipo_barragem_outro || baseData.tipoBarragemOutro,
          introducao: p.introducao || baseData.introducao,
          parecer_final: p.parecer_final || baseData.parecer_final || '',
          status: (p.status || baseData.status || 'Rascunho') as 'Rascunho' | 'Concluído',
          tipo_documento: 'Parecer Técnico' as const,
          dataConclusao: p.data_conclusao || baseData.dataConclusao,
          
          responsaveisTecnicos: p.parecer_responsaveis?.length > 0 
            ? p.parecer_responsaveis.map((rt: any) => ({
                id: rt.id,
                nome: rt.nome,
                art: rt.art
              }))
            : baseData.responsaveisTecnicos || [],

          docsGerais: p.parecer_documentos?.filter((d: any) => d.grupo === 'Gerais').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],
          docsGeraisOutro: p.parecer_documentos?.filter((d: any) => d.grupo === 'Gerais_Outro').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],
          docsIdentificacao: p.parecer_documentos?.filter((d: any) => d.grupo === 'Identificação').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],
          docsIdentificacaoOutro: p.parecer_documentos?.filter((d: any) => d.grupo === 'Identificação_Outro').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],
          docsEspolio: p.parecer_documentos?.filter((d: any) => d.grupo === 'Espólio').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],
          docsEspolioOutro: p.parecer_documentos?.filter((d: any) => d.grupo === 'Espólio_Outro').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],
          docsArt: p.parecer_documentos?.filter((d: any) => d.grupo === 'ART').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],
          docsArtOutro: p.parecer_documentos?.filter((d: any) => d.grupo === 'ART_Outro').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],
          docsTecnicos: p.parecer_documentos?.filter((d: any) => d.grupo === 'Técnicos').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],
          docsTecnicosOutro: p.parecer_documentos?.filter((d: any) => d.grupo === 'Técnicos_Outro').map((d: any) => ({ id: d.id, label: d.label, checked: d.checked, pageNumber: d.page_number, extraInput: d.extra_input })) || [],

          barragemPrincipal: principalBar ? {
            id: principalBar.id,
            nome: principalBar.nome,
            snisb: principalBar.snisb,
            lat: principalBar.lat,
            long: principalBar.long,
            alturaMaxima: principalBar.altura_maxima,
            alturaMaximaFls: principalBar.altura_maxima_fls,
            bordaLivre: principalBar.borda_livre,
            bordaLivreFls: principalBar.borda_livre_fls,
            cotaCoroamento: principalBar.cota_coroamento,
            cotaCoroamentoFls: principalBar.cota_coroamento_fls,
            comprimentoCoroamento: principalBar.comprimento_coroamento,
            comprimentoCoroamentoFls: principalBar.comprimento_coroamento_fls,
            larguraCoroamento: principalBar.largura_coroamento,
            larguraCoroamentoFls: principalBar.largura_coroamento_fls,
            tipoEstrutural: principalBar.tipo_estrutural,
            tipoFundacao: principalBar.tipo_fundacao,
            idade: principalBar.idade,
            scoreIdade: principalBar.score_idade,
            cotaNNO: principalBar.cota_nno,
            cotaNMM: principalBar.cota_nmm,
            areaNNO: principalBar.area_nno,
            areaNMM: principalBar.area_nmm,
            volumeNMO: principalBar.volume_nmo,
            volumeNMM: principalBar.volume_nmm,
            vazaoMaxima: principalBar.vazao_maxima,
            possuiAdequacao: principalBar.possui_adequacao,
            adequacaoVazao: principalBar.adequacao_vazao,
            adequacaoCota: principalBar.adequacao_cota,
            adequacaoLocalizacao: principalBar.adequacao_localizacao,
            adequacaoVazaoRemanescente: principalBar.adequacao_vazao_remanescente,
            adequacaoSeguranca: principalBar.adequacao_seguranca,
            estruturas: principalBar.parecer_estruturas?.map((e: any) => ({
              id: e.id,
              descricao: e.descricao,
              vazao: e.vazao,
              cotaSoleira: e.cota_soleira,
              localizacao: e.localizacao,
              seguranca: e.seguranca
            })) || []
          } : {} as any,

          barragensMontante: montanteBars.map((b: any) => ({
            id: b.id,
            nome: b.nome,
            snisb: b.snisb,
            lat: b.lat,
            long: b.long,
            alturaMaxima: b.altura_maxima,
            alturaMaximaFls: b.altura_maxima_fls,
            bordaLivre: b.borda_livre,
            bordaLivreFls: b.borda_livre_fls,
            cotaCoroamento: b.cota_coroamento,
            cotaCoroamentoFls: b.cota_coroamento_fls,
            comprimentoCoroamento: b.comprimento_coroamento,
            comprimentoCoroamentoFls: b.comprimento_coroamento_fls,
            larguraCoroamento: b.largura_coroamento,
            larguraCoroamentoFls: b.largura_coroamento_fls,
            tipoEstrutural: b.tipo_estrutural,
            tipoFundacao: b.tipo_fundacao,
            idade: b.idade,
            scoreIdade: b.score_idade,
            cotaNNO: b.cota_nno,
            cotaNMM: b.cota_nmm,
            areaNNO: b.area_nno,
            areaNMM: b.area_nmm,
            volumeNMO: b.volume_nmo,
            volumeNMM: b.volume_nmm,
            vazaoMaxima: b.vazao_maxima,
            possuiAdequacao: b.possui_adequacao,
            adequacaoVazao: b.adequacao_vazao,
            adequacaoCota: b.adequacao_cota,
            adequacaoLocalizacao: b.adequacao_localizacao,
            adequacaoVazaoRemanescente: b.adequacao_vazao_remanescente,
            adequacaoSeguranca: b.adequacao_seguranca,
            estruturas: b.parecer_estruturas?.map((e: any) => ({
              id: e.id,
              descricao: e.descricao,
              vazao: e.vazao,
              cotaSoleira: e.cota_soleira,
              localizacao: e.localizacao,
              seguranca: e.seguranca
            })) || []
          })),

          classificacao: {
            dpa1Select: p.dpa1_select,
            dpa2Select: p.dpa2_select,
            dpa3Select: p.dpa3_select,
            dpa4Select: p.dpa4_select,
            scoreDpa1: p.score_dpa1,
            scoreDpa2: p.score_dpa2,
            scoreDpa3: p.score_dpa3,
            scoreDpa4: p.score_dpa4,
            totalDpa: p.total_dpa,
            dpaClass: p.dpa_class,
            rupturaTexto: p.ruptura_texto,
            legendaDPA: p.legenda_dpa,
            criPreClassificacao: p.cri_pre_classificacao,
            scoreCt1: p.score_ct1,
            scoreCt2: p.score_ct2,
            scoreCt3: p.score_ct3,
            scoreCt4: p.score_ct4,
            scoreCt5: p.score_ct5,
            ct6Select: p.ct6_select,
            scoreCt6: p.score_ct6,
            ec1Select: p.ec1_select, scoreEc1: p.score_ec1,
            ec2Select: p.ec2_select, scoreEc2: p.score_ec2,
            ec3Select: p.ec3_select, scoreEc3: p.score_ec3,
            ec4Select: p.ec4_select, scoreEc4: p.score_ec4,
            ec5Select: p.ec5_select, scoreEc5: p.score_ec5,
            ps1Select: p.ps1_select, scorePs1: p.score_ps1,
            ps2Select: p.ps2_select, scorePs2: p.score_ps2,
            ps3Select: p.ps3_select, scorePs3: p.score_ps3,
            ps4Select: p.ps4_select, scorePs4: p.score_ps4,
            ps5Select: p.ps5_select, scorePs5: p.score_ps5,
            ps6Select: p.ps6_select, scorePs6: p.score_ps6,
            totalCT: p.total_ct,
            totalEC: p.total_ec,
            totalPS: p.total_ps,
            riskGeral: p.risk_geral,
            valGeral: p.val_geral,
            riskPercolacao: p.risk_percolacao,
            valPercolacao: p.val_percolacao,
            riskGalgamento: p.risk_galgamento,
            valGalgamento: p.val_galgamento,
            riskGerencial: p.risk_gerencial,
            valGerencial: p.val_gerencial,
            risco: p.risco,
            resumo: p.resumo
          },
          interessado: p.interessado || '',
          empreendimento: p.empreendimento || '',
          coordenadas: p.coordenadas || '',
          espolio: p.espolio || false,
          infoBarramento: p.info_barramento || ''
        };
      });

      setPareceres(mappedPareceres);

      // Fetch Oficios
      const { data: oData, error: oError } = await supabase
        .from('oficios')
        .select('*')
        .order('created_at', { ascending: false });

      if (oError) throw oError;

      const mappedOficios: OficioData[] = oData.map(o => ({
        ...o.data,
        id: o.id,
        userId: o.user_id,
        status: (o.status || 'Rascunho') as 'Rascunho' | 'Concluído',
        tipo_documento: 'Ofício de Pendências' as const,
        municipio: o.data?.municipio || o.municipio || '',
        created_at: o.created_at
      }));

      setOficios(mappedOficios);

      // Fetch NoObligatoriedades
      const { data: nData, error: nError } = await supabase
        .from('nao_obrigatoriedades')
        .select('*')
        .order('created_at', { ascending: false });

      if (nError) throw nError;

      const mappedNoObligatoriedades: NoObligatoryData[] = nData.map(n => ({
        ...n.data,
        data: n.data,
        id: n.id,
        userId: n.user_id,
        analista: n.analista,
        processo: n.processo,
        status: (n.status || 'Rascunho') as 'Rascunho' | 'Concluído',
        tipo_documento: 'Não Obrigatoriedade' as const,
        municipio: n.municipio,
        lat: n.lat,
        long: n.long,
        empreendedor: n.empreendedor,
        created_at: n.created_at,
        updated_at: n.updated_at
      }));

      setNoObligatoriedades(mappedNoObligatoriedades);

      // Fetch Indeferimentos
      const { data: indData, error: indError } = await supabase
        .from('indeferimentos')
        .select('*')
        .order('created_at', { ascending: false });

      if (indError) {
        console.warn('Tabela indeferimentos ainda não existe ou erro na busca:', indError);
      } else {
        const mappedIndeferimentos: RejectionData[] = indData.map(i => {
          const baseData = i.data || {};
          const analistaCalculated = i.analista || baseData.analista || 
            (i.analista_ref === 'OUTRO' ? (i.analista_ref_outro || baseData.analistaRefOutro) : (i.analista_ref || baseData.analistaRef)) ||
            (baseData.analistaRef === 'OUTRO' ? baseData.analistaRefOutro : baseData.analistaRef);

          return {
            ...baseData,
            id: i.id,
            userId: i.user_id,
            protocolo: i.protocolo || baseData.protocolo,
            analista: analistaCalculated,
            analistaRef: i.analista_ref || baseData.analistaRef,
            analistaRefOutro: i.analista_ref_outro || baseData.analistaRefOutro,
            dataProtocolo: i.data_protocolo || baseData.dataProtocolo,
            numProcesso: i.num_processo || baseData.numProcesso,
            nomeEmpreendedor: i.nome_empreendedor || baseData.nomeEmpreendedor,
            cpfCnpj: i.cpf_cnpj || baseData.cpfCnpj,
            enderecoEmpreendimento: i.endereco_empreendimento || baseData.enderecoEmpreendimento,
            nomeFazenda: i.nome_fazenda || baseData.nomeFazenda,
            numCar: i.num_car || baseData.numCar || i.numCar,
            municipioEmpreendimento: i.municipio || baseData.municipioEmpreendimento,
            latEixo: i.lat_eixo || baseData.latEixo,
            longEixo: i.long_eixo || baseData.longEixo,
            situacao: i.situacao || baseData.situacao,
            situacaoOutro: i.situacao_outro || baseData.situacaoOutro,
            situacaoEmpreendimento: i.situacao_empreendimento || baseData.situacaoEmpreendimento,
            situacaoEmpreendimentoOutro: i.situacao_empreendimento_outro || baseData.situacaoEmpreendimentoOutro,
            finalidadeBarramento: i.finalidade_barramento || baseData.finalidadeBarramento,
            finalidadeBarramentoOutro: i.finalidade_barramento_outro || baseData.finalidadeBarramentoOutro,
            numOficioEmitido: i.num_oficio_emitido || baseData.numOficioEmitido,
            dataOficioEmitido: i.data_oficio_emitido || baseData.dataOficioEmitido,
            viaEncaminhamento: i.via_encaminhamento || baseData.viaEncaminhamento || [],
            viaEncaminhamentoOutro: i.via_encaminhamento_outro || baseData.viaEncaminhamentoOutro,
            enderecoEncaminhamento: i.endereco_encaminhamento || baseData.enderecoEncaminhamento,
            dataRecebimentoOficio: i.data_recebimento_oficio || baseData.dataRecebimentoOficio,
            prazoConcedido: i.prazo_concedido || baseData.prazoConcedido || 0,
            recebidoPorNome: i.recebido_por_nome || baseData.recebidoPorNome,
            sistemaSituacao: i.sistema_situacao || baseData.sistemaSituacao || 'Parecer Técnico emitido',
            sistemaObservacoes: i.sistema_observacoes || baseData.sistemaObservacoes || 'Processo indeferido por inércia',
            docsGerais: i.docs_gerais || baseData.docsGerais || [],
            docsIdentificacao: i.docs_ident || baseData.docsIdentificacao || [],
            docsEspolio: i.docs_espolio || baseData.docsEspolio || [],
            docsTecnicos: i.docs_tecnicos || baseData.docsTecnicos || [],
            responsaveisTecnicos: i.responsaveis || baseData.responsaveisTecnicos || [],
            status: (i.status || baseData.status || 'Rascunho') as 'Rascunho' | 'Concluído',
            tipo_documento: 'Indeferimento' as const,
            created_at: i.created_at,
            updated_at: i.updated_at,
            municipio: i.municipio || baseData.municipio,
            lat: i.lat_eixo || i.lat,
            long: i.long_eixo || i.long,
            empreendedor: i.nome_empreendedor || i.empreendedor
          };
        });
        setIndeferimentos(mappedIndeferimentos);
      }

      // Fetch Transferencias
      const { data: tData, error: tError } = await supabase
        .from('transferencias_titularidade')
        .select('*')
        .order('created_at', { ascending: false });

      if (tError) {
        console.warn('Tabela transferencias_titularidade ainda não existe ou erro na busca:', tError);
      } else {
        const mappedTransferencias: TransferData[] = tData.map(t => ({
          id: t.id,
          userId: t.user_id,
          analista: t.analista || '',
          analistaOutro: t.analista_outro || '',
          nProcesso: t.n_processo || '',
          snisb: t.snisb || '',
          tipoClassificacao: t.tipo_classificacao || '',
          dataProtocolo: t.data_protocolo || '',
          portariaNumero: t.portaria_numero || '',
          dataPortaria: t.data_portaria || '',
          portariaNova: t.portaria_nova || '',
          dataPortariaNova: t.data_portaria_nova || '',
          parecerTecnico: t.parecer_tecnico || '',
          dataParecerTecnico: t.data_parecer_tecnico || '',
          responsavelTecnico: t.responsavel_tecnico || '',
          artNumero: t.art_numero || '',
          nomeFazenda: t.nome_fazenda || '',
          zonaEndereco: t.zona_endereco || 'Rural',
          municipio: t.municipio || '',
          latGMS: t.lat_gms || '',
          longGMS: t.long_gms || '',
          barragemTipoClassificacao: t.barragem_tipo_classificacao || '',
          barragemTipoClassificacaoOutro: t.barragem_tipo_classificacao_outro || '',
          nomeCursoAgua: t.nome_curso_agua || '',
          subBacia: t.sub_bacia || '',
          alturaMaxima: t.altura_maxima?.toString() || '',
          tipoBarragem: t.tipo_barragem || '',
          situacaoEmpreendimento: t.situacao_empreendimento || '',
          situacaoEmpreendimentoOutro: t.situacao_empreendimento_outro || '',
          volumeArmazenado: t.volume_armazenado?.toString() || '',
          dpa: t.dpa || 'Baixo',
          cri: t.cri || 'Baixa',
          antigoProprietario: t.antigo_proprietario || '',
          antigoTipoDoc: t.antigo_tipo_doc || 'CPF',
          antigoDoc: t.antigo_doc || '',
          novoProprietario: t.novo_proprietario || '',
          novoTipoDoc: t.novo_tipo_doc || 'CPF',
          novoDoc: t.novo_doc || '',
          docs: t.docs || [],
          customPortariaText: t.custom_portaria_text,
          status: (t.status || 'rascunho') === 'rascunho' ? 'Rascunho' : 'Concluído',
          tipo_documento: 'Transferência de Titularidade' as const,
          created_at: t.created_at,
          updated_at: t.updated_at,
          lat: t.lat_gms,
          long: t.long_gms,
          empreendedor: t.novo_proprietario
        }));
        setTransferencias(mappedTransferencias);
      }

    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setPareceres([]);
      setOficios([]);
      setNoObligatoriedades([]);
      setIndeferimentos([]);
      setTransferencias([]);
      setLoading(false);
      return;
    }
    void fetchAllData();
  }, [currentUser]);

  const deleteParecer = async (id: string) => {
    try {
      const { error } = await supabase
        .from('pareceres')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setPareceres(prev => prev.filter(p => p.id !== id));
      return { success: true };
    } catch (err) {
      console.error('Error deleting parecer:', err);
      return { success: false, message: 'Erro ao excluir parecer' };
    }
  };

  const deleteOficio = async (id: string) => {
    try {
      const { error } = await supabase
        .from('oficios')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setOficios(prev => prev.filter(o => o.id !== id));
      return { success: true };
    } catch (err) {
      console.error('Error deleting oficio:', err);
      return { success: false, message: 'Erro ao excluir ofício' };
    }
  };
  
  const deleteNoObligatoriedade = async (id: string) => {
    try {
      const { error } = await supabase
        .from('nao_obrigatoriedades')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setNoObligatoriedades(prev => prev.filter(n => n.id !== id));
      return { success: true };
    } catch (err) {
      console.error('Error deleting não obrigatoriedade:', err);
      return { success: false, message: 'Erro ao excluir não obrigatoriedade' };
    }
  };

  const deleteIndeferimento = async (id: string) => {
    try {
      const { error } = await supabase
        .from('indeferimentos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setIndeferimentos(prev => prev.filter(i => i.id !== id));
      return { success: true };
    } catch (err) {
      console.error('Error deleting indeferimento:', err);
      return { success: false, message: 'Erro ao excluir indeferimento' };
    }
  };

  const deleteTransferencia = async (id: string) => {
    try {
      const { error } = await supabase
        .from('transferencias_titularidade')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setTransferencias(prev => prev.filter(t => t.id !== id));
      return { success: true };
    } catch (err) {
      console.error('Error deleting transferência:', err);
      return { success: false, message: 'Erro ao excluir transferência' };
    }
  };

  const allDocs = [
    ...pareceres.map(p => ({ ...p, tipo_documento: 'Parecer Técnico' as const })),
    ...oficios.map(o => ({ ...o, tipo_documento: 'Ofício de Pendências' as const })),
    ...noObligatoriedades.map(n => ({ ...n, tipo_documento: 'Não Obrigatoriedade' as const })),
    ...indeferimentos.map(i => ({ ...i, tipo_documento: 'Indeferimento' as const })),
    ...transferencias.map(t => ({ ...t, tipo_documento: 'Transferência de Titularidade' as const })),
  ];

  // Use a Map to ensure unique documents by ID
  const uniqueDocsMap = new Map<string, AppDocument>();
  allDocs.forEach(doc => {
    if (doc.id) {
      uniqueDocsMap.set(doc.id, doc);
    }
  });

  const documents: AppDocument[] = Array.from(uniqueDocsMap.values()).sort((a, b) => {
    const dataA = (a as any).created_at || (a as any).data || (a as any).dataProtocolo || 0;
    const dataB = (b as any).created_at || (b as any).data || (b as any).dataProtocolo || 0;
    const dateA = new Date(dataA).getTime();
    const dateB = new Date(dataB).getTime();
    return dateB - dateA;
  });

  return (
    <DataContext.Provider value={{ 
      pareceres, 
      oficios, 
      noObligatoriedades,
      indeferimentos,
      transferencias,
      documents, 
      loading, 
      refreshData: fetchAllData, 
      deleteParecer,
      deleteOficio,
      deleteNoObligatoriedade,
      deleteIndeferimento,
      deleteTransferencia
    }}>
      {children}
    </DataContext.Provider>
  );
};
