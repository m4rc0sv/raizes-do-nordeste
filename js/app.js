import { UNIDADES, PRODUTOS, CATEGORIAS, NIVEIS, ESTOQUE_INICIAL, FREQ, RECOMPENSAS, campanhasIniciais } from './data.js';
import { solicitarPagamento } from './payment.js';
import { hashSenha } from './seguranca.js';

const KEY = 'raizes:v1';
const base = { unidade: 'rec', canal: 'app', cart: {}, cupom: null, user: null, contas: [], consent: null, log: [], pedidos: [], staff: null, audit: [], estoque: {}, campanhas: null, pausa: {}, sazonais: null };
const S = (() => { try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...base }; } })();
if (!S.campanhas) S.campanhas = campanhasIniciais();
if (!S.sazonais) { const ini = new Date().setHours(0, 0, 0, 0); S.sazonais = Object.fromEntries(PRODUTOS.filter((p) => p.sazonal).map((p) => [p.id, { inicio: ini, fim: ini + 30 * 864e5 }])); }
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const CORP = /@raizes\.com$/i; // e-mails da equipe
if (params.has('canal')) S.canal = params.get('canal') === 'totem' ? 'totem' : 'app';
const save = () => {
  if (S.user) { const i = S.contas.findIndex((x) => x.email === S.user.email); if (i >= 0) S.contas[i] = S.user; }
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const $ = (s) => document.querySelector(s);
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ui = { cat: 'Todos', aba: 'login', sessao: [], ultimo: Date.now(), pag: { estado: 'idle', msg: '' }, erros: {} };

function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); }
// O aviso some no próximo toque para não cobrir botões em telas pequenas.
document.addEventListener('pointerdown', () => { $('#toast').hidden = true; }, true);
const pontosAtivos = () => !!(S.user && S.consent && S.consent.fidelidade);
const nivel = () => [...NIVEIS].reverse().find((n) => (S.user?.pontos || 0) >= n.min);
const idade = (nasc) => {
  const [y, m, d] = String(nasc).split('-').map(Number); const h = new Date();
  return h.getFullYear() - y - (h < new Date(h.getFullYear(), m - 1, d) ? 1 : 0);
};
const campAtiva = (c, u = S.unidade) => c.ativa && Date.now() >= c.inicio && Date.now() <= c.fim && (!c.un.length || c.un.includes(u));
const campDoCupom = (cod) => S.campanhas.find((c) => c.tipo === 'cupom' && c.cupom === cod);
const publicoOk = (c) => c.publico === 'todos' || (c.publico === 'frequentes' && pontosAtivos() && pedidosDoUser() >= FREQ.min)
  || (c.publico === 'idade' && !!S.user?.nasc && !!S.consent?.marketing && idade(S.user.nasc) >= c.idadeMin && idade(S.user.nasc) <= c.idadeMax);
const pctCupom = () => { const c = campDoCupom(S.cupom); return c && campAtiva(c) && publicoOk(c) ? c.valor / 100 : 0; };
const HORARIOS = ['Assim que ficar pronto', 'Em 15 minutos', 'Em 30 minutos', 'Em 45 minutos'];
const estornoTxt = (o) => (!o.estorno ? 'Nenhum valor será cobrado.' : o.estorno.tipo === 'dinheiro' ? 'Devolução em dinheiro no balcão.' : `Estorno de ${brl(o.total)} ${Date.now() - o.estorno.em > 8000 ? 'concluído' : 'solicitado ao serviço de pagamento'} (ref. ${o.ref}).`);
const avisoPausa = () => (S.canal !== 'totem' && S.pausa?.[S.unidade] ? '<p class="aviso" role="status">Esta unidade pausou os pedidos online por alta demanda. Peça no totem ou no balcão, ou volte em instantes.</p>' : '');
function promoBanner() {
  const c = S.campanhas.find((x) => x.tipo === 'cupom' && x.publico === 'todos' && campAtiva(x));
  return c ? `<div class="promo"><strong>${esc(c.nome)}:</strong> cupom ${c.cupom} com ${c.valor}% de desconto até ${new Date(c.fim).toLocaleDateString('pt-BR')}.</div>` : '';
}
const pedidosDoUser = () => S.pedidos.filter((o) => o.uid && o.uid === S.user?.email && o.etapa !== 0).length;
const extrato = (txt, pts) => { S.user.hist = [{ t: Date.now(), txt, pts }, ...(S.user.hist || [])].slice(0, 20); };
function calcPontos(t) {
  const base = Math.floor(t.total);
  const dobro = !S.campanhas.some((c) => c.tipo === 'pontos-cuscuz' && campAtiva(c)) ? 0 : Math.floor(t.itens.filter((i) => i.p.cat === 'Cuscuz').reduce((a, i) => a + i.p.preco * i.q, 0));
  const cf = S.campanhas.find((c) => c.tipo === 'bonus-freq' && campAtiva(c) && publicoOk(c));
  const freq = cf ? cf.valor : 0;
  return { total: base + dobro + freq, det: `${base} base${dobro ? ` + ${dobro} cuscuz em dobro` : ''}${freq ? ` + ${freq} cliente frequente` : ''}` };
}
function campanhaStatus(c) {
  if (!c.ativa) return 'Pausada.';
  if (c.tipo !== 'cupom' && !pontosAtivos()) return 'Ative o programa de fidelidade para ganhar pontos.';
  if (publicoOk(c)) return c.tipo === 'cupom' ? `Ativa para você. Use o cupom ${c.cupom}.` : 'Ativa para você.';
  if (c.publico === 'frequentes' && !pontosAtivos()) return 'Ative o programa de fidelidade para contarmos seus pedidos.';
  if (c.publico === 'frequentes') return `Faltam ${Math.max(0, FREQ.min - pedidosDoUser())} pedido(s) para liberar.`;
  if (!S.consent?.marketing) return 'Ative “Ofertas personalizadas” na Central de privacidade.';
  if (!S.user.nasc) return 'Informe sua data de nascimento na aba Conta.';
  return 'Fora da faixa etária desta campanha.';
}

const estoqueDe = (id, u = S.unidade) => S.estoque[`${u}:${id}`] ?? ESTOQUE_INICIAL;
const naJanela = (p) => { const j = S.sazonais?.[p.id]; return !p.sazonal || !j || (Date.now() >= j.inicio && Date.now() <= j.fim); };
const disp = (p, u = S.unidade) => p.un.includes(u) && estoqueDe(p.id, u) > 0 && naJanela(p);
function novoPedido(p) {
  const un = p.un ?? S.unidade;
  const id = `${un.toUpperCase()}-${String(Math.max(0, ...S.pedidos.filter((o) => o.un === un).map((o) => +String(o.id).split('-').pop() || 0)) + 1).padStart(4, '0')}`;
  p.itens.forEach((i) => { S.estoque[`${un}:${i.id}`] = estoqueDe(i.id, un) - i.q; });
  return { id, un, criadoEm: Date.now(), etapa: 1, ...p };
}
// O módulo da equipe só é baixado quando alguém da equipe entra.
let equipe = null;
const carregarEquipe = async () => {
  if (!equipe) { const { criarEquipe } = await import('./equipe.js'); equipe = criarEquipe({ S, ui, brl, esc, toast, disp, estoqueDe, novoPedido }); }
  return equipe;
};
const areaRestrita = (t) => `<h1>${t}</h1><p class="aviso">Área restrita à equipe. Entre pela aba <a href="#/conta">Conta</a> com seu e-mail corporativo.</p>`;
const ABAS = { atendente: 'Balcão', cozinha: 'Cozinha', gerente: 'Gestão', matriz: 'Rede' };

function totais() {
  const itens = Object.entries(S.cart).map(([id, q]) => ({ p: PRODUTOS.find((x) => x.id === id), q })).filter((i) => i.p && disp(i.p));
  const sub = itens.reduce((a, i) => a + i.p.preco * i.q, 0);
  const usados = [];
  (pontosAtivos() ? (S.user.vales || []) : []).forEach((rid) => {
    const r = RECOMPENSAS.find((x) => x.id === rid);
    if (r && itens.some((i) => i.p.id === r.produto && i.q > usados.filter((u) => u === rid).length)) usados.push(rid);
  });
  const dV = usados.reduce((a, rid) => a + PRODUTOS.find((p) => p.id === RECOMPENSAS.find((x) => x.id === rid).produto).preco, 0);
  const dN = pontosAtivos() ? (sub - dV) * nivel().desc : 0;
  const dC = S.cupom ? (sub - dV - dN) * pctCupom() : 0;
  return { itens, sub, dV, dN, dC, usados, total: Math.max(0, sub - dV - dN - dC) };
}
const qtdCarrinho = () => totais().itens.reduce((a, i) => a + i.q, 0);

const views = {
  equipe: () => (equipe && S.staff ? equipe.view() : areaRestrita('Equipe')),
  campanhas: () => (equipe && S.staff ? equipe.viewCampanhas() : areaRestrita('Campanhas')),
  cardapio() {
    const un = UNIDADES.find((u) => u.id === S.unidade);
    const lista = PRODUTOS.filter((p) => ui.cat === 'Todos' || p.cat === ui.cat);
    return `<section class="hero"><p class="kick">${esc(un.nome)}</p><h1>Do sertão à sua mesa, sem fila.</h1><p>${un.cozinha === 'reduzida' ? 'Alguns itens não são preparados nesta unidade.' : 'Cardápio completo nesta unidade.'}</p></section>
    
    ${avisoPausa()}${promoBanner()}
    <div class="chips" role="group" aria-label="Categorias">${['Todos', ...CATEGORIAS].map((c) => `<button class="chip" data-act="cat" data-v="${c}" aria-pressed="${ui.cat === c}">${c}</button>`).join('')}</div>
    <div class="grid">${lista.map((p) => {
      const ok = disp(p);
      return `<article class="card prod ${ok ? '' : 'off'}" data-cat="${p.cat}"><span class="em" aria-hidden="true">${p.em}</span><div class="inf"><h3>${p.nome}${p.sazonal ? ' (junino)' : ''}</h3><p>${p.desc}</p><span class="preco">${brl(p.preco)}</span></div>
      ${ok ? `<button class="btn" data-act="add" data-v="${p.id}" aria-label="Adicionar ${p.nome}">Adicionar</button>` : `<span class="erro">${p.sazonal && !naJanela(p) ? 'Fora de temporada' : 'Indisponível agora'}</span>`}</article>`;
    }).join('')}</div>`;
  },
  carrinho() {
    const t = totais();
    if (!t.itens.length) return `<h1>Seu carrinho</h1><p>Seu carrinho está vazio. Escolha algo no cardápio para começar.</p><a class="btn" href="#/cardapio">Ver cardápio</a>`;
    return `<h1>Seu carrinho</h1>${t.itens.map(({ p, q }) => `<div class="card"><div class="inf"><h3>${p.nome}</h3><span class="preco">${brl(p.preco * q)}</span></div>
      <div class="qtd"><button data-act="menos" data-v="${p.id}" aria-label="Remover um ${p.nome}">−</button><strong>${q}</strong><button data-act="mais" data-v="${p.id}" aria-label="Adicionar mais um ${p.nome}">+</button></div></div>`).join('')}
    <form data-form="cupom" style="margin:12px 0"><label class="f">Cupom<input name="cupom" value="${esc(S.cupom || '')}" autocomplete="off"></label>${ui.erros.cupom ? `<p class="erro" role="alert">${ui.erros.cupom}</p>` : ''}<button class="btn sec">Aplicar cupom</button></form>
    ${resumo(t)}<a class="btn" href="#/checkout">Ir para o pagamento</a>`;
  },
  checkout() {
    const t = totais(); const p = ui.pag; const e = ui.erros;
    if (!t.itens.length) return `<h1>Pagamento</h1><p>Nada para pagar ainda. Adicione itens ao carrinho.</p><a class="btn" href="#/cardapio">Ver cardápio</a>`;
    return `<h1>Pagamento</h1>${avisoPausa()}${resumo(t)}
    ${p.estado === 'processando' ? `<p class="aviso" role="status"><i class="spin" aria-hidden="true"></i>${esc(p.msg || 'Aguardando confirmação do pagamento… não feche esta tela.')}</p>` : ''}
    ${p.estado === 'recusado' ? `<p class="erro" role="alert">Pagamento recusado. ${esc(p.msg)} Tente outro cartão ou use Pix.</p>` : ''}
    ${p.estado === 'timeout' ? '<p class="erro" role="alert">O serviço de pagamento não respondeu após 3 tentativas. Você não foi cobrado. Ao tentar de novo, reaproveitamos a mesma solicitação, sem risco de cobrança em duplicidade.</p>' : ''}
    ${p.estado === 'offline' ? '<p class="erro" role="alert">Sem conexão com a internet. Não foi possível enviar o pagamento e nada foi cobrado. Tente de novo quando a conexão voltar.</p>' : ''}${p.estado === 'pausada' ? '<p class="erro" role="alert">Pedidos online pausados nesta unidade. Nada foi cobrado.</p>' : ''}
    <form data-form="pagar" novalidate>
      <fieldset><legend>Como você quer receber?</legend>
        <label><input type="radio" name="modo" value="retirada" checked> Retirar na loja (pick-up)</label>
        <label><input type="radio" name="modo" value="local"> Consumir no local</label>
        <label class="f">Horário de retirada<select name="horario">${HORARIOS.map((h) => `<option>${h}</option>`).join('')}</select></label></fieldset>
      <fieldset><legend>Forma de pagamento</legend>
        <label><input type="radio" name="metodo" value="pix" ${ui.metodo === 'cartao' ? '' : 'checked'}> Pix</label>
        <label><input type="radio" name="metodo" value="cartao" ${ui.metodo === 'cartao' ? 'checked' : ''}> Cartão de crédito</label></fieldset>
      <div id="campos-cartao" class="campos-cartao" ${ui.metodo === 'cartao' ? '' : 'hidden'}>
      <label class="f">Número do cartão<input name="numero" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0001"></label>${e.numero ? `<p class="erro" role="alert">${e.numero}</p>` : ''}
      <label class="f">Validade (MM/AA)<input name="val" placeholder="12/29" autocomplete="cc-exp"></label>${e.val ? `<p class="erro" role="alert">${e.val}</p>` : ''}
      <label class="f">CVV<input name="cvv" inputmode="numeric" maxlength="3" autocomplete="cc-csc"></label>${e.cvv ? `<p class="erro" role="alert">${e.cvv}</p>` : ''}
      ${DEMO ? '<p class="aviso">Teste: cartão final 0 é recusado; final 9 falha e se recupera sozinho; final 8 fica fora do ar.</p>' : ''}</div>
      <p class="aviso">Ambiente de demonstração: nenhum valor é cobrado.</p>
      <button class="btn" ${p.estado === 'processando' ? 'disabled' : ''}>${p.estado === 'timeout' ? 'Tentar novamente' : `Pagar ${brl(t.total)}`}</button>
    </form>`;
  },
  pedidos() {
    const meus = S.user ? S.pedidos.filter((o) => o.uid === S.user.email && !o.anon) : (S.canal === 'totem' ? S.pedidos.filter((o) => ui.sessao.includes(o.id)) : null);
    if (!meus) return '<h1>Meus pedidos</h1><p>Entre na sua conta para acompanhar seus pedidos.</p><a class="btn" href="#/conta">Entrar ou criar conta</a>';
    if (!meus.length) return `<h1>Meus pedidos</h1><p>Você ainda não fez pedidos. Que tal um cuscuz quentinho?</p><a class="btn" href="#/cardapio">Ver cardápio</a>`;
    const rot = ['Pagamento confirmado', 'Em preparo', 'Pronto', 'Retirado'];
    return `<h1>Meus pedidos</h1>${S.canal === 'totem' && !S.user ? '<button class="btn" data-act="novo-totem">Fazer novo pedido</button>' : ''}${meus.map((o) => {
      const s = status(o);
      return `<article class="card" style="display:block"><h3>Pedido #${o.id} — ${esc(UNIDADES.find((u) => u.id === o.un).nome)}</h3>
      <p>${o.itens.map((i) => `${i.q}× ${i.nome}`).join(', ')} · ${brl(o.total)} · ref. ${o.ref}</p><p>${o.modo === 'local' ? 'Consumir no local' : o.modo === 'retirada' ? `Retirada na loja: ${o.horario}` : ''}</p>
      ${s === 0 ? `<p class="erro">Pedido cancelado pela loja. ${estornoTxt(o)}</p>` : `<ol class="steps">${rot.map((r, i) => `<li class="${i < s ? 'on' : ''}">${r}</li>`).join('')}</ol>`}
      ${s === 3 ? `<button class="btn" data-act="retirar" data-v="${o.id}">Confirmar retirada</button>` : ''}</article>`;
    }).join('')}`;
  },
  fidelidade() {
    if (!S.user) return `<h1>Fidelidade</h1><p>Entre na sua conta para acumular pontos: 1 ponto a cada R$ 1,00.</p><a class="btn" href="#/conta">Entrar ou criar conta</a>`;
    const pts = S.user.pontos || 0; const n = nivel(); const prox = NIVEIS.find((x) => x.min > pts);
    return `<h1>Fidelidade</h1>${pontosAtivos() ? '' : '<p class="aviso">Você ainda não autorizou o programa. Ative em <a href="#/privacidade">Central de privacidade</a> para ganhar pontos e descontos.</p>'}
    <div class="card" style="display:block"><h2>${pts} pontos · nível ${n.n}</h2><p>Desconto do nível: ${Math.round(n.desc * 100)}% em todos os pedidos.</p>
    ${prox ? `<div class="barra" role="progressbar" aria-valuenow="${pts}" aria-valuemax="${prox.min}"><i style="width:${Math.min(100, (pts / prox.min) * 100)}%"></i></div><p>Faltam ${prox.min - pts} pontos para ${prox.n}.</p>` : '<p>Você está no nível máximo.</p>'}</div>
    <h2>Recompensas</h2><div class="grid">${RECOMPENSAS.map((r) => `<div class="card"><div class="inf"><h3>${r.nome}</h3><p>${r.custo} pontos</p></div><button class="btn" data-act="resgatar" data-v="${r.id}" ${pontosAtivos() && pts >= r.custo ? '' : 'disabled'}>Resgatar</button></div>`).join('')}</div>
    ${(S.user.vales || []).length ? `<p class="aviso">Vales prontos: ${S.user.vales.map((id) => RECOMPENSAS.find((r) => r.id === id)?.nome).join(', ')}. Eles entram sozinhos no carrinho quando o item correspondente estiver lá.</p>` : ''}
    <h2>Campanhas</h2><div class="grid">${S.campanhas.filter((c) => campAtiva(c)).map((c) => `<div class="card"><div class="inf"><h3>${esc(c.nome)}</h3><p>${esc(c.desc)} Válida até ${new Date(c.fim).toLocaleDateString('pt-BR')}.</p><p><strong>${campanhaStatus(c)}</strong></p></div></div>`).join('') || '<p>Nenhuma campanha no ar nesta unidade agora.</p>'}</div>
    <h2>Extrato</h2>${(S.user.hist || []).length ? `<ul>${S.user.hist.slice(0, 5).map((h) => `<li>${new Date(h.t).toLocaleDateString('pt-BR')}: ${h.pts > 0 ? '+' : ''}${h.pts} pontos — ${esc(h.txt)}</li>`).join('')}</ul>` : '<p>Sem movimentações ainda.</p>'}`;
  },
  conta() {
    if (S.staff) return `<h1>Olá, ${esc(S.staff.rotulo)}</h1><p>${esc(S.staff.email)} · ${S.staff.un ? esc(UNIDADES.find((u) => u.id === S.staff.un).nome) : 'toda a rede'}</p><p>Você está na área da equipe. As abas do seu perfil aparecem no menu.</p><a class="btn" href="#/equipe">Abrir meu painel</a> <button class="btn sec" data-act="staff-sair">Sair</button>`;
    if (S.user) return `<h1>Olá, ${esc(S.user.nome)}</h1><p>${esc(S.user.email)}</p>
    <form data-form="dados" novalidate><label class="f">Nome<input name="nome" value="${esc(S.user.nome)}" autocomplete="name"></label>${ui.erros.nome ? `<p class="erro" role="alert">${ui.erros.nome}</p>` : ''}<button class="btn sec">Atualizar nome</button></form>
    ${S.consent?.marketing ? `<form data-form="perfil" novalidate><label class="f">Data de nascimento (opcional)<input name="nasc" type="date" value="${S.user.nasc || ''}"></label>
      <p class="aviso">Usada só para campanhas por faixa etária, porque você autorizou “Ofertas personalizadas”. Deixe em branco e salve para apagá-la.</p>${ui.erros.nasc ? `<p class="erro" role="alert">${ui.erros.nasc}</p>` : ''}<button class="btn">Salvar perfil</button></form>`
      : '<div class="aviso"><label class="f">Data de nascimento (opcional)<input type="date" disabled></label><p>Campo bloqueado: só usamos sua idade em campanhas se você autorizar “Ofertas personalizadas”.</p><button type="button" class="btn sec" data-act="ativar-marketing">Autorizar ofertas personalizadas</button></div>'}
    <button class="btn sec" data-act="sair">Sair</button>`;
    const e = ui.erros; const cad = ui.aba === 'cadastro';
    return `<h1>${cad ? 'Criar conta' : 'Entrar'}</h1><div class="chips"><button class="chip" data-act="aba" data-v="login" aria-pressed="${!cad}">Entrar</button><button class="chip" data-act="aba" data-v="cadastro" aria-pressed="${cad}">Criar conta</button></div>
    ${DEMO && !cad ? '<p class="aviso">Demonstração (senha no README): atendente.rec@raizes.com, cozinha.rec@raizes.com, gerente.rec@raizes.com (troque rec por cg ou for) e matriz@raizes.com.</p>' : ''}
    <form data-form="${cad ? 'cadastro' : 'login'}" novalidate>
      ${cad ? `<label class="f">Nome<input name="nome" autocomplete="name"></label>${e.nome ? `<p class="erro" role="alert">${e.nome}</p>` : ''}` : ''}
      <label class="f">E-mail<input name="email" type="email" autocomplete="email"></label>${e.email ? `<p class="erro" role="alert">${e.email}</p>` : ''}
      <label class="f">Senha${cad ? ' (mínimo 8 caracteres)' : ''}<input name="senha" type="password" autocomplete="${cad ? 'new-password' : 'current-password'}"></label>${e.senha ? `<p class="erro" role="alert">${e.senha}</p>` : ''}
      ${cad ? `<label class="sw"><input type="checkbox" name="termos"><span>Li e aceito os <a href="#/privacidade">Termos e a Política de Privacidade</a>. Usaremos nome e e-mail apenas para sua conta e seus pedidos.</span></label>${e.termos ? `<p class="erro" role="alert">${e.termos}</p>` : ''}` : ''}
      ${e.geral ? `<p class="erro" role="alert">${e.geral}</p>` : ''}${cad ? `<label class="f">Data de nascimento (opcional)<input name="nasc" type="date" autocomplete="bday"></label>${e.nasc ? `<p class="erro" role="alert">${e.nasc}</p>` : ''}
      <label class="sw"><input type="checkbox" name="ofertas"><span>Quero receber ofertas personalizadas. Autorizo usar minha idade e meu perfil de consumo em campanhas segmentadas. Posso revogar quando quiser na <a href="#/privacidade">Central de privacidade</a>.</span></label>` : ''}<button class="btn">${cad ? 'Criar conta' : 'Entrar'}</button></form>`;
  },
  privacidade() {
    const c = S.consent || {};
    const sw = (k, t, d, fixo) => `<label class="sw"><input type="checkbox" name="${k}" ${fixo || c[k] ? 'checked' : ''} ${fixo ? 'disabled' : ''}><span><strong>${t}</strong><br>${d}</span></label>`;
    return `<h1>Central de privacidade</h1><p>Seguimos a LGPD (Lei 13.709/2018). Aqui você vê o que coletamos, por quê, e decide o que autorizar.</p>
    <form data-form="consent">
      ${sw('essencial', 'Dados essenciais (obrigatório)', 'Nome, e-mail e itens do pedido. Finalidade: executar seu pedido e o pagamento.', true)}
      ${sw('fidelidade', 'Programa de fidelidade', 'Histórico de compras e frequência para calcular pontos, nível e descontos.')}
      ${sw('marketing', 'Ofertas personalizadas', 'Idade e perfil de consumo para campanhas segmentadas. Opcional.')}
      <button class="btn">Salvar minhas escolhas</button></form>
    <h2>Seus direitos</h2><p>Você pode revogar qualquer consentimento acima, baixar seus dados ou excluir sua conta. Contato do encarregado (DPO): privacidade@raizesdonordeste.com.br</p>
    ${S.user ? '<div class="acoes"><button class="btn sec" data-act="exportar">Baixar meus dados</button> <button class="btn sec" data-act="excluir">Excluir minha conta e dados</button></div>' : '<p>Entre na sua conta para baixar ou excluir seus dados.</p>'}
    <h2>Histórico de consentimentos</h2>${(() => { const L = S.log.filter((l) => l.uid === (S.user?.email ?? null)); return L.length ? `<ul>${L.slice(-6).reverse().map((l) => `<li>${l.t} — ${esc(l.txt)}</li>`).join('')}</ul>` : '<p>Nenhum registro ainda.</p>'; })()}`;
  },
};

function resumo(t) {
  return `<div class="lin"><span>Subtotal</span><span>${brl(t.sub)}</span></div>${t.dV ? `<div class="lin"><span>Vale de recompensa</span><span>− ${brl(t.dV)}</span></div>` : ''}${t.dN ? `<div class="lin"><span>Desconto nível ${nivel().n}</span><span>− ${brl(t.dN)}</span></div>` : ''}${t.dC ? `<div class="lin"><span>Cupom ${S.cupom}</span><span>− ${brl(t.dC)}</span></div>` : ''}<div class="lin tot"><span>Total</span><span>${brl(t.total)}</span></div>`;
}
function status(o) { return o.etapa ?? (o.retirado ? 4 : 3); }
function registrar(txt) { S.log.push({ t: new Date().toLocaleString('pt-BR'), txt, uid: S.user?.email ?? null }); }

const TITULOS = { cardapio: 'Cardápio', carrinho: 'Carrinho', checkout: 'Pagamento', pedidos: 'Meus pedidos', fidelidade: 'Pontos', conta: 'Conta', privacidade: 'Central de privacidade', equipe: 'Painel da equipe', campanhas: 'Campanhas' };
// Acessibilidade: liga cada mensagem de erro ao seu campo e identifica cabeçalhos de tabela.
function aprimorar() {
  $('#app').querySelectorAll('th:not([scope])').forEach((th) => th.setAttribute('scope', 'col'));
  $('#app').querySelectorAll('p.erro').forEach((p, i) => {
    const campo = p.previousElementSibling?.querySelector?.('input,select'); if (!campo) return;
    p.id ||= `erro-${i}`; campo.setAttribute('aria-invalid', 'true'); campo.setAttribute('aria-describedby', p.id);
  });
}
let rota = 'cardapio';
function render() {
  if (S.staff && S.user) equipe?.click('staff-sair', '');
  if (S.staff && Date.now() > (S.staff.ate ?? 0)) equipe?.expirar();
  if (S.staff?.un) S.unidade = S.staff.un;
  rota = location.hash.replace('#/', '') || 'cardapio';
  if (!views[rota]) rota = 'cardapio';
  document.body.classList.toggle('totem', S.canal === 'totem');
  const html = views[rota]();
  if (html !== ui.html) { $('#app').innerHTML = html; ui.html = html; aprimorar(); }
  document.title = `${TITULOS[rota]} — Raízes do Nordeste`;
  if (ui.focarErro) { ui.focarErro = false; document.querySelector('#app [aria-invalid=true]')?.focus(); }
  const links = [['cardapio', 'Cardápio'], ['carrinho', `Carrinho${qtdCarrinho() ? `<span class="badge">${qtdCarrinho()}</span>` : ''}`], ['pedidos', 'Pedidos'], ['fidelidade', 'Pontos'], ['conta', 'Conta'], ['privacidade', 'Privacidade']];
  const itens = S.staff ? [['cardapio', 'Cardápio'], ['equipe', ABAS[S.staff.papel]], ...(S.staff.papel === 'matriz' ? [['campanhas', 'Campanhas']] : []), ['conta', 'Conta']] : links;
  $('.nav').innerHTML = itens.map(([r, l]) => `<a href="#/${r}" ${r === rota ? 'aria-current="page"' : ''}>${l}</a>`).join('');
  $('#unidade').innerHTML = UNIDADES.map((u) => `<option value="${u.id}" ${u.id === S.unidade ? 'selected' : ''}>${u.nome}</option>`).join('');
  $('#unidade').disabled = !!S.staff?.un;
  $('#consent').hidden = !!S.consent || rota === 'privacidade';
  document.body.classList.toggle('com-banner', !$('#consent').hidden);
  document.body.style.setProperty('--banner', `${$('#consent').offsetHeight}px`);
}
const go = (r) => { ui.erros = {}; location.hash = '#/' + r; };

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; const v = el.dataset.v;
  if (a === 'pular') { ev.preventDefault(); $('#app').focus(); return; }
  if (equipe?.click(a, v)) { if (a === 'staff-sair') location.hash = '#/cardapio'; save(); render(); return; }
  if (a === 'cat') ui.cat = v;
  if (a === 'add' || a === 'mais') {
    if ((S.cart[v] || 0) >= estoqueDe(v)) toast('Quantidade máxima disponível no estoque.');
    else { S.cart[v] = (S.cart[v] || 0) + 1; if (a === 'add') toast('Adicionado ao carrinho'); }
  }
  if (a === 'menos') { S.cart[v]--; if (S.cart[v] <= 0) delete S.cart[v]; }
  if (a === 'aba') { ui.aba = v; ui.erros = {}; }
  if (a === 'sair') { save(); S.user = null; toast('Você saiu da conta'); }
  if (a === 'ativar-marketing') { S.consent = { essencial: true, fidelidade: !!S.consent?.fidelidade, marketing: true }; registrar('Autorizou ofertas personalizadas'); toast('Ofertas personalizadas autorizadas'); }
  if (a === 'resgatar') {
    const r = RECOMPENSAS.find((x) => x.id === v);
    if (!pontosAtivos()) toast('Ative o programa de fidelidade na Central de privacidade.');
    else if (!r || (S.user.pontos || 0) < r.custo) toast('Pontos insuficientes para esta recompensa.');
    else { S.user.pontos -= r.custo; S.user.vales = [...(S.user.vales || []), r.id]; extrato(`Resgate: ${r.nome}`, -r.custo); toast('Vale resgatado! Ele será usado no próximo pedido.'); }
  }
  if (a === 'retirar') { const ped = S.pedidos.find((o) => o.id === v); if (ped && (S.user ? ped.uid === S.user.email : ui.sessao.includes(ped.id))) ped.etapa = 4; }
  if (a === 'novo-totem') { ui.sessao = []; S.cart = {}; S.cupom = null; location.hash = '#/cardapio'; }
  if (a === 'consent-min') { S.consent = { essencial: true, fidelidade: false, marketing: false }; registrar('Aceitou apenas dados essenciais'); }
  if (a === 'consent-all') { S.consent = { essencial: true, fidelidade: true, marketing: true }; registrar('Aceitou todos os consentimentos'); }
  if (a === 'exportar') {
    if (!S.user) { toast('Entre na sua conta para baixar seus dados.'); return; }
    const dados = { usuario: S.user && { nome: S.user.nome, email: S.user.email, pontos: S.user.pontos }, consentimentos: S.consent, pedidos: S.pedidos.filter((o) => o.uid === S.user.email) };
    const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })); l.download = 'meus-dados.json'; l.click();
    return;
  }
  if (a === 'excluir') {
    if (!S.user) { toast('Entre na sua conta para excluir seus dados.'); return; }
    if (!confirm('Isso apaga sua conta, seus pontos e consentimentos. Os pedidos são mantidos de forma anônima, sem ligação com você. Deseja continuar?')) return;
    const restantes = S.contas.filter((c) => c.email !== S.user?.email); Object.assign(S, { ...base, contas: restantes, estoque: S.estoque, audit: S.audit, staff: S.staff, campanhas: S.campanhas, pausa: S.pausa, sazonais: S.sazonais, pedidos: S.pedidos.map((o) => (!S.user || o.uid !== S.user.email ? o : { ...o, uid: undefined, pontos: undefined, anon: true })) }); toast('Seus dados foram excluídos'); go('cardapio');
  }
  save(); render();
});

document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('[data-form]'); if (!f) return;
  ev.preventDefault(); ui.erros = {}; ui.focarErro = true;
  const d = Object.fromEntries(new FormData(f)); const tipo = f.dataset.form;
  if (equipe?.submit(tipo, d)) { save(); render(); return; }
  if (tipo === 'cupom') {
    const c = (d.cupom || '').trim().toUpperCase();
    if (!c) S.cupom = null; else {
      const camp = campDoCupom(c);
      if (!camp) ui.erros.cupom = 'Cupom inválido. Confira o código digitado.';
      else if (!campAtiva(camp)) ui.erros.cupom = 'Esta campanha não está no ar nesta unidade ou já terminou.';
      else if (!publicoOk(camp)) ui.erros.cupom = camp.publico === 'idade' ? 'Cupom de campanha segmentada: exige conta, “Ofertas personalizadas” ativas e data de nascimento dentro da faixa da campanha.' : 'Este cupom é para clientes frequentes com o programa de fidelidade ativo.';
      else { S.cupom = c; toast('Cupom aplicado'); }
    }
  }
  if (tipo === 'cadastro' || tipo === 'login') {
    const e = ui.erros; const email = (d.email || '').trim().toLowerCase();
    if (tipo === 'cadastro' && !(d.nome || '').trim()) e.nome = 'Informe seu nome.';
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Digite um e-mail válido, como nome@email.com.';
    if (tipo === 'cadastro' ? (d.senha || '').length < 8 : !d.senha) e.senha = tipo === 'cadastro' ? 'A senha precisa ter pelo menos 8 caracteres.' : 'Informe sua senha.';
    if (tipo === 'cadastro' && !d.termos) e.termos = 'Para criar a conta, aceite os Termos e a Política de Privacidade.';
    if (tipo === 'cadastro' && d.nasc && !(idade(d.nasc) >= 18 && idade(d.nasc) <= 120)) e.nasc = 'Informe uma data válida. Este campo é apenas para maiores de 18 anos.';
    if (!Object.keys(e).length) {
      const conta = S.contas.find((c) => c.email === email); const hs = await hashSenha(d.senha);
      const ns = tipo === 'login' && CORP.test(email) ? await (await carregarEquipe()).entrar(email, d.senha) : null;
      if (tipo === 'cadastro') {
        if (conta) e.geral = 'Este e-mail já tem cadastro. Use “Entrar”.';
        else if (CORP.test(email)) e.geral = 'Este e-mail é reservado à equipe. Use outro e-mail para criar sua conta.';
        else { S.contas.push({ nome: d.nome.trim(), email, senha: hs, pontos: 0 }); S.user = S.contas[S.contas.length - 1]; registrar('Aceitou Termos e Política de Privacidade');
          if (d.ofertas) {
            S.consent = { essencial: true, fidelidade: !!S.consent?.fidelidade, marketing: true }; registrar('Autorizou ofertas personalizadas (cadastro)');
            if (d.nasc) S.user.nasc = d.nasc;
            toast('Conta criada');
          } else toast(d.nasc ? 'Conta criada. Não guardamos sua data de nascimento porque as ofertas personalizadas não foram autorizadas.' : 'Conta criada');
        }
      } else if (ns !== null) { if (ns === 'ok') { toast('Acesso da equipe liberado'); location.hash = '#/equipe'; } else e.geral = 'E-mail ou senha incorretos.'; } else if (!conta || (conta.senha !== hs && conta.senha !== btoa(d.senha))) e.geral = 'E-mail ou senha incorretos.';
      else { conta.senha = hs; S.user = conta; toast('Bem-vindo de volta'); }
    }
  }
  if (tipo === 'dados' && S.user) {
    const nome = (d.nome || '').trim();
    if (nome.length < 2) ui.erros.nome = 'Informe seu nome (mínimo de 2 caracteres).';
    else { S.user.nome = nome; registrar('Retificou o nome cadastrado'); toast('Dados atualizados'); }
  }
  if (tipo === 'perfil' && S.user && S.consent?.marketing) {
    if (!d.nasc) { delete S.user.nasc; toast('Data de nascimento removida'); }
    else if (!(idade(d.nasc) >= 18 && idade(d.nasc) <= 120)) ui.erros.nasc = 'Informe uma data válida. Este campo é apenas para maiores de 18 anos.';
    else { S.user.nasc = d.nasc; toast('Perfil salvo'); }
  }
  if (tipo === 'consent') {
    S.consent = { essencial: true, fidelidade: !!d.fidelidade, marketing: !!d.marketing }; if (!S.consent.marketing && S.user) delete S.user.nasc;
    registrar(`Consentimentos atualizados (fidelidade: ${S.consent.fidelidade ? 'sim' : 'não'}, ofertas: ${S.consent.marketing ? 'sim' : 'não'})`); toast('Escolhas salvas');
  }
  if (tipo === 'pagar') {
    if (ui.pag.estado === 'processando') return;
    const t = totais(); const e = ui.erros;
    if (S.canal !== 'totem' && !S.user) { toast('Entre na sua conta para finalizar o pedido'); return go('conta'); }
    if (d.metodo === 'cartao') {
      if (!/^\d{16}$/.test((d.numero || '').replace(/\s/g, ''))) e.numero = 'O número do cartão deve ter 16 dígitos.';
      const m = /^(\d{2})\/(\d{2})$/.exec(d.val || '');
      if (!m || +m[1] < 1 || +m[1] > 12 || 2000 + +m[2] < new Date().getFullYear()) e.val = 'Informe uma validade futura no formato MM/AA.';
      if (!/^\d{3}$/.test(d.cvv || '')) e.cvv = 'O CVV tem 3 dígitos.';
    }
    if (!navigator.onLine) { ui.pag = { estado: 'offline', msg: '' }; return render(); }
    if (S.canal !== 'totem' && S.pausa?.[S.unidade]) { ui.pag = { estado: 'pausada', msg: '' }; return render(); }
    if (t.itens.some((i) => i.q > estoqueDe(i.p.id))) { toast('Algum item acabou ou não tem a quantidade pedida. Revise o carrinho.'); return go('carrinho'); }
    if (Object.keys(e).length) return render();
    const un = S.unidade; ui.pag = { estado: 'processando', msg: '' }; render();
    const chave = `${(ui.chave ||= `PG${Date.now().toString(36)}`)}-${Math.round(t.total * 100)}`;
    const max = 3; let r; let feitas = 0;
    for (let i = 1; i <= max; i++) {
      feitas = i;
      r = await solicitarPagamento({ chave, valor: t.total, metodo: d.metodo, numero: d.numero });
      if (r.status !== 'timeout' || i === max) break;
      ui.pag = { estado: 'processando', msg: `Sem resposta do serviço de pagamento. Tentando de novo (${i + 1} de ${max})…` }; render();
      await new Promise((ok) => setTimeout(ok, 800 * i));
    }
    if (r.status === 'aprovado') {
      const gp = pontosAtivos() ? calcPontos(t) : null;
      const ped = novoPedido({ un, uid: S.user?.email, pontos: gp?.total, itens: t.itens.map((i) => ({ id: i.p.id, nome: i.p.nome, q: i.q, preco: i.p.preco })), total: t.total, ref: r.ref, canal: S.canal === 'totem' ? 'totem' : 'app', pagto: d.metodo, tentativas: feitas, modo: d.modo === 'local' ? 'local' : 'retirada', horario: d.modo === 'local' ? null : (HORARIOS.includes(d.horario) ? d.horario : HORARIOS[0]), desconto: +(t.sub - t.total).toFixed(2) });
      S.pedidos.unshift(ped); ui.sessao.push(ped.id);
      if (gp) {
        S.user.pontos = (S.user.pontos || 0) + gp.total; extrato(`Pedido (${gp.det})`, gp.total);
        t.usados.forEach((rid) => { const k = (S.user.vales || []).indexOf(rid); if (k >= 0) S.user.vales.splice(k, 1); });
      }
      S.cart = {}; S.cupom = null; ui.chave = null; ui.metodo = 'pix'; ui.pag = { estado: 'idle', msg: '' }; save(); toast('Pagamento aprovado!'); return go('pedidos');
    }
    if (r.status === 'recusado') ui.chave = null;
    ui.pag = { estado: r.status, msg: r.motivo || '' };
  }
  save(); render();
});

// Pagamento: os campos do cartão só aparecem quando "Cartão de crédito" é escolhido.
document.addEventListener('change', (ev) => {
  if (ev.target.name !== 'metodo') return;
  ui.metodo = ev.target.value; $('#campos-cartao').hidden = ev.target.value !== 'cartao';
});

// Unidades da campanha: "Todas" marca tudo; desmarcar ou marcar só algumas vira "específicas".
document.addEventListener('change', (ev) => {
  const fs = ev.target.closest('[data-unidades]'); if (!fs) return;
  const cbs = [...fs.querySelectorAll('input[type=checkbox]')];
  if (ev.target.name === 'abr') { cbs.forEach((c) => { c.checked = ev.target.value === 'todas'; }); return; }
  fs.querySelector(`input[name=abr][value=${cbs.every((c) => c.checked) ? 'todas' : 'sel'}]`).checked = true;
});

// Sessão da equipe expira por inatividade; o totem limpa a sessão do cliente quando fica parado.
['click', 'keydown', 'input'].forEach((t) => document.addEventListener(t, () => { ui.ultimo = Date.now(); if (S.staff) S.staff.ate = Date.now() + 15 * 60000; }, true));
setInterval(() => {
  if (S.canal === 'totem' && !S.user && Date.now() - ui.ultimo > 60000 && (ui.sessao.length || Object.keys(S.cart).length)) { ui.sessao = []; S.cart = {}; S.cupom = null; save(); location.hash = '#/cardapio'; render(); }
  if (S.staff && Date.now() > (S.staff.ate ?? 0)) { equipe?.expirar(); save(); render(); }
}, 5000);

$('#unidade').addEventListener('change', (e) => { S.unidade = e.target.value; save(); render(); });

const rede = () => { $('#offline').hidden = navigator.onLine; };
window.addEventListener('offline', () => { rede(); toast('Você ficou sem conexão'); });
window.addEventListener('online', () => { rede(); toast('Conexão restabelecida'); });
rede();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('hashchange', () => { ui.erros = {}; render(); window.scrollTo(0, 0); $('#app').focus({ preventScroll: true }); });
setInterval(() => { if ((rota === 'pedidos' || (rota === 'equipe' && S.staff?.papel === 'cozinha')) && !document.activeElement?.closest('button')) render(); }, 2000);
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { Object.assign(S, JSON.parse(e.newValue)); } catch { return; }
  if (rota === 'pedidos' || (rota === 'equipe' && S.staff?.papel === 'cozinha')) render();
});
if (S.staff) await carregarEquipe();
render();
