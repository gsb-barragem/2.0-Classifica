import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, Header, Footer, PageNumber, ImageRun, ISectionOptions } from 'docx';
import saveAs from 'file-saver';
import { ParecerData, DocItem, BarramentoData, DanoEnum, RiscoEnum } from '../types';

// Placeholder Base64 for the Logo (Mato Grosso / SEMA generic placeholder)
// Users should replace this string with the actual Base64 of their specific logo image.
const LOGO_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAACZSURBVHhe7cExAQAAAMKg9U9tCy8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4MC9QAAdsG8xQAAAAASUVORK5CYII=";

const generateDocItemText = (item: DocItem, artMode = false): string => {
  let text = item.label === 'OUTRO' && item.extraInput ? item.extraInput : item.label;
  
  if (artMode) {
    if (item.label === 'OUTRO') {
        text = `ART n° ${item.extraInput || '_____'} da atividade técnica ${item.extraSelect || '____'}`; 
    } else {
        text = `ART n° ${item.extraInput || '_____'} da atividade técnica ${item.label}`;
    }
  } else if (item.label !== 'OUTRO' && item.extraInput) {
    text = `${text} (${item.extraInput})`;
  }

  if (item.pageNumber) {
    text += ` (fls. ${item.pageNumber})`;
  }
  return text;
};

const createDocList = (items: DocItem[], outros: DocItem[], artMode = false): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  
  const checkedItems = items.filter(i => i.checked);
  const checkedOutros = outros.filter(i => i.checked);
  
  const allChecked = [...checkedItems, ...checkedOutros];

  allChecked.forEach(item => {
    paragraphs.push(new Paragraph({
      text: generateDocItemText(item, artMode),
      bullet: { level: 0 },
      spacing: { after: 50 }
    }));
  });

  if (allChecked.length === 0) {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: "Nenhum documento selecionado neste tópico.",
          italics: true,
        })
      ],
      indent: { left: 720 }
    }));
  }

  return paragraphs;
};

// Remove score part (e.g., "Terra Homogênea (4)" -> "Terra Homogênea")
const cleanScore = (text: string | null | undefined) => {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\s*\(\d+.*?\)$/, "");
};

const formatFls = (val: string) => {
  if (!val) return '';
  const clean = val.trim();
  if (clean.toLowerCase().includes('fls')) return clean;
  return `fls. ${clean}`;
};

function createBarramentoTable(b: BarramentoData, title: string): (Paragraph | Table)[] {
  const rows: string[][] = [
    ["Nome da barragem", b.nome],
    ["SNISB", b.snisb || "-"],
    ["Coordenadas", `Lat: ${b.lat} Long: ${b.long}`],
    ["Altura Máxima (m)", b.alturaMaxima + (b.alturaMaximaFls ? ` (${formatFls(b.alturaMaximaFls)})` : "")],
    ["Borda Livre (m)", b.bordaLivre + (b.bordaLivreFls ? ` (${formatFls(b.bordaLivreFls)})` : "")],
    ["Cota do Coroamento (m)", b.cotaCoroamento + (b.cotaCoroamentoFls ? ` (${formatFls(b.cotaCoroamentoFls)})` : "")],
    ["Comprimento do Coroamento (m)", b.comprimentoCoroamento + (b.comprimentoCoroamentoFls ? ` (${formatFls(b.comprimentoCoroamentoFls)})` : "")],
    ["Largura do Coroamento (m)", b.larguraCoroamento + (b.larguraCoroamentoFls ? ` (${formatFls(b.larguraCoroamentoFls)})` : "")],
    ["Tipo Estrutural", cleanScore(b.tipoEstrutural)],
    ["Tipo de Fundação", cleanScore(b.tipoFundacao)],
    ["Idade (anos)", b.idade],
    ["Reservatório (Cota NNO) (m)", b.cotaNNO],
    ["Reservatório (Cota NMM) (m)", b.cotaNMM],
    ["Reservatório (Área NNO) (m²)/(ha)", b.areaNNO],
    ["Reservatório (Área NMM) (m²)/(ha)", b.areaNMM],
    ["Reservatório (Vol. NMO) (hm³)", b.volumeNMO],
    ["Reservatório (Vol. NMM) (hm³)", b.volumeNMM],
    ["Vazão Máxima de Projeto (m³/s) /TR", b.vazaoMaxima],
  ];

  // Logic to insert Hydraulic Structures flat into the rows array
  b.estruturas.forEach((struct, idx) => {
    rows.push([`Estrutura Hidráulica ${idx + 1} - Descrição`, struct.descricao]);
    rows.push([` - Vazão da estrutura (m³/s)`, struct.vazao]);
    rows.push([` - Cota da soleira (m)`, struct.cotaSoleira]);
    rows.push([` - Localização no barramento`, struct.localizacao]);
    rows.push([` - Segurança Estrutural`, struct.seguranca]);
  });

  return [
    new Paragraph({
      text: title,
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      style: "Caption",
    }),
    createTable(rows)
  ];
}

function createAdequacaoTable(b: BarramentoData, title = "Tabela 3. Adequações propostas para o barramento"): (Paragraph | Table)[] {
  if (!b.possuiAdequacao) return [];
  const rows: string[][] = [
    ["Vazão (Adequação) (m³/s)", b.adequacaoVazao || '-'],
    ["Cota Soleira (Adequação) (m)", b.adequacaoCota || '-'],
    ["Localização (Adequação)", b.adequacaoLocalizacao || '-'],
    ["Vazão Mínima Remanescente", b.adequacaoVazaoRemanescente || '-'],
    ["Segurança (Adequação)", b.adequacaoSeguranca || '-'],
  ];

  return [
    new Paragraph({
      text: title,
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      style: "Caption",
    }),
    createTable(rows)
  ];
}

interface RangeRow {
  formula: string;
  classe: string;
  isMatch: boolean;
}

// Function to create specific DPA/CRI Range Table with highlighting
function createRangeTable(rows: RangeRow[], title: string, result: string, header1 = "Fórmula de cálculo", header2 = "Classe"): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ 
            children: [new Paragraph({ children: [new TextRun({ text: title, bold: true })] })], 
            shading: { fill: "F3F4F6" },
            columnSpan: 2
          }),
        ]
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: header1, bold: true })] })], shading: { fill: "F3F4F6" } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: header2, bold: true })] })], shading: { fill: "F3F4F6" } }),
        ]
      }),
      ...rows.map(row => 
        new TableRow({
          children: [
            new TableCell({ 
              children: [new Paragraph({ text: row.formula })], 
              shading: row.isMatch ? { fill: "FDE68A" } : undefined 
            }),
            new TableCell({ 
              children: [new Paragraph({ text: row.classe })], 
              shading: row.isMatch ? { fill: "FDE68A" } : undefined 
            }),
          ]
        })
      ),
      new TableRow({
        children: [
          new TableCell({ 
            children: [new Paragraph({ children: [new TextRun({ text: result, bold: true })], alignment: AlignmentType.CENTER })], 
            shading: { fill: "F3F4F6" },
            columnSpan: 2
          }),
        ]
      }),
    ]
  });
}

// Helper for Quadro 4
function createQuadro4(resumoClass: string): Table {
  const isA = resumoClass.includes("CLASSE A");
  const isB = resumoClass.includes("CLASSE B");
  const isC = resumoClass.includes("CLASSE C");
  const isD = resumoClass.includes("CLASSE D");

  let contentRows: string[][] = [];

  if (isA || isB) {
    const className = isA ? "Classe A" : "Classe B";
    const rpsbFreq = isA ? "a cada 5 anos" : "a cada 7 anos";
    contentRows = [
      [className, ""],
      ["Peças técnicas obrigatórias: PSB completo (6 volumes, incluindo RPSB e PAE), PAE, Relatórios ISR e ISE, RPSB.", ""],
      ["Periodicidade:", ""],
      ["• ISR", "anual (até 31/dez)"],
      ["• ISE", "quando NPGB Alerta/Emergência, antes primeiro enchimento, com RPSB, deplecionamento rápido, eventos extremos, descomissionamento/sabotagem ou exigência SEMA."],
      ["• RPSB", `${rpsbFreq} (Resumo Executivo no SNISB).`],
      ["• PAE", "atualização anual; revisão quando necessário (mudanças, recomendações etc.)."],
      ["• PSB", "atualização contínua com resultados de inspeções."]
    ];
  } else if (isC) {
    contentRows = [
      ["Classe C", ""],
      ["Peças técnicas obrigatórias: PSB (6 volumes, sem PAE obrigatório), Relatórios ISR e ISE, RPSB.", ""],
      ["Periodicidade:", ""],
      ["• ISR", "anual (até 31/dez)"],
      ["• ISE", "quando NPGB Alerta/Emergência, antes primeiro enchimento, com RPSB, deplecionamento rápido, eventos extremos, descomissionamento/sabotagem ou exigência SEMA."],
      ["• RPSB", "a cada 10 anos (Resumo Executivo no SNISB)."],
      ["• PSB", "atualização contínua com resultados de inspeções."]
    ];
  } else if (isD) {
    contentRows = [
      ["Classe D", ""],
      ["Peças técnicas obrigatórias: PSB (6 volumes, sem PAE obrigatório), Relatórios ISR e, quando exigido pela SEMA, ISE, RPSB.", ""],
      ["Periodicidade:", ""],
      ["• ISR", "anual (até 31/dez)"],
      ["• ISE", "quando NPGB Alerta/Emergência, antes do primeiro enchimento, com RPSB, deplecionamento rápido, eventos extremos, descomissionamento/sabotagem ou por exigência da SEMA."],
      ["• RPSB", "a cada 15 anos (Resumo Executivo no SNISB)."],
      ["• PSB", "atualização contínua com resultados de inspeções."]
    ];
  } else {
    contentRows = [["Não se enquadra nas condicionantes.", ""]];
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Atividades a serem executadas pelo empreendedor:", bold: true })] })], shading: { fill: "F3F4F6" }, width: { size: 50, type: WidthType.PERCENTAGE } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Prazo / Periodicidade:", bold: true })] })], shading: { fill: "F3F4F6" }, width: { size: 50, type: WidthType.PERCENTAGE } }),
        ]
      }),
      ...contentRows.map((row, idx) => 
        new TableRow({
          children: row[1] === "" ? [
             // Header-like rows (ClassName, Peças técnicas, Periodicidade headers) span 2 columns
             new TableCell({ 
                children: [new Paragraph({ children: [new TextRun({ text: row[0], bold: idx === 0 })] })], // Bold first row (Class Name)
                columnSpan: 2,
                shading: idx === 0 ? { fill: "F3F4F6" } : undefined
             })
          ] : [
             new TableCell({ children: [new Paragraph({ text: row[0] })] }),
             new TableCell({ children: [new Paragraph({ text: row[1] })] }),
          ]
        })
      )
    ]
  });
}

export const generateParecerDoc = async (data: ParecerData) => {
  const tipoClass = data.tipoClassificacao === 'OUTRO' ? data.tipoClassificacaoOutro : data.tipoClassificacao;
  const tipoBarragem = data.tipoBarragem === 'OUTRO' ? data.tipoBarragemOutro : data.tipoBarragem;
  const situacao = data.situacaoEmpreendimento === 'OUTRO' ? data.situacaoEmpreendimentoOutro : data.situacaoEmpreendimento;
  const analistaNome = data.analista === 'OUTRO' ? (data.analistaOutro || '_____') : (data.analista || '_____');
  const finalidade = data.finalidade === 'OUTRO' ? data.finalidadeOutro : data.finalidade;

  // Volume Nomenclature Mapping
  const volNomenclatureMap: Record<string, string> = {
    "MUITO BAIXO – inferior a 3hm³ (1)": "muito pequeno.",
    "BAIXO – de 3 a 10 hm³ (2)": "pequeno.",
    "MEDIO – de 10 a 75 hm³ (3)": "médio.",
    "ALTO – de 75 a 200 hm³ (4)": "grande.",
    "MUITO ALTO – superior a 200hm³ (5)": "muito grande."
  };
  const volNomenclature = volNomenclatureMap[data.classificacao.dpa1Select] || cleanScore(data.classificacao.dpa1Select);

  // Determine if it fits PNSB criteria
  const isPNSB = (
    data.classificacao.dpaClass === DanoEnum.MEDIO || 
    data.classificacao.dpaClass === DanoEnum.ALTO ||
    parseFloat(data.barragemPrincipal.alturaMaxima || '0') >= 15 ||
    parseFloat(data.barragemPrincipal.volumeNMM || '0') >= 3
  );

  const introP1 = `De acordo com a Política Nacional de Segurança de Barragens, Lei nº 12.334, de 20 de setembro de 2010, em seu artigo 5º inciso I, a fiscalização da segurança de barragens compete à entidade que outorga o direito de uso dos recursos hídricos, observado o domínio do corpo hídrico, quando o objeto for de acumulação de água, exceto para fins de aproveitamento hidrelétrico.`;
  const introP2 = `A fiscalização deve se basear em análise documental, em vistorias técnicas, em indicadores de segurança de barragem e em outros procedimentos definidos pelo órgão fiscalizador.`;
  const introP3 = `No estado de Mato Grosso, os critérios técnicos a serem aplicados e os procedimentos administrativos estão estabelecidos na Resolução CNRH nº 241, de 10 de setembro de 2024 e na Instrução Normativa nº 08, de 18 de dezembro de 2023.`;
  const introP4 = `Este Parecer apresenta os resultados da análise do pedido de ${tipoClass} quanto à Segurança de Barragem de ${tipoBarragem} de acumulação de água para usos múltiplos, exceto para geração de energia elétrica, com ou sem captação de água. Conforme a solicitação, observa-se que o empreendimento se encontra-se em fase de ${situacao}.`;
  const introP5 = `Este documento encontra embasamento na análise dos documentos disponibilizados nos autos, contendo em referência à análise documental:`;

  // 4.1 Text
  const volumeSectionText = `De acordo com o Art. 6º da Resolução CNRH Nº 241/2024, as barragens são classificadas quanto ao volume total do reservatório. Conforme informações apresentadas pelo empreendedor, a Barragem é classificada, quanto ao Volume, como ‘${volNomenclature}’`;

  // 4.2 Text
  const dpaSectionText = `Conforme Art. 4º da Resolução CNRH Nº 241, de 10 de setembro de 2024, a classificação por Categoria de Dano Potencial Associado (DPA) da barragem tem por objetivo classificar as barragens em função do potencial de danos humanos, sociais, econômicos e ambientais decorrentes de eventual ruptura, vazamento, infiltração no solo ou mau funcionamento da barragem, devendo ser considerado o cenário de pior caso. ${data.classificacao.rupturaTexto}`;

  // 4.3 Text
  const criSectionText = `Segundo o Art. 7º da Resolução CNRH Nº 241/2024, a Categoria de Risco (CRI) refere-se aos aspectos da própria barragem que possam influenciar na probabilidade de ocorrência de acidente, sendo classificada em função das características técnicas, do estado de conservação do empreendimento e do plano de segurança da barragem. Abaixo se encontra a classificação do barramento quanto à categoria de risco embasada na Resolução:`;

  // 4.4 Text
  // RT Text Logic
  const rtText = data.responsaveisTecnicos.map(rt => `${rt.nome} (ART ${rt.art})`).join('\n');

  // Range Rows Data Construction
  const dpaRows: RangeRow[] = [
    { formula: "(DPA1 + DPA2 + DPA3 + DPA4) > 13", classe: "ALTO", isMatch: data.classificacao.dpaClass === DanoEnum.ALTO },
    { formula: "7 <= (DPA1 + DPA2 + DPA3 + DPA4) <= 13", classe: "MÉDIO", isMatch: data.classificacao.dpaClass === DanoEnum.MEDIO },
    { formula: "(DPA1 + DPA2 + DPA3 + DPA4) < 7", classe: "BAIXO", isMatch: data.classificacao.dpaClass === DanoEnum.BAIXO },
  ];

  const criRows: RangeRow[] = [
    { formula: "Se algum indicador de risco resultar em ALTO", classe: "ALTA", isMatch: data.classificacao.risco === RiscoEnum.ALTO },
    { formula: "Se NENHUM indicador de risco resultar em ALTO, e algum resultar em MÉDIO", classe: "MÉDIA", isMatch: data.classificacao.risco === RiscoEnum.MEDIO },
    { formula: "Se todos os indicadores de risco resultarem em BAIXO", classe: "BAIXA", isMatch: data.classificacao.risco === RiscoEnum.BAIXO },
  ];

  const genRiskRows: RangeRow[] = [
    { formula: "CT + EC + PSB >= 65", classe: "ALTO", isMatch: data.classificacao.riskGeral === RiscoEnum.ALTO },
    { formula: "35 < CT + EC + PSB < 65", classe: "MÉDIO", isMatch: data.classificacao.riskGeral === RiscoEnum.MEDIO },
    { formula: "CT + EC + PSB <= 35", classe: "BAIXO", isMatch: data.classificacao.riskGeral === RiscoEnum.BAIXO },
  ];

  const percRows: RangeRow[] = [
    { formula: "EC3 = 5 ou EC4 = 5 ou EC5 = 5 ou (EC3+ EC4 + EC5) > 10", classe: "ALTO", isMatch: data.classificacao.riskPercolacao === RiscoEnum.ALTO },
    { formula: "7 < (EC3 + EC4 + EC5) <= 10", classe: "MÉDIO", isMatch: data.classificacao.riskPercolacao === RiscoEnum.MEDIO },
    { formula: "(EC3 + EC4 + EC5) <= 7", classe: "BAIXO", isMatch: data.classificacao.riskPercolacao === RiscoEnum.BAIXO },
  ];

  const galgRows: RangeRow[] = [
    { formula: "(CT6 + EC1) > 7 ou EC1 = 5", classe: "ALTO", isMatch: data.classificacao.riskGalgamento === RiscoEnum.ALTO },
    { formula: "4 < (CT6) + (EC1) <= 7", classe: "MÉDIO", isMatch: data.classificacao.riskGalgamento === RiscoEnum.MEDIO },
    { formula: "(CT6) + (EC1) <= 4", classe: "BAIXO", isMatch: data.classificacao.riskGalgamento === RiscoEnum.BAIXO },
  ];

  const gerencialRows: RangeRow[] = [
    { formula: "PSB >= 24", classe: "ALTO", isMatch: data.classificacao.riskGerencial === RiscoEnum.ALTO },
    { formula: "13 < PSB < 24", classe: "MÉDIO", isMatch: data.classificacao.riskGerencial === RiscoEnum.MEDIO },
    { formula: "PSB <= 13", classe: "BAIXO", isMatch: data.classificacao.riskGerencial === RiscoEnum.BAIXO },
  ];

  const mainSectionChildren = [
    // TITLE
    new Paragraph({
      children: [
          new TextRun({
              text: `Parecer Técnico CSB -SURH /SEMA/MT`,
              bold: true,
              size: 24, 
          })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
    }),

    // REQUESTED HEADER INFO BLOCK
    new Paragraph({
      children: [
          new TextRun({ text: "Processo nº: ", bold: true }),
          new TextRun({ text: data.protocolo })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
          new TextRun({ text: "Assunto: ", bold: true }),
          new TextRun({ text: `${tipoClass} quanto à Segurança de ${tipoClass === 'CLASSIFICAÇÃO DE RESERVATÓRIO PULMÃO' ? 'Barragem' : `Barragem de ${tipoBarragem}`} – ${data.razaoSocial} (Código SNISB nº ${data.barragemPrincipal.snisb || '____'})`, bold: true })
      ],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 400 }
    }),

    // 1. INTRODUÇÃO
    new Paragraph({
      text: "1. INTRODUÇÃO",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: introP1, size: 24 })],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: introP2, size: 24 })],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: introP3, size: 24 })],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: introP4, size: 24 })],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: introP5, size: 24 })],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360 },
    }),

    new Paragraph({ text: "Documentos Gerais", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
    ...createDocList(data.docsGerais, data.docsGeraisOutro),

     new Paragraph({ text: "Documentos de Identificação", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
    ...createDocList(data.docsIdentificacao, data.docsIdentificacaoOutro),

    ...(data.espolio ? [
      new Paragraph({ text: "Documentos de Espólio", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
      ...createDocList(data.docsEspolio, data.docsEspolioOutro)
    ] : []),

     new Paragraph({ text: "Documentos de ART", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
    ...createDocList(data.docsArt, data.docsArtOutro, true),

     new Paragraph({ text: "Documentos Técnicos", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
    ...createDocList(data.docsTecnicos, data.docsTecnicosOutro),


    // 2. INFORMAÇÕES DO PEDIDO
    new Paragraph({
      text: "2. INFORMAÇÕES DO PEDIDO",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 },
    }),
    
    new Paragraph({
      text: "Tabela 1. Informações do empreendedor e empreendimento",
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      style: "Caption", 
    }),

    createTable([
      ["Identificação do empreendedor", data.razaoSocial],
      [(data.cpfCnpj || '').replace(/\D/g, '').length > 11 ? "CNPJ" : "CPF", data.cpfCnpj || "-"],
      ["Localização do empreendimento", data.localizacao],
      ["Nº CAR", data.numCAR],
      ["Município/UF", data.municipio ? `${data.municipio}/MT` : "-"],
      ["UPG", data.upg || "-"],
      ["Finalidade do barramento", finalidade],
      ["Situação do empreendimento", situacao],
      ["Nome do Curso d’água barrado", data.cursoAgua],
      ["Propriedades Limites da barragem", data.propriedadesLimites],
      ["Sub-bacia/Bacia", data.subBacia],
      ["Área da bacia de contribuição (km²)*", data.areaBacia],
      ["Índice de pluviosidade**", data.indicePluviosidade],
      ["Responsável(is) Técnico(s) / ART", rtText || "-"], // ADDED RT ROW
    ]),

    new Paragraph({
      children: [
          new TextRun({
              text: data.legendaTabela1,
              size: 20, 
              italics: true
          })
      ],
      spacing: { before: 60, after: 200 },
    }),

    // 3. INFORMAÇÕES DO BARRAMENTO
    new Paragraph({
      text: "3. INFORMAÇÕES DO BARRAMENTO",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 },
    }),
    
    ...createBarramentoTable(data.barragemPrincipal, "Tabela 2. Informações gerais do barramento principal"),

    ...data.barragensMontante.flatMap((b, idx) => 
       createBarramentoTable(b, `Tabela 2.${idx+1}. Informações da ${b.nome}`)
    ),

    ...createAdequacaoTable(
      data.barragemPrincipal,
      data.barragensMontante.length > 0 ? "Tabela 3. Adequações propostas para o barramento principal" : "Tabela 3. Adequações propostas para o barramento"
    ),

    ...data.barragensMontante.flatMap((b, idx) => 
       createAdequacaoTable(b, `Tabela 3.${idx + 1}. Adequações propostas para a ${b.nome || `Barragem a montante ${idx + 1}`}`)
    ),
    
    // 4. CLASSIFICAÇÃO
    new Paragraph({
      text: "4. CLASSIFICAÇÃO",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 },
    }),
    
    // 4.1 Volume
    new Paragraph({ text: "4.1 Quanto ao Volume", heading: HeadingLevel.HEADING_3, spacing: { before: 100, after: 60 } }),
    new Paragraph({
       children: [new TextRun({ text: volumeSectionText, size: 24 })],
       alignment: AlignmentType.JUSTIFIED,
       spacing: { line: 360 },
    }),

    // 4.2 DPA
    new Paragraph({ text: "4.2 Quanto ao Dano Potencial Associado (DPA)", heading: HeadingLevel.HEADING_3, spacing: { before: 100, after: 60 } }),
    new Paragraph({
       children: [new TextRun({ text: dpaSectionText, size: 24 })],
       alignment: AlignmentType.JUSTIFIED,
       spacing: { line: 360 },
    }),

    new Paragraph({
      text: "Quadro 1. Memória de cálculo quanto ao DPA*",
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      style: "Caption",
    }),
    
    // DPA TABLE
    createTable([
        ["Critério", "Descrição", "Pontuação"],
        ["DPA1 - Volume", cleanScore(data.classificacao.dpa1Select), data.classificacao.scoreDpa1.toString()],
        ["DPA2 - Construções na área afetada a jusante", 
         cleanScore(data.classificacao.dpa2Select),
         data.classificacao.scoreDpa2.toString()
        ],
        ["DPA3 - Ambiental", cleanScore(data.classificacao.dpa3Select), data.classificacao.scoreDpa3.toString()],
        ["DPA4 - Socioeconômico", cleanScore(data.classificacao.dpa4Select), data.classificacao.scoreDpa4.toString()],
        ["TOTAL", "", data.classificacao.totalDpa.toString()],
        ["CLASSIFICAÇÃO", "", data.classificacao.dpaClass.toUpperCase()]
    ]),

     new Paragraph({
      children: [
          new TextRun({
              text: data.classificacao.legendaDPA,
              size: 20, 
              italics: true
          })
      ],
      spacing: { before: 60, after: 200 },
    }),

    // 4.3 CRI
    new Paragraph({ text: "4.3 Quanto à Categoria de Risco (CRI)", heading: HeadingLevel.HEADING_3, spacing: { before: 100, after: 60 } }),
    
    new Paragraph({
       children: [new TextRun({ text: criSectionText, size: 24 })],
       alignment: AlignmentType.JUSTIFIED,
       spacing: { line: 360 },
    }),

        new Paragraph({
          text: "Quadro 2. Características Técnicas (CT)",
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
          style: "Caption",
        }),

        createTable([
            ["Critério", "Descrição", "Pontuação"],
            ["CT1 - Altura", data.barragemPrincipal.alturaMaxima ? `${data.barragemPrincipal.alturaMaxima} m` : "-", data.classificacao.scoreCt1.toString()],
            ["CT2 - Comprimento", data.barragemPrincipal.comprimentoCoroamento ? `${data.barragemPrincipal.comprimentoCoroamento} m` : "-", data.classificacao.scoreCt2.toString()],
            ["CT3 - Tipo Estrutural", cleanScore(data.barragemPrincipal.tipoEstrutural), data.classificacao.scoreCt3.toString()],
            ["CT4 - Tipo de Fundação", cleanScore(data.barragemPrincipal.tipoFundacao), data.classificacao.scoreCt4.toString()],
            ["CT5 - Idade da Barragem (CRI)", data.barragemPrincipal.idade ? `${data.barragemPrincipal.idade} anos` : "-", data.classificacao.scoreCt5.toString()],
            ["CT6 - Vazão de Projeto", cleanScore(data.classificacao.ct6Select), data.classificacao.scoreCt6.toString()],
            ["TOTAL CT", "", data.classificacao.totalCT.toString()],
        ]),

        new Paragraph({
          text: "Quadro 3. Estado de Conservação (EC)",
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
          style: "Caption",
        }),

        createTable([
            ["Critério", "Descrição", "Pontuação"],
            ["EC1 - Confiabilidade das Estruturas Extravasoras", cleanScore(data.classificacao.ec1Select), data.classificacao.scoreEc1.toString()],
            ["EC2 - Confiabilidade das Estruturas de Adução", cleanScore(data.classificacao.ec2Select), data.classificacao.scoreEc2.toString()],
            ["EC3 - Percolação", cleanScore(data.classificacao.ec3Select), data.classificacao.scoreEc3.toString()],
            ["EC4 - Deformações e Recalques", cleanScore(data.classificacao.ec4Select), data.classificacao.scoreEc4.toString()],
            ["EC5 - Deterioração dos Taludes / Proteções", cleanScore(data.classificacao.ec5Select), data.classificacao.scoreEc5.toString()],
            ["TOTAL EC", "", data.classificacao.totalEC.toString()],
        ]),

        new Paragraph({
          text: "Quadro 4. Plano de Segurança (PS)",
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
          style: "Caption",
        }),

        createTable([
            ["Critério", "Descrição", "Pontuação"],
            ["PS1 - Documentação de Projeto", cleanScore(data.classificacao.ps1Select), data.classificacao.scorePs1.toString()],
            ["PS2 - Estrutura Organizacional e Qualificação Técnica", cleanScore(data.classificacao.ps2Select), data.classificacao.scorePs2.toString()],
            ["PS3 - Procedimentos de Inspeção e Monitoramento", cleanScore(data.classificacao.ps3Select), data.classificacao.scorePs3.toString()],
            ["PS4 - Relatórios de Inspeção e Revisão Periódica", cleanScore(data.classificacao.ps4Select), data.classificacao.scorePs4.toString()],
            ["PS5 - Plano de Ação de Emergência (PAE)", cleanScore(data.classificacao.ps5Select), data.classificacao.scorePs5.toString()],
            ["PS6 - Regra Operacional dos Dispositivos de Descarga", cleanScore(data.classificacao.ps6Select), data.classificacao.scorePs6.toString()],
            ["TOTAL PS", "", data.classificacao.totalPS.toString()],
        ]),

        new Paragraph({
          children: [
              new TextRun({
                  text: "*Classificação do CRI (Categoria de Risco) conforme as Faixas de Classificação estabelecidas nos itens II.7, II.8 e II.9, do Anexo II, da Resolução CNRH Nº 241, de 10 de setembro de 2024",
                  size: 20, 
                  italics: true
              })
          ],
          spacing: { before: 60, after: 200 },
        }),



    // Quadro 5.1
    ...(data.classificacao.criPreClassificacao ? [] : [
        new Paragraph({
          text: "Quadro 5.1. Resumo do cálculo dos indicadores da CRI",
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
          style: "Caption",
        }),
        createRangeTable(criRows, "FAIXAS DE CLASSIFICAÇÃO POR CATEGORIA DE RISCO (ÁGUA)", data.classificacao.risco.toUpperCase(), "Critério de Avaliação", "Classe de Categoria de Risco"),

         new Paragraph({
          children: [
              new TextRun({
                  text: "*Os indicadores de riscos são calculados a partir do quadro 5.2",
                  size: 20, 
                  italics: true
                    })
                ],
                spacing: { before: 60, after: 200 },
              }),

              // Quadro 5.2
               new Paragraph({
                text: "Quadro 5.2. INDICADOR DE RISCO GERAL",
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 100 },
                style: "Caption",
              }),
              createRangeTable(genRiskRows, "INDICADOR DE RISCO GERAL", data.classificacao.riskGeral.toUpperCase(), "Fórmula de cálculo", "Classe do indicador"),

               // Quadro 5.3
               new Paragraph({
                text: "Quadro 5.3. INDICADOR DE RISCO POR PERCOLAÇÃO / CONSERVAÇÃO",
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 100 },
                style: "Caption",
              }),
              createRangeTable(percRows, "INDICADOR DE RISCO POR PERCOLAÇÃO / CONSERVAÇÃO", data.classificacao.riskPercolacao.toUpperCase(), "Fórmula de cálculo", "Classe do indicador"),

               // Quadro 5.4
               new Paragraph({
                text: "Quadro 5.4. INDICADOR DE RISCO POR GALGAMENTO",
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 100 },
                style: "Caption",
              }),
              createRangeTable(galgRows, "INDICADOR DE RISCO POR GALGAMENTO", data.classificacao.riskGalgamento.toUpperCase(), "Fórmula de cálculo", "Classe do indicador"),

               // Quadro 5.5
               new Paragraph({
                text: "Quadro 5.5. INDICADOR DE RISCO GERENCIAL",
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 100 },
                style: "Caption",
              }),
              createRangeTable(gerencialRows, "INDICADOR DE RISCO GERENCIAL", data.classificacao.riskGerencial.toUpperCase(), "Fórmula de cálculo", "Classe do indicador"),

        new Paragraph({
          text: `QUADRO 6. RESUMO DO QUADRO DE CLASSIFICAÇÃO`,
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
          style: "Caption",
        }),

        // Quadro 6
        createTable([
          ["RESUMO DO QUADRO DE CLASSIFICAÇÃO", ""],
          ["Tipo de Classificação:", tipoClass],
          ["Nome do Curso D’água:", data.cursoAgua],
          ["Sub-bacia/Bacia:", data.subBacia],
          ["UPG:", data.upg || ""],
          ["Município/UF:", data.municipio ? `${data.municipio}/MT` : ""],
          ["Nome do Empreendedor:", data.razaoSocial],
          ["Localização do empreendimento:", data.localizacao],
          ["Número do Processo:", data.protocolo],
          ["Número do SNISB:", data.barragemPrincipal.snisb || "-"],
          ["DANO POTENCIAL ASSOCIADO:", data.classificacao.dpaClass.toUpperCase()],
          ["CATEGORIA DE RISCO:", data.classificacao.risco.toUpperCase()],
          ["Classificação quanto ao volume:", volNomenclature],
          ["Coordenadas:", `${data.barragemPrincipal.lat} - ${data.barragemPrincipal.long}`],
          ["Altura (m):", data.barragemPrincipal.alturaMaxima || "-"],
          ["Tipo de Barragem:", tipoBarragem],
          ["Volume armazenado (NMM) (hm³):", data.barragemPrincipal.volumeNMM || "-"],
          ["Situação do empreendimento:", situacao]
        ])
    ]),

          // 5. PARECER (ALWAYS ADDED)
          new Paragraph({
            text: "5. PARECER TÉCNICO CONCLUSIVO",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 120 },
          }),
          new Paragraph({
            children: [new TextRun({ text: data.parecer_final, size: 24 })],
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: 360 },
          }),
  ];

  const sections: ISectionOptions[] = [
    {
      properties: {
        page: {
          margin: { top: 1000, right: 1000, bottom: 1440, left: 1000 }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.SINGLE, size: 20, color: "000000" }, // Thick black line at bottom
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE },
                insideVertical: { style: BorderStyle.NONE }
              },
              rows: [
                new TableRow({
                  children: [
                    // LOGO CELL (Left)
                    new TableCell({
                      width: { size: 40, type: WidthType.PERCENTAGE },
                      verticalAlign: "center",
                      children: [
                        new Paragraph({
                          children: [
                            new ImageRun({
                              data: LOGO_BASE64, // Placeholder Base64
                              transformation: { width: 250, height: 60 },
                              type: "png",
                            }),
                          ],
                          alignment: AlignmentType.LEFT
                        })
                      ]
                    }),
                    // ADDRESS CELL (Right)
                    new TableCell({
                      width: { size: 60, type: WidthType.PERCENTAGE },
                      verticalAlign: "center",
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "Rua C esquina com rua Dois, Centro Político Administrativo",
                              color: "2F5496", // SEMA Blue
                              font: "Calibri",
                              size: 18 // 9pt
                            })
                          ],
                          alignment: AlignmentType.RIGHT,
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "CEP: 78.049-913 • Cuiabá • Mato Grosso • www.sema.mt.gov.br",
                              color: "2F5496", // SEMA Blue
                              font: "Calibri",
                              size: 18 // 9pt
                            })
                          ],
                          alignment: AlignmentType.RIGHT,
                        })
                      ]
                    })
                  ]
                })
              ]
            })
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
              new Paragraph({
                  children: [
                      new TextRun("Secretaria de Estado de Meio Ambiente – SEMA/MT"),
                      new TextRun({
                          children: [" - Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
                      }),
                  ],
                  alignment: AlignmentType.CENTER,
                  border: {
                      top: { style: BorderStyle.SINGLE, size: 6, color: "auto" },
                  },
                  spacing: { before: 200 },
              })
          ]
        })
      },
      children: mainSectionChildren,
    }
  ];

  // 5.1 CONDICIONANTES (ONLY ADDED IF PNSB AND NOT PRE-CLASS)
  if (isPNSB && !data.classificacao.criPreClassificacao) {
      sections.push({
          properties: {
            page: {
              margin: { top: 1000, right: 1000, bottom: 1440, left: 1000 }
            }
          },
          children: [
               new Paragraph({ text: "5.1 CONDICIONANTES E CONSEQUÊNCIAS REGULATÓRIAS", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
                new Paragraph({
                    children: [new TextRun({ text: `As consequências regulatórias da ${tipoClass} são definidas pela legislação vigente, estão discriminadas no quadro abaixo:`, size: 24 })],
                    alignment: AlignmentType.JUSTIFIED,
                    spacing: { line: 360, after: 100 },
                }),

                new Paragraph({
                    text: "Quadro 7. Consequências regulatórias.",
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 100 },
                    style: "Caption",
                }),

                createQuadro4(data.classificacao.resumo.toUpperCase()),
          ]
      });
  }
  
  // SIGNATURE (ALWAYS ADDED)
  sections.push({
      properties: {
        page: {
          margin: { top: 1000, right: 1000, bottom: 1440, left: 1000 }
        }
      },
      children: [
          new Paragraph({
            text: "________________________________________________",
            alignment: AlignmentType.CENTER,
            spacing: { before: 1200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: analistaNome,
                bold: true,
              })
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: "Analista de Meio Ambiente - SEMA/MT",
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: "Cuiabá/MT, " + new Date().toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'}),
            alignment: AlignmentType.CENTER,
            spacing: { before: 100 }
          }),
      ]
  });

  const doc = new Document({
    sections,
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Parecer_${(data.protocolo || '').replace(/[^a-zA-Z0-9]/g, '-')}.docx`);
};

export const generateOficioDoc = async (data: any) => {
  const analistaNome = data.analista === 'OUTRO' ? (data.analistaOutro || '_____') : (data.analista || '_____');
  const dataFormatada = new Date(data.data).toLocaleDateString('pt-BR');
  
  const introText = `A Secretaria de Estado de Meio Ambiente – SEMA/MT, no uso de suas atribuições legais, e considerando a análise técnica do processo nº ${data.protocolo}, referente ao empreendimento ${data.interessado}, vem por meio deste informar as seguintes pendências que devem ser sanadas para o prosseguimento da análise:`;

  const rtText = data.responsaveisTecnicos.map((rt: any) => {
    const nome = rt.nome === 'OUTRO' ? rt.nomeOutro : rt.nome;
    return `${nome} (ART ${rt.art})`;
  }).join('\n');

  const mainSectionChildren = [
    // TITLE
    new Paragraph({
      children: [
          new TextRun({
              text: `OFÍCIO DE PENDÊNCIAS - CSB/SURH/SEMA/MT`,
              bold: true,
              size: 24, 
          })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
    }),

    new Paragraph({
      children: [
          new TextRun({ text: "Processo nº: ", bold: true }),
          new TextRun({ text: data.protocolo })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
          new TextRun({ text: "Assunto: ", bold: true }),
          new TextRun({ text: data.assunto, bold: true })
      ],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 400 }
    }),

    new Paragraph({
      children: [new TextRun({ text: introText, size: 24 })],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 200 },
    }),

    new Paragraph({
      text: "LISTAGEM DE PENDÊNCIAS",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
    }),

    ...data.pendencias.map((p: string, idx: number) => 
      new Paragraph({
        text: `${idx + 1}. ${p}`,
        bullet: { level: 0 },
        spacing: { after: 100 },
        alignment: AlignmentType.JUSTIFIED,
      })
    ),

    new Paragraph({
      text: "RESPONSÁVEL(IS) TÉCNICO(S)",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: rtText || "Não informado.", size: 24 })],
      spacing: { after: 200 },
    }),

    new Paragraph({
      children: [
        new TextRun({ text: "PRAZO PARA CUMPRIMENTO: ", bold: true }),
        new TextRun({ text: `${data.prazo} dias`, bold: true, color: "FF0000" })
      ],
      spacing: { before: 300, after: 400 },
    }),

    new Paragraph({
      children: [new TextRun({ text: `Cuiabá/MT, ${dataFormatada}.`, size: 24 })],
      alignment: AlignmentType.RIGHT,
      spacing: { before: 400, after: 800 },
    }),

    new Paragraph({
      children: [
        new TextRun({ text: "________________________________________________", bold: true }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: (analistaNome || '_____'), bold: true }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Analista de Meio Ambiente - SEMA/MT" }),
      ],
      alignment: AlignmentType.CENTER,
    }),
  ];

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Caption",
          name: "Caption",
          basedOn: "Normal",
          next: "Normal",
          run: {
            size: 18,
            bold: true,
            italics: true,
          },
          paragraph: {
            spacing: { after: 100 },
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, right: 1000, bottom: 1440, left: 1000 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.SINGLE, size: 20, color: "000000" },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideHorizontal: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE }
                },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        width: { size: 40, type: WidthType.PERCENTAGE },
                        verticalAlign: "center",
                        children: [
                          new Paragraph({
                            children: [
                              new ImageRun({
                                data: LOGO_BASE64,
                                transformation: { width: 250, height: 60 },
                                type: "png",
                              }),
                            ],
                            alignment: AlignmentType.LEFT
                          })
                        ]
                      }),
                      new TableCell({
                        width: { size: 60, type: WidthType.PERCENTAGE },
                        verticalAlign: "center",
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: "Rua C esquina com rua Dois, Centro Político Administrativo",
                                color: "2F5496",
                                font: "Calibri",
                                size: 18
                              })
                            ],
                            alignment: AlignmentType.RIGHT,
                          }),
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: "CEP: 78.049-913 • Cuiabá • Mato Grosso • www.sema.mt.gov.br",
                                color: "2F5496",
                                font: "Calibri",
                                size: 18
                              })
                            ],
                            alignment: AlignmentType.RIGHT,
                          })
                        ]
                      })
                    ]
                  })
                ]
              })
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
                new Paragraph({
                    children: [
                        new TextRun("Secretaria de Estado de Meio Ambiente – SEMA/MT"),
                        new TextRun({
                            children: [" - Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
                        }),
                    ],
                    alignment: AlignmentType.CENTER,
                    border: {
                        top: { style: BorderStyle.SINGLE, size: 6, color: "auto" },
                    },
                    spacing: { before: 200 },
                })
            ]
          })
        },
        children: mainSectionChildren,
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  saveAs(buffer, `Oficio_Pendencias_${(data.protocolo || '').replace(/[^a-zA-Z0-9]/g, '-')}.docx`);
};

function createTable(rows: string[][]): Table {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: rows.map((row) =>
      new TableRow({
        children: row.map((cellText, idx) => {
           let widthSize = 35;
           const colCount = rows[0].length;
           
           if (colCount === 3) {
             // 3 column table logic (DPA/CRI)
             if (idx === 0) widthSize = 30;
             else if (idx === 1) widthSize = 55;
             else widthSize = 15;
           } else {
             // 2 column table logic
             widthSize = idx === 0 ? 35 : 65;
           }
           
           const isHeaderOrTotal = idx === 0 || row[0] === "TOTAL" || row[0] === "CLASSIFICAÇÃO" || row[0].includes("RESULTADOS") || row[0].includes("TOTAL CT") || row[0].includes("TOTAL EC") || row[0].includes("TOTAL PS");
           const isSectionHeader = row[1] === "" && row[0] !== "TOTAL" && row[0] !== "CLASSIFICAÇÃO";

           return new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cellText || "-",
                    bold: isHeaderOrTotal, 
                  })
                ],
                alignment: idx === 2 ? AlignmentType.CENTER : AlignmentType.LEFT
              })
            ],
            width: { size: widthSize, type: WidthType.PERCENTAGE },
            verticalAlign: "center",
            borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
            },
            shading: { fill: (idx === 0 || isSectionHeader) ? "F9FAFB" : "FFFFFF" }, 
            columnSpan: (isSectionHeader && idx === 0) ? 3 : 1,
            margins: { top: 100, bottom: 100, left: 100, right: 100 }
          })
        }).filter(cell => cell.options.columnSpan !== 1 || cell.options.width?.size !== 0), // Basic filter, improved by logic above
      })
    ),
  });
}