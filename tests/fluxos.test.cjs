// Testes de ponta a ponta: abrem o app num navegador real e simulam o uso.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
let servidor, base, navegador;

before(async () => {
  servidor = http.createServer((req, res) => {
    const rota = decodeURIComponent(req.url.split('?')[0]);
    const arq = path.join(RAIZ, rota === '/' ? 'index.html' : rota);
    fs.readFile(arq, (err, dados) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'text/plain' }); res.end(dados);
    });
  });
  await new Promise((ok) => servidor.listen(0, ok));
  base = `http://localhost:${servidor.address().port}/`;
  navegador = await chromium.launch();
});
after(async () => { await navegador.close(); servidor.close(); });

async function nova(consentimento = 'all') {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  page.resp = '';
  page.on('dialog', (d) => d.accept(page.resp));
  page.erros = []; page.on('pageerror', (e) => page.erros.push(e.message));
  await page.goto(base);
  if (consentimento) await page.click(`[data-act=consent-${consentimento === 'all' ? 'all' : 'min'}]`);
  return page;
}
const ir = (page, rota) => page.evaluate((r) => { location.hash = `#/${r}`; }, rota);
const ver = (page, texto, ms = 8000) => page.waitForFunction((t) => document.body.innerText.includes(t), texto, { timeout: ms });
const fim = async (page) => { assert.deepEqual(page.erros, [], 'erros de JavaScript na página'); await page.context().close(); };

async function criarConta(page, { nasc = '', ofertas = false, email = 'ana@teste.com' } = {}) {
  await ir(page, 'conta'); await page.click('[data-act=aba][data-v=cadastro]');
  await page.fill('input[name=nome]', 'Ana Souza'); await page.fill('input[name=email]', email); await page.fill('input[name=senha]', 'senha1234');
  if (nasc) await page.fill('input[name=nasc]', nasc);
  if (ofertas) await page.check('input[name=ofertas]');
  await page.check('input[name=termos]'); await page.click('form[data-form=cadastro] .btn');
}
async function pedir(page, numero = '') {
  await ir(page, 'cardapio'); await page.click('[data-act=add][data-v=c1]'); await ir(page, 'checkout');
  if (numero) {
    await page.check('input[name=metodo][value=cartao]'); await page.fill('input[name=numero]', numero);
    await page.fill('input[name=val]', '12/29'); await page.fill('input[name=cvv]', '123');
  }
  await page.click('form[data-form=pagar] .btn');
}
async function loginEquipe(page, papel, un = 'rec') {
  await ir(page, 'conta');
  for (const sair of ['[data-act=sair]', '[data-act=staff-sair]']) if (await page.locator(sair).count()) { await page.click(sair); await ir(page, 'conta'); }
  await page.click('[data-act=aba][data-v=login]');
  await page.fill('input[name=email]', papel === 'matriz' ? 'matriz@raizes.com' : `${papel}.${un}@raizes.com`); await page.fill('input[name=senha]', 'raizes123');
  await page.click('form[data-form=login] .btn'); await ver(page, 'Painel');
}
async function entrarCliente(page) {
  await ir(page, 'conta'); await page.click('[data-act=aba][data-v=login]');
  await page.fill('input[name=email]', 'ana@teste.com'); await page.fill('input[name=senha]', 'senha1234');
  await page.click('form[data-form=login] .btn'); await ver(page, 'Olá, Ana');
}

test('1. cardápio muda conforme a unidade (cozinha reduzida)', async () => {
  const p = await nova();
  await p.selectOption('#unidade', 'for'); await ver(p, 'Indisponível agora');
  assert.equal(await p.locator('.card.off').count(), 3);
  await p.selectOption('#unidade', 'rec'); await p.waitForSelector('.card:not(.off)');
  assert.equal(await p.locator('.card.off').count(), 0);
  await fim(p);
});

test('2. cadastro vazio mostra as mensagens de erro', async () => {
  const p = await nova(); await ir(p, 'conta'); await p.click('[data-act=aba][data-v=cadastro]');
  await p.click('form[data-form=cadastro] .btn');
  for (const t of ['Informe seu nome', 'e-mail válido', 'pelo menos 8 caracteres', 'aceite os Termos']) await ver(p, t);
  await fim(p);
});

test('3. cadastro com ofertas autorizadas guarda a data de nascimento', async () => {
  const p = await nova(null); await criarConta(p, { nasc: '2003-05-10', ofertas: true }); await ver(p, 'Olá, Ana');
  assert.equal(await p.inputValue('input[name=nasc]'), '2003-05-10');
  await fim(p);
});

test('4. cadastro sem autorizar ofertas descarta a data e avisa', async () => {
  const p = await nova(null); await criarConta(p, { nasc: '2003-05-10' }); await ver(p, 'Não guardamos sua data');
  assert.equal(await p.locator('input[type=date][disabled]').count(), 1);
  await fim(p);
});

test('5. cadastro rejeita menor de 18 anos', async () => {
  const p = await nova(); await criarConta(p, { nasc: '2015-01-01', ofertas: true });
  await ver(p, 'apenas para maiores de 18'); assert.ok(!(await p.textContent('#app')).includes('Olá, Ana'));
  await fim(p);
});

test('6. pedido com Pix aparece como pagamento confirmado', async () => {
  const p = await nova(); await criarConta(p); await pedir(p);
  await ver(p, 'Pedido #REC-0001'); await ver(p, 'Pagamento confirmado');
  assert.equal(await p.locator('.steps li.on').count(), 1);
  await fim(p);
});

test('7. cartão final 0 é recusado e não gera pedido', async () => {
  const p = await nova(); await criarConta(p); await pedir(p, '4111111111111110');
  await ver(p, 'Pagamento recusado'); await ir(p, 'pedidos'); await ver(p, 'ainda não fez pedidos');
  await fim(p);
});

test('8. cartão final 9 falha uma vez e se recupera sozinho', async () => {
  const p = await nova(); await criarConta(p); await pedir(p, '4111111111111119'); await ver(p, 'Pedido #REC-0001', 15000);
  await fim(p);
});

test('9. cartão final 8 esgota as tentativas e avisa que nada foi cobrado', async () => {
  const p = await nova(); await criarConta(p); await pedir(p, '4111111111111118'); await ver(p, 'não respondeu após 3 tentativas', 20000);
  await fim(p);
});

test('10. cartão com número curto mostra erro de validação', async () => {
  const p = await nova(); await criarConta(p); await pedir(p, '123'); await ver(p, 'deve ter 16 dígitos');
  await fim(p);
});

test('11. cupom inexistente e cupom segmentado sem elegibilidade são barrados', async () => {
  const p = await nova(); await p.click('[data-act=add][data-v=c1]'); await ir(p, 'carrinho');
  await p.fill('input[name=cupom]', 'NAOEXISTE'); await p.click('form[data-form=cupom] .btn'); await ver(p, 'Cupom inválido');
  await p.fill('input[name=cupom]', 'JOVEM10'); await p.click('form[data-form=cupom] .btn'); await ver(p, 'campanha segmentada');
  await p.fill('input[name=cupom]', 'SAOJOAO10'); await p.click('form[data-form=cupom] .btn'); await ver(p, 'Cupom SAOJOAO10');
  await fim(p);
});

test('12. totem permite pedir sem criar conta', async () => {
  const p = await nova(); await p.goto(`${base}?canal=totem`); await pedir(p); await ver(p, 'Pedido #REC-0001');
  await fim(p);
});

test('13. cozinha avança o pedido e o cliente vê o novo status', async () => {
  const p = await nova(); await criarConta(p); await pedir(p); await ver(p, 'Pedido #REC-0001');
  await loginEquipe(p, 'cozinha'); await p.click('[data-act=kds]'); await p.click('[data-act=staff-sair]'); await entrarCliente(p); await ir(p, 'pedidos');
  await p.waitForFunction(() => document.querySelectorAll('.steps li.on').length === 2);
  await fim(p);
});

test('14. atendente: desconto acima de 10%, desconto sem motivo e cancelamento sem motivo', async () => {
  const p = await nova(); await loginEquipe(p, 'atendente');
  const enviar = async (desc, motivo = '') => { await p.fill('input[name=q_c1]', '1'); await p.fill('input[name=desc]', desc); await p.fill('input[name=motivo]', motivo); await p.click('form[data-form=balcao] .btn'); };
  await enviar('15'); await ver(p, 'só com o gerente');
  await enviar('5'); await ver(p, 'exige motivo');
  await enviar('0'); await ver(p, 'Pedido enviado para a cozinha');
  await p.click('[data-act=cancelar]'); await ver(p, 'Informe o motivo');
  p.resp = 'Cliente desistiu'; await p.click('[data-act=cancelar]'); await ver(p, 'Pedido cancelado');
  await fim(p);
});

test('15. aba Campanhas só existe para a matriz', async () => {
  const p = await nova(); assert.equal(await p.locator('.nav a[href="#/campanhas"]').count(), 0);
  await loginEquipe(p, 'atendente'); await ir(p, 'campanhas'); await ver(p, 'exclusiva da matriz');
  assert.equal(await p.locator('.nav a[href="#/campanhas"]').count(), 0);
  await p.click('[data-act=staff-sair]'); await loginEquipe(p, 'matriz');
  assert.equal(await p.locator('.nav a[href="#/campanhas"]').count(), 1);
  await fim(p);
});

test('16. campanhas: seleção de unidades alterna entre todas e específicas', async () => {
  const p = await nova(); await loginEquipe(p, 'matriz'); await ir(p, 'campanhas'); await ver(p, 'Nova campanha');
  const f = p.locator('form[data-form=camp-nova]'); const cbs = f.locator('input[type=checkbox]');
  const radio = (v) => f.locator(`input[name=abr][value=${v}]`);
  assert.equal(await radio('todas').isChecked(), true); assert.equal(await cbs.evaluateAll((l) => l.every((c) => c.checked)), true);
  await f.locator('input[name=un_rec]').uncheck(); assert.equal(await radio('sel').isChecked(), true);
  await f.locator('input[name=un_rec]').check(); assert.equal(await radio('todas').isChecked(), true);
  await radio('sel').check(); assert.equal(await cbs.evaluateAll((l) => l.every((c) => !c.checked)), true);
  await f.locator('input[name=un_rec]').check(); await f.locator('input[name=un_cg]').check(); assert.equal(await radio('sel').isChecked(), true);
  await radio('todas').check(); assert.equal(await cbs.evaluateAll((l) => l.every((c) => c.checked)), true);
  await fim(p);
});

test('17. campanhas: criar, editar e remover', async () => {
  const p = await nova(); await loginEquipe(p, 'matriz'); await ir(p, 'campanhas'); await ver(p, 'Nova campanha');
  const f = p.locator('form[data-form=camp-nova]');
  await f.locator('input[name=nome]').fill('Teste Promo'); await f.locator('input[name=cupom]').fill('TESTE20'); await f.locator('input[name=valor]').fill('20');
  await f.locator('.btn').click(); await ver(p, 'Campanha criada'); await ver(p, 'Teste Promo — No ar');
  const card = () => p.locator('form[data-form=camp-edit]', { hasText: 'Teste Promo' });
  await card().locator('input[name=valor]').fill('25'); await card().locator('.btn', { hasText: 'Salvar alterações' }).click(); await ver(p, 'Campanha atualizada');
  assert.match(await card().textContent(), /25%/);
  await card().locator('[data-act=camp-del]').click(); await ver(p, 'Campanha removida');
  assert.equal(await card().count(), 0);
  await fim(p);
});

test('18. pausa de pedidos online bloqueia o pagamento no app', async () => {
  const p = await nova(); await loginEquipe(p, 'gerente'); await p.click('[data-act=pausa]'); await ver(p, 'Retomar pedidos online');
  await p.click('[data-act=staff-sair]'); await criarConta(p); await pedir(p); await ver(p, 'Pedidos online pausados');
  await fim(p);
});

test('19. sem internet o pagamento é bloqueado com aviso', async () => {
  const p = await nova(); await criarConta(p);
  await ir(p, 'cardapio'); await p.click('[data-act=add][data-v=c1]'); await ir(p, 'checkout');
  await p.context().setOffline(true); await p.waitForSelector('#offline:not([hidden])');
  await p.click('form[data-form=pagar] .btn'); await ver(p, 'Sem conexão com a internet');
  await p.context().setOffline(false); await fim(p);
});

// ---- Negócio: pick-up, fidelidade, estorno, LGPD, relatórios e sazonalidade ----
async function pedirCom(page, { modo, horario } = {}) {
  await ir(page, 'cardapio'); await page.click('[data-act=add][data-v=c1]'); await ir(page, 'checkout');
  if (modo) await page.check(`input[name=modo][value=${modo}]`);
  if (horario) await page.selectOption('select[name=horario]', horario);
  await page.click('form[data-form=pagar] .btn');
}

test('20. pick-up registra o horário de retirada escolhido', async () => {
  const p = await nova(); await criarConta(p); await pedirCom(p, { horario: 'Em 30 minutos' });
  await ver(p, 'Retirada na loja: Em 30 minutos');
  await fim(p);
});

test('21. pedido para consumir no local é identificado como tal', async () => {
  const p = await nova(); await criarConta(p); await pedirCom(p, { modo: 'local' });
  await ver(p, 'Consumir no local');
  await fim(p);
});

test('22. pontos acumulam, extrato mostra e a recompensa vira vale no carrinho', async () => {
  const p = await nova(); await criarConta(p);
  await pedir(p); await ver(p, 'Pedido #REC-0001'); await pedir(p); await ver(p, 'Pedido #REC-0002');
  await ir(p, 'fidelidade'); await ver(p, '48 pontos'); await ver(p, '+24 pontos');
  await p.click('[data-act=resgatar][data-v=cafe]'); await ver(p, 'Vale resgatado');
  await ir(p, 'cardapio'); await p.click('[data-act=add][data-v=b1]'); await ir(p, 'carrinho'); await ver(p, 'Vale de recompensa');
  await fim(p);
});

test('23. recompensa fica bloqueada sem pontos suficientes', async () => {
  const p = await nova(); await criarConta(p); await ir(p, 'fidelidade');
  assert.equal(await p.locator('[data-act=resgatar][data-v=cafe]').isDisabled(), true);
  await fim(p);
});

test('24. cancelar pedido pago solicita estorno e devolve os pontos', async () => {
  const p = await nova(); await criarConta(p); await pedir(p); await ver(p, 'Pedido #REC-0001');
  await loginEquipe(p, 'atendente'); p.resp = 'Cliente desistiu'; await p.click('[data-act=cancelar]'); await ver(p, 'Pedido cancelado'); await p.click('[data-act=staff-sair]'); await entrarCliente(p);
  await ir(p, 'pedidos'); await ver(p, 'Estorno de'); await ir(p, 'fidelidade'); await ver(p, '0 pontos · nível Bronze');
  await fim(p);
});

test('25. excluir a conta mantém o pedido de forma anônima', async () => {
  const p = await nova(); await criarConta(p); await pedir(p); await ver(p, 'Pedido #REC-0001');
  await ir(p, 'privacidade'); await p.click('[data-act=excluir]'); await ir(p, 'pedidos'); await ver(p, 'Entre na sua conta');
  const s = await p.evaluate(() => JSON.parse(localStorage.getItem('raizes:v1')));
  assert.equal(s.pedidos.length, 1); assert.ok(s.pedidos[0].anon && !s.pedidos[0].uid && s.user === null);
  await fim(p);
});

test('26. retificação do nome: valida e atualiza', async () => {
  const p = await nova(); await criarConta(p); await ver(p, 'Olá, Ana');
  await p.fill('form[data-form=dados] input[name=nome]', 'A'); await p.click('form[data-form=dados] .btn'); await ver(p, 'mínimo de 2 caracteres');
  await p.fill('form[data-form=dados] input[name=nome]', 'Ana Maria'); await p.click('form[data-form=dados] .btn'); await ver(p, 'Olá, Ana Maria');
  await fim(p);
});

test('27. relatórios da matriz: período, forma de pagamento, região e meta', async () => {
  const p = await nova(); await loginEquipe(p, 'matriz'); await p.click('[data-act=seed]'); await ver(p, 'Resumo financeiro');
  for (const t of ['Por forma de pagamento', 'Por região', 'Meta (30 dias)', 'Descontos concedidos']) await ver(p, t);
  assert.equal(await p.evaluate(() => document.querySelector('table thead tr').children.length === document.querySelector('table tbody tr').children.length), true, 'colunas da tabela não batem com as células');
  assert.equal(await p.locator('table').first().locator('tbody tr').count(), 3);
  await p.click('[data-act=periodo][data-v="1"]'); await p.waitForSelector('[data-act=periodo][data-v="1"][aria-pressed=true]');
  await fim(p);
});

test('28. produto sazonal some do cardápio fora da temporada', async () => {
  const p = await nova(); await loginEquipe(p, 'matriz');
  await p.fill('input[name=i_d2]', '2020-01-01T10:00'); await p.fill('input[name=f_d2]', '2020-01-02T10:00');
  await p.click('form[data-form=sazonal] .btn'); await ver(p, 'Temporada atualizada');
  await p.click('[data-act=staff-sair]'); await ir(p, 'cardapio'); await ver(p, 'Fora de temporada');
  await fim(p);
});

test('29. campos do cartão só aparecem quando cartão de crédito é escolhido', async () => {
  const p = await nova(); await criarConta(p);
  await ir(p, 'cardapio'); await p.click('[data-act=add][data-v=c1]'); await ir(p, 'checkout');
  const campos = p.locator('#campos-cartao');
  assert.equal(await campos.isVisible(), false);
  await p.check('input[name=metodo][value=cartao]'); assert.equal(await campos.isVisible(), true);
  await p.check('input[name=metodo][value=pix]'); assert.equal(await campos.isVisible(), false);
  await p.check('input[name=metodo][value=cartao]'); await p.click('form[data-form=pagar] .btn');
  await ver(p, 'deve ter 16 dígitos');
  assert.equal(await campos.isVisible(), true); assert.equal(await p.locator('input[name=metodo][value=cartao]').isChecked(), true);
  await fim(p);
});

// ---- Privacidade do cliente e perfis por unidade ----
test('30. depois de sair da conta, o cliente não vê mais pedidos', async () => {
  const p = await nova(); await criarConta(p); await pedir(p); await ver(p, 'Pedido #REC-0001');
  await ir(p, 'conta'); await p.click('[data-act=sair]'); await ir(p, 'pedidos'); await ver(p, 'Entre na sua conta para acompanhar');
  assert.ok(!(await p.textContent('#app')).includes('REC-0001'));
  await fim(p);
});

test('31. outro cliente no mesmo aparelho não vê os pedidos do primeiro', async () => {
  const p = await nova(); await criarConta(p); await pedir(p); await ver(p, 'Pedido #REC-0001');
  await ir(p, 'conta'); await p.click('[data-act=sair]');
  await criarConta(p, { email: 'bia@teste.com' }); await ver(p, 'Olá, Ana'); await ir(p, 'pedidos'); await ver(p, 'ainda não fez pedidos');
  assert.ok(!(await p.textContent('#app')).includes('REC-0001'));
  await fim(p);
});

test('32. cliente não vê área da equipe nem seletor de canal; dicas de teste ficam ocultas', async () => {
  const p = await nova(); await criarConta(p);
  assert.equal(await p.locator('.nav a[href="#/equipe"]').count(), 0); assert.equal(await p.locator('.nav a[href="#/campanhas"]').count(), 0);
  assert.equal(await p.locator('#canal').count(), 0);
  await ir(p, 'cardapio'); await p.click('[data-act=add][data-v=c1]'); await ir(p, 'checkout'); await p.check('input[name=metodo][value=cartao]');
  assert.ok(!(await p.textContent('#app')).includes('final 0'));
  await ir(p, 'equipe'); await ver(p, 'Área restrita'); assert.ok(!(await p.textContent('#app')).includes('raizes123'));
  await fim(p);
});

test('33. atendente fica preso à unidade e não vê a fila de outra unidade', async () => {
  const p = await nova(); await criarConta(p); await pedir(p); await ver(p, 'Pedido #REC-0001');
  await loginEquipe(p, 'atendente', 'for'); await ver(p, 'Fortaleza');
  assert.equal(await p.locator('#unidade').isDisabled(), true); await ver(p, 'Nenhum pedido em andamento');
  await fim(p);
});

test('34. gerente de unidade não vê campanhas nem outras unidades; matriz vê a rede toda', async () => {
  const p = await nova(); await loginEquipe(p, 'gerente', 'for');
  assert.equal(await p.locator('.nav a[href="#/campanhas"]').count(), 0);
  let texto = await p.textContent('#app'); assert.ok(texto.includes('Fortaleza') && !texto.includes('Recife') && !texto.includes('Campina'));
  await ir(p, 'campanhas'); await ver(p, 'exclusiva da matriz');
  await p.click('[data-act=staff-sair]'); await loginEquipe(p, 'matriz');
  texto = await p.textContent('#app'); assert.ok(texto.includes('Recife') && texto.includes('Fortaleza') && texto.includes('Campina Grande'));
  await fim(p);
});

test('35. a sessão da equipe expira por inatividade', async () => {
  const p = await nova(); await loginEquipe(p, 'atendente');
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('raizes:v1')); s.staff.ate = 1; localStorage.setItem('raizes:v1', JSON.stringify(s)); });
  await p.reload(); await ir(p, 'equipe'); await ver(p, 'Área restrita');
  await fim(p);
});

test('36. totem: cliente sem login vê só o pedido da sessão e o descarta ao recomeçar', async () => {
  const p = await nova(); await p.goto(`${base}?canal=totem`); await pedir(p); await ver(p, 'Pedido #REC-0001');
  await p.click('[data-act=novo-totem]'); await ir(p, 'pedidos'); await ver(p, 'ainda não fez pedidos');
  assert.ok(!(await p.textContent('#app')).includes('REC-0001'));
  await fim(p);
});

test('37. login da equipe pela aba Conta libera as abas específicas de cada perfil', async () => {
  const p = await nova(); await ir(p, 'conta');
  await p.fill('input[name=email]', 'cozinha.rec@raizes.com'); await p.fill('input[name=senha]', 'errada123'); await p.click('form[data-form=login] .btn'); await ver(p, 'E-mail ou senha incorretos');
  await loginEquipe(p, 'cozinha');
  assert.equal(await p.locator('.nav a', { hasText: 'Cozinha' }).count(), 1); assert.equal(await p.locator('.nav a[href="#/fidelidade"]').count(), 0);
  await p.click('[data-act=staff-sair]'); await loginEquipe(p, 'matriz');
  assert.equal(await p.locator('.nav a', { hasText: 'Rede' }).count(), 1); assert.equal(await p.locator('.nav a[href="#/campanhas"]').count(), 1);
  await fim(p);
});

test('38. e-mail da equipe não pode ser usado para criar conta de cliente', async () => {
  const p = await nova(); await criarConta(p, { email: 'teste@raizes.com' }); await ver(p, 'reservado à equipe');
  assert.ok(!(await p.textContent('#app')).includes('Olá, Ana'));
  await fim(p);
});

// ---- Segurança, privacidade de dados sensíveis e desempenho ----
test('39. HTML digitado no nome aparece como texto e não é executado', async () => {
  const p = await nova(); await ir(p, 'conta'); await p.click('[data-act=aba][data-v=cadastro]');
  await p.fill('input[name=nome]', '<img src=x onerror="window.__xss=1">Ana'); await p.fill('input[name=email]', 'x@teste.com'); await p.fill('input[name=senha]', 'senha1234');
  await p.check('input[name=termos]'); await p.click('form[data-form=cadastro] .btn'); await ver(p, 'Olá, <img src=x');
  assert.equal(await p.evaluate(() => window.__xss), undefined); assert.equal(await p.locator('#app img').count(), 0);
  await fim(p);
});

test('40. número do cartão e senha em texto puro não são gravados no navegador', async () => {
  const p = await nova(); await criarConta(p); await pedir(p, '4111111111111111'); await ver(p, 'Pedido #REC-0001', 15000);
  const guardado = await p.evaluate(() => localStorage.getItem('raizes:v1'));
  assert.ok(!guardado.includes('4111111111111111')); assert.ok(!guardado.includes('senha1234')); assert.ok(!guardado.includes('"cvv"'));
  await fim(p);
});

test('41. a carga inicial do cliente usa até 8 requisições, menos de 60 KB e não baixa o módulo da equipe', async () => {
  const ctx = await navegador.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  let reqs = 0; let bytes = 0; const arquivos = [];
  p.on('response', async (r) => { reqs++; try { bytes += (await r.body()).length; arquivos.push(r.url().split('/').pop()); } catch {} });
  await p.goto(base); await p.waitForSelector('.prod'); await new Promise((ok) => setTimeout(ok, 400));
  assert.ok(reqs <= 8, `requisições: ${reqs}`); assert.ok(bytes < 61440, `bytes: ${bytes}`); assert.ok(!arquivos.includes('equipe.js'), 'o cliente baixou equipe.js');
  await ctx.close();
});

test('42. o carrinho não passa da quantidade em estoque da unidade', async () => {
  const p = await nova(); await loginEquipe(p, 'gerente');
  await p.fill('input[name=e_c1]', '1'); await p.click('form[data-form=estoque] .btn'); await ver(p, 'Estoque atualizado');
  await p.click('[data-act=staff-sair]'); await ir(p, 'cardapio');
  await p.click('[data-act=add][data-v=c1]'); await p.click('[data-act=add][data-v=c1]'); await ver(p, 'Quantidade máxima disponível no estoque');
  await ir(p, 'carrinho'); await ver(p, 'Cuscuz com ovo');
  assert.equal((await p.locator('.qtd strong').first().textContent()).trim(), '1');
  await fim(p);
});
