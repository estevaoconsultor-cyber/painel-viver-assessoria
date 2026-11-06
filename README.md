# Painel Viver Assessoria

Painel de suporte ao corretor parceiro da Viver Assessoria (visão Gestor e visão Corretor).

- `index.html` — painel (login, menus, Carol, Esteira de vínculos, jornada, treinamentos, kit de design, banco de leads, links úteis)
- `simulador.html` — simulador de preços Hapvida (menu "Simulador de preços")
- `financeiro.html` — painel financeiro (menu "Painel financeiro", só gestor; abre como dashboard própria)
- `glass.webp`, `logo.webp` — logomarca

Site estático: na Vercel, importe o repositório sem framework e sem comando de build.

Carol (assistente): responde pelo Claude quando o portal é aberto pelo link do Claude. Na cópia hospedada (Vercel), preencha `CAROL_API` no `index.html` com o endereço de uma função própria (ex.: Supabase) que receba `{mensagens}` e devolva `{resposta}`.

## Login e dados reais (Supabase, projeto `viver-portal`)

- `nuvem.js` — login real, dados das corretoras, esteira gravada no banco, menu Acessos e aviso "+1 corretor concluído"
- `supabase.js` — biblioteca do Supabase (v2.45.4), servida pelo próprio site
- `supabase/functions/viver-usuarios` — função que cria, pausa, reativa, exclui e troca a senha dos usuários (só gestor Viver)

Perfis: **gestor** (Viver, vê tudo), **hapvida** (vê tudo menos Pedidos e Acessos), **corretor** (só a própria corretora).
Quem entra com usuário (nome.sobrenome) em vez de e-mail recebe um e-mail interno `@acesso.viverassessoriacomercial.com.br`.

O link do Claude continua sendo a versão de demonstração (dados de exemplo); o site usa só dados reais.
