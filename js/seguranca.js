// Simulação de armazenamento seguro de senha: hash SHA-256 com sal.
// Em produção isso acontece no servidor, com um algoritmo lento (bcrypt ou argon2).
// Requer HTTPS ou localhost (SubtleCrypto); fora disso usa um valor diferente e o login da equipe não funciona.
const SAL = 'raizes-nordeste-v1';

export async function hashSenha(senha) {
  if (!globalThis.crypto?.subtle) return `inseguro:${btoa(unescape(encodeURIComponent(senha)))}`;
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${SAL}:${senha}`));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
