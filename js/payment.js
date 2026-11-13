// Gateway externo simulado. O front só solicita, recebe confirmação ou negativa e registra.
// A chave de idempotência evita cobrança em duplicidade quando a mesma solicitação é repetida.
// Cartão final 0: recusado. Final 9: não responde na 1ª tentativa e se recupera na 2ª. Final 8: não responde nunca.
const registro = new Map();
const tentativas = new Map();
const TEMPO_LIMITE = 8000;

function gateway({ chave, valor, metodo, numero = '' }) {
  return new Promise((resolve) => {
    const final = numero.replace(/\D/g, '').slice(-1);
    setTimeout(() => {
      if (registro.has(chave)) return resolve({ ...registro.get(chave), repetido: true });
      const n = (tentativas.get(chave) || 0) + 1; tentativas.set(chave, n);
      const ref = `TX${chave.slice(-8).toUpperCase()}`;
      if (metodo === 'cartao' && (final === '8' || (final === '9' && n < 2))) return resolve({ status: 'timeout', ref });
      const r = metodo === 'cartao' && final === '0'
        ? { status: 'recusado', motivo: 'Saldo ou limite insuficiente.', ref }
        : { status: 'aprovado', valor, ref };
      registro.set(chave, r); resolve(r);
    }, 1200);
  });
}

export function solicitarPagamento(dados) {
  const limite = new Promise((resolve) => setTimeout(() => resolve({ status: 'timeout' }), TEMPO_LIMITE));
  return Promise.race([gateway(dados), limite]);
}
