// Inicialização e rotas (baseadas em #hash, porque o GitHub Pages não reescreve URLs).
import { CONFIG } from './config.js';
import { criarRepositorio } from './data/repositorio.js';
import { html } from './util/html.js';
import { carregando, erro } from './ui/componentes.js';
import { paginaRanking, paginaHistorico, paginaLiga, paginaJogador } from './views/publico.js';
import { montarAdmin } from './views/admin.js';

const repo = criarRepositorio(CONFIG);
const principal = document.getElementById('conteudo');
let dadosPublicos = null;
let admin = null; // instância montada da área administrativa (mantém a sessão entre abas)
let raizAdmin = null;

document.title = CONFIG.nomeComunidade;
// Marca em duas cores, como o "OPCG<span>Ranking</span>" do OPCGRanking: a última palavra em destaque.
document.querySelectorAll('[data-nome-comunidade]').forEach((el) => {
  const partes = CONFIG.nomeComunidade.trim().split(/\s+/);
  const destaque = document.createElement('span');
  destaque.className = 'accent';
  destaque.textContent = partes.length > 1 ? partes.pop() : '';
  el.replaceChildren(partes.join(' ') + (destaque.textContent ? ' ' : ''), destaque);
});

async function carregarDados(forcar = false) {
  if (!dadosPublicos || forcar) dadosPublicos = await repo.carregarPublico();
  return dadosPublicos;
}

function rotaAtual() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { pagina: partes[0] || '', param: partes[1] || '' };
}

function marcarMenu(pagina) {
  document.querySelectorAll('.nav-links a').forEach((a) => {
    const alvo = a.getAttribute('href').replace(/^#\/?/, '');
    const ativo = alvo === pagina || (alvo === '' && pagina === '');
    a.classList.toggle('on', ativo);
    if (ativo) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function navegar() {
  const { pagina, param } = rotaAtual();
  marcarMenu(pagina);

  if (pagina === 'admin') {
    if (!admin) {
      raizAdmin = document.createElement('div');
      admin = montarAdmin(raizAdmin, {
        repo,
        config: CONFIG,
        aba: param,
        aoAlterarDados: () => {
          dadosPublicos = null;
        },
      });
    } else {
      admin.definirAba(param);
    }
    principal.replaceChildren(raizAdmin);
    return;
  }

  principal.innerHTML = String(carregando());
  try {
    const dados = await carregarDados();
    let conteudo;
    if (pagina === '') conteudo = paginaRanking(dados, CONFIG);
    else if (pagina === 'historico' && param) conteudo = paginaLiga(dados, param);
    else if (pagina === 'historico') conteudo = paginaHistorico(dados);
    else if (pagina === 'jogador') conteudo = paginaJogador(dados, param);
    else conteudo = html`<section class="page"><p>Página não encontrada. <a href="#/">Voltar ao ranking</a></p></section>`;
    principal.innerHTML = String(conteudo);
  } catch (e) {
    console.error(e);
    principal.innerHTML = String(html`<section class="page">${erro(`Não foi possível carregar os dados da liga. ${e.message}`)}</section>`);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navegar);
navegar();
