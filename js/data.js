export const UNIDADES = [
  { id: 'rec', uf: 'PE', regiao: 'Litoral', meta: 4000, nome: 'Recife — Boa Viagem', cozinha: 'completa' },
  { id: 'cg', uf: 'PB', regiao: 'Interior', meta: 3000, nome: 'Campina Grande — Centro', cozinha: 'completa' },
  { id: 'for', uf: 'CE', regiao: 'Litoral', meta: 3500, nome: 'Fortaleza — Aldeota', cozinha: 'reduzida' },
];
export const CATEGORIAS = ['Tapiocas', 'Cuscuz', 'Bebidas', 'Doces'];
const todas = ['rec', 'cg', 'for'];
export const PRODUTOS = [
  { id: 't1', nome: 'Tapioca de queijo coalho', desc: 'Queijo coalho derretido e manteiga de garrafa.', preco: 14.9, cat: 'Tapiocas', em: '🫓', un: todas },
  { id: 't2', nome: 'Tapioca de carne de sol', desc: 'Carne de sol desfiada com queijo.', preco: 19.9, cat: 'Tapiocas', em: '🫓', un: ['rec', 'cg'] },
  { id: 'c1', nome: 'Cuscuz com ovo', desc: 'Cuscuz de milho quentinho com ovo mexido.', preco: 12.5, cat: 'Cuscuz', em: '🍳', un: todas },
  { id: 'c2', nome: 'Cuscuz recheado de frango', desc: 'Recheio de frango desfiado temperado.', preco: 18.5, cat: 'Cuscuz', em: '🍲', un: ['rec', 'cg'] },
  { id: 'b1', nome: 'Café coado na hora', desc: 'Café fresco, 200 ml.', preco: 6.0, cat: 'Bebidas', em: '☕', un: todas },
  { id: 'b2', nome: 'Suco de cajá', desc: 'Polpa natural, 300 ml.', preco: 9.5, cat: 'Bebidas', em: '🥤', un: todas },
  { id: 'd1', nome: 'Bolo de macaxeira', desc: 'Fatia generosa, massa úmida.', preco: 8.9, cat: 'Doces', em: '🍰', un: todas },
  { id: 'd2', nome: 'Canjica cremosa', desc: 'Edição junina: milho, leite e canela.', preco: 11.0, cat: 'Doces', em: '🥣', un: ['rec', 'cg'], sazonal: true },
];
export const NIVEIS = [
  { n: 'Bronze', min: 0, desc: 0 },
  { n: 'Prata', min: 100, desc: 0.05 },
  { n: 'Ouro', min: 300, desc: 0.1 },
];
export const FREQ = { min: 3 };
export const RECOMPENSAS = [
  { id: 'cafe', nome: 'Café coado grátis', custo: 30, produto: 'b1' },
  { id: 'bolo', nome: 'Bolo de macaxeira grátis', custo: 60, produto: 'd1' },
  { id: 'tapioca', nome: 'Tapioca de queijo coalho grátis', custo: 120, produto: 't1' },
];
export const ESTOQUE_INICIAL = 30;
// Campanhas iniciais. A matriz pode pausar, mudar prazo, desconto e unidades, e criar novas.
export const campanhasIniciais = () => {
  const ini = new Date().setHours(0, 0, 0, 0); const base = { ativa: true, inicio: ini, fim: ini + 30 * 864e5, un: [], publico: 'todos' };
  return [
    { ...base, id: 'c1', nome: 'Semana junina', desc: 'Desconto da temporada junina com o cupom SAOJOAO10.', tipo: 'cupom', cupom: 'SAOJOAO10', valor: 10 },
    { ...base, id: 'c2', nome: 'Cupom Raízes', desc: 'Desconto de boas-vindas com o cupom RAIZES5.', tipo: 'cupom', cupom: 'RAIZES5', valor: 5 },
    { ...base, id: 'c3', nome: 'Combo Jovem', desc: 'Desconto para 18 a 25 anos com o cupom JOVEM10.', tipo: 'cupom', cupom: 'JOVEM10', valor: 10, publico: 'idade', idadeMin: 18, idadeMax: 25 },
    { ...base, id: 'c4', nome: 'Pontos em dobro no cuscuz', desc: 'Cada R$ 1,00 em cuscuz rende um ponto extra.', tipo: 'pontos-cuscuz' },
    { ...base, id: 'c5', nome: 'Cliente frequente', desc: 'A partir do 4º pedido, bônus de pontos a cada pedido.', tipo: 'bonus-freq', valor: 20, publico: 'frequentes' },
  ];
};
