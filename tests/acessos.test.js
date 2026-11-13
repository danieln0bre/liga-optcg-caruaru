import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinarAcessos, normalizarEmail, podeRemover } from '../js/domain/acessos.js';

test('valida e normaliza e-mail', () => {
  assert.equal(normalizarEmail('  Fulano@Exemplo.com '), 'fulano@exemplo.com');
  assert.equal(normalizarEmail('sem-arroba.com'), '');
  assert.equal(normalizarEmail('a@b'), '');
  assert.equal(normalizarEmail('a b@c.com'), '');
  assert.equal(normalizarEmail(''), '');
});

test('junta as permissões das duas planilhas por pessoa', () => {
  const publica = [
    { id: 'anyone', type: 'anyone', role: 'reader' },
    { id: 'p1', type: 'user', role: 'owner', emailAddress: 'dono@x.com', displayName: 'Dono' },
    { id: 'p2', type: 'user', role: 'writer', emailAddress: 'Ana@x.com', displayName: 'Ana' },
    { id: 'p3', type: 'user', role: 'reader', emailAddress: 'bia@x.com' },
  ];
  const admin = [
    { id: 'a1', type: 'user', role: 'owner', emailAddress: 'dono@x.com' },
    { id: 'a2', type: 'user', role: 'writer', emailAddress: 'ana@x.com' },
    { id: 'a3', type: 'group', role: 'writer', emailAddress: 'grupo@x.com' },
  ];
  const lista = combinarAcessos(publica, admin);
  assert.deepEqual(lista.map((p) => [p.email, p.publica, p.admin, p.completo]), [
    ['dono@x.com', 'proprietário', 'proprietário', true],
    ['ana@x.com', 'editor', 'editor', true],
    ['bia@x.com', 'leitor', null, false],
  ]);
  assert.deepEqual(lista[1].ids, { publica: 'p2', admin: 'a2' });
});

test('inclui a planilha de pesquisas sem mudar o que é "acesso completo"', () => {
  const lista = combinarAcessos(
    [{ id: 'p1', type: 'user', role: 'writer', emailAddress: 'ana@x.com' }],
    [{ id: 'a1', type: 'user', role: 'writer', emailAddress: 'ana@x.com' }],
    [{ id: 'q1', type: 'user', role: 'reader', emailAddress: 'ana@x.com' }],
  );
  assert.equal(lista[0].pesquisa, 'leitor');
  assert.equal(lista[0].ids.pesquisa, 'q1');
  assert.equal(lista[0].completo, true);
});

test('não deixa remover o proprietário nem a si mesmo', () => {
  assert.equal(podeRemover({ email: 'dono@x.com', proprietario: true }, 'outro@x.com'), false);
  assert.equal(podeRemover({ email: 'eu@x.com', proprietario: false }, 'EU@x.com'), false);
  assert.equal(podeRemover({ email: 'ana@x.com', proprietario: false }, 'eu@x.com'), true);
});
