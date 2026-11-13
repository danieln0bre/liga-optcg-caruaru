// Teste de fumaça: abre as páginas no modo demonstração e falha se houver erro no console.
// Usa o Chrome instalado na máquina (playwright-core não baixa navegador). Sem Chrome, o teste é pulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarServidor } from '../scripts/servidor.mjs';

let chromium = null;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  /* dependência de desenvolvimento ausente */
}

let servidor;
let navegador;
let base;
let motivoPular = null;

before(async () => {
  if (motivoPular) return;
  if (!chromium) {
    motivoPular = 'playwright-core não instalado (rode npm install)';
    return;
  }
  try {
    navegador = await chromium.launch({ channel: process.env.NAVEGADOR || 'chrome', headless: true });
  } catch {
    motivoPular = 'Google Chrome não encontrado (defina NAVEGADOR=msedge para usar o Edge)';
    return;
  }
  servidor = await iniciarServidor(0);
  base = `http://localhost:${servidor.address().port}/`;
});

after(async () => {
  await navegador?.close();
  servidor?.close();
});

/** Abre uma rota, espera o conteúdo e devolve os erros do console. */
async function abrir(rota, { largura = 1200, aoAbrir } = {}) {
  const pagina = await navegador.newPage({ viewport: { width: largura, height: 900 } });
  // O teste sempre roda no modo demo, mesmo que js/config.js esteja configurado para as planilhas.
  await pagina.route('**/js/config.js', async (rota) => {
    const resposta = await rota.fetch();
    const corpo = (await resposta.text()).replace(/modo:\s*'sheets'/, "modo: 'demo'");
    await rota.fulfill({ response: resposta, body: corpo });
  });
  const erros = [];
  pagina.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  pagina.on('pageerror', (e) => erros.push(e.message));
  pagina.on('requestfailed', (r) => erros.push(`falha ao carregar ${r.url()}`));
  pagina.on('dialog', (d) => d.accept());
  await pagina.goto(base + rota, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('#conteudo section.page');
  const resultado = { pagina, erros, titulo: await pagina.textContent('#conteudo h1').catch(() => '') };
  if (aoAbrir) await aoAbrir(pagina);
  return resultado;
}

const ROTAS_PUBLICAS = [
  ['#/', 'ranking da temporada ativa'],
  ['#/historico', 'ligas anteriores'],
  ['#/historico/t_2026_1', 'liga encerrada com torneios'],
  ['#/historico/t_2025_2', 'liga antiga só com classificação'],
  ['#/jogador/j_01', 'perfil do jogador'],
  ['#/jogador/inexistente', 'jogador não encontrado'],
  ['#/pagina-que-nao-existe', 'rota desconhecida'],
];

for (const [rota, descricao] of ROTAS_PUBLICAS) {
  test(`página pública sem erros: ${descricao}`, async (t) => {
    if (motivoPular) return t.skip(motivoPular);
    const { pagina, erros } = await abrir(rota);
    await pagina.close();
    assert.deepEqual(erros, []);
  });
}

test('ranking: pódio, tabela e menu com aria-current', async (t) => {
  if (motivoPular) return t.skip(motivoPular);
  const { pagina, erros } = await abrir('#/');
  assert.equal(await pagina.locator('.podium-item').count(), 3);
  assert.ok((await pagina.locator('.tbl tbody tr').count()) > 3);
  assert.ok((await pagina.locator('.chip.off').count()) > 0, 'deve haver resultados descartados esmaecidos');
  assert.equal(await pagina.getAttribute('.nav-links a[href="#/"]', 'aria-current'), 'page');
  await pagina.close();
  assert.deepEqual(erros, []);
});

test('ranking legível no celular, sem rolagem horizontal da página', async (t) => {
  if (motivoPular) return t.skip(motivoPular);
  const { pagina, erros } = await abrir('#/', { largura: 375 });
  const larguras = await pagina.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(larguras[0] <= larguras[1], `página mais larga que a tela: ${larguras}`);
  assert.equal(await pagina.locator('th.hide-mobile').first().isVisible(), false);
  await pagina.close();
  assert.deepEqual(erros, []);
});

test('administração no modo demo: entra sem login e abre todas as abas', async (t) => {
  if (motivoPular) return t.skip(motivoPular);
  const { pagina, erros } = await abrir('#/admin');
  await pagina.getByRole('button', { name: /Entrar/ }).click();
  for (const aba of ['torneio', 'torneios', 'jogadores', 'temporadas']) {
    await pagina.goto(`${base}#/admin/${aba}`);
    await pagina.waitForSelector('.tabs [aria-current="page"]');
    assert.equal(await pagina.getAttribute('.tabs [aria-current="page"]', 'href'), `#/admin/${aba}`);
  }
  await pagina.goto(`${base}#/admin/jogadores`);
  await pagina.getByRole('button', { name: /Rafael Torres/ }).click();
  await pagina.waitForSelector('input[name="member_number"]');
  assert.match(await pagina.textContent('#conteudo'), /Member Number: \d{10}/);
  await pagina.close();
  assert.deepEqual(erros, []);
});

test('lançar torneio colando a classificação atualiza o ranking', async (t) => {
  if (motivoPular) return t.skip(motivoPular);
  const { pagina, erros } = await abrir('#/admin');
  await pagina.getByRole('button', { name: /Entrar/ }).click();
  await pagina.fill('input[name="nome"]', 'Local de fumaça');
  await pagina.fill('textarea[name="classificacao"]', '1. Sofia Queiroz (0000999001)\n2. Bia F.\n3. Jogador Novo da Silva');
  await pagina.getByRole('button', { name: 'Conferir nomes' }).click();
  const selos = await pagina.$$eval('.status', (s) => s.map((x) => x.textContent));
  assert.deepEqual(selos, ['nome exato', 'nome exato', 'novo?']);
  await pagina.getByRole('button', { name: 'Registrar torneio' }).click();
  await pagina.waitForSelector('.notice.ok');
  // O número digitado passou a identificar a jogadora.
  await pagina.fill('textarea[name="classificacao"]', 'Qualquer Nome (0000999001)\nOutra Pessoa');
  await pagina.getByRole('button', { name: 'Conferir nomes' }).click();
  assert.equal(await pagina.textContent('.status >> nth=0'), 'Member Number');
  await pagina.close();
  assert.deepEqual(erros, []);
});

test('administradores: lista, libera e remove acesso (demo)', async (t) => {
  if (motivoPular) return t.skip(motivoPular);
  const { pagina, erros } = await abrir('#/admin');
  await pagina.getByRole('button', { name: /Entrar/ }).click();
  await pagina.goto(`${base}#/admin/acessos`);
  await pagina.getByRole('button', { name: 'Carregar lista' }).click();
  await pagina.waitForSelector('.tbl tbody tr');
  assert.equal(await pagina.locator('.tbl tbody tr').count(), 2);
  // O próprio usuário (proprietário na demo) não tem botão de remover.
  assert.equal(await pagina.locator('button[data-acao="remover-acesso"]').count(), 1);

  await pagina.fill('input[name="email"]', 'email-invalido');
  await pagina.getByRole('button', { name: 'Liberar acesso' }).click();
  // O navegador barra pelo type="email"; nada muda na lista.
  assert.equal(await pagina.locator('.tbl tbody tr').count(), 2);

  await pagina.fill('input[name="email"]', ' Nova.Pessoa@Exemplo.com ');
  await pagina.getByRole('button', { name: 'Liberar acesso' }).click();
  await pagina.waitForSelector('.notice.ok');
  assert.equal(await pagina.locator('.tbl tbody tr').count(), 3);
  assert.match(await pagina.textContent('.tbl tbody'), /nova\.pessoa@exemplo\.com/);

  await pagina.locator('button[data-email="nova.pessoa@exemplo.com"]').click();
  await pagina.waitForSelector('.notice.ok');
  assert.equal(await pagina.locator('.tbl tbody tr').count(), 2);
  await pagina.close();
  assert.deepEqual(erros, []);
});

test('painel: indicadores, gráficos e risco de evasão (demo)', async (t) => {
  if (motivoPular) return t.skip(motivoPular);
  const { pagina, erros } = await abrir('#/admin');
  await pagina.getByRole('button', { name: /Entrar/ }).click();
  await pagina.waitForSelector('.tabs');
  await pagina.goto(`${base}#/admin/painel`);
  await pagina.waitForSelector('.indicadores');
  assert.equal(await pagina.locator('.indicadores > div').count(), 5);
  assert.ok((await pagina.locator('figure.grafico svg').count()) >= 2);
  assert.ok((await pagina.locator('td.calor').count()) > 0, 'mapa de coortes preenchido');
  assert.ok((await pagina.locator('button[data-acao="ver-ficha"]').count()) > 0, 'demo tem jogadores em risco');
  // Trocar a temporada redesenha sem erro.
  await pagina.selectOption('select[data-campo="painel-temporada"]', { index: 1 });
  await pagina.waitForSelector('.indicadores');
  await pagina.locator('button[data-acao="ver-ficha"]').first().click().catch(() => {});
  await pagina.close();
  assert.deepEqual(erros, []);
});

test('pesquisas: link, sugestões, temas e respostas (demo)', async (t) => {
  if (motivoPular) return t.skip(motivoPular);
  const { pagina, erros } = await abrir('#/admin');
  await pagina.getByRole('button', { name: /Entrar/ }).click();
  await pagina.waitForSelector('.tabs');
  await pagina.goto(`${base}#/admin/pesquisas`);
  await pagina.waitForSelector('.compartilhar');
  assert.match(await pagina.inputValue('[data-campo="link-pesquisa"]'), /^https:\/\/docs\.google\.com\/forms\//);
  assert.ok((await pagina.locator('.sugestao').count()) > 0);
  assert.ok((await pagina.locator('figure.grafico svg').count()) === 1);
  assert.equal(await pagina.locator('.indicadores > div').count(), 4);
  await pagina.close();
  assert.deepEqual(erros, []);
});
