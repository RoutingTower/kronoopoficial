# Frontend

Sem framework, sem bundler, sem `npm install`. HTML + CSS + JS carregados
via `<script src="...">` clássico (não `type="module"` — isso é proposital,
ver "Por que não ES modules" abaixo).

## Estrutura

```
frontend/
  index.html              esqueleto HTML (login + shell do app + modal), carrega tudo abaixo
  css/
    style.css              todo o CSS, incluindo o tema dark (:root[data-theme="dark"])
  js/
    config.js                API_BASE e firebaseConfig — único arquivo que muda entre dev/produção
    firebase-init.js         inicializa o Firebase Auth (SDK "compat") e expõe window.KronoAuth
    utils.js                 funções puras: datas, formatação, CSV/Excel, cálculo de status
    state.js                 DB em memória, seedDB(), loadDB(), apiRequest() + apiCreateX/apiUpdateX/apiDeleteX por recurso, uiState
    ui.js                    login (real + modo demonstração), navegação (NAV, buildNav, visibleNavItems), modal, renderMain (roteador)
    render-analista.js       telas do papel Analista
    render-supervisor.js     telas do papel Supervisor
    render-coordenador.js    telas do papel Coordenador
    events.js                bindMainEvents() — todo listener de clique/change do #mainArea
    main.js                  bootstrap: listeners fixos (logout, modal, tema) + initLogin() + onAuthStateChanged (entra sozinho se já tinha sessão)
```

**Ordem de carregamento importa em dois pontos**: `config.js` e
`firebase-init.js` precisam vir antes de tudo (definem `API_BASE` e
`KronoAuth`, usados por `state.js`/`main.js`); `utils.js` precisa vir antes
de `state.js`, porque `uiState` (em `state.js`) chama `todayISO()` e
`addDaysISO()` (em `utils.js`) na própria inicialização do objeto. Fora
isso, como tudo é `function`/`const` de topo-nível compartilhando o mesmo
escopo global, a ordem entre os demais arquivos não quebra nada — só é
mantida em ordem lógica de leitura.

## Convenções (siga estas ao adicionar algo novo)

### Renderização
Não há virtual DOM nem reatividade. Todo `render*()` retorna uma *string*
de HTML; `renderMain()` (em `ui.js`) decide qual função chamar com base em
`session.role` + `activeNavKey` e faz `main.innerHTML = <string>`. Depois de
**todo** `innerHTML =`, `renderMain()` chama `bindMainEvents()` de novo —
os listeners são re-anexados do zero a cada render, então nunca guarde
referência a um elemento do `#mainArea` entre renders.

### Eventos
Elementos interativos dentro de telas usam `data-<algo>="valor"` no HTML e
são pegos em `events.js` via `main.querySelectorAll('[data-algo]')`.
Elementos **fixos** que nunca são recriados (`#logoutBtn`, `#modalBg`,
`#btnPersonalizarMenu`, `.theme-switch-input`) são ligados uma única vez em
`main.js`, não em `bindMainEvents()`.

### Mutações (criar/editar/excluir)
Cada recurso tem endpoint próprio (ver `backend/README.md` → "Módulos
implementados") — não existe mais um `saveDB()` genérico. Todo handler de
mutação segue o mesmo padrão: monta o objeto (`entrada`/`patch`) → se
`session.demoMode`, muta `DB` localmente e re-renderiza (sem tocar rede) →
senão, `try { await apiCreateX/apiUpdateX/apiDeleteX(...); muta DB local
com a resposta; renderMain(); } catch(e){ alert('Não foi possível ...: '+e.message); }`.
Os helpers `apiCreateX`/`apiUpdateX`/`apiDeleteX` (em `state.js`) já
anexam o Firebase ID token e lançam com a mensagem que o backend manda.
Exemplo (`data-excluir-suplencia`):
```js
main.querySelectorAll('[data-excluir-suplencia]').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    if(!confirm('Excluir esta cobertura avulsa?')) return;
    const id = btn.dataset.excluirSuplencia;
    if(session.demoMode){ DB.suplencias = DB.suplencias.filter(x=>x.id!==id); renderMain(); return; }
    try{ await apiDeleteSuplencia(id); DB.suplencias = DB.suplencias.filter(x=>x.id!==id); renderMain(); }
    catch(e){ alert('Não foi possível excluir: '+e.message); }
  });
});
```

### Modais
`openModal(htmlString)` / `closeModal()` (em `ui.js`) escrevem no
`#modalBody` fixo e mostram `#modalBg`. Todo modal de formulário segue:
botão `data-modal-cancel` → `closeModal`, botão de confirmar com `id`
próprio (`confirmXxx`) → valida, segue o padrão de mutação acima
(demoMode local vs. `apiCreateX`/`apiUpdateX` com try/catch), termina com
`closeModal(); renderMain();`.

### Filtros com estado (data + dropdown)
Todo filtro de período segue o mesmo padrão, visto em Métricas, Ocorrências,
Caixa de Envio e Grade do Dia: estado em `uiState.xFiltro = {inicio, fim,
...}`, inputs com `data-xfiltro="inicio"`/`"fim"`, handler genérico:
```js
main.querySelectorAll('[data-xfiltro]').forEach(inp=>{
  inp.addEventListener('change', ()=>{
    uiState.xFiltro[inp.dataset.xfiltro] = inp.value;
    renderMain();
  });
});
```

### Importação em massa
CSV usa `downloadCSV()`/`parseCSV()`/`readFileAsText()`; Excel usa
`downloadXLSX()`/`parseXLSX()`/`readFileAsArrayBuffer()` (biblioteca
[SheetJS](https://sheetjs.com), carregada via CDN em `index.html` — única
dependência externa do frontend). Ambos os fluxos: baixar modelo → usuário
preenche → `<input type="file" style="display:none">` disparado por um
`<label class="btn">` → parse → validar linha a linha (contar `ok`/`fail`)
→ `alert()` com o resumo.

### Tema (light/dark)
Toda cor vem de variável CSS (`var(--bg)`, `var(--panel)`, `var(--text)`,
etc., definidas em `:root` e sobrescritas em `:root[data-theme="dark"]`).
**Nunca** hardcode uma cor de fundo/texto num template — use as variáveis,
senão o elemento fica ilegível quando o usuário troca de tema. O tema é
lido de `localStorage('kronoop-theme')`, aplicado o mais cedo possível por
um script inline no `<head>` do `index.html` (evita flash de tela clara), e
alternado pelos `.theme-switch` (ao lado do título "KronoOP", no login e na
sidebar).

### Personalização de menu
`NAV` (em `ui.js`) define os itens padrão por papel. `visibleNavItems()`
aplica `user.navConfig = {order, hidden}` se o usuário personalizou o menu
(modal "Personalizar menu"). Ao adicionar um item novo em `NAV`, ele
aparece automaticamente no fim do menu de quem já personalizou — não
precisa migração.

## Por que não ES modules

`<script type="module">` bloqueia `import` de arquivos locais quando a
página é aberta via `file://` (Chrome recusa por CORS) — e rodar
`index.html` direto, sem servidor, é um requisito do projeto (ver
`README.md` raiz). Por isso os módulos são scripts clássicos que
compartilham o escopo global do `window`, na ordem dos `<script src="...">`
em `index.html`.
