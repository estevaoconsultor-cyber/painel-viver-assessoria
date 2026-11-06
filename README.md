# Painel Viver Assessoria

Painel de suporte ao corretor parceiro da Viver Assessoria (visão Gestor e visão Corretor).

- `index.html` — painel (login, menus, Carol, Esteira de vínculos, jornada, treinamentos, kit de design, banco de leads, links úteis)
- `simulador.html` — simulador de preços Hapvida (menu "Simulador de preços")
- `financeiro.html` — painel financeiro (menu "Painel financeiro", só gestor; abre como dashboard própria)
- `glass.webp`, `logo.webp` — logomarca

Site estático: na Vercel, importe o repositório sem framework e sem comando de build.

Carol (assistente): responde pelo Claude quando o portal é aberto pelo link do Claude. Na cópia hospedada (Vercel), preencha `CAROL_API` no `index.html` com o endereço de uma função própria (ex.: Supabase) que receba `{mensagens}` e devolva `{resposta}`.

Versão de demonstração: login aceita qualquer senha e os dados são de exemplo.
