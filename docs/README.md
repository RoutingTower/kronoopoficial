# Documentação do KronoOP

Índice de tudo que existe hoje para orientar quem for continuar o
desenvolvimento deste projeto. Comece por aqui.

## Onde encontrar cada coisa

| Preciso saber... | Vá para |
|---|---|
| Visão geral do projeto, estrutura de pastas, estado atual | [`README.md`](../README.md) (raiz) |
| Como as peças se encaixam (frontend ↔ backend ↔ banco) | [`ARQUITETURA.md`](ARQUITETURA.md) |
| Como o frontend é organizado e as convenções usadas nele | [`FRONTEND.md`](FRONTEND.md) |
| Como rodar/implementar o backend, quais endpoints existem | [`../backend/README.md`](../backend/README.md) |
| O formato de cada coleção do banco (users, lembretes, raioX, ...) | [`../db/README.md`](../db/README.md) |
| Como criar e configurar o projeto Firebase do zero, passo a passo | [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md) |
| Como adicionar uma tela, um filtro, uma exclusão, etc. — passo a passo | [`GUIA-DE-CONTRIBUICAO.md`](GUIA-DE-CONTRIBUICAO.md) |
| O que falta fazer, em ordem de prioridade | [`ROADMAP.md`](ROADMAP.md) |
| **Guia único para leigos, do zero ao site no ar (Google Cloud)** | [`PASSO-A-PASSO-IMPLEMENTACAO.md`](PASSO-A-PASSO-IMPLEMENTACAO.md) |
| Como publicar (Firebase + GitHub Pages + Render), passo a passo | [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md) |
| Como publicar no Google Cloud (Firebase Hosting + Cloud Run), versão resumida | [`COMO-PUBLICAR-GOOGLE-CLOUD.md`](COMO-PUBLICAR-GOOGLE-CLOUD.md) |

## Regra de ouro

Este projeto não tem build step nem testes automatizados no repositório.
Depois de seguir [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md), você vai ter um
repositório Git próprio e dois deploys automáticos (frontend no GitHub
Pages, backend no Render, ambos redeployando a cada push em `master`).
Isso significa:

- **Teste manualmente antes de considerar algo pronto.** Suba o backend
  (`cd backend && npm run dev`) e sirva o frontend com qualquer servidor
  estático (`npx http-server frontend -p 8080`), ou simplesmente abra
  `frontend/index.html` direto no navegador (funciona standalone, cai em
  dados simulados se o backend não responder).
- **Antes de apagar algo, confirme que nada o referencia** — grep pelo
  nome do arquivo/função em todo o projeto. O git permite desfazer, mas
  evite depender disso como rede de segurança.
- **`backend/.env` nunca deve ser commitado** — já está no `.gitignore`,
  mas confira `git status` antes de um `git add -A` se algo parecer
  estranho. Variáveis de ambiente em produção ficam configuradas direto
  no dashboard do Render, não no repositório.
- **Mantenha esta documentação e os `README.md` de cada pasta em dia.**
  Eles já ficaram desatualizados antes (o `db/README.md` descrevia campos
  que não existiam mais) — quando mudar o schema de uma coleção, a
  estrutura de pastas, ou a infraestrutura de deploy, atualize o doc
  correspondente no mesmo commit/sessão.
