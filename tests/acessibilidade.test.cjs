// Auditoria de acessibilidade e usabilidade rodando no navegador (WCAG 2.1 AA, verificações automáticas).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require('playwright');

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
let servidor, base, navegador;
before(async () => {
  servidor = http.createServer((req, res) => {
    const rota = decodeURIComponent(req.url.split('?')[0]); const arq = path.join(__dirname, '..', rota === '/' ? 'index.html' : rota);
    fs.readFile(arq, (err, dados) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'text/plain' }); res.end(dados); });
  });
  await new Promise((ok) => servidor.listen(0, ok)); base = `http://localhost:${servidor.address().port}/`; navegador = await chromium.launch();
});
after(async () => { await navegador.close(); servidor.close(); });

// Roda dentro da página e devolve a lista de problemas encontrados.
function auditar() {
  const problemas = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const nome = (el) => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) || (el.labels && [...el.labels].map((l) => l.textContent).join(' ')) || el.textContent || el.getAttribute('title') || '').trim();
  document.querySelectorAll('input:not([type=hidden]),select,textarea,button,a[href]').forEach((el) => { if (vis(el) && !nome(el)) problemas.push(`sem nome acessível: <${el.tagName.toLowerCase()} ${el.name || el.className || el.getAttribute('href')}>`); });
  if (document.documentElement.scrollWidth > innerWidth + 1) problemas.push(`rolagem horizontal: página com ${document.documentElement.scrollWidth}px em janela de ${innerWidth}px`);
  const ids = {}; document.querySelectorAll('[id]').forEach((el) => { ids[el.id] = (ids[el.id] || 0) + 1; });
  Object.entries(ids).filter(([, n]) => n > 1).forEach(([i]) => problemas.push(`id duplicado: ${i}`));
  const h1 = document.querySelectorAll('h1').length; if (h1 !== 1) problemas.push(`deveria haver 1 h1, há ${h1}`);
  ['header', 'nav', 'main'].forEach((t) => { if (!document.querySelector(t)) problemas.push(`falta <${t}>`); });
  document.querySelectorAll('button,.chip,.nav a,select,input:not([type=checkbox]):not([type=radio]):not([type=hidden])').forEach((el) => {
    if (!vis(el)) return; const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) problemas.push(`alvo pequeno (${Math.round(r.width)}x${Math.round(r.height)}): ${nome(el).slice(0, 25) || el.name}`);
  });
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mix = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const fundo = (el) => { const base = el === document.documentElement ? { r: 255, g: 255, b: 255, a: 1 } : fundo(el.parentElement); const c = parse(getComputedStyle(el).backgroundColor); return c.a === 0 ? base : mix(c, base); };
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el) || el.matches(':disabled') || el.closest('.skip') || el.closest('[aria-hidden=true]') || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const cs = getComputedStyle(el); const bg = fundo(el); const c0 = parse(cs.color); const fg = mix({ ...c0, a: c0.a * Number(cs.opacity) }, bg);
    const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x); const razao = (l1 + 0.05) / (l2 + 0.05);
    const grande = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
    if (razao < (grande ? 3 : 4.5)) problemas.push(`contraste ${razao.toFixed(2)}: "${el.textContent.trim().slice(0, 30)}"`);
  });
  return problemas;
}

const ir = (p, r) => p.evaluate((x) => { location.hash = `#/${x}`; }, r);
const ver = (p, t, ms = 8000) => p.waitForFunction((x) => document.body.innerText.includes(x), t, { timeout: ms });
async function entrar(p, email) {
  await ir(p, 'conta');
  for (const sair of ['[data-act=sair]', '[data-act=staff-sair]']) if (await p.locator(sair).count()) { await p.click(sair); await ir(p, 'conta'); }
  await p.click('[data-act=aba][data-v=login]'); await p.fill('input[name=email]', email); await p.fill('input[name=senha]', 'raizes123');
  await p.click('form[data-form=login] .btn'); await ver(p, 'Painel');
}

for (const [rotulo, largura, esquema] of [['celular claro', 360, 'light'], ['celular escuro', 360, 'dark'], ['desktop claro', 1280, 'light']]) {
  test(`auditoria de acessibilidade: ${rotulo}`, async () => {
    const ctx = await navegador.newContext({ viewport: { width: largura, height: 800 }, colorScheme: esquema }); const p = await ctx.newPage();
    const achados = []; const checar = async (cena) => { await p.waitForTimeout(450); for (const x of await p.evaluate(auditar)) achados.push(`[${cena}] ${x}`); };
    await p.goto(base); await ir(p, 'cardapio'); await p.waitForSelector('.prod'); await checar('cardápio com banner de consentimento');
    await p.click('[data-act=consent-all]');
    for (const r of ['cardapio', 'carrinho', 'conta', 'privacidade', 'fidelidade', 'pedidos']) { await ir(p, r); await checar(`visitante: ${r}`); }
    await ir(p, 'conta'); await p.click('[data-act=aba][data-v=cadastro]'); await checar('cadastro'); await p.click('form[data-form=cadastro] .btn'); await checar('cadastro com erros');
    await p.fill('input[name=nome]', 'Ana Souza'); await p.fill('input[name=email]', 'ana@teste.com'); await p.fill('input[name=senha]', 'senha1234');
    await p.check('input[name=ofertas]'); await p.check('input[name=termos]'); await p.click('form[data-form=cadastro] .btn'); await ver(p, 'Olá, Ana');
    await ir(p, 'cardapio'); await p.click('[data-act=add][data-v=c1]'); await ir(p, 'carrinho'); await checar('carrinho com item');
    await ir(p, 'checkout'); await p.check('input[name=metodo][value=cartao]'); await checar('pagamento com cartão'); await p.click('form[data-form=pagar] .btn'); await checar('pagamento com erros');
    await p.check('input[name=metodo][value=pix]'); await p.click('form[data-form=pagar] .btn'); await ver(p, 'Pedido #REC-0001', 15000);
    for (const r of ['pedidos', 'fidelidade', 'conta', 'privacidade']) { await ir(p, r); await checar(`cliente: ${r}`); }
    for (const papel of ['atendente', 'cozinha', 'gerente']) { await entrar(p, `${papel}.rec@raizes.com`); await checar(`equipe: ${papel}`); await p.click('[data-act=staff-sair]'); }
    await entrar(p, 'matriz@raizes.com'); await p.click('[data-act=seed]'); await checar('equipe: matriz'); await ir(p, 'campanhas'); await ver(p, 'Nova campanha'); await checar('equipe: campanhas');
    await ctx.close(); assert.deepEqual([...new Set(achados)], [], `${achados.length} problemas de acessibilidade`);
  });
}

test('teclado e leitor de tela: pular para o conteúdo, foco após navegar, título e erros ligados aos campos', async () => {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage(); await p.goto(base);
  await p.keyboard.press('Tab'); assert.equal(await p.evaluate(() => document.activeElement.className), 'skip');
  await p.keyboard.press('Enter'); assert.equal(await p.evaluate(() => document.activeElement.id), 'app'); assert.ok(!(await p.evaluate(() => location.hash)).includes('app'));
  const ordem = []; await p.goto(base); for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); ordem.push(await p.evaluate(() => document.activeElement.textContent.trim())); }
  assert.ok(ordem.includes('Aceitar todos'), `o banner de consentimento deve ser alcançável logo no início: ${ordem}`);
  await p.click('[data-act=consent-all]'); await ir(p, 'carrinho'); await ver(p, 'carrinho');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'app'); assert.match(await p.title(), /^Carrinho — /);
  await ir(p, 'conta'); await p.click('[data-act=aba][data-v=cadastro]'); await p.click('form[data-form=cadastro] .btn'); await ver(p, 'Informe seu nome');
  const foco = await p.evaluate(() => { const e = document.activeElement; return { invalido: e.getAttribute('aria-invalid'), msg: document.getElementById(e.getAttribute('aria-describedby'))?.textContent }; });
  assert.equal(foco.invalido, 'true'); assert.match(foco.msg, /Informe seu nome/);
  await ctx.close();
});
