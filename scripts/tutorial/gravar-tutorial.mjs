// Grava o vídeo-tutorial para administradores: abre o site no modo demonstração (dados fictícios),
// executa cada passo com um cursor visível e legendas na tela, e salva em tutorial/saida/.
// Uso: node scripts/tutorial/gravar-tutorial.mjs   (precisa do Google Chrome e do ffmpeg no PATH)
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { iniciarServidor } from '../servidor.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SAIDA = path.join(RAIZ, 'tutorial', 'saida');
const W = 1280;
const H = 720;
const RAPIDO = process.env.RAPIDO === '1'; // ensaio sem esperar a leitura das legendas

// Jogadores do print de exemplo: nomes e Member Numbers da demonstração (fictícios) + um estreante.
const PRINT = [
  ['Rafael Torres', '0000100001', 12],
  ['Bianca Ferraz', '0000115839', 9],
  ['Lucas Andrade', '0000107920', 9],
  ['PH Sá', '0000147515', 6],
  ['Gabriel Lins', '0000131677', 6],
  ['Ana Beatriz Rocha', '0000139596', 3],
  ['Kaique Novaes', '0000998877', 3],
  ['Thiago Moura', '0000123758', 0],
];

function htmlPrint() {
  const linhas = PRINT.map(([nome, numero, pts], i) => `
    <div class="l"><div class="pos">${i + 1}</div>
      <div class="info"><div class="nome">${nome}</div><div class="mn">Member Number ${numero}</div></div>
      <div class="pts">${pts}</div></div>`).join('');
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111;width:390px}
    .topo{padding:18px 16px 10px;font-weight:700;font-size:20px;border-bottom:1px solid #ddd}
    .cab{display:flex;justify-content:space-between;padding:8px 16px;font-size:12px;color:#666}
    .l{display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid #eee}
    .pos{width:30px;height:30px;border-radius:50%;background:#e8e8e8;display:grid;place-items:center;font-weight:700;margin-right:14px}
    .info{flex:1}.nome{font-weight:700;font-size:16px}.mn{font-size:12px;color:#555;margin-top:3px}
    .pts{font-weight:700;font-size:16px;width:40px;text-align:right}
  </style><div class="topo">Ranking</div><div class="cab"><span>Jogador</span><span>Pontos</span></div>${linhas}`;
}

async function gerarPrint(navegador) {
  const p = await navegador.newPage({ viewport: { width: 390, height: 640 }, deviceScaleFactor: 2 });
  await p.setContent(htmlPrint());
  const arquivo = path.join(SAIDA, 'print-exemplo.png');
  await p.screenshot({ path: arquivo, fullPage: true });
  await p.close();
  return arquivo;
}

const CSS = `
#tut-legenda{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);width:max-content;max-width:1120px;
  background:rgba(8,10,13,.94);color:#fff;font:600 23px/1.38 system-ui,Segoe UI,sans-serif;padding:12px 24px;border-radius:12px;
  border:2px solid #d9a441;z-index:2147483646;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.6);transition:opacity .25s}
#tut-legenda:empty{opacity:0}
#tut-legenda b{color:#f0c46a}
body{padding-bottom:150px!important}
#tut-capitulo{position:fixed;top:9px;left:50%;transform:translateX(-50%);background:#d9a441;color:#101317;font:700 15px system-ui,sans-serif;
  padding:5px 12px;border-radius:999px;z-index:2147483646}
#tut-capitulo:empty{display:none}
#tut-cursor{position:fixed;left:640px;top:360px;width:24px;height:24px;border-radius:50%;background:rgba(217,164,65,.45);
  border:3px solid #fff;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);
  transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1),transform .15s;box-shadow:0 0 0 2px #000}
#tut-cursor.clique{transform:translate(-50%,-50%) scale(.6);background:#d9a441}
#tut-destaque{position:fixed;border:3px solid #f0c46a;border-radius:10px;z-index:2147483645;pointer-events:none;
  box-shadow:0 0 0 9999px rgba(0,0,0,.35);transition:all .45s ease}
#tut-cartao{position:fixed;inset:0;background:#101317;z-index:2147483647;display:grid;place-items:center;text-align:center;
  font-family:system-ui,Segoe UI,sans-serif;color:#e8eaed}
#tut-cartao h1{font-size:46px;margin:0 0 14px}#tut-cartao h1 span{color:#d9a441}
#tut-cartao p{font-size:24px;color:#aab3bf;margin:6px 0;max-width:980px}
`;

async function main() {
  rmSync(SAIDA, { recursive: true, force: true });
  mkdirSync(SAIDA, { recursive: true });
  const servidor = await iniciarServidor(0);
  const base = `http://localhost:${servidor.address().port}/`;
  const navegador = await chromium.launch({ channel: process.env.NAVEGADOR || 'chrome', headless: true });
  const printExemplo = await gerarPrint(navegador);

  const ctx = await navegador.newContext({
    viewport: { width: W, height: H },
    bypassCSP: true,
    recordVideo: { dir: SAIDA, size: { width: W, height: H } },
  });
  const page = await ctx.newPage();
  await page.route('**/js/config.js', async (rota) => {
    const r = await rota.fetch();
    await rota.fulfill({ response: r, body: (await r.text()).replace(/modo:\s*'sheets'/, "modo: 'demo'") });
  });
  page.on('dialog', async (d) => {
    const msg = d.message();
    await d.accept(); // com o diálogo aberto a página não responde; a legenda vem logo depois
    await legenda(`O site pede confirmação ("${msg.slice(0, 70)}…") → clique em <b>OK</b>.`, 0, false);
  });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));

  /* ---------- helpers ---------- */
  const esperar = (ms) => page.waitForTimeout(RAPIDO ? Math.min(ms, 150) : ms);
  async function prepararOverlay() {
    await page.addStyleTag({ content: CSS });
    await page.evaluate(() => {
      for (const id of ['tut-legenda', 'tut-capitulo', 'tut-cursor']) {
        if (!document.getElementById(id)) document.body.insertAdjacentHTML('beforeend', `<div id="${id}"></div>`);
      }
    });
  }
  async function legenda(texto, ms, aguardar = true) {
    await page.evaluate((t) => { document.getElementById('tut-legenda').innerHTML = t; }, texto);
    const leitura = Math.max(2600, texto.replace(/<[^>]+>/g, '').length * 62);
    if (aguardar) await esperar(ms ?? leitura);
  }
  const semLegenda = () => page.evaluate(() => { document.getElementById('tut-legenda').innerHTML = ''; });
  const capitulo = (t) => page.evaluate((x) => { document.getElementById('tut-capitulo').textContent = x; }, t);
  async function cartao(titulo, linhas, ms = 4500) {
    await page.evaluate(([t, ls]) => {
      const c = document.createElement('div');
      c.id = 'tut-cartao';
      c.innerHTML = `<div><h1>${t}</h1>${ls.map((l) => `<p>${l}</p>`).join('')}</div>`;
      document.body.appendChild(c);
    }, [titulo, linhas]);
    await esperar(ms);
    await page.evaluate(() => document.getElementById('tut-cartao')?.remove());
  }
  async function mover(loc) {
    await loc.scrollIntoViewIfNeeded();
    await esperar(250);
    const b = await loc.boundingBox();
    await page.evaluate(([x, y]) => {
      const c = document.getElementById('tut-cursor');
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
    }, [b.x + b.width / 2, b.y + b.height / 2]);
    await esperar(800);
  }
  async function clicar(loc, pausa = 700) {
    await mover(loc);
    await page.evaluate(() => document.getElementById('tut-cursor').classList.add('clique'));
    await esperar(160);
    await page.evaluate(() => document.getElementById('tut-cursor').classList.remove('clique'));
    await loc.click();
    await esperar(pausa);
  }
  async function digitar(loc, texto) {
    await clicar(loc, 200);
    await loc.fill('');
    await loc.pressSequentially(texto, { delay: RAPIDO ? 0 : 45 });
    await esperar(400);
  }
  async function preencher(loc, valor) { // datas e selects: sem digitação letra a letra
    await mover(loc);
    await loc.fill(valor);
    await esperar(500);
  }
  async function destacar(loc, texto, ms) {
    await loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight - 130) window.scrollBy({ top: r.top - (innerHeight - 130 - r.height) / 2 });
    });
    await esperar(400);
    const b = await loc.boundingBox();
    await page.evaluate((r) => {
      let d = document.getElementById('tut-destaque');
      if (!d) { d = document.createElement('div'); d.id = 'tut-destaque'; document.body.appendChild(d); }
      Object.assign(d.style, { left: `${r.x - 6}px`, top: `${r.y - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    }, b);
    if (texto) await legenda(texto, ms);
    else await esperar(ms ?? 1500);
    await page.evaluate(() => document.getElementById('tut-destaque')?.remove());
  }
  const aba = (nome) => page.locator('.tabs a', { hasText: nome });
  async function irParaAba(nome) {
    await semLegenda();
    await clicar(aba(nome), 900);
    await page.evaluate(() => window.scrollTo({ top: 0 }));
  }
  async function rolarAte(loc) {
    // Põe o elemento no meio da área livre (acima da legenda); se for alto, alinha pelo topo.
    await loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const livre = innerHeight - 130 - 70;
      const alvo = r.height > livre ? r.top - 70 : r.top - 70 - (livre - r.height) / 2;
      window.scrollBy({ top: alvo, behavior: 'smooth' });
    });
    await esperar(900);
  }

  /* ---------- roteiro ---------- */
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('#conteudo section.page');
  await prepararOverlay();

  await cartao('Liga OPTCG <span>Caruaru</span>', [
    'Tutorial para administradores',
    'Como lançar torneios, cuidar dos jogadores e das temporadas — e onde cada coisa fica salva.',
    '<small>Gravado no modo demonstração: todos os nomes e números são fictícios.</small>',
  ], 6000);

  // 1. Site público
  await capitulo('1 · Site público');
  await legenda('Este é o site da liga: <b>danieln0bre.github.io/liga-optcg-caruaru</b>. Qualquer pessoa abre, sem login.');
  await destacar(page.locator('.podium, .podio, [class*="podium"]').first(), 'No topo, o pódio da temporada que está valendo.');
  await rolarAte(page.locator('.tbl').first());
  await legenda('Na tabela, a pontuação de cada jogador. Pontos do torneio = participantes − colocação + 1.');
  const descartado = page.locator('.chip.off').first();
  if (await descartado.count()) await destacar(descartado, 'Só os <b>6 melhores resultados</b> contam. Os resultados apagados (esmaecidos) foram descartados.');
  await semLegenda();
  await clicar(page.locator('.tbl a[href^="#/jogador/"]').first(), 1200);
  await legenda('Clicando no nome, abre o perfil do jogador: foto, deck favorito e histórico de torneios.');
  await clicar(page.locator('.nav-links a', { hasText: 'Ligas anteriores' }), 1200);
  await legenda('Em <b>Ligas anteriores</b> ficam as classificações finais das temporadas já encerradas.');

  // 2. Entrar
  await capitulo('2 · Entrar');
  await clicar(page.locator('.nav-links a', { hasText: 'Administração' }), 1000);
  await prepararOverlay();
  await legenda('A área de administração fica no menu <b>Administração</b>.');
  await legenda('No site de verdade, o botão é <b>"Entrar com Google"</b>. Use a conta Google que recebeu acesso às planilhas.');
  await legenda('Se aparecer "Acesso pendente", o seu e-mail ainda não foi liberado: fale com o Daniel.');
  await clicar(page.getByRole('button', { name: /Entrar/ }), 1500);

  // 3. Lançar torneio
  await capitulo('3 · Lançar torneio');
  await legenda('A primeira aba é <b>Lançar torneio</b>: é o que você vai usar toda semana.');
  await destacar(page.locator('select[name="temporada_id"]'), 'Confira a temporada e a data. O nome do torneio é opcional.');
  await digitar(page.locator('input[name="nome"]'), 'Local de sábado');
  await destacar(page.locator('fieldset.print-upload'), 'No app <b>Bandai TCG+</b>, abra o evento, vá na tela <b>Ranking</b> e tire um print. Depois clique em "Escolher arquivos".', 5200);
  await legenda('Se a lista não couber numa tela, tire vários prints e selecione todos de uma vez.');
  await mover(page.locator('input[data-campo="prints"]'));
  await page.locator('input[data-campo="prints"]').setInputFiles(printExemplo);
  await legenda('O site lê o print aqui mesmo no navegador (a imagem não é enviada para lugar nenhum).', 2500, false);
  const area = page.locator('textarea[name="classificacao"]');
  for (let i = 0; i < 120 && !(await area.inputValue()).trim(); i++) await page.waitForTimeout(500);
  await esperar(2500);
  await rolarAte(area);
  await destacar(area, 'Pronto: a classificação aparece aqui, com o <b>Member Number</b> de cada jogador entre parênteses.', 4500);
  await legenda('Dá para corrigir qualquer linha à mão. Sem print, você também pode digitar a lista, um jogador por linha.');
  await clicar(page.getByRole('button', { name: 'Conferir nomes' }), 1200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await legenda('Agora o site mostra quem ele reconheceu. Pelo Member Number ele acha o jogador mesmo com apelido — veja o "PH Sá".');
  await destacar(page.locator('tr', { hasText: 'Kaique' }), 'Jogador que nunca jogou aparece como <b>"novo?"</b>: o site cria o cadastro dele ao registrar.', 4500);
  await legenda('Se algum nome estiver errado, escolha o jogador certo na lista ao lado. Os pontos já aparecem calculados.');
  await clicar(page.getByRole('button', { name: 'Registrar torneio' }), 1800);
  await legenda('Registrado! O torneio e os resultados vão para a <b>planilha pública</b> (abas torneios e resultados).');
  await legenda('Os Member Numbers vão só para a <b>planilha administrativa</b>, que apenas os admins enxergam.');
  await clicar(page.locator('.nav-links a', { hasText: 'Ranking' }), 1500);
  await prepararOverlay();
  await legenda('No ranking público o torneio já conta. Para quem já estava com o site aberto, basta atualizar a página.');
  await clicar(page.locator('.nav-links a', { hasText: 'Administração' }), 1200);

  // 4. Torneios
  await capitulo('4 · Torneios');
  await irParaAba('Torneios');
  await legenda('Na aba <b>Torneios</b> ficam todos os torneios da temporada.');
  const anular = page.locator('button[data-acao="anular"]').first();
  await destacar(anular, 'Lançou errado? Clique em <b>Anular</b>: o torneio para de contar pontos, mas continua registrado.', 4500);
  await clicar(anular, 1200);
  await legenda('Depois é só lançar de novo, corrigido, na aba Lançar torneio. Um torneio anulado pode ser reativado.');
  await clicar(page.locator('button[data-acao="reativar"]').first(), 1200);

  // 5. Jogadores
  await capitulo('5 · Jogadores');
  await irParaAba('Jogadores');
  await legenda('Em <b>Jogadores</b> você edita o perfil de cada um. Jogadores novos também podem ser criados aqui.');
  await clicar(page.locator('button[data-acao="editar-jogador"]', { hasText: 'Kaique' }), 1200);
  await legenda('O Kaique foi criado pelo print. Vamos completar o perfil dele.');
  await digitar(page.locator('input[name="deck_favorito"]'), 'Roronoa Zoro (vermelho)');
  await digitar(page.locator('textarea[name="bio"]'), 'Estreou no local de sábado.');
  await destacar(page.locator('input[name="member_number"]'), 'O <b>Member Number</b> fica só na planilha administrativa e serve para reconhecer o jogador nos próximos prints.', 4800);
  await clicar(page.locator('form[data-form="jogador"] button[type="submit"]'), 1500);
  await legenda('Salvo: o perfil vai para a <b>planilha pública</b> (aba jogadores), o Member Number para a administrativa.');
  const nota = page.locator('textarea[name="texto"]');
  if (await nota.count()) {
    await digitar(nota, 'Primeiro torneio; veio com um amigo.');
    await clicar(page.getByRole('button', { name: 'Adicionar anotação' }), 1500);
    await legenda('As <b>anotações</b> são internas: ficam na planilha administrativa e os jogadores não veem.');
  }

  // 6. Temporadas
  await capitulo('6 · Temporadas');
  await irParaAba('Temporadas');
  await legenda('Em <b>Temporadas</b> você cria e encerra as ligas. Antes do primeiro torneio, crie a temporada aqui.');
  const encerrar = page.locator('button[data-acao="encerrar"]').first();
  await destacar(encerrar, 'No fim da liga, clique em <b>Encerrar e congelar classificação</b>: o resultado final vai para Ligas anteriores.', 5000);
  await clicar(encerrar, 1500);
  const form = page.locator('form[data-form="temporada"]');
  await rolarAte(form);
  await legenda('Depois, crie a próxima temporada: nome, início, fim e quantos melhores resultados contam.');
  await digitar(form.locator('input[name="nome"]'), 'Liga 2027 — 1º semestre');
  await preencher(form.locator('input[name="inicio"]'), '2027-01-09');
  await preencher(form.locator('input[name="fim"]'), '2027-06-26');
  await clicar(form.getByRole('button', { name: 'Criar temporada' }), 1500);
  await legenda('A temporada vai para a <b>planilha pública</b> (aba temporadas). Deixe só uma temporada ativa por vez.');
  const importar = page.locator('form[data-form="importar"]');
  if (await importar.count()) {
    await rolarAte(importar);
    await legenda('Aqui embaixo dá para cadastrar a classificação de <b>ligas antigas</b>, de antes do site existir.');
  }

  // 7. Painel
  await capitulo('7 · Painel');
  await irParaAba('Painel');
  const filtro = page.locator('select[data-campo="painel-temporada"]');
  await legenda('No <b>Painel</b>, escolha a temporada no filtro. A nova ainda não tem torneios, então vamos olhar a anterior.');
  await mover(filtro);
  await filtro.selectOption({ label: 'Liga 2026 — 2º semestre' });
  await esperar(1000);
  await legenda('O Painel mostra como a comunidade está: jogadores ativos, estreantes, frequência e retenção.');
  await rolarAte(page.locator('.svg-rolagem svg').first());
  await legenda('Os gráficos mostram a participação torneio a torneio, separando quem já jogava de quem estreou.');
  const risco = page.locator('h2', { hasText: 'Risco de evasão' });
  if (await risco.count()) {
    await rolarAte(page.locator('.panel', { has: risco }).last());
    await legenda('Em <b>Risco de evasão</b> aparece quem jogava sempre e sumiu nas últimas semanas. Vale chamar para voltar!');
  }

  // 8. Pesquisas
  await capitulo('8 · Pesquisas');
  await irParaAba('Pesquisas');
  await legenda('Em <b>Pesquisas</b> ficam o link do formulário para mandar aos jogadores e o resumo das respostas.');
  const sugestoes = page.locator('h2', { hasText: 'Sugestões de ação' });
  if (await sugestoes.count()) {
    await rolarAte(page.locator('.panel', { has: sugestoes }).last());
    await legenda('As respostas são analisadas automaticamente e viram <b>sugestões de ação</b> para as maiores reclamações.');
  }

  // 9. Administradores
  await capitulo('9 · Administradores');
  await irParaAba('Administradores');
  await legenda('Para chamar outro organizador, use a aba <b>Administradores</b>.');
  await digitar(page.locator('input[name="email"]'), 'novo.organizador@gmail.com');
  await clicar(page.getByRole('button', { name: 'Liberar acesso' }), 1500);
  await legenda('A pessoa recebe um convite do Google por e-mail. Depois, avise o Daniel para liberar o login dela no Google.');
  const carregar = page.getByRole('button', { name: 'Carregar lista' });
  if (await carregar.count()) await clicar(carregar, 1500);
  await rolarAte(page.locator('h2', { hasText: 'Quem tem acesso' }));
  await legenda('Em <b>Quem tem acesso</b> você vê todo mundo e pode remover quem não organiza mais.');

  await capitulo('');
  await semLegenda();
  await cartao('Resumo', [
    'Toda semana: <b>Lançar torneio</b> → enviar o print → <b>Conferir nomes</b> → <b>Registrar</b>.',
    'Errou? <b>Torneios</b> → Anular e lançar de novo.',
    'Fim da liga: <b>Temporadas</b> → Encerrar → criar a próxima.',
    'Dúvidas ou acesso: fale com o Daniel.',
  ], 9000);

  const video = page.video();
  await ctx.close();
  await navegador.close();
  servidor.close();
  if (erros.length) console.error('Erros na página:', erros);

  const webm = await video.path();
  const final = path.join(SAIDA, 'tutorial-admin.webm');
  renameSync(webm, final);
  const mp4 = path.join(SAIDA, 'tutorial-admin.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', final, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  console.log('Vídeo:', mp4, readdirSync(SAIDA));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
