# Raízes do Nordeste: front-end

Interface mobile-first para a rede de lanchonetes Raízes do Nordeste, com três canais de atendimento (App/Web, Totem e Balcão) e painéis para a equipe das unidades e para a matriz.

Projeto acadêmico da trilha Front-end, entrega técnica na opção B (codificação): HTML, CSS e JavaScript puros, com dados mockados. O documento completo (requisitos, diagramas, wireframes, plano de testes e conclusão) está no PDF entregue junto com este repositório.

Autor: `Marcos Vinicius Alves de Souza`. RU: `5042523`. Curso e disciplina: `CST ANÁLISE E DESENVOLVIMENTO DE SISTEMAS - DISTÂNCIA (2701)`.

## Links

| O quê | Endereço |
|---|---|
| Site publicado (App/Web) | `https://m4rc0sv.github.io/raizes-do-nordeste/` |
| Totem | `https://m4rc0sv.github.io/raizes-do-nordeste/?canal=totem` |
| Modo demonstração (mostra dicas de teste) | `https://m4rc0sv.github.io/raizes-do-nordeste/?demo` |
| Repositório | `https://github.com/m4rc0sv/raizes-do-nordeste` |

## Roteiro de testes

1. Abra o site e responda ao aviso de privacidade (**Aceitar todos** ou **Só o essencial**).
2. No cardápio, troque a **unidade** no topo. Fortaleza tem cozinha reduzida e alguns itens ficam indisponíveis.
3. Em **Conta**, escolha **Criar conta** e cadastre-se. A data de nascimento é opcional e só é guardada se você marcar a autorização de ofertas personalizadas.
4. Adicione itens, aplique um cupom no **Carrinho** e finalize no pagamento: escolha retirar na loja (com horário) ou consumir no local, e pague com **Pix** (aprova) ou **cartão**.
5. Em **Pedidos**, acompanhe o status. Em **Pontos**, veja o saldo, o extrato e as recompensas. Em **Privacidade**, ajuste os consentimentos, baixe ou exclua seus dados.
6. Para ver a equipe: em **Conta**, saia e entre com um e-mail da tabela abaixo. Surgem as abas do perfil (por exemplo, entre como cozinha, avance o pedido e volte como cliente para ver o novo status).
7. Para o totem, abra o endereço com `?canal=totem`. O pedido é feito sem login.

## Dados de teste

Equipe (senha `raizes123`; entra pela aba **Conta**, com e-mail corporativo):

| Perfil | E-mail | O que vê |
|---|---|---|
| Atendente | `atendente.rec@raizes.com` | Pedido de balcão e fila da própria unidade |
| Cozinha | `cozinha.rec@raizes.com` | Fila de preparo da própria unidade |
| Gerente da unidade | `gerente.rec@raizes.com` | Vendas, estoque, pausa de pedidos online e auditoria da unidade |
| Matriz (administrador) | `matriz@raizes.com` | Toda a rede: relatórios, campanhas e temporadas |

Troque `rec` (Recife) por `cg` (Campina Grande) ou `for` (Fortaleza) para as outras unidades. Na matriz, o botão **Gerar dados de exemplo** preenche os relatórios.

Cartões (qualquer validade futura, como `12/29`, e CVV de 3 dígitos; número de 16 dígitos):

| Final do número | Resultado |
|---|---|
| qualquer outro | Aprovado |
| 0 | Recusado (limite insuficiente) |
| 9 | Falha na primeira tentativa e se recupera sozinho |
| 8 | Serviço de pagamento fora do ar (esgota as 3 tentativas) |

Cupons: `SAOJOAO10` (10%), `RAIZES5` (5%) e `JOVEM10` (10%, só para 18 a 25 anos com ofertas personalizadas autorizadas e data de nascimento no perfil).

Sem internet: nas ferramentas do navegador (F12), em Rede, escolha *Offline*. O aviso aparece e o pagamento é bloqueado.

## Requisitos da Trilha e onde ver

| Requisito | Onde ver |
|---|---|
| Cadastro e autenticação | Conta (cliente e equipe) |
| Cardápio por unidade | Cardápio, com o seletor de unidade |
| Realização de pedidos | Carrinho e Pagamento (retirada ou consumo no local) |
| Acompanhamento do status | Pedidos (cliente) e fila da Cozinha (equipe) |
| Programa de fidelização e recompensas | Pontos (níveis, extrato e vales de item grátis) |
| Promoções e campanhas | Banner do Cardápio e Pontos; gestão na aba Campanhas (matriz) |
| Pagamento por serviço externo | Pagamento: solicitação, confirmação ou negativa, repetição automática e estorno |
| LGPD na interface | Aviso de consentimento, Central de privacidade, consentimento separado para idade, exportar, retificar e excluir dados |
| Multicanal | App/Web, Totem (`?canal=totem`) e Balcão (perfil Atendente) |
| Mobile-first e responsivo | Verificado em 360 px e 1280 px |
| Atores | Cliente, Atendente, Cozinha, Gerente/Administrador e serviço de pagamento (simulado) |

## Rodar localmente

Os módulos ES exigem um servidor HTTP (não funciona abrindo o `index.html` direto):

```
npm start
```

Depois abra http://localhost:8080. Sem Node, use `python3 -m http.server 8080`.

## Testes

Há 46 testes automatizados que abrem o app num navegador real: 42 de fluxos (positivos e negativos, com mensagens de erro, segurança básica e carga inicial) e 4 de acessibilidade e usabilidade (rolagem horizontal, contraste, nomes acessíveis, alvos de toque e navegação por teclado, nos temas claro e escuro).

```
npm install
npx playwright install chromium
npm test
```

Os testes sobem o próprio servidor e levam cerca de dois minutos.

## Tecnologias e estrutura

HTML, CSS e JavaScript puros (módulos ES), sem build. O Playwright é usado só nos testes.

```
index.html          página única (as telas são montadas por rotas com #)
css/styles.css      estilos, tema claro e escuro
js/app.js           estado, rotas e telas do cliente
js/data.js          dados mockados (unidades, cardápio, campanhas, níveis)
js/payment.js       serviço de pagamento simulado (tentativas e idempotência)
js/equipe.js        painéis da equipe e da matriz (carregado só para a equipe)
js/seguranca.js     hash de senha com sal (simulação)
sw.js               cache para uso sem internet
tests/              testes automatizados
```