# Guia de contribuição

Receitas práticas para as mudanças mais comuns neste projeto. Leia
[`FRONTEND.md`](FRONTEND.md) primeiro para as convenções gerais — aqui é o
passo a passo aplicado.

## Adicionar uma tela nova para um papel (analista/supervisor/coordenador)

1. Adicione a entrada em `NAV.<papel>` (`frontend/js/ui.js`), com uma `k`
   (chave interna, minúscula, sem espaço) e um `label` (o que aparece no
   menu).
2. Na função `render<Papel>()` do arquivo correspondente
   (`render-analista.js` / `render-supervisor.js` / `render-coordenador.js`),
   adicione um `else if(activeNavKey==='sua-chave') content = suaFuncao(...)`.
3. Escreva `function suaFuncao(...)` retornando a string de HTML da tela.
   Reaproveite classes existentes (`.card`, `.section-title`, `.help-text`,
   `.filter-row`, `.csv-row`, `table`/`th`/`td`) em vez de estilo novo.
4. Se a tela tem formulário/ação, adicione os `data-*` nos elementos e o
   handler correspondente em `bindMainEvents()` (`events.js`) — veja os
   padrões de exclusão/filtro/modal em [`FRONTEND.md`](FRONTEND.md).
5. Teste abrindo `frontend/index.html` (direto ou via
   `npx http-server frontend`) e navegando até a tela nova.

## Adicionar um campo a uma entidade existente (ex.: lembretes, comunicados)

Todo recurso já tem CRUD próprio no backend (não existe mais blob
genérico — ver [`ARQUITETURA.md`](ARQUITETURA.md)), então um campo novo
precisa existir nos dois lados:

1. Adicione o campo no objeto `entrada`/`patch` montado no handler de
   criação/edição (`events.js`), que vai como corpo do
   `apiCreateX`/`apiUpdateX` correspondente (`state.js`).
2. Adicione o campo na whitelist do controller
   (`backend/src/controllers/<recurso>.controller.js` — `createX`/`updateX`
   já destroem `req.body` explicitamente; um campo que não está lá é
   silenciosamente ignorado) e no schema documentado em
   [`../db/README.md`](../db/README.md).
3. Se o campo deve ser editável depois de criado, adicione ao modal de
   edição correspondente (padrão `data-editar-x` → `openModal` com os
   valores atuais → `confirmEditarX` chama `apiUpdateX`).
4. Adicione a exibição do campo onde a entidade aparece (pode ser mais de
   um lugar — ex.: um lembrete aparece no card do analista, na caixa de
   envio do supervisor, e no histórico do coordenador).

## Adicionar exclusão/edição a uma lista existente

Padrão usado em todas as listas do projeto (Cadastros, Operações Fixas,
Cobertura, folgas/férias, etc.) — ver [`FRONTEND.md`](FRONTEND.md) →
"Mutações" para o modelo completo:

```js
// no template de render:
<button class="btn btn-danger" data-excluir-x="${item.id}">Excluir</button>

// em bindMainEvents():
main.querySelectorAll('[data-excluir-x]').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    if(!confirm('Excluir <descrição do que some>?')) return;
    const id = btn.dataset.excluirX;
    try{ await apiDeleteX(id); DB.x = DB.x.filter(i=>i.id!==id); renderMain(); }
    catch(e){ alert('Não foi possível excluir: '+e.message); }
  });
});
```
Para editar, troque o `confirm` por `openModal(...)` com os campos
preenchidos com os valores atuais do item, e o botão de confirmar chama
`apiUpdateX(id, patch)` (mesmo padrão try/catch). Se o recurso
tem regra de "quem pode mexer em quê" (a maioria tem — ver
`backend/README.md` → "Autenticação"), lembre de adicionar o
`apiCreateX`/`apiUpdateX`/`apiDeleteX` correspondente em `state.js` antes,
seguindo os que já existem lá.

## Adicionar um filtro de período a uma tela

1. Adicione `xFiltro: {inicio: addDaysISO(todayISO(), -N), fim: todayISO()}`
   ao `uiState` inicial (`state.js`).
2. No template da tela, adicione os dois `<input type="date"
   data-xfiltro="inicio">` / `data-xfiltro="fim"`.
3. Filtre o array de dados com `(r.data||'') >= inicio && (r.data||'') <= fim`.
4. Adicione o handler genérico (ver [`FRONTEND.md`](FRONTEND.md) → "Filtros
   com estado").

## Testar uma mudança

Não há suíte de testes automatizada. O fluxo usado durante todo o
desenvolvimento deste projeto:

1. Suba o backend (`cd backend && npm run dev`) com um `.env` apontando pro
   seu projeto Firebase, e sirva `frontend/` (`npx http-server frontend
   -p 8080` ou abra `frontend/index.html` direto via `file://`, ambos
   funcionam).
2. Faça login com e-mail/senha de um usuário existente — não existe mais
   modo offline/demonstração, login sempre passa pelo Firebase Auth e pelo
   backend de verdade.
3. Navegue manualmente até a tela alterada, nos três papéis relevantes
   (analista/supervisor/coordenador) quando a mudança os afeta.
4. Confira o console do navegador — não deve aparecer nenhum erro. Se o
   backend estiver fora do ar, o login falha explicitamente (mensagem na
   tela), não existe fallback silencioso.
5. Se a mudança envolve fluxo de várias etapas (formulário → salvar →
   aparecer na lista → editar → excluir), teste o ciclo completo — inclusive
   um **reload da página** depois de salvar, pra confirmar que gravou de
   verdade no Firestore e não só na memória — antes de considerar pronto.

## Antes de apagar algo

Sem git neste projeto, apagar é definitivo. Antes de remover um arquivo,
função ou classe CSS:

```powershell
# função/constante JS: procure por todo o projeto, não só onde foi definida
Select-String -Path frontend\js\*.js,frontend\index.html -Pattern "nomeDaCoisa"

# classe CSS: procure em todo o frontend
Select-String -Path frontend\css\*.css,frontend\js\*.js,frontend\index.html -Pattern "nome-da-classe"
```
Se a única ocorrência for a própria definição, é seguro remover.
