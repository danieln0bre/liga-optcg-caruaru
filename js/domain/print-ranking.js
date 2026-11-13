// Interpretação do print da tela "Ranking" do Bandai TCG+ (classificação final de um evento).
// Funções puras: recebem as linhas que o OCR reconheceu (texto + posição na imagem) e devolvem
// colocação, nome e Member Number de cada jogador. O OCR em si fica em js/ocr/leitor-print.js.
//
// Cada linha da tabela do app tem: posição (num círculo) · nome · "Member Number 0000310001" ·
// Win Points · OMW%… A âncora é o número de 10 dígitos, que não depende do idioma do app:
// o nome é o texto logo acima dele, na mesma faixa horizontal, e a posição é o número curto à esquerda.
//
// Formato de entrada: [{ texto, x0, y0, x1, y1, palavras: [{ texto, x0, y0, x1, y1 }] }]

const cx = (b) => (b.x0 + b.x1) / 2;
const cy = (b) => (b.y0 + b.y1) / 2;

/** Corrige confusões comuns do OCR em números (O→0, l/I/|→1) só quando estão encostadas em dígitos. */
function corrigirDigitos(texto) {
  return String(texto)
    .replace(/\s+/g, '')
    .replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, '0')
    .replace(/(?<=\d)[lI|]|[lI|](?=\d)/g, '1');
}

/** A palavra contém um Member Number (8+ dígitos seguidos, tolerando um ou dois dígitos perdidos)? */
const temMemberNumber = (texto) => /\d{8,}/.test(corrigirDigitos(texto));

/** Extrai o Member Number (10 dígitos finais). Devolve o que conseguir ler, mesmo incompleto. */
export function extrairMemberNumber(texto) {
  const sequencias = corrigirDigitos(texto).match(/\d{8,}/g);
  if (!sequencias) return '';
  const ultimo = sequencias[sequencias.length - 1];
  return ultimo.length > 10 ? ultimo.slice(-10) : ultimo;
}

// Rótulo do número no app ("Member Number", "Número de membro", "会員番号"…): nunca faz parte do nome.
const ROTULO = /^(member|number|n[uú]mero|membro|miembro|numero|de|会員番号)[:：]?$/i;
const temLetra = (t) => /\p{L}/u.test(t);

/**
 * Lê as linhas de UM print.
 * @returns {{ jogadores: [{ colocacao, nome, memberNumber, colocacaoLida }], avisos: string[] }}
 */
export function interpretarPrintRanking(linhas) {
  const palavras = linhas.flatMap((l) => l.palavras || []);
  const ancoras = linhas
    .map((linha) => ({ linha, numero: (linha.palavras || []).find((p) => temMemberNumber(p.texto)) }))
    .filter((a) => a.numero || temMemberNumber(a.linha.texto))
    .sort((a, b) => a.linha.y0 - b.linha.y0);

  const avisos = [];
  const lidos = ancoras.map(({ linha, numero }, i) => {
    const caixaNumero = numero || linha;
    const alturaLinha = Math.max(8, caixaNumero.y1 - caixaNumero.y0);
    const limiteSuperior = i ? ancoras[i - 1].linha.y1 : -Infinity;
    // Faixa horizontal do nome: começa onde começa o rótulo do número e termina pouco depois do número.
    const faixa = { x0: linha.x0 - alturaLinha, x1: caixaNumero.x1 + alturaLinha * 0.5 };
    const servePraNome = (p) =>
      cx(p) > faixa.x0 && cx(p) < faixa.x1 && temLetra(p.texto) && !ROTULO.test(p.texto) && !temMemberNumber(p.texto);

    // 1) Nome na mesma linha do OCR, acima do número (acontece quando o OCR junta as duas).
    let nomePalavras = (linha.palavras || []).filter((p) => p !== numero && servePraNome(p) && cy(p) < caixaNumero.y0 - alturaLinha * 0.3);
    let topo = nomePalavras.length ? Math.min(...nomePalavras.map((p) => p.y0)) : null;
    // 2) Senão, a linha mais próxima acima, até a linha do jogador anterior.
    if (!nomePalavras.length) {
      const acima = linhas
        .filter((l) => l !== linha && cy(l) < linha.y0 && l.y0 >= limiteSuperior - 2 && linha.y0 - l.y1 < alturaLinha * 4)
        .sort((a, b) => b.y1 - a.y1);
      for (const l of acima) {
        const ps = (l.palavras || []).filter(servePraNome);
        if (ps.some((p) => (p.texto.match(/\p{L}/gu) || []).length >= 2 || /[぀-ヿ一-鿿]/.test(p.texto))) {
          // Mantém a ordem e os símbolos do nome ("zé Gomu #Mugi"): pega todas as palavras da faixa.
          nomePalavras = (l.palavras || []).filter((p) => cx(p) > faixa.x0 && cx(p) < faixa.x1 && !ROTULO.test(p.texto));
          topo = l.y0;
          break;
        }
      }
    }
    const nome = nomePalavras
      .sort((a, b) => a.x0 - b.x0)
      .map((p) => p.texto)
      .join(' ')
      .replace(/^[|)\]}>.,:;]+\s*|\s*[|([{<.,:;]+$/g, '')
      .trim();
    const topoLinha = topo ?? linha.y0 - alturaLinha * 1.5;

    // Posição: número curto à esquerda da faixa do nome, na altura da linha da tabela.
    const centro = (topoLinha + linha.y1) / 2;
    const candidatos = palavras
      .filter((p) => /^\d{1,3}$/.test(corrigirDigitos(p.texto)) && cx(p) < faixa.x0 && cy(p) > topoLinha - alturaLinha && cy(p) < linha.y1 + alturaLinha)
      .sort((a, b) => Math.abs(cy(a) - centro) - Math.abs(cy(b) - centro));
    const posicaoLida = candidatos.length ? Number(corrigirDigitos(candidatos[0].texto)) : null;

    return { nome, memberNumber: extrairMemberNumber(numero ? numero.texto : linha.texto), posicaoLida };
  });

  if (!lidos.length) {
    return { jogadores: [], avisos: ['Nenhum jogador encontrado no print. Confira se é a tela "Ranking" do evento no Bandai TCG+.'] };
  }

  // A tabela é ordenada; as posições lidas servem para descobrir onde o print começa (prints rolados
  // começam no meio). Vale o deslocamento mais frequente entre posição lida e ordem na imagem.
  const contagem = new Map();
  lidos.forEach((l, i) => {
    if (l.posicaoLida) contagem.set(l.posicaoLida - i, (contagem.get(l.posicaoLida - i) || 0) + 1);
  });
  const deslocamento = [...contagem].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1;
  if (!contagem.size) avisos.push('Não foi possível ler as posições; considerei o primeiro jogador do print como 1º lugar.');

  const jogadores = lidos.map((l, i) => {
    const colocacao = i + deslocamento;
    if (l.posicaoLida && l.posicaoLida !== colocacao) {
      avisos.push(`Confira a posição de "${l.nome || l.memberNumber}": o print parece indicar ${l.posicaoLida}º, a ordem indica ${colocacao}º.`);
    }
    if (!l.nome) avisos.push(`${colocacao}º lugar: nome não lido. Complete à mão.`);
    if (l.memberNumber.length !== 10) avisos.push(`${colocacao}º lugar: Member Number incompleto (${l.memberNumber || 'não lido'}).`);
    return { colocacao, nome: l.nome, memberNumber: l.memberNumber.length === 10 ? l.memberNumber : '', colocacaoLida: l.posicaoLida === colocacao };
  });
  return { jogadores, avisos };
}

/**
 * Junta vários prints do mesmo ranking (quando a lista não cabe numa tela).
 * Remove repetidos (mesmo Member Number ou mesma posição) e aponta posições faltando.
 */
export function juntarPrints(leituras) {
  const avisos = leituras.flatMap((l, i) => l.avisos.map((a) => (leituras.length > 1 ? `Print ${i + 1}: ${a}` : a)));
  const porColocacao = new Map();
  const vistos = new Map(); // memberNumber → colocação
  for (const { jogadores } of leituras) {
    for (const j of jogadores) {
      const existente = porColocacao.get(j.colocacao);
      if (existente) {
        if (existente.memberNumber !== j.memberNumber || existente.nome !== j.nome) {
          if (!existente.colocacaoLida && j.colocacaoLida) porColocacao.set(j.colocacao, j);
          else if (existente.memberNumber !== j.memberNumber) {
            avisos.push(`${j.colocacao}º lugar aparece com jogadores diferentes nos prints ("${existente.nome}" e "${j.nome}"). Confira.`);
          }
        }
        continue;
      }
      if (j.memberNumber && vistos.has(j.memberNumber)) {
        avisos.push(`"${j.nome}" aparece em ${vistos.get(j.memberNumber)}º e ${j.colocacao}º. Confira as posições.`);
        continue;
      }
      if (j.memberNumber) vistos.set(j.memberNumber, j.colocacao);
      porColocacao.set(j.colocacao, j);
    }
  }
  const jogadores = [...porColocacao.values()].sort((a, b) => a.colocacao - b.colocacao);
  const ultimo = jogadores.at(-1)?.colocacao ?? 0;
  const faltando = [];
  for (let c = 1; c <= ultimo; c++) if (!porColocacao.has(c)) faltando.push(c);
  if (faltando.length) {
    avisos.push(`Faltam as posições ${faltando.map((c) => `${c}º`).join(', ')}. Envie o print com elas ou acrescente as linhas à mão, na ordem.`);
  }
  return { jogadores, avisos, faltando };
}

/** Converte a leitura no texto da classificação, no formato aceito pela conferência de nomes. */
export function classificacaoComoTexto(jogadores) {
  return jogadores
    .map((j) => `${j.colocacao}. ${j.nome || '(nome não lido)'}${j.memberNumber ? ` (${j.memberNumber})` : ''}`)
    .join('\n');
}
