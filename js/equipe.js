import { UNIDADES, PRODUTOS } from './data.js';
import { hashSenha } from './seguranca.js';

// Acessos de demonstração: equipe vinculada a uma unidade (papel.unidade@) e a matriz com visão da rede.
const ACESSOS = { 'matriz@raizes.com': { papel: 'matriz' } };
UNIDADES.forEach((u) => ['atendente', 'cozinha', 'gerente'].forEach((p) => { ACESSOS[`${p}.${u.id}@raizes.com`] = { papel: p, un: u.id }; }));
const HASH_EQUIPE = 'd5fe07461ec343563e78553e5bfd537ab62d1d0a33b68f8c44f7dae0c1fdca84'; // hash (com sal) da senha de demonstração; o texto da senha não fica no código
const PAPEL = { atendente: 'Atendente', cozinha: 'Cozinha', gerente: 'Gerente da unidade', matriz: 'Matriz (administrador)' };
const CANAL = { app: 'App', totem: 'Totem', balcao: 'Balcão' };
const ETAPAS = ['Cancelado', 'Recebido', 'Em preparo', 'Pronto', 'Retirado'];
const etapaDe = (o) => o.etapa ?? (o.retirado ? 4 : 3);
const nomeUn = (id) => UNIDADES.find((u) => u.id === id)?.nome ?? id;
const dt = (t) => new Date(t).toLocaleString('pt-BR');
const modoTxt = (o) => (o.modo === 'local' ? 'Consumo no local' : o.modo === 'retirada' ? `Retirada: ${o.horario}` : 'Balcão');

// Painéis da operação: balcão do atendente, fila da cozinha, gestão da unidade e visão da matriz.
export function criarEquipe({ S, ui, brl, esc, toast, disp, estoqueDe, novoPedido }) {
  const restrita = () => '<p class="aviso">Área restrita à equipe.</p>';
  const audit = (acao, detalhe) => S.audit.push({ t: Date.now(), ator: PAPEL[S.staff.papel], un: S.staff.un ?? null, acao, detalhe });
  const is = (...ps) => ps.includes(S.staff?.papel);
  const itensTxt = (o) => o.itens.map((i) => `${i.q}× ${i.nome}`).join(', ');
  const erro = (m) => (m ? `<p class="erro" role="alert">${m}</p>` : '');
  const emAndamento = () => S.pedidos.filter((o) => o.un === S.unidade && [1, 2, 3].includes(etapaDe(o))).sort((a, b) => a.criadoEm - b.criadoEm);

  function cozinha() {
    const fila = emAndamento();
    if (!fila.length) return '<p>Nenhum pedido na fila. Novos pedidos aparecem aqui automaticamente.</p>';
    return `<div class="grid">${fila.map((o) => {
      const e = etapaDe(o); const min = Math.floor((Date.now() - o.criadoEm) / 60000);
      const acao = e === 1 ? `<button class="btn" data-act="kds" data-v="${o.id}:2">Iniciar preparo</button>`
        : e === 2 ? `<button class="btn" data-act="kds" data-v="${o.id}:3">Marcar como pronto</button>` : '<strong>Pronto, aguardando retirada</strong>';
      return `<article class="card" style="display:block"><h3>#${o.id} · ${CANAL[o.canal] ?? 'App'} · há ${min} min</h3><p>${esc(itensTxt(o))}</p><p>${modoTxt(o)} · ${ETAPAS[e]}</p>${acao}</article>`;
    }).join('')}</div>`;
  }

  function atendente() {
    const e = ui.erros; const ativos = emAndamento();
    return `<div class="duas"><div><h2>Novo pedido no balcão</h2>
    <form data-form="balcao" novalidate>
      ${PRODUTOS.filter((p) => disp(p)).map((p) => `<label class="f">${p.nome} · ${brl(p.preco)} (estoque: ${estoqueDe(p.id)})<input type="number" name="q_${p.id}" min="0" max="${estoqueDe(p.id)}" value="0" inputmode="numeric"></label>`).join('')}
      <label class="f">Pagamento (maquininha externa)<select name="pagto"><option value="cartao">Cartão</option><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option></select></label>
      <label class="f">Desconto manual (0 a 10%)<input type="number" name="desc" min="0" max="10" value="0"></label>
      <label class="f">Motivo do desconto<input name="motivo" autocomplete="off"></label>${erro(e.desc)}
      ${erro(e.geral)}<button class="btn">Enviar para a cozinha</button></form>
    </div><div><h2>Pedidos em andamento</h2>${ativos.length ? ativos.map((o) => {
      const et = etapaDe(o);
      return `<article class="card" style="display:block"><h3>#${o.id} · ${CANAL[o.canal] ?? 'App'} · ${ETAPAS[et]}</h3><p>${esc(itensTxt(o))} · ${brl(o.total)}</p>
      ${et === 3 ? `<button class="btn" data-act="kds" data-v="${o.id}:4">Entregar ao cliente</button>` : ''}
      ${et <= 2 ? `<button class="btn sec" data-act="cancelar" data-v="${o.id}">Cancelar pedido</button>` : ''}</article>`;
    }).join('') : '<p>Nenhum pedido em andamento.</p>'}</div></div>`;
  }

  function gerente() {
    const m = is('matriz'); const escopo = (o) => m || o.un === S.staff.un;
    const vis = m ? UNIDADES : UNIDADES.filter((u) => u.id === S.staff.un);
    const aud = S.audit.filter((x) => m || x.un === S.staff.un);
    const noPeriodo = (o) => !ui.dias || o.criadoEm >= Date.now() - ui.dias * 864e5;
    const ok = S.pedidos.filter((o) => etapaDe(o) > 0 && noPeriodo(o) && escopo(o));
    const soma = (l) => l.reduce((a, o) => a + o.total, 0);
    const f30 = (u) => soma(S.pedidos.filter((o) => etapaDe(o) > 0 && o.un === u.id && o.criadoEm >= Date.now() - 30 * 864e5));
    const linhas = vis.map((u) => { const l = ok.filter((o) => o.un === u.id); const r = f30(u); return `<tr><td>${u.nome}</td><td>${u.uf} · ${u.regiao}</td><td>${l.length}</td><td>${brl(soma(l))}</td><td>${l.length ? brl(soma(l) / l.length) : '—'}</td><td>${brl(r)} de ${brl(u.meta)} (${Math.round((r / u.meta) * 100)}%)</td></tr>`; }).join('');
    const top = {}; const canais = {};
    ok.forEach((o) => { const c = CANAL[o.canal] ?? 'App'; canais[c] = (canais[c] || 0) + 1; o.itens.forEach((i) => { top[i.nome] = (top[i.nome] || 0) + i.q; }); });
    const rank = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const porForma = {}; const porRegiao = {};
    ok.forEach((o) => {
      const f = ({ pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' })[o.pagto] ?? 'Não informado'; porForma[f] = (porForma[f] || 0) + o.total;
      const r = UNIDADES.find((u) => u.id === o.un)?.regiao ?? '—'; porRegiao[r] = (porRegiao[r] || 0) + o.total;
    });
    const lista = (m) => Object.entries(m).map(([k, v]) => `${k}: ${brl(v)}`).join(' · ') || 'sem vendas';
    const temDemo = S.pedidos.some((o) => o.demo);
    return `<h2>${m ? 'Vendas por unidade (matriz)' : 'Vendas da unidade'}</h2><div class="chips" role="group" aria-label="Período">${[[1, 'Últimas 24 h'], [7, '7 dias'], [30, '30 dias'], [0, 'Tudo']].map(([v, t]) => `<button class="chip" data-act="periodo" data-v="${v}" aria-pressed="${(ui.dias || 0) === v}">${t}</button>`).join('')}</div>
    <div class="tabela"><table><thead><tr><th>Unidade</th><th>UF · região</th><th>Pedidos</th><th>Faturamento</th><th>Ticket médio</th><th>Meta (30 dias)</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <p>Pedidos cancelados: ${S.pedidos.filter((o) => etapaDe(o) === 0 && escopo(o)).length}. Canais: ${Object.entries(canais).map(([c, n]) => `${c} ${n}`).join(', ') || 'sem vendas ainda'}.</p>
    <h2>Resumo financeiro</h2><p>Faturamento: <strong>${brl(soma(ok))}</strong> · Descontos concedidos: <strong>${brl(ok.reduce((a, o) => a + (o.desconto || 0), 0))}</strong></p>
    <p>Por forma de pagamento: ${lista(porForma)}.</p><p>Por região: ${lista(porRegiao)}.</p>
    <h2>Produtos mais consumidos</h2>${rank.length ? `<ol>${rank.map(([n, q]) => `<li>${esc(n)}: ${q} un.</li>`).join('')}</ol>` : '<p>Sem vendas registradas ainda.</p>'}
    <p class="aviso">Os relatórios usam apenas dados agregados de pedidos, sem informações pessoais de clientes (LGPD).</p>
    ${m ? `<button class="btn sec" data-act="seed">${temDemo ? 'Remover dados de exemplo' : 'Gerar dados de exemplo'}</button>` : ''}
    ${m ? '' : `<h2>Alta demanda — ${nomeUn(S.unidade)}</h2><p>${S.pausa?.[S.unidade] ? 'Pedidos online (app e web) <strong>pausados</strong>. Totem e balcão seguem funcionando.' : 'Pedidos online liberados.'}</p><button class="btn sec" data-act="pausa">${S.pausa?.[S.unidade] ? 'Retomar pedidos online' : 'Pausar pedidos online'}</button>`}
    ${m ? `<h2>Produtos sazonais</h2>
    <form data-form="sazonal" novalidate>${PRODUTOS.filter((p) => p.sazonal).map((p) => { const j = S.sazonais[p.id] ?? { inicio: Date.now(), fim: Date.now() + 30 * 864e5 }; return `<fieldset><legend>${p.nome}</legend><label class="f">Início<input type="datetime-local" name="i_${p.id}" value="${loc(j.inicio)}"></label><label class="f">Fim<input type="datetime-local" name="f_${p.id}" value="${loc(j.fim)}"></label></fieldset>`; }).join('')}${erro(ui.erros.sazonal)}<button class="btn">Salvar temporada</button></form>` : ''}
    ${m ? '' : `<h2>Estoque — ${nomeUn(S.unidade)}</h2>
    <form data-form="estoque" novalidate>${PRODUTOS.filter((p) => p.un.includes(S.unidade)).map((p) => `<label class="f">${p.nome}<input type="number" name="e_${p.id}" min="0" max="999" value="${estoqueDe(p.id)}"></label>`).join('')}
      ${erro(ui.erros.estoque)}<button class="btn">Salvar estoque</button></form>`}
    <h2>Auditoria (últimos 10 registros)</h2>${aud.length ? `<div class="tabela"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>${aud.slice(-10).reverse().map((a) => `<tr><td>${dt(a.t)}</td><td>${a.ator}</td><td>${a.acao}</td><td>${esc(a.detalhe)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhum registro ainda.</p>'}`;
  }

  const PUBLICO = { todos: 'Todos os clientes', frequentes: 'Clientes frequentes (4º pedido em diante)', idade: 'Faixa etária' };
  const loc = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const statusCamp = (c) => (!c.ativa ? 'Pausada' : Date.now() < c.inicio ? 'Agendada' : Date.now() > c.fim ? 'Encerrada' : 'No ar');
  const publicoTxt = (c) => (c.publico === 'idade' ? `Faixa etária (${c.idadeMin} a ${c.idadeMax} anos)` : PUBLICO[c.publico]);
  const unTxt = (c) => (c.un.length ? c.un.map(nomeUn).join(', ') : 'todas as unidades');
  const resumoCamp = (c) => `${c.tipo === 'cupom' ? `${c.valor}%` : c.tipo === 'bonus-freq' ? `${c.valor} pts` : 'regra de pontos'} · ${dt(c.inicio)} a ${dt(c.fim)} · ${unTxt(c)} · ${c.ativa ? 'ativa' : 'pausada'}`;
  const abrang = (un) => {
    const todas = !un.length;
    return `<fieldset data-unidades><legend>Unidades participantes</legend>
    <label><input type="radio" name="abr" value="todas" ${todas ? 'checked' : ''}> Todas as unidades</label>
    <label><input type="radio" name="abr" value="sel" ${todas ? '' : 'checked'}> Somente unidades específicas</label>
    ${UNIDADES.map((u) => `<label><input type="checkbox" name="un_${u.id}" ${todas || un.includes(u.id) ? 'checked' : ''}> ${u.nome}</label>`).join('')}</fieldset>`;
  };
  const rascunho = (id) => (ui.erros.campId === id && ui.draft ? ui.draft : {});
  const unDe = (c, r) => (r.abr ? (r.abr === 'sel' ? UNIDADES.filter((u) => r[`un_${u.id}`]).map((u) => u.id) : []) : c.un);
  const campos = (c, r) => {
    const eCupom = c.tipo === 'cupom';
    return `<label class="f">Nome<input name="nome" value="${esc(r.nome ?? c.nome ?? '')}" autocomplete="off"></label>
    <label class="f">Descrição (opcional)<input name="desc" value="${esc(r.desc ?? c.desc ?? '')}" autocomplete="off"></label>
    ${eCupom ? `<label class="f">Código do cupom<input name="cupom" value="${esc(r.cupom ?? c.cupom ?? '')}" autocomplete="off"></label>` : ''}
    ${eCupom || c.tipo === 'bonus-freq' ? `<label class="f">${eCupom ? 'Desconto (%)' : 'Bônus (pontos)'}<input type="number" name="valor" value="${esc(r.valor ?? c.valor ?? 10)}" min="1"></label>` : ''}
    ${eCupom ? `<label class="f">Público<select name="publico">${Object.entries(PUBLICO).map(([k, t]) => `<option value="${k}" ${(r.publico ?? c.publico) === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Idade mínima (se faixa etária)<input type="number" name="idadeMin" value="${esc(r.idadeMin ?? c.idadeMin ?? 18)}" min="18"></label>
    <label class="f">Idade máxima (se faixa etária)<input type="number" name="idadeMax" value="${esc(r.idadeMax ?? c.idadeMax ?? 25)}" max="120"></label>` : ''}
    <label class="f">Início<input type="datetime-local" name="inicio" value="${esc(r.inicio ?? loc(c.inicio ?? Date.now()))}"></label>
    <label class="f">Fim<input type="datetime-local" name="fim" value="${esc(r.fim ?? loc(c.fim ?? Date.now() + 7 * 864e5))}"></label>`;
  };

  function viewCampanhas() {
    if (!S.staff) return restrita();
    if (!is('matriz')) return '<h1>Campanhas</h1><p class="aviso">Área exclusiva da matriz. Saia e entre com o perfil da matriz.</p><button class="btn sec" data-act="staff-sair">Sair e trocar de perfil</button>';
    const cards = S.campanhas.map((c) => {
      const r = rascunho(c.id); const ativa = r.abr ? !!r.ativa : c.ativa;
      return `<form data-form="camp-edit" class="card" style="display:grid;max-width:none"><input type="hidden" name="id" value="${c.id}">
      <h3>${esc(c.nome)} — ${statusCamp(c)}</h3><p>${resumoCamp(c)} · público: ${publicoTxt(c)}</p>
      ${campos(c, r)}${abrang(unDe(c, r))}
      <label class="sw"><input type="checkbox" name="ativa" ${ativa ? 'checked' : ''}><span>Campanha ativa (desmarque para pausar)</span></label>
      ${ui.erros.campId === c.id ? erro(ui.erros.camp) : ''}
      <div class="acoes"><button class="btn">Salvar alterações</button><button type="button" class="btn sec" data-act="camp-del" data-v="${c.id}">Remover campanha</button></div></form>`;
    }).join('');
    const rn = rascunho('nova'); const novo = { tipo: 'cupom', un: [], publico: 'todos', valor: 10 };
    return `<h1>Campanhas</h1><p>Crie, edite, pause ou remova campanhas. Toda alteração fica registrada na auditoria.</p>
    ${cards || '<p class="aviso">Nenhuma campanha cadastrada. Crie a primeira abaixo.</p>'}
    <h2>Nova campanha de desconto</h2>
    <form data-form="camp-nova" novalidate>${campos(novo, rn)}${abrang(unDe(novo, rn))}${ui.erros.campId === 'nova' ? erro(ui.erros.camp) : ''}<button class="btn">Criar campanha</button></form>`;
  }

  function salvarCamp(d, nova) {
    const er = ui.erros; er.campId = nova ? 'nova' : d.id;
    const c = nova ? { id: `c${Date.now().toString(36)}`, tipo: 'cupom', publico: 'todos' } : S.campanhas.find((x) => x.id === d.id);
    if (!c) return;
    const eCupom = c.tipo === 'cupom'; const comValor = eCupom || c.tipo === 'bonus-freq';
    const cup = (d.cupom || '').trim().toUpperCase(); const nome = (d.nome || '').trim();
    const inicio = new Date(d.inicio).getTime(); const fim = new Date(d.fim).getTime(); const valor = Number(d.valor);
    const marcadas = UNIDADES.filter((u) => d[`un_${u.id}`]).map((u) => u.id);
    const un = d.abr === 'sel' && marcadas.length < UNIDADES.length ? marcadas : [];
    const publico = eCupom ? (['todos', 'frequentes', 'idade'].includes(d.publico) ? d.publico : 'todos') : c.publico;
    const a = Number(d.idadeMin); const b = Number(d.idadeMax);
    const msg = (() => {
      if (nome.length < 3) return 'Dê um nome à campanha (mínimo de 3 caracteres).';
      if (eCupom && !/^[A-Z0-9]{4,15}$/.test(cup)) return 'O cupom deve ter de 4 a 15 letras ou números, sem espaços.';
      if (eCupom && S.campanhas.some((x) => x.id !== c.id && x.cupom === cup)) return 'Já existe uma campanha com este cupom.';
      if (comValor) {
        const max = eCupom ? 50 : 200;
        if (!Number.isInteger(valor) || valor < 1 || valor > max) return `O valor deve ser um inteiro de 1 a ${max}${eCupom ? '%' : ' pontos'}.`;
      }
      if (eCupom && publico === 'idade' && !(Number.isInteger(a) && Number.isInteger(b) && a >= 18 && b <= 120 && a <= b)) return 'Faixa etária inválida: use inteiros a partir de 18 anos, com mínimo menor ou igual ao máximo.';
      if (!(inicio > 0 && fim > 0)) return 'Informe início e fim válidos.';
      if (fim <= inicio) return 'O fim precisa ser depois do início.';
      if (d.abr === 'sel' && !marcadas.length) return 'Marque ao menos uma unidade ou use “Todas as unidades”.';
      return '';
    })();
    if (msg) { er.camp = msg; ui.draft = d; return; }
    const antes = nova ? '' : resumoCamp(c); const velho = c.cupom;
    Object.assign(c, { nome, inicio, fim, un, publico, ativa: nova ? true : !!d.ativa, desc: (d.desc || '').trim() || (eCupom ? `Desconto de ${valor}% com o cupom ${cup}.` : c.desc) });
    if (comValor) c.valor = valor;
    if (eCupom) { Object.assign(c, { cupom: cup, idadeMin: publico === 'idade' ? a : c.idadeMin ?? 18, idadeMax: publico === 'idade' ? b : c.idadeMax ?? 25 }); if (!nova && velho && S.cupom === velho) S.cupom = cup; }
    if (nova) S.campanhas.unshift(c);
    audit(nova ? 'Campanha criada' : 'Campanha atualizada', nova ? `${c.nome}: ${resumoCamp(c)}` : `${c.nome}: ${antes} → ${resumoCamp(c)}`);
    er.camp = ''; er.campId = null; ui.draft = null; toast(nova ? 'Campanha criada' : 'Campanha atualizada');
  }

  function removerCamp(id) {
    const c = S.campanhas.find((x) => x.id === id); if (!c) return;
    if (!confirm(`Remover a campanha “${c.nome}”? Esta ação não pode ser desfeita.`)) return;
    S.campanhas = S.campanhas.filter((x) => x.id !== id);
    if (c.cupom && S.cupom === c.cupom) S.cupom = null;
    audit('Campanha removida', `${c.nome}: ${resumoCamp(c)}`); toast('Campanha removida');
  }

  function view() {
    if (!S.staff) return restrita();
    const p = S.staff.papel;
    return `<h1>Painel — ${PAPEL[p]}</h1><p>${S.staff.un ? `Unidade: <strong>${nomeUn(S.staff.un)}</strong>.` : 'Visão consolidada de toda a rede.'} <button class="btn sec" data-act="staff-sair">Sair</button></p>${{ atendente, cozinha, gerente, matriz: gerente }[p]()}`;
  }

  function seed() {
    if (S.pedidos.some((o) => o.demo)) { S.pedidos = S.pedidos.filter((o) => !o.demo); audit('Dados de exemplo', 'Removeu os pedidos fictícios'); return; }
    const canais = ['app', 'totem', 'balcao'];
    for (let i = 0; i < 14; i++) {
      const u = UNIDADES[i % 3]; const ps = PRODUTOS.filter((p) => p.un.includes(u.id));
      const itens = [0, 1].map((k) => { const p = ps[(i * 3 + k * 2) % ps.length]; return { id: p.id, nome: p.nome, q: 1 + ((i + k) % 3), preco: p.preco }; });
      S.pedidos.push({ id: `D${String(i + 1).padStart(3, '0')}`, un: u.id, itens, total: itens.reduce((a, x) => a + x.q * x.preco, 0), ref: `DEMO${i}`, criadoEm: Date.now() - i * 14400000, canal: canais[i % 3], etapa: 4, demo: true, pagto: ['pix', 'cartao', 'dinheiro'][i % 3], desconto: i % 4 === 0 ? 2 : 0 });
    }
    audit('Dados de exemplo', 'Gerou 14 pedidos fictícios');
  }

  function click(a, v) {
    if (!['staff-sair', 'kds', 'cancelar', 'seed', 'camp-del', 'pausa', 'periodo'].includes(a)) return false;
    if (!S.staff) return true;
    if (a === 'staff-sair') { audit('Logout', 'Saiu do painel'); S.staff = null; return true; }
    if (a === 'periodo') { ui.dias = +v; return true; }
    if (a === 'seed') { if (is('matriz')) seed(); return true; }
    if (a === 'camp-del') { if (is('matriz')) removerCamp(v); return true; }
    if (a === 'pausa') {
      if (is('gerente')) { S.pausa = { ...S.pausa, [S.unidade]: !S.pausa?.[S.unidade] }; audit('Pedidos online', `${nomeUn(S.unidade)}: ${S.pausa[S.unidade] ? 'pausados' : 'retomados'}`); }
      return true;
    }
    const [id, n] = v.split(':'); const o = S.pedidos.find((x) => x.id === id);
    if (!o) return true;
    if (S.staff.un && o.un !== S.staff.un) { toast('Este pedido é de outra unidade.'); return true; }
    if (a === 'kds') {
      const prox = +n; const permitido = (prox <= 3 && is('cozinha', 'gerente')) || (prox === 4 && is('atendente', 'gerente'));
      if (permitido && prox === etapaDe(o) + 1) { o.etapa = prox; toast(`Pedido #${o.id}: ${ETAPAS[prox]}`); } else toast('Ação não permitida para este pedido.');
      return true;
    }
    if (!is('atendente', 'gerente')) { toast('Seu perfil não pode cancelar pedidos.'); return true; }
    if (![1, 2].includes(etapaDe(o))) { toast('Só dá para cancelar pedidos que ainda não ficaram prontos.'); return true; }
    const m = (prompt('Motivo do cancelamento (obrigatório):') || '').trim();
    if (m.length < 5) { toast('Informe o motivo com pelo menos 5 caracteres.'); return true; }
    o.itens.forEach((i) => { if (i.id) S.estoque[`${o.un}:${i.id}`] = estoqueDe(i.id, o.un) + i.q; });
    const contas = new Set([S.user, S.contas.find((c) => c.email === o.uid)]);
    const estorno = o.uid && o.pontos ? o.pontos : 0;
    if (estorno) contas.forEach((c) => { if (c?.email === o.uid) c.pontos = Math.max(0, (c.pontos || 0) - estorno); });
    o.etapa = 0; o.motivo = m; o.estorno = { tipo: o.pagto === 'dinheiro' ? 'dinheiro' : 'pagamento', em: Date.now() };
    audit('Cancelamento', `Pedido #${o.id}: ${m} · ${o.estorno.tipo === 'dinheiro' ? 'devolução em dinheiro' : `estorno de ${brl(o.total)} solicitado`}${estorno ? ` · ${estorno} pontos estornados` : ''}`); toast('Pedido cancelado e estoque devolvido');
    return true;
  }

  function submit(tipo, d) {
    const e = ui.erros;
    if (!['balcao', 'estoque', 'camp-nova', 'camp-edit', 'sazonal'].includes(tipo)) return false;
    if (!S.staff) return true;
    if (tipo === 'sazonal') {
      if (!is('matriz')) return true;
      for (const p of PRODUTOS.filter((x) => x.sazonal)) {
        const i = new Date(d[`i_${p.id}`]).getTime(); const f = new Date(d[`f_${p.id}`]).getTime();
        if (!(i > 0 && f > i)) { e.sazonal = `Período inválido para “${p.nome}”: informe o início e um fim posterior.`; return true; }
        S.sazonais[p.id] = { inicio: i, fim: f }; audit('Temporada de produto', `${p.nome}: ${dt(i)} a ${dt(f)}`);
      }
      toast('Temporada atualizada'); return true;
    }
    if (tipo === 'camp-nova' || tipo === 'camp-edit') { if (is('matriz')) salvarCamp(d, tipo === 'camp-nova'); return true; }
    if (tipo === 'balcao') {
      if (!is('atendente')) return true;
      const itens = PRODUTOS.filter((p) => disp(p)).map((p) => ({ id: p.id, nome: p.nome, q: Math.floor(Number(d[`q_${p.id}`]) || 0), preco: p.preco })).filter((i) => i.q > 0);
      const desc = Number(d.desc || 0); const motivo = (d.motivo || '').trim();
      if (!itens.length) e.geral = 'Informe a quantidade de pelo menos um item.';
      else if (itens.some((i) => i.q > estoqueDe(i.id))) e.geral = 'Quantidade acima do estoque disponível.';
      if (!(desc >= 0 && desc <= 10)) e.desc = 'O desconto manual vai de 0% a 10%. Acima disso, só com o gerente.';
      else if (desc > 0 && motivo.length < 5) e.desc = 'Todo desconto exige motivo, com pelo menos 5 caracteres.';
      if (Object.keys(e).length) return true;
      const bruto = itens.reduce((a, i) => a + i.q * i.preco, 0); const total = bruto * (1 - desc / 100);
      const ped = novoPedido({ itens, total, ref: `BAL${Date.now().toString(36).toUpperCase()}`, canal: 'balcao', pagto: d.pagto, modo: 'local', desconto: +(bruto - total).toFixed(2) });
      S.pedidos.unshift(ped);
      if (desc > 0) audit('Desconto manual', `Pedido #${ped.id}: ${desc}% (${motivo})`);
      toast('Pedido enviado para a cozinha'); return true;
    }
    if (!is('gerente')) return true;
    const mud = [];
    for (const p of PRODUTOS.filter((x) => x.un.includes(S.unidade))) {
      const bruto = String(d[`e_${p.id}`] ?? '').trim(); const n = Number(bruto);
      if (bruto === '' || !Number.isInteger(n) || n < 0 || n > 999) { e.estoque = `Estoque de “${p.nome}” inválido: use um número inteiro de 0 a 999.`; return true; }
      if (n !== estoqueDe(p.id)) mud.push([p, n]);
    }
    mud.forEach(([p, n]) => { audit('Ajuste de estoque', `${p.nome} (${nomeUn(S.unidade)}): ${estoqueDe(p.id)} → ${n}`); S.estoque[`${S.unidade}:${p.id}`] = n; });
    toast(mud.length ? 'Estoque atualizado' : 'Nenhuma alteração'); return true;
  }

  async function entrar(email, senha) {
    const acc = ACESSOS[email]; if (!acc) return null;
    if ((await hashSenha(senha)) !== HASH_EQUIPE) return 'erro';
    S.staff = { ...acc, email, rotulo: PAPEL[acc.papel], ate: Date.now() + 15 * 60000 }; S.user = null;
    if (acc.un) S.unidade = acc.un;
    audit('Login', `Acesso como ${PAPEL[acc.papel]}${acc.un ? ` (${nomeUn(acc.un)})` : ''}`); return 'ok';
  }

  function expirar() {
    S.audit.push({ t: Date.now(), ator: PAPEL[S.staff.papel], un: S.staff.un ?? null, acao: 'Logout', detalhe: 'Sessão expirada por inatividade' }); S.staff = null;
  }

  return { view, viewCampanhas, click, submit, entrar, expirar };
}
