import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CondicaoAreaEmpreendedorFieldset,
  getVigenciaContratoAnosWarning,
} from '../components/opinion/Topic2PedidoEmpreendedor';
import { mapParecerRowToParecerData } from '../src/contexts/DataContext';
import {
  applyParecerFieldChange,
  buildParecerSavePayloads,
  deriveClassification,
  normalizeCondicaoAreaState,
} from '../src/utils/opinionCalculations';
import { ParecerData } from '../types';

function makeBaseParecer(overrides: Partial<ParecerData> = {}): ParecerData {
  return {
    id: 'parecer-teste-1',
    protocolo: '123456/2026',
    analista: 'Analista Teste',
    analistaOutro: '',
    data: '2026-11-26',
    dataRecebimentoProcesso: '',
    interessado: '',
    empreendimento: '',
    coordenadas: '',
    razaoSocial: 'Empreendedor Teste Ltda',
    cpfCnpj: '',
    localizacao: '',
    numCAR: '',
    municipio: 'Cuiabá',
    condicaoArea: '',
    vigenciaContratoAnos: '',
    vigenciaInicio: '',
    finalidade: '',
    finalidadeOutro: '',
    situacaoEmpreendimento: '',
    situacaoEmpreendimentoOutro: '',
    cursoAgua: '',
    propriedadesLimites: '',
    subBacia: '',
    upg: '',
    areaBacia: '',
    indicePluviosidade: '',
    legendaTabela1: '',
    responsaveisTecnicos: [],
    tipoClassificacao: 'Classificação Inicial',
    tipoClassificacaoOutro: '',
    tipoBarragem: 'Terra',
    tipoBarragemOutro: '',
    docsGerais: [],
    docsGeraisOutro: [],
    docsIdentificacao: [],
    docsIdentificacaoOutro: [],
    espolio: false,
    docsEspolio: [],
    docsEspolioOutro: [],
    docsArt: [],
    docsArtOutro: [],
    docsTecnicos: [],
    docsTecnicosOutro: [],
    introducao: '',
    infoBarramento: '',
    barragemPrincipal: {
      id: 'main',
      nome: 'Barragem Teste',
      snisb: '',
      lat: '',
      long: '',
      alturaMaxima: '12',
      alturaMaximaFls: '',
      bordaLivre: '',
      bordaLivreFls: '',
      cotaCoroamento: '',
      cotaCoroamentoFls: '',
      comprimentoCoroamento: '180',
      comprimentoCoroamentoFls: '',
      larguraCoroamento: '',
      larguraCoroamentoFls: '',
      tipoEstrutural: 'Terra homogênea (1 ponto)',
      tipoFundacao: 'Solo saprolítico (2 pontos)',
      idade: '10',
      scoreIdade: 1,
      cotaNNO: '',
      cotaNMM: '',
      areaNNO: '',
      areaNMM: '',
      volumeNMO: '',
      volumeNMM: '5,0',
      vazaoMaxima: '',
      estruturas: [],
      possuiAdequacao: false,
    },
    barragensMontante: [],
    classificacao: {
      dpa1Select: '',
      dpa2Select: 'Não existem (0 pontos)',
      dpa3Select: 'Não existem (0 pontos)',
      dpa4Select: 'Baixo (1 ponto)',
      scoreDpa1: 0,
      scoreDpa2: 0,
      scoreDpa3: 0,
      scoreDpa4: 1,
      totalDpa: 3,
      dpaClass: 'Baixo' as ParecerData['classificacao']['dpaClass'],
      rupturaTexto: '',
      legendaDPA: '',
      criPreClassificacao: false,
      scoreCt1: 0,
      scoreCt2: 1,
      scoreCt3: 1,
      scoreCt4: 2,
      scoreCt5: 1,
      ct6Select: 'Extravasor com capacidade adequada (0 pontos)',
      scoreCt6: 0,
      ec1Select: 'Confiável (0 pontos)',
      scoreEc1: 0,
      ec2Select: 'Inexistente (0 pontos)',
      scoreEc2: 0,
      ec3Select: 'Ausente (0 pontos)',
      scoreEc3: 0,
      ec4Select: 'Ausente (0 pontos)',
      scoreEc4: 0,
      ec5Select: 'Bom (0 pontos)',
      scoreEc5: 0,
      ps1Select: 'Sim (0 pontos)',
      scorePs1: 0,
      ps2Select: 'Sim (0 pontos)',
      scorePs2: 0,
      ps3Select: 'Sim (0 pontos)',
      scorePs3: 0,
      ps4Select: 'Sim (0 pontos)',
      scorePs4: 0,
      ps5Select: 'Sim (0 pontos)',
      scorePs5: 0,
      ps6Select: 'Não se aplica (0 pontos)',
      scorePs6: 0,
      totalCT: 5,
      totalEC: 0,
      totalPS: 0,
      riskGeral: 'Baixa' as ParecerData['classificacao']['riskGeral'],
      valGeral: 5,
      riskPercolacao: 'Baixa' as ParecerData['classificacao']['riskPercolacao'],
      valPercolacao: 3,
      riskGalgamento: 'Baixa' as ParecerData['classificacao']['riskGalgamento'],
      valGalgamento: 2,
      riskGerencial: 'Baixa' as ParecerData['classificacao']['riskGerencial'],
      valGerencial: 0,
      risco: 'Baixa' as ParecerData['classificacao']['risco'],
      resumo: 'Classe C',
    },
    parecer_final: '',
    status: 'Rascunho',
    tipo_documento: 'Parecer Técnico',
    ...overrides,
  };
}

function renderTopic2(formData: ParecerData, readOnly = false): string {
  return renderToStaticMarkup(
    React.createElement(CondicaoAreaEmpreendedorFieldset, {
      condicaoArea: formData.condicaoArea,
      vigenciaContratoAnos: formData.vigenciaContratoAnos,
      vigenciaInicio: formData.vigenciaInicio,
      readOnly,
      onChangeCondicaoArea: () => undefined,
      onChangeVigenciaAnos: () => undefined,
      onChangeVigenciaInicio: () => undefined,
      onClear: () => undefined,
    })
  );
}

test('INITIAL_DATA em OpinionForm inicializa condicaoArea, vigenciaContratoAnos e vigenciaInicio vazios', () => {
  const opinionFormSource = fs.readFileSync(
    path.resolve(process.cwd(), 'components/OpinionForm.tsx'),
    'utf8'
  );
  assert.match(opinionFormSource, /condicaoArea:\s*''/);
  assert.match(opinionFormSource, /vigenciaContratoAnos:\s*''/);
  assert.match(opinionFormSource, /vigenciaInicio:\s*''/);
});

test('Salvar sem preencher os campos de condição na área não bloqueia e não adiciona colunas SQL novas', () => {
  const snapshot = makeBaseParecer({
    condicaoArea: '',
    vigenciaContratoAnos: '',
    vigenciaInicio: '',
  });

  const derived = deriveClassification(snapshot);
  assert.equal(derived.resultado.isComplete, true);

  const opinionFormSource = fs.readFileSync(
    path.resolve(process.cwd(), 'components/OpinionForm.tsx'),
    'utf8'
  );
  const conclusaoBlockMatch = opinionFormSource.match(
    /const getConclusaoPendencias = \(\): string\[\] => \{[\s\S]*?\n  \};/
  );
  assert.ok(conclusaoBlockMatch, 'getConclusaoPendencias deve existir em OpinionForm.tsx');
  assert.equal(conclusaoBlockMatch[0].includes('condicaoArea'), false);
  assert.equal(conclusaoBlockMatch[0].includes('vigenciaContratoAnos'), false);
  assert.equal(conclusaoBlockMatch[0].includes('vigenciaInicio'), false);

  const { payload, fallback42703Payload } = buildParecerSavePayloads({
    parecerId: 'parecer-teste-1',
    userId: 'user-1',
    userName: 'Analista Teste',
    status: 'Concluído',
    snapshot,
    nowIso: '2026-11-26T12:00:00.000Z',
  });

  assert.equal('condicao_area' in payload, false);
  assert.equal('vigencia_contrato_anos' in payload, false);
  assert.equal('vigencia_inicio' in payload, false);
  assert.equal('condicaoArea' in payload, false);
  assert.equal('vigenciaContratoAnos' in payload, false);
  assert.equal('vigenciaInicio' in payload, false);

  assert.equal(payload.data.condicaoArea, '');
  assert.equal(payload.data.vigenciaContratoAnos, '');
  assert.equal(payload.data.vigenciaInicio, '');

  assert.equal(fallback42703Payload.data.condicaoArea, '');
  assert.equal(fallback42703Payload.data.vigenciaContratoAnos, '');
  assert.equal(fallback42703Payload.data.vigenciaInicio, '');
});

test('Arrendatário com anos exibe campos de vigência, inclui no payload JSONB e mostra aviso discreto só para valor inválido', () => {
  const base = makeBaseParecer();
  let state = applyParecerFieldChange(base, 'condicaoArea', 'arrendatario');
  state = applyParecerFieldChange(state, 'vigenciaContratoAnos', '15');
  state = applyParecerFieldChange(state, 'vigenciaInicio', '2026-03-01');

  assert.equal(state.condicaoArea, 'arrendatario');
  assert.equal(state.vigenciaContratoAnos, '15');
  assert.equal(state.vigenciaInicio, '2026-03-01');
  assert.equal(getVigenciaContratoAnosWarning(state.vigenciaContratoAnos), null);

  const html = renderTopic2(state, false);
  assert.match(html, /Condição na área/);
  assert.match(html, /Opcional\. Informação complementar para o cadastro\./);
  assert.match(html, /Vigência do contrato \(anos\)/);
  assert.match(html, /Início da vigência/);
  assert.match(html, /value="15"/);
  assert.match(html, /value="2026-03-01"/);
  assert.match(html, /title="Limpar condição na área"/);

  const { payload, fallback42703Payload } = buildParecerSavePayloads({
    parecerId: 'parecer-arrend-1',
    userId: 'user-1',
    userName: 'Analista Teste',
    status: 'Rascunho',
    snapshot: state,
  });
  assert.equal(payload.data.condicaoArea, 'arrendatario');
  assert.equal(payload.data.vigenciaContratoAnos, '15');
  assert.equal(payload.data.vigenciaInicio, '2026-03-01');
  assert.equal(fallback42703Payload.data.condicaoArea, 'arrendatario');
  assert.equal(fallback42703Payload.data.vigenciaContratoAnos, '15');
  assert.equal(fallback42703Payload.data.vigenciaInicio, '2026-03-01');

  // Valor negativo mostra aviso discreto sem bloquear
  const invalidState = applyParecerFieldChange(state, 'vigenciaContratoAnos', '-5');
  const warning = getVigenciaContratoAnosWarning(invalidState.vigenciaContratoAnos);
  assert.ok(warning && warning.includes('1 a 99 anos'));
  assert.equal(getVigenciaContratoAnosWarning('0')?.includes('1 a 99 anos'), true);
  assert.equal(getVigenciaContratoAnosWarning('100')?.includes('1 a 99 anos'), true);
  assert.equal(getVigenciaContratoAnosWarning(''), null);

  const invalidHtml = renderTopic2(invalidState, false);
  assert.ok(invalidHtml.includes(warning));

  // Modo readOnly desabilita select, inputs de vigência e botão Limpar
  const readOnlyHtml = renderTopic2(state, true);
  assert.match(readOnlyHtml, /id="condicao-area-select"[^>]*disabled/);
  assert.match(readOnlyHtml, /id="vigencia-contrato-anos"[^>]*disabled/);
  assert.match(readOnlyHtml, /id="vigencia-inicio"[^>]*disabled/);
  assert.match(readOnlyHtml, /<button[^>]*disabled[^>]*title="Limpar condição na área"/);
});

test('Trocar de arrendatário para proprietário ou não informado limpa vigenciaContratoAnos e vigenciaInicio', () => {
  const asArrendatario = makeBaseParecer({
    condicaoArea: 'arrendatario',
    vigenciaContratoAnos: '10',
    vigenciaInicio: '2026-01-15',
  });

  const asProprietario = applyParecerFieldChange(
    asArrendatario,
    'condicaoArea',
    'proprietario'
  );
  assert.equal(asProprietario.condicaoArea, 'proprietario');
  assert.equal(asProprietario.vigenciaContratoAnos, '');
  assert.equal(asProprietario.vigenciaInicio, '');

  const propHtml = renderTopic2(asProprietario, false);
  assert.doesNotMatch(propHtml, /id="vigencia-contrato-anos"/);
  assert.doesNotMatch(propHtml, /id="vigencia-inicio"/);

  const asNaoInformado = applyParecerFieldChange(asArrendatario, 'condicaoArea', '');
  assert.equal(asNaoInformado.condicaoArea, '');
  assert.equal(asNaoInformado.vigenciaContratoAnos, '');
  assert.equal(asNaoInformado.vigenciaInicio, '');
});

test('Recarregar um parecer preserva os valores de condicaoArea e vigência no DataContext e na reidratação', () => {
  const base = makeBaseParecer();
  const rowNormal = {
    id: 'p-1',
    user_id: 'u-1',
    protocolo: '111/2026',
    analista: 'Analista A',
    status: 'Rascunho',
    data: {
      empreendedorId: 'emp-1',
      barragemId: 'bar-1',
      sistemaOrigem: 'CLASSIFICA_CSB',
      condicaoArea: 'arrendatario',
      vigenciaContratoAnos: '12',
      vigenciaInicio: '2026-05-20',
      responsaveisTecnicos: [],
      barragemPrincipal: base.barragemPrincipal,
      barragensMontante: [],
    },
    parecer_responsaveis: [],
    parecer_documentos: [],
    parecer_barramentos: [],
  };

  const reloaded = mapParecerRowToParecerData(rowNormal);
  assert.equal(reloaded.condicaoArea, 'arrendatario');
  assert.equal(reloaded.vigenciaContratoAnos, '12');
  assert.equal(reloaded.vigenciaInicio, '2026-05-20');

  const normalizedForEdit = normalizeCondicaoAreaState(reloaded);
  assert.equal(normalizedForEdit.condicaoArea, 'arrendatario');
  assert.equal(normalizedForEdit.vigenciaContratoAnos, '12');
  assert.equal(normalizedForEdit.vigenciaInicio, '2026-05-20');

  // Fallback 42703 também preserva valores no recarregamento
  const { fallback42703Payload } = buildParecerSavePayloads({
    parecerId: 'p-fallback',
    userId: 'u-1',
    userName: 'Analista A',
    status: 'Rascunho',
    snapshot: makeBaseParecer({
      condicaoArea: 'arrendatario',
      vigenciaContratoAnos: '8',
      vigenciaInicio: '2025-11-01',
    }),
  });

  const reloadedFallback = mapParecerRowToParecerData({
    id: 'p-fallback',
    user_id: 'u-1',
    protocolo: '123456/2026',
    analista: 'Analista A',
    status: 'Rascunho',
    data: fallback42703Payload.data,
    parecer_responsaveis: [],
    parecer_documentos: [],
    parecer_barramentos: [],
  });
  assert.equal(reloadedFallback.condicaoArea, 'arrendatario');
  assert.equal(reloadedFallback.vigenciaContratoAnos, '8');
  assert.equal(reloadedFallback.vigenciaInicio, '2025-11-01');

  // Parecer legado sem esses campos reidrata com ''
  const reloadedLegacy = mapParecerRowToParecerData({
    id: 'p-legacy',
    user_id: 'u-1',
    protocolo: '999/2025',
    analista: 'Analista B',
    status: 'Concluído',
    data: {},
    parecer_responsaveis: [],
    parecer_documentos: [],
    parecer_barramentos: [],
  });
  assert.equal(reloadedLegacy.condicaoArea, '');
  assert.equal(reloadedLegacy.vigenciaContratoAnos, '');
  assert.equal(reloadedLegacy.vigenciaInicio, '');
});

test('Contagem de funções serverless em api/ permanece exatamente 4', () => {
  const apiDir = path.resolve(process.cwd(), 'api');
  const entries = fs
    .readdirSync(apiDir)
    .filter((file) => file.endsWith('.ts'))
    .sort();

  assert.equal(entries.length, 4);
  assert.deepEqual(entries, [
    'administra-escrita.ts',
    'administra-leitura.ts',
    'pendencias.ts',
    'solicitacoes-vistoria.ts',
  ]);
});
