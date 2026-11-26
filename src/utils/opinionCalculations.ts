import {
  OPS_DPA1_VOLUME,
  OPS_TIPO_CLASSIFICACAO,
} from '../../constants';
import { getUpgsForMunicipality } from '../data/upgData';
import {
  BarramentoData,
  DanoEnum,
  ParecerData,
  RiscoEnum,
} from '../../types';

export const IDADE_SEM_ENCHIMENTO = 'Ainda não atingiu o nível máximo operacional';
export const IDADE_SEM_INFORMACAO = 'Sem informação';

export type IdadeModo = 'numerica' | 'sem_enchimento' | 'sem_informacao' | 'pendente';

export type RelacaoBarragemMontante =
  | 'Barragem em sequência'
  | 'Reservatório comunicante';

export const OPS_RELACAO_BARRAMENTO_MONTANTE: RelacaoBarragemMontante[] = [
  'Barragem em sequência',
  'Reservatório comunicante',
];

export type ConclusaoCategoria =
  | 'CLASSE_A'
  | 'CLASSE_B'
  | 'CLASSE_C'
  | 'CLASSE_D'
  | 'NAO_ENQUADRADA_PNSB'
  | 'PRE_CLASSIFICACAO'
  | 'PENDENTE';

export const TEXTO_APROVADO_NAO_ENQUADRAMENTO_PNSB = `Com base nas informações e nos documentos constantes dos autos, bem como nos critérios de classificação aplicáveis, verificou-se que a barragem apresenta Dano Potencial Associado (DPA) [BAIXO/MÉDIO/ALTO] e volume total do reservatório, correspondente ao Nível Máximo Maximorum (NMM), de [volume] hm³.

Considerando os critérios legais de inclusão previstos no art. 1º, parágrafo único, da Lei nº 12.334/2010, com as alterações da Lei nº 14.066/2020, conclui-se que a barragem não se enquadra na Política Nacional de Segurança de Barragens (PNSB), uma vez que não atende aos critérios de inclusão aplicáveis, conforme os dados analisados neste processo. Por essa razão, não lhe é atribuída classe final A, B, C ou D neste parecer.

O não enquadramento na PNSB não afasta a responsabilidade do empreendedor pela segurança, manutenção e operação da barragem, nem o dever de comunicar ao órgão fiscalizador alterações relevantes nas suas características ou condições. A presente análise considera as informações disponíveis nos autos e as condições identificadas na data de sua elaboração, podendo ser revista caso haja alteração dos dados que fundamentaram a avaliação.

Esta conclusão refere-se exclusivamente à análise de classificação quanto à segurança da barragem e não autoriza a execução de obras, intervenções ou alterações no barramento, as quais deverão observar os procedimentos de licenciamento e as demais exigências legais aplicáveis.`;

export interface DerivedDpa1Result {
  selectValue: string;
  faixaLabel: string;
  nomenclatura: string;
  score: number;
}

export interface DerivedDpaResult {
  volumeNmmValido: number | null;
  dpa1: DerivedDpa1Result | null;
  scoreDpa1: number | null;
  scoreDpa2: number | null;
  scoreDpa3: number | null;
  scoreDpa4: number | null;
  totalDpa: number | null;
  dpaClass: DanoEnum | null;
  isComplete: boolean;
  pendingFields: string[];
}

export interface DerivedCriResult {
  alturaValida: number | null;
  comprimentoValido: number | null;
  idadeModo: IdadeModo;
  idadeAnos: number | null;
  scoreCt1: number | null;
  scoreCt2: number | null;
  scoreCt3: number | null;
  scoreCt4: number | null;
  scoreCt5: number | null;
  scoreCt6: number | null;
  totalCT: number | null;
  scoreEc1: number | null;
  scoreEc2: number | null;
  scoreEc3: number | null;
  scoreEc4: number | null;
  scoreEc5: number | null;
  totalEC: number | null;
  scorePs1: number | null;
  scorePs2: number | null;
  scorePs3: number | null;
  scorePs4: number | null;
  scorePs5: number | null;
  scorePs6: number | null;
  totalPS: number | null;
  valGeral: number | null;
  riskGeral: RiscoEnum | null;
  valPercolacao: number | null;
  riskPercolacao: RiscoEnum | null;
  valGalgamento: number | null;
  riskGalgamento: RiscoEnum | null;
  valGerencial: number | null;
  riskGerencial: RiscoEnum | null;
  risco: RiscoEnum | null;
  isComplete: boolean;
  pendingFields: string[];
}

export interface DerivedPnsbResult {
  status: 'enquadrada' | 'nao_enquadrada' | 'pendente';
  enquadrada: boolean | null;
  criteriosAtendidos: string[];
  pendingFields: string[];
}

export interface DerivedClassificationResult {
  isPreClassificacao: boolean;
  dpa: DerivedDpaResult;
  cri: DerivedCriResult | null;
  pnsb: DerivedPnsbResult;
  resultado: {
    categoria: ConclusaoCategoria;
    label: string;
    classeFinal: 'A' | 'B' | 'C' | 'D' | null;
    pendingFields: string[];
    isComplete: boolean;
  };
}

export const parseNumericBr = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalizedSpaces = trimmed.replace(/\s+/g, '');
  let normalized = normalizedSpaces;

  if (normalized.includes(',') && normalized.includes('.')) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');
    if (parts.length > 2) return null;
    normalized = normalized.replace(',', '.');
  }

  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const extractScoreFromOption = (text: string | null | undefined): number | null => {
  if (!text || typeof text !== 'string' || !text.trim()) return null;
  const match = text.match(/\((\d+)\s*(?:ponto|pontos)?\s*\)\s*$/i) || text.match(/\((\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

export const cleanOptionScore = (text: string | null | undefined): string => {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\s*\(\d+.*?\)$/, '').trim();
};

export const getDpa1FromVolumeValue = (vol: number | null): DerivedDpa1Result | null => {
  if (vol === null || !Number.isFinite(vol) || vol < 0) return null;

  if (vol <= 3) {
    return {
      selectValue: OPS_DPA1_VOLUME[0],
      faixaLabel: 'Muito pequeno – ≤ 3 hm³ (1 ponto)',
      nomenclatura: 'muito pequeno',
      score: 1,
    };
  }
  if (vol <= 10) {
    return {
      selectValue: OPS_DPA1_VOLUME[1],
      faixaLabel: 'Pequeno – > 3 a 10 hm³ (2 pontos)',
      nomenclatura: 'pequeno',
      score: 2,
    };
  }
  if (vol <= 75) {
    return {
      selectValue: OPS_DPA1_VOLUME[2],
      faixaLabel: 'Médio – > 10 a 75 hm³ (3 pontos)',
      nomenclatura: 'médio',
      score: 3,
    };
  }
  if (vol <= 200) {
    return {
      selectValue: OPS_DPA1_VOLUME[3],
      faixaLabel: 'Grande – > 75 a 200 hm³ (4 pontos)',
      nomenclatura: 'grande',
      score: 4,
    };
  }
  return {
    selectValue: OPS_DPA1_VOLUME[4],
    faixaLabel: 'Muito grande – > 200 hm³ (5 pontos)',
    nomenclatura: 'muito grande',
    score: 5,
  };
};

export const getCt1FromHeight = (altura: number | null): number | null => {
  if (altura === null || !Number.isFinite(altura) || altura < 0) return null;
  if (altura < 15) return 0;
  if (altura <= 30) return 3;
  if (altura <= 60) return 4;
  return 5;
};

export const getCt2FromLength = (comprimento: number | null): number | null => {
  if (comprimento === null || !Number.isFinite(comprimento) || comprimento < 0) return null;
  if (comprimento <= 200) return 1;
  if (comprimento <= 600) return 3;
  if (comprimento <= 1200) return 4;
  return 5;
};

export const evaluateCt5Age = (
  idadeRaw: string | null | undefined
): { modo: IdadeModo; idadeAnos: number | null; score: number | null; descricao: string } => {
  const trimmed = (idadeRaw || '').trim();
  if (!trimmed) {
    return {
      modo: 'pendente',
      idadeAnos: null,
      score: null,
      descricao: 'Pendente',
    };
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === IDADE_SEM_ENCHIMENTO.toLowerCase()) {
    return {
      modo: 'sem_enchimento',
      idadeAnos: null,
      score: 5,
      descricao: IDADE_SEM_ENCHIMENTO,
    };
  }
  if (normalized === IDADE_SEM_INFORMACAO.toLowerCase()) {
    return {
      modo: 'sem_informacao',
      idadeAnos: null,
      score: 5,
      descricao: IDADE_SEM_INFORMACAO,
    };
  }

  const age = parseNumericBr(trimmed);
  if (age === null || age < 0) {
    return {
      modo: 'pendente',
      idadeAnos: null,
      score: null,
      descricao: 'Pendente (valor inválido)',
    };
  }

  let score = 5;
  if (age < 5) score = 5;
  else if (age < 10) score = 3;
  else if (age < 30) score = 2;
  else if (age <= 40) score = 1;
  else if (age <= 50) score = 2;
  else score = 3;

  return {
    modo: 'numerica',
    idadeAnos: age,
    score,
    descricao: `${trimmed} anos`,
  };
};

export const isPreClassificacaoTipo = (
  tipoClassificacao: string | null | undefined,
  criPreClassificacaoFlag?: boolean
): boolean => {
  const normalized = (tipoClassificacao || '').trim().toUpperCase();
  if (
    normalized === (OPS_TIPO_CLASSIFICACAO[1] || '').toUpperCase() ||
    normalized === (OPS_TIPO_CLASSIFICACAO[2] || '').toUpperCase() ||
    normalized.includes('PRÉ-CLASSIFICAÇÃO') ||
    normalized.includes('PRE-CLASSIFICACAO')
  ) {
    return true;
  }
  return Boolean(criPreClassificacaoFlag);
};

export const deriveClassification = (formData: ParecerData): DerivedClassificationResult => {
  const bar = formData.barragemPrincipal;
  const cls = formData.classificacao;
  const isPreClassificacao = isPreClassificacaoTipo(
    formData.tipoClassificacao,
    cls.criPreClassificacao
  );

  // --- DPA ---
  const volumeNmmValido = parseNumericBr(bar?.volumeNMM);
  const dpa1 = getDpa1FromVolumeValue(volumeNmmValido);
  const scoreDpa1 = dpa1 ? dpa1.score : null;
  const scoreDpa2 = extractScoreFromOption(cls.dpa2Select);
  const scoreDpa3 = extractScoreFromOption(cls.dpa3Select);
  const scoreDpa4 = extractScoreFromOption(cls.dpa4Select);

  const dpaPending: string[] = [];
  if (scoreDpa1 === null) {
    dpaPending.push('Volume armazenado no NMM (hm³) para cálculo do DPA1');
  }
  if (scoreDpa2 === null) {
    dpaPending.push('DPA2 (potencial de perda de vidas humanas / construções)');
  }
  if (scoreDpa3 === null) {
    dpaPending.push('DPA3 (impacto ambiental)');
  }
  if (scoreDpa4 === null) {
    dpaPending.push('DPA4 (impacto socioeconômico)');
  }

  const isDpaComplete = dpaPending.length === 0;
  const totalDpa = isDpaComplete
    ? (scoreDpa1 as number) + (scoreDpa2 as number) + (scoreDpa3 as number) + (scoreDpa4 as number)
    : null;

  let dpaClass: DanoEnum | null = null;
  if (totalDpa !== null) {
    if (totalDpa < 7) dpaClass = DanoEnum.BAIXO;
    else if (totalDpa <= 13) dpaClass = DanoEnum.MEDIO;
    else dpaClass = DanoEnum.ALTO;
  }

  const dpa: DerivedDpaResult = {
    volumeNmmValido,
    dpa1,
    scoreDpa1,
    scoreDpa2,
    scoreDpa3,
    scoreDpa4,
    totalDpa,
    dpaClass,
    isComplete: isDpaComplete,
    pendingFields: dpaPending,
  };

  // --- PNSB (critérios alternativos OU: altura >= 15 m, volume NMM >= 3 hm³, DPA Médio/Alto) ---
  const alturaValida = parseNumericBr(bar?.alturaMaxima);
  const alturaAvaliada = alturaValida !== null && alturaValida >= 0;
  const volumeAvaliado = volumeNmmValido !== null && volumeNmmValido >= 0;
  const dpaAvaliado = isDpaComplete && dpaClass !== null;

  const criteriosAtendidos: string[] = [];
  if (alturaAvaliada && alturaValida >= 15) {
    criteriosAtendidos.push('Altura do maciço ≥ 15 m (art. 1º, parágrafo único)');
  }
  if (volumeAvaliado && volumeNmmValido >= 3) {
    criteriosAtendidos.push('Volume total do reservatório (NMM) ≥ 3 hm³ (art. 1º, parágrafo único)');
  }
  if (dpaAvaliado && (dpaClass === DanoEnum.MEDIO || dpaClass === DanoEnum.ALTO)) {
    criteriosAtendidos.push(`Dano Potencial Associado ${dpaClass} (art. 1º, parágrafo único)`);
  }

  let pnsbPending: string[] = [];
  let pnsbStatus: 'enquadrada' | 'nao_enquadrada' | 'pendente' = 'pendente';
  let enquadrada: boolean | null = null;

  if (criteriosAtendidos.length > 0) {
    enquadrada = true;
    pnsbStatus = 'enquadrada';
    pnsbPending = [];
  } else {
    if (!alturaAvaliada) {
      pnsbPending.push('Altura máxima projetada (m)');
    }
    if (!volumeAvaliado) {
      pnsbPending.push('Volume armazenado no NMM (hm³)');
    }
    if (!dpaAvaliado) {
      pnsbPending.push('Classificação completa do DPA');
    }

    if (pnsbPending.length === 0) {
      enquadrada = false;
      pnsbStatus = 'nao_enquadrada';
    }
  }

  const pnsb: DerivedPnsbResult = {
    status: pnsbStatus,
    enquadrada,
    criteriosAtendidos,
    pendingFields: pnsbPending,
  };

  // --- CRI (somente quando NÃO for pré-classificação e NÃO for não enquadrada na PNSB) ---
  let cri: DerivedCriResult | null = null;
  if (!isPreClassificacao && pnsbStatus !== 'nao_enquadrada') {
    const criPending: string[] = [];

    const scoreCt1 = getCt1FromHeight(alturaValida);
    if (scoreCt1 === null) criPending.push('CT1 — Altura máxima projetada (m)');

    const comprimentoValido = parseNumericBr(bar?.comprimentoCoroamento);
    const scoreCt2 = getCt2FromLength(comprimentoValido);
    if (scoreCt2 === null) criPending.push('CT2 — Comprimento do coroamento (m)');

    const scoreCt3 = extractScoreFromOption(bar?.tipoEstrutural);
    if (scoreCt3 === null) criPending.push('CT3 — Tipo estrutural');

    const scoreCt4 = extractScoreFromOption(bar?.tipoFundacao);
    if (scoreCt4 === null) criPending.push('CT4 — Tipo de fundação');

    const ageEval = evaluateCt5Age(bar?.idade);
    const scoreCt5 = ageEval.score;
    if (scoreCt5 === null) criPending.push('CT5 — Idade da barragem (ou condição explícita)');

    const scoreCt6 = extractScoreFromOption(cls.ct6Select);
    if (scoreCt6 === null) criPending.push('CT6 — Vazão de projeto');

    const scoreEc1 = extractScoreFromOption(cls.ec1Select);
    if (scoreEc1 === null) criPending.push('EC1 — Confiabilidade das estruturas extravasoras');

    const scoreEc2 = extractScoreFromOption(cls.ec2Select);
    if (scoreEc2 === null) criPending.push('EC2 — Confiabilidade das estruturas de adução');

    const scoreEc3 = extractScoreFromOption(cls.ec3Select);
    if (scoreEc3 === null) criPending.push('EC3 — Percolação');

    const scoreEc4 = extractScoreFromOption(cls.ec4Select);
    if (scoreEc4 === null) criPending.push('EC4 — Deformações e recalques');

    const scoreEc5 = extractScoreFromOption(cls.ec5Select);
    if (scoreEc5 === null) criPending.push('EC5 — Deterioração dos taludes / proteções');

    const scorePs1 = extractScoreFromOption(cls.ps1Select);
    if (scorePs1 === null) criPending.push('PS1 — Documentação de projeto');

    const scorePs2 = extractScoreFromOption(cls.ps2Select);
    if (scorePs2 === null) criPending.push('PS2 — Estrutura organizacional e qualificação técnica');

    const scorePs3 = extractScoreFromOption(cls.ps3Select);
    if (scorePs3 === null) criPending.push('PS3 — Procedimentos de inspeção e monitoramento');

    const scorePs4 = extractScoreFromOption(cls.ps4Select);
    if (scorePs4 === null) criPending.push('PS4 — Relatórios de inspeção e revisão periódica');

    const scorePs5 = extractScoreFromOption(cls.ps5Select);
    if (scorePs5 === null) criPending.push('PS5 — Plano de Ação de Emergência (PAE)');

    const scorePs6 = extractScoreFromOption(cls.ps6Select);
    if (scorePs6 === null) criPending.push('PS6 — Regra operacional dos dispositivos de descarga');

    const ctComplete =
      scoreCt1 !== null &&
      scoreCt2 !== null &&
      scoreCt3 !== null &&
      scoreCt4 !== null &&
      scoreCt5 !== null &&
      scoreCt6 !== null;
    const ecComplete =
      scoreEc1 !== null &&
      scoreEc2 !== null &&
      scoreEc3 !== null &&
      scoreEc4 !== null &&
      scoreEc5 !== null;
    const psComplete =
      scorePs1 !== null &&
      scorePs2 !== null &&
      scorePs3 !== null &&
      scorePs4 !== null &&
      scorePs5 !== null &&
      scorePs6 !== null;

    const totalCT = ctComplete
      ? (scoreCt1 as number) +
        (scoreCt2 as number) +
        (scoreCt3 as number) +
        (scoreCt4 as number) +
        (scoreCt5 as number) +
        (scoreCt6 as number)
      : null;

    const totalEC = ecComplete
      ? (scoreEc1 as number) +
        (scoreEc2 as number) +
        (scoreEc3 as number) +
        (scoreEc4 as number) +
        (scoreEc5 as number)
      : null;

    const totalPS = psComplete
      ? (scorePs1 as number) +
        (scorePs2 as number) +
        (scorePs3 as number) +
        (scorePs4 as number) +
        (scorePs5 as number) +
        (scorePs6 as number)
      : null;

    const isCriComplete = criPending.length === 0 && totalCT !== null && totalEC !== null && totalPS !== null;

    let valGeral: number | null = null;
    let riskGeral: RiscoEnum | null = null;
    if (totalCT !== null && totalEC !== null && totalPS !== null) {
      valGeral = totalCT + totalEC + totalPS;
      if (valGeral >= 65) riskGeral = RiscoEnum.ALTO;
      else if (valGeral > 35) riskGeral = RiscoEnum.MEDIO;
      else riskGeral = RiscoEnum.BAIXO;
    }

    let valPercolacao: number | null = null;
    let riskPercolacao: RiscoEnum | null = null;
    if (scoreEc3 !== null && scoreEc4 !== null && scoreEc5 !== null) {
      valPercolacao = scoreEc3 + scoreEc4 + scoreEc5;
      if (scoreEc3 === 5 || scoreEc4 === 5 || scoreEc5 === 5 || valPercolacao > 10) {
        riskPercolacao = RiscoEnum.ALTO;
      } else if (valPercolacao > 7) {
        riskPercolacao = RiscoEnum.MEDIO;
      } else {
        riskPercolacao = RiscoEnum.BAIXO;
      }
    }

    let valGalgamento: number | null = null;
    let riskGalgamento: RiscoEnum | null = null;
    if (scoreCt6 !== null && scoreEc1 !== null) {
      valGalgamento = scoreCt6 + scoreEc1;
      if (valGalgamento > 7 || scoreEc1 === 5) {
        riskGalgamento = RiscoEnum.ALTO;
      } else if (valGalgamento > 4) {
        riskGalgamento = RiscoEnum.MEDIO;
      } else {
        riskGalgamento = RiscoEnum.BAIXO;
      }
    }

    let valGerencial: number | null = null;
    let riskGerencial: RiscoEnum | null = null;
    if (totalPS !== null) {
      valGerencial = totalPS;
      if (valGerencial >= 24) riskGerencial = RiscoEnum.ALTO;
      else if (valGerencial > 13) riskGerencial = RiscoEnum.MEDIO;
      else riskGerencial = RiscoEnum.BAIXO;
    }

    let risco: RiscoEnum | null = null;
    if (isCriComplete && riskGeral && riskPercolacao && riskGalgamento && riskGerencial) {
      const risks = [riskGeral, riskPercolacao, riskGalgamento, riskGerencial];
      if (risks.includes(RiscoEnum.ALTO)) risco = RiscoEnum.ALTO;
      else if (risks.includes(RiscoEnum.MEDIO)) risco = RiscoEnum.MEDIO;
      else risco = RiscoEnum.BAIXO;
    }

    cri = {
      alturaValida,
      comprimentoValido,
      idadeModo: ageEval.modo,
      idadeAnos: ageEval.idadeAnos,
      scoreCt1,
      scoreCt2,
      scoreCt3,
      scoreCt4,
      scoreCt5,
      scoreCt6,
      totalCT,
      scoreEc1,
      scoreEc2,
      scoreEc3,
      scoreEc4,
      scoreEc5,
      totalEC,
      scorePs1,
      scorePs2,
      scorePs3,
      scorePs4,
      scorePs5,
      scorePs6,
      totalPS,
      valGeral,
      riskGeral,
      valPercolacao,
      riskPercolacao,
      valGalgamento,
      riskGalgamento,
      valGerencial,
      riskGerencial,
      risco,
      isComplete: isCriComplete,
      pendingFields: criPending,
    };
  }

  // --- RESULTADO FINAL & MATRIZ A-D ---
  const allPending = Array.from(
    new Set([
      ...dpaPending,
      ...pnsbPending,
      ...(!isPreClassificacao && cri ? cri.pendingFields : []),
    ])
  );

  // Also check mandatory relation for each upstream dam (for operational completeness notice, without altering classification math)
  const missingUpstreamRelations = (formData.barragensMontante || [])
    .map((bm, i) =>
      !bm.relacaoBarragemPrincipal
        ? `Relação com a barragem principal (${bm.nome || `Barragem a Montante ${i + 1}`})`
        : null
    )
    .filter((v): v is string => Boolean(v));

  if (isPreClassificacao) {
    const preReady = isDpaComplete && dpaClass !== null && pnsbPending.length === 0;
    return {
      isPreClassificacao: true,
      dpa,
      cri: null,
      pnsb,
      resultado: {
        categoria: preReady ? 'PRE_CLASSIFICACAO' : 'PENDENTE',
        label:
          preReady && dpaClass
            ? `PRÉ-CLASSIFICAÇÃO — DPA ${dpaClass.toUpperCase()}`
            : 'PENDENTE — DADOS NECESSÁRIOS PARA PRÉ-CLASSIFICAÇÃO',
        classeFinal: null,
        pendingFields: [...allPending, ...missingUpstreamRelations],
        isComplete: preReady,
      },
    };
  }

  if (pnsbStatus === 'nao_enquadrada') {
    const naoEnqReady =
      isDpaComplete &&
      dpaClass !== null &&
      alturaAvaliada &&
      volumeAvaliado &&
      pnsbPending.length === 0;

    return {
      isPreClassificacao: false,
      dpa,
      cri: null,
      pnsb,
      resultado: {
        categoria: naoEnqReady ? 'NAO_ENQUADRADA_PNSB' : 'PENDENTE',
        label: naoEnqReady
          ? 'NÃO SE ENQUADRA NA PNSB'
          : 'PENDENTE — DADOS NECESSÁRIOS PARA CLASSIFICAÇÃO',
        classeFinal: null,
        pendingFields: naoEnqReady
          ? missingUpstreamRelations
          : [...dpaPending, ...pnsbPending, ...missingUpstreamRelations],
        isComplete: naoEnqReady,
      },
    };
  }

  const fullReady =
    isDpaComplete &&
    dpaClass !== null &&
    pnsbPending.length === 0 &&
    enquadrada !== null &&
    cri !== null &&
    cri.isComplete &&
    cri.risco !== null;

  if (!fullReady) {
    return {
      isPreClassificacao: false,
      dpa,
      cri,
      pnsb,
      resultado: {
        categoria: 'PENDENTE',
        label: 'PENDENTE — DADOS NECESSÁRIOS PARA CLASSIFICAÇÃO',
        classeFinal: null,
        pendingFields: [...allPending, ...missingUpstreamRelations],
        isComplete: false,
      },
    };
  }

  // SEMA/MT Matrix A-D
  if (dpaClass === DanoEnum.ALTO) {
    return {
      isPreClassificacao: false,
      dpa,
      cri,
      pnsb,
      resultado: {
        categoria: 'CLASSE_A',
        label: `CLASSE A (CRI ${cri!.risco})`,
        classeFinal: 'A',
        pendingFields: missingUpstreamRelations,
        isComplete: true,
      },
    };
  }

  if (dpaClass === DanoEnum.MEDIO) {
    return {
      isPreClassificacao: false,
      dpa,
      cri,
      pnsb,
      resultado: {
        categoria: 'CLASSE_B',
        label: `CLASSE B (CRI ${cri!.risco})`,
        classeFinal: 'B',
        pendingFields: missingUpstreamRelations,
        isComplete: true,
      },
    };
  }

  // dpaClass === BAIXO
  if (enquadrada) {
    if (cri!.risco === RiscoEnum.ALTO) {
      return {
        isPreClassificacao: false,
        dpa,
        cri,
        pnsb,
        resultado: {
          categoria: 'CLASSE_C',
          label: 'CLASSE C (CRI Alta)',
          classeFinal: 'C',
          pendingFields: missingUpstreamRelations,
          isComplete: true,
        },
      };
    }
    return {
      isPreClassificacao: false,
      dpa,
      cri,
      pnsb,
      resultado: {
        categoria: 'CLASSE_D',
        label: `CLASSE D (CRI ${cri!.risco})`,
        classeFinal: 'D',
        pendingFields: missingUpstreamRelations,
        isComplete: true,
      },
    };
  }

  return {
    isPreClassificacao: false,
    dpa,
    cri,
    pnsb,
    resultado: {
      categoria: 'NAO_ENQUADRADA_PNSB',
      label: 'NÃO SE ENQUADRA NA PNSB',
      classeFinal: null,
      pendingFields: missingUpstreamRelations,
      isComplete: true,
    },
  };
};

export const buildAutomaticIntroText = (formData: ParecerData): string => {
  const classif =
    formData.tipoClassificacao === 'OUTRO'
      ? formData.tipoClassificacaoOutro
      : formData.tipoClassificacao;
  const barragem =
    formData.tipoBarragem === 'OUTRO'
      ? formData.tipoBarragemOutro
      : formData.tipoBarragem;
  const situacao =
    formData.situacaoEmpreendimento === 'OUTRO'
      ? formData.situacaoEmpreendimentoOutro
      : formData.situacaoEmpreendimento;

  const barragemLabel = barragem?.trim()
    ? /^barragem\b/i.test(barragem.trim())
      ? barragem.trim()
      : `Barragem de ${barragem.trim()}`
    : '...';

  const situacaoPhrase =
    situacao && situacao !== 'Sem informação'
      ? `em fase de ${situacao}`
      : 'com situação não informada nos autos';

  return `De acordo com a Política Nacional de Segurança de Barragens, Lei nº 12.334, de 20 de setembro de 2010, em seu artigo 5º, inciso I, a fiscalização da segurança de barragens compete à entidade que outorga o direito de uso dos recursos hídricos, observado o domínio do corpo hídrico, quando o objeto for de acumulação de água, exceto para fins de aproveitamento hidrelétrico.
A fiscalização deve se basear em análise documental, em vistorias técnicas, em indicadores de segurança de barragem e em outros procedimentos definidos pelo órgão fiscalizador.
No estado de Mato Grosso, os critérios técnicos a serem aplicados e os procedimentos administrativos estão estabelecidos na Resolução CNRH nº 241, de 10 de setembro de 2024, e na Instrução Normativa nº 08, de 18 de dezembro de 2023.
Este Parecer apresenta os resultados da análise do pedido de ${classif || '...'} quanto à Segurança de ${barragemLabel} de acumulação de água para usos múltiplos, exceto para geração de energia elétrica, com ou sem captação de água. Conforme a solicitação, observa-se que o empreendimento se encontra ${situacaoPhrase}.
Este documento encontra embasamento na análise dos documentos disponibilizados nos autos, contendo em referência à análise documental:`;
};

const formatListaCriterios = (items: string[]): string => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} e ${items[1]}`;
  return `${items.slice(0, -1).join('; ')}; e ${items[items.length - 1]}`;
};

const getEnquadramentoDetailText = (
  dpaClass: DanoEnum,
  altura: number | null,
  volume: number | null
): string => {
  const criterios: string[] = [];

  if (altura !== null && altura >= 15) {
    criterios.push(
      'altura do maciço, medida do encontro do pé do talude de jusante com o nível do solo até a crista de coroamento do barramento, maior ou igual a 15 (quinze) metros'
    );
  }
  if (volume !== null && volume >= 3) {
    criterios.push(
      'capacidade total do reservatório maior ou igual a 3.000.000 m³ (três milhões de metros cúbicos)'
    );
  }
  if (dpaClass === DanoEnum.MEDIO || dpaClass === DanoEnum.ALTO) {
    criterios.push(
      `categoria de dano potencial associado ${dpaClass.toLowerCase()}, em termos econômicos, sociais, ambientais ou de perda de vidas humanas`
    );
  }

  if (criterios.length === 0) {
    return `não apresenta características que a enquadrem na Política Nacional de Segurança de Barragens, conforme a Lei nº 12.334/2010 e a Lei nº 14.066/2020.`;
  }

  const criterioIntro =
    criterios.length === 1
      ? `como critério de inclusão ${criterios[0]}`
      : `como critérios de inclusão: ${formatListaCriterios(criterios)}`;

  return `apresenta características que a enquadram na Política Nacional de Segurança de Barragens, conforme a Lei nº 12.334/2010, atualizada pela Lei nº 14.066/2020, nos termos do art. 1º, parágrafo único, que estabelece ${criterioIntro}.\nDessa forma, deverá ser elaborado o Plano de Segurança da Barragem (PSB), estruturado nos Volumes I, II, III, IV, V e VI, devendo conter, no mínimo, as informações previstas no Anexo II – Conteúdo Mínimo e Nível de Detalhamento do PSB, em conformidade com os critérios estabelecidos pela Resolução CEHIDRO nº 163, de 11 de maio de 2023. Ademais, a elaboração deverá observar as condicionantes estabelecidas no Quadro 7 do presente parecer.`;
};

export const buildSuggestedParecerText = (
  formData: ParecerData,
  derived: DerivedClassificationResult
): string => {
  if (!derived.resultado.isComplete || !derived.dpa.dpaClass || !derived.dpa.dpa1) {
    return '';
  }

  const tipoClass =
    (formData.tipoClassificacao === 'OUTRO'
      ? formData.tipoClassificacaoOutro
      : formData.tipoClassificacao) || 'Classificação';
  const volNomenclature = derived.dpa.dpa1.nomenclatura;
  const volTexto = (formData.barragemPrincipal.volumeNMM || '').trim() || String(derived.dpa.volumeNmmValido ?? '');
  const dpaClass = derived.dpa.dpaClass;
  const snisb = (formData.barragemPrincipal.snisb || '').trim() || '_____';
  const altura = derived.cri?.alturaValida ?? parseNumericBr(formData.barragemPrincipal.alturaMaxima);
  const volume = derived.dpa.volumeNmmValido;

  // Pré-classificação: não menciona CRI nem Classe final A-D
  if (derived.isPreClassificacao) {
    const pnsbPre = derived.pnsb.enquadrada
      ? getEnquadramentoDetailText(dpaClass, altura, volume)
      : `não atende, com os dados apresentados nesta fase de pré-classificação, aos critérios de enquadramento na Política Nacional de Segurança de Barragens (Lei nº 12.334/2010, alterada pela Lei nº 14.066/2020).`;

    return `A solicitação de ${tipoClass} da barragem está em conformidade com a Instrução Normativa nº 08, de 18 de dezembro de 2023. Na análise de pré-classificação realizada, verificou-se que a barragem apresenta Volume correspondente ao Nível Máximo Maximorum (NMM) de ${volTexto} hm³ (‘${volNomenclature}’) e Dano Potencial Associado (DPA) classificado como ${dpaClass.toUpperCase()}, não sendo atribuída Categoria de Risco (CRI) nem classe final nesta modalidade.
Assim, em conclusão à análise de pré-classificação, tem-se que a barragem ${pnsbPre}
É responsabilidade do empreendedor comunicar ao órgão fiscalizador qualquer alteração na sua barragem, bem como zelar pela gestão de segurança da barragem e pela reparação de danos decorrentes de eventual rompimento, vazamento ou mau funcionamento, independentemente da existência de culpa.
O empreendedor deverá permitir o acesso irrestrito do órgão fiscalizador e dos órgãos integrantes do Sistema Nacional de Proteção e Defesa Civil (SINPDEC) ao local da barragem e à sua documentação de segurança.
Considerando os fatos e análises apresentadas, manifestamo-nos pelo deferimento da ${tipoClass} desta barragem localizada em rio de domínio estadual, cadastrada no Sistema Nacional de Informações sobre Segurança de Barragens (SNISB) sob o código nº ${snisb}.
Esta análise considera o uso e ocupação do solo atuais e poderá ser alterada caso sejam identificadas modificações nos critérios utilizados. Salienta-se que este parecer não autoriza a execução de obras no barramento, devendo o empreendedor obter previamente as devidas licenças ambientais nos termos da legislação vigente.`;
  }

  // Não enquadramento na PNSB: preserva integralmente o texto aprovado sem menção a CRI
  if (derived.resultado.categoria === 'NAO_ENQUADRADA_PNSB') {
    return TEXTO_APROVADO_NAO_ENQUADRAMENTO_PNSB
      .replace('[BAIXO/MÉDIO/ALTO]', dpaClass.toUpperCase())
      .replace('[volume]', volTexto);
  }

  // Classes A, B, C, D
  const criRisco = derived.cri?.risco ? derived.cri.risco.toUpperCase() : '';
  const enquadramentoText = getEnquadramentoDetailText(dpaClass, altura, volume);

  return `A solicitação de ${tipoClass} da barragem está em conformidade com a Instrução Normativa nº 08, de 18 de dezembro de 2023. Na análise de classificação realizada, verificou-se que a barragem apresenta Volume ‘${volNomenclature}’ (${volTexto} hm³ no NMM), Dano Potencial Associado (DPA) classificado como ${dpaClass.toUpperCase()}, Categoria de Risco (CRI) classificada como ${criRisco} e enquadramento final na ${derived.resultado.label}.
Assim, em conclusão à análise, tem-se que a barragem ${enquadramentoText}
É responsabilidade do empreendedor comunicar ao órgão fiscalizador qualquer alteração na sua barragem, bem como fazer a gestão de segurança da barragem e reparação de danos decorrentes de seu rompimento, vazamento ou mau funcionamento, independentemente da existência de culpa.
O empreendedor deverá permitir o acesso irrestrito do órgão fiscalizador e dos órgãos integrantes do Sistema Nacional de Proteção e Defesa Civil (SINPDEC) ao local da barragem e à sua documentação de segurança.
Considerando os fatos e análises apresentadas, manifestamo-nos pelo deferimento da ${tipoClass} desta barragem localizada em rio de domínio estadual, sendo inserida no cadastro do Sistema Nacional de Informações sobre Segurança de Barragens (SNISB) com o código nº ${snisb}.
Esta classificação é realizada considerando o uso e ocupação do solo atuais e poderá ser alterada caso sejam identificadas modificações em algum dos critérios utilizados para a classificação. Salienta-se que este parecer ou o ato de classificação não autorizam obras no barramento e que o empreendedor deve obter as licenças antes de quaisquer obras em conformidade com a legislação ambiental vigente.`;
};

export const normalizeMunicipioName = (value: string): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, "'")
    .trim()
    .toLowerCase();

export const getUpgOptionsForMunicipality = (municipio: string): string[] => {
  if (!municipio) return [];
  const exact = getUpgsForMunicipality(municipio);
  if (exact.length > 0) return exact;

  // Fallback normalized match (e.g. Mirassol d’Oeste vs Mirassol D'Oeste)
  const target = normalizeMunicipioName(municipio);
  // Dynamic lookup through OPS matching all UPGs by checking UPG_MAPPING indirectly via known list isn't exported separately,
  // so normalize common apostrophe/case variations:
  const variants = [
    municipio.replace(/’/g, "'"),
    municipio.replace(/d’oeste/gi, "D'Oeste"),
    municipio.replace(/d'oeste/gi, "D'Oeste"),
    municipio.replace(/Luciára/gi, 'Luciara'),
  ];
  for (const variant of variants) {
    const found = getUpgsForMunicipality(variant);
    if (found.length > 0) return found;
  }

  void target;
  return [];
};

export const getQuadro7RegulatorioRows = (resumoClass: string) => {
  const upper = (resumoClass || '').toUpperCase();
  const isA = upper.includes('CLASSE A');
  const isB = upper.includes('CLASSE B');
  const isC = upper.includes('CLASSE C');
  const isD = upper.includes('CLASSE D');

  if (isA || isB) {
    const className = isA ? 'Classe A' : 'Classe B';
    const rpsbFreq = isA ? 'a cada 5 anos' : 'a cada 7 anos';
    return [
      { col1: className, col2: '', isHeader: true },
      { col1: 'Peças técnicas obrigatórias: PSB completo (6 volumes, incluindo RPSB e PAE), PAE, Relatórios ISR e ISE, RPSB.', col2: '' },
      { col1: 'Periodicidade:', col2: '' },
      { col1: '• ISR', col2: 'no mínimo anual (até 31/dez)' },
      { col1: '• ISE', col2: 'quando NPGB Alerta/Emergência, antes primeiro enchimento, com RPSB, deplecionamento rápido, eventos extremos, descomissionamento/sabotagem ou exigência SEMA.' },
      { col1: '• RPSB', col2: `${rpsbFreq} (Resumo Executivo no SNISB).` },
      { col1: '• PAE', col2: 'atualização anual; revisão quando necessário (mudanças, recomendações etc.).' },
      { col1: '• PSB', col2: 'atualização contínua com resultados de inspeções.' },
    ];
  }
  if (isC) {
    return [
      { col1: 'Classe C', col2: '', isHeader: true },
      { col1: 'Peças técnicas obrigatórias: PSB (6 volumes, sem PAE obrigatório), Relatórios ISR e ISE, RPSB.', col2: '' },
      { col1: 'Periodicidade:', col2: '' },
      { col1: '• ISR', col2: 'no mínimo anual (até 31/dez)' },
      { col1: '• ISE', col2: 'quando NPGB Alerta/Emergência, antes primeiro enchimento, com RPSB, deplecionamento rápido, eventos extremos, descomissionamento/sabotagem ou exigência SEMA.' },
      { col1: '• RPSB', col2: 'a cada 10 anos (Resumo Executivo no SNISB).' },
      { col1: '• PSB', col2: 'atualização contínua com resultados de inspeções.' },
    ];
  }
  if (isD) {
    return [
      { col1: 'Classe D', col2: '', isHeader: true },
      { col1: 'Peças técnicas obrigatórias: PSB (6 volumes, sem PAE obrigatório), Relatórios ISR e, quando exigido pela SEMA, ISE, RPSB.', col2: '' },
      { col1: 'Periodicidade:', col2: '' },
      { col1: '• ISR', col2: 'no mínimo bienal (até 31/dez)' },
      { col1: '• ISE', col2: 'quando NPGB Alerta/Emergência, antes do primeiro enchimento, com RPSB, deplecionamento rápido, eventos extremos, descomissionamento/sabotagem ou por exigência da SEMA.' },
      { col1: '• RPSB', col2: 'a cada 12 anos (Resumo Executivo no SNISB).' },
      { col1: '• PSB', col2: 'atualização contínua com resultados de inspeções.' },
    ];
  }
  return [];
};

export function normalizeCondicaoAreaState(input?: {
  condicaoArea?: unknown;
  vigenciaContratoAnos?: unknown;
  vigenciaInicio?: unknown;
}): {
  condicaoArea: '' | 'proprietario' | 'arrendatario';
  vigenciaContratoAnos: string;
  vigenciaInicio: string;
} {
  const condicaoArea: '' | 'proprietario' | 'arrendatario' =
    input?.condicaoArea === 'proprietario' || input?.condicaoArea === 'arrendatario'
      ? input.condicaoArea
      : '';

  const rawAnos = input?.vigenciaContratoAnos;
  const vigenciaContratoAnos =
    condicaoArea === 'arrendatario' && rawAnos !== undefined && rawAnos !== null
      ? String(rawAnos)
      : '';

  const rawInicio = input?.vigenciaInicio;
  const vigenciaInicio =
    condicaoArea === 'arrendatario' && rawInicio !== undefined && rawInicio !== null
      ? String(rawInicio)
      : '';

  return {
    condicaoArea,
    vigenciaContratoAnos,
    vigenciaInicio,
  };
}

export function validateVigenciaContratoAnos(value?: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) {
    return 'Informe um número inteiro positivo para a vigência do contrato (anos).';
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return 'A vigência do contrato (anos) deve ser um número inteiro positivo maior que zero.';
  }
  return null;
}

export function validateVigenciaInicio(value?: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return 'Informe uma data válida para o início da vigência.';
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return 'Informe uma data válida para o início da vigência.';
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return 'Informe uma data válida para o início da vigência.';
  }
  return null;
}

export function validateCondicaoAreaData(input?: {
  condicaoArea?: unknown;
  vigenciaContratoAnos?: unknown;
  vigenciaInicio?: unknown;
}): {
  valid: boolean;
  anosError: string | null;
  inicioError: string | null;
  firstError: string | null;
} {
  if (input?.condicaoArea !== 'arrendatario') {
    return { valid: true, anosError: null, inicioError: null, firstError: null };
  }
  const anosError = validateVigenciaContratoAnos(input.vigenciaContratoAnos);
  const inicioError = validateVigenciaInicio(input.vigenciaInicio);
  const firstError = anosError || inicioError || null;
  return {
    valid: !firstError,
    anosError,
    inicioError,
    firstError,
  };
}

export function applyParecerFieldChange(
  prev: ParecerData,
  field: keyof ParecerData,
  value: any
): ParecerData {
  const updated: ParecerData = { ...prev, [field]: value };

  // Preenche automaticamente UPG somente quando única; preserva quando houver múltiplas opções
  if (field === 'municipio') {
    const upgs = getUpgOptionsForMunicipality(value);
    if (upgs.length === 1) {
      updated.upg = upgs[0];
    } else if (!value) {
      updated.upg = '';
    }
  }

  if (field === 'tipoClassificacao') {
    const isPre = isPreClassificacaoTipo(value, false);
    updated.classificacao = {
      ...prev.classificacao,
      criPreClassificacao: isPre,
    };
  }

  if (field === 'condicaoArea' && value !== 'arrendatario') {
    updated.vigenciaContratoAnos = '';
    updated.vigenciaInicio = '';
  }

  return updated;
}

export function buildParecerSavePayloads(params: {
  parecerId: string;
  userId: string;
  userName: string;
  status: 'Rascunho' | 'Concluído';
  snapshot: ParecerData;
  nowIso?: string;
}) {
  const { parecerId, userId, userName, status, snapshot } = params;
  const nowIso = params.nowIso || new Date().toISOString();
  const { condicaoArea, vigenciaContratoAnos, vigenciaInicio } =
    normalizeCondicaoAreaState(snapshot);

  const payload = {
    user_id: userId,
    protocolo: snapshot.protocolo,
    analista: snapshot.analista || userName,
    analista_outro: snapshot.analistaOutro || null,
    data_parecer: snapshot.data || null,
    data_recebimento_processo: snapshot.dataRecebimentoProcesso || null,
    razao_social: snapshot.razaoSocial,
    cpf_cnpj: snapshot.cpfCnpj,
    localizacao: snapshot.localizacao,
    num_car: snapshot.numCAR,
    municipio: snapshot.municipio,
    finalidade: snapshot.finalidade,
    finalidade_outro: snapshot.finalidadeOutro,
    situacao_empreendimento: snapshot.situacaoEmpreendimento,
    situacao_empreendimento_outro: snapshot.situacaoEmpreendimentoOutro,
    curso_agua: snapshot.cursoAgua,
    propriedades_limites: snapshot.propriedadesLimites,
    sub_bacia: snapshot.subBacia,
    upg: snapshot.upg,
    area_bacia: snapshot.areaBacia,
    indice_pluviosidade: snapshot.indicePluviosidade,
    legenda_tabela1: snapshot.legendaTabela1,
    tipo_classificacao: snapshot.tipoClassificacao,
    tipo_classificacao_outro: snapshot.tipoClassificacaoOutro,
    tipo_barragem: snapshot.tipoBarragem,
    tipo_barragem_outro: snapshot.tipoBarragemOutro,
    introducao: snapshot.introducao,
    parecer_final: snapshot.parecer_final,
    parecer_tecnico_numero: snapshot.parecerTecnicoNumero,
    data_parecer_tecnico: snapshot.dataParecerTecnico || null,
    portaria_numero: snapshot.portariaNumero,
    data_portaria: snapshot.dataPortaria || null,
    custom_portaria_text: snapshot.customPortariaText,
    status,
    tipo_documento: 'Parecer Técnico' as const,
    data_conclusao:
      status === 'Concluído'
        ? nowIso
        : snapshot.status === 'Concluído'
        ? snapshot.dataConclusao
        : null,
    updated_at: nowIso,
    dpa_class: snapshot.classificacao.dpaClass || null,
    dpa1_select: snapshot.classificacao.dpa1Select,
    dpa2_select: snapshot.classificacao.dpa2Select,
    dpa3_select: snapshot.classificacao.dpa3Select,
    dpa4_select: snapshot.classificacao.dpa4Select,
    score_dpa1: snapshot.classificacao.scoreDpa1,
    score_dpa2: snapshot.classificacao.scoreDpa2,
    score_dpa3: snapshot.classificacao.scoreDpa3,
    score_dpa4: snapshot.classificacao.scoreDpa4,
    total_dpa: snapshot.classificacao.totalDpa,
    ruptura_texto: snapshot.classificacao.rupturaTexto,
    legenda_dpa: snapshot.classificacao.legendaDPA,
    cri_pre_classificacao: snapshot.classificacao.criPreClassificacao,
    ct6_select: snapshot.classificacao.ct6Select,
    ec1_select: snapshot.classificacao.ec1Select,
    ec2_select: snapshot.classificacao.ec2Select,
    ec3_select: snapshot.classificacao.ec3Select,
    ec4_select: snapshot.classificacao.ec4Select,
    ec5_select: snapshot.classificacao.ec5Select,
    ps1_select: snapshot.classificacao.ps1Select,
    ps2_select: snapshot.classificacao.ps2Select,
    ps3_select: snapshot.classificacao.ps3Select,
    ps4_select: snapshot.classificacao.ps4Select,
    ps5_select: snapshot.classificacao.ps5Select,
    ps6_select: snapshot.classificacao.ps6Select,
    score_ct1: snapshot.classificacao.scoreCt1,
    score_ct2: snapshot.classificacao.scoreCt2,
    score_ct3: snapshot.classificacao.scoreCt3,
    score_ct4: snapshot.classificacao.scoreCt4,
    score_ct5: snapshot.classificacao.scoreCt5,
    score_ct6: snapshot.classificacao.scoreCt6,
    score_ec1: snapshot.classificacao.scoreEc1,
    score_ec2: snapshot.classificacao.scoreEc2,
    score_ec3: snapshot.classificacao.scoreEc3,
    score_ec4: snapshot.classificacao.scoreEc4,
    score_ec5: snapshot.classificacao.scoreEc5,
    score_ps1: snapshot.classificacao.scorePs1,
    score_ps2: snapshot.classificacao.scorePs2,
    score_ps3: snapshot.classificacao.scorePs3,
    score_ps4: snapshot.classificacao.scorePs4,
    score_ps5: snapshot.classificacao.scorePs5,
    score_ps6: snapshot.classificacao.scorePs6,
    total_ct: snapshot.classificacao.totalCT,
    total_ec: snapshot.classificacao.totalEC,
    total_ps: snapshot.classificacao.totalPS,
    val_geral: snapshot.classificacao.valGeral,
    risk_geral: snapshot.classificacao.riskGeral || null,
    val_percolacao: snapshot.classificacao.valPercolacao,
    risk_percolacao: snapshot.classificacao.riskPercolacao || null,
    val_galgamento: snapshot.classificacao.valGalgamento,
    risk_galgamento: snapshot.classificacao.riskGalgamento || null,
    val_gerencial: snapshot.classificacao.valGerencial,
    risk_gerencial: snapshot.classificacao.riskGerencial || null,
    risco: snapshot.classificacao.risco || null,
    resumo: snapshot.classificacao.resumo,
    empreendedor_id: snapshot.empreendedorId || null,
    barragem_id: snapshot.barragemId || snapshot.barragemPrincipal?.barragemId || null,
    sistema_origem: snapshot.sistemaOrigem || 'CLASSIFICA_CSB',
    data: {
      empreendedorId: snapshot.empreendedorId || null,
      barragemId: snapshot.barragemId || snapshot.barragemPrincipal?.barragemId || null,
      sistemaOrigem: snapshot.sistemaOrigem || 'CLASSIFICA_CSB',
      condicaoArea,
      vigenciaContratoAnos,
      vigenciaInicio,
      responsaveisTecnicos: snapshot.responsaveisTecnicos || [],
      barragemPrincipal: snapshot.barragemPrincipal,
      barragensMontante: snapshot.barragensMontante || [],
    },
  };

  const fallback42703Payload = {
    id: parecerId,
    user_id: userId,
    analista: snapshot.analista || userName,
    protocolo: snapshot.protocolo,
    status,
    tipo_documento: 'Parecer Técnico' as const,
    data: {
      ...payload,
      ...payload.data,
      analista: snapshot.analista || userName,
    },
    updated_at: nowIso,
  };

  return { payload, fallback42703Payload };
}

