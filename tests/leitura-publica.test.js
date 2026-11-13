// Leitura pública sem chave de API: CSV do endpoint gviz do Google Sheets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarCsv, lerAbaCsv, lerAbasCsv } from '../js/data/sheets-api.js';

test('CSV com aspas, aspas escapadas, vírgulas e quebra de linha dentro do campo', () => {
  const csv = '﻿"id","nome","bio"\r\n"j_1","Zoro, o Caçador","diz ""oi""\nsegunda linha"\n"j_2","Nami",""\n';
  assert.deepEqual(interpretarCsv(csv), [
    ['id', 'nome', 'bio'],
    ['j_1', 'Zoro, o Caçador', 'diz "oi"\nsegunda linha'],
    ['j_2', 'Nami', ''],
  ]);
  assert.deepEqual(interpretarCsv('a,b'), [['a', 'b']]);
  assert.deepEqual(interpretarCsv(''), []);
});

function simularFetch(respostas) {
  const pedidos = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    pedidos.push(u);
    const r = respostas[u.searchParams.get('sheet')] ?? { status: 200, tipo: 'text/csv', corpo: '"id","nome"' };
    return new Response(r.corpo, { status: r.status ?? 200, headers: { 'content-type': r.tipo ?? 'text/csv; charset=utf-8' } });
  };
  return pedidos;
}

test('lê a aba, ignora linhas vazias e não manda chave nenhuma', async () => {
  const pedidos = simularFetch({ jogadores: { corpo: '"id","nome"\n"j_1","Luffy"\n"",""\n"j_2","Nami"\n' } });
  const linhas = await lerAbaCsv('PLANILHA', 'jogadores', ['id', 'nome']);
  assert.deepEqual(linhas.map((l) => [l.id, l.nome]), [['j_1', 'Luffy'], ['j_2', 'Nami']]);
  assert.equal(pedidos[0].hostname, 'docs.google.com');
  assert.equal(pedidos[0].searchParams.get('tqx'), 'out:csv');
  assert.ok(!pedidos[0].searchParams.has('key'));
});

test('aba inexistente: o gviz devolve outra aba e o cabeçalho diferente vira erro', async () => {
  simularFetch({ resultados: { corpo: '"id","nome","inicio"\n"t1","Liga 1","2026-01-01"\n' } });
  await assert.rejects(lerAbaCsv('P', 'resultados', ['id', 'torneio_id', 'jogador_id', 'colocacao']), /não foi encontrada/);
});

test('planilha que não é pública devolve HTML de login e vira erro claro', async () => {
  simularFetch({ temporadas: { tipo: 'text/html', corpo: '<html>login</html>' } });
  await assert.rejects(lerAbaCsv('P', 'temporadas', ['id']), /qualquer pessoa com o link/);
});

test('lê várias abas em paralelo', async () => {
  simularFetch({ a: { corpo: '"x"\n"1"' }, b: { corpo: '"y"\n"2"' } });
  const r = await lerAbasCsv('P', { a: ['x'], b: ['y'] });
  assert.equal(r.a[0].x, '1');
  assert.equal(r.b[0].y, '2');
});
