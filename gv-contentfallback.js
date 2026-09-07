/* ============================================================
   GV RUN — Fallback de conteúdo (Etapa técnica, sem risco)
   ------------------------------------------------------------
   Prepara a transição do WEEKS hardcoded para o conteúdo vindo
   do Supabase (monthly_blocks/session_exercises), SEM quebrar o
   programa de 8 semanas que já está no ar.

   Como funciona: quando uma sessão é aberta, o app renderiza a
   lista de sempre (WEEKS). Este arquivo então checa, de forma
   assíncrona, se existe um bloco PUBLICADO no Supabase para o
   mês/tipo de sessão. Se existir, substitui a lista pela versão
   nova. Se não existir (o caso de hoje — nada publicado ainda),
   não faz nada, e o aluno nunca percebe diferença.

   Mapeamento de sessão (provisório, até a UI ganhar C1/C2 separados):
     M -> diario | B -> B | C -> C1

   Requer: gv-auth-sync.js (usa `sb`), openSession/curChecks/
   updateDoneBtn já definidos no index.html.
   Carregar por ÚLTIMO, depois de gv-runlog.js, antes de </body>:
   <script src="gv-contentfallback.js"></script>
   ============================================================ */
(function () {

  const SESSION_TYPE_MAP = { M: "diario", B: "B", C: "C1" };

  // por enquanto, sempre tenta o mês 1 — nenhum aluno é assinante
  // anual ainda, então isso é inerte até o dia em que existir
  // conteúdo publicado. Quando a assinatura anual entrar em uso
  // de verdade, trocar por uma leitura de S.current_month.
  function currentMonthNumber() {
    return (typeof S === "object" && S && S.current_month) ? S.current_month : 1;
  }

  async function loadPublishedSession(monthNumber, sessionType) {
    try {
      const { data: block, error: e1 } = await sb.from("monthly_blocks")
        .select("id, is_published").eq("month_number", monthNumber).eq("is_published", true).maybeSingle();
      if (e1 || !block) return null;

      const { data: session, error: e2 } = await sb.from("block_sessions")
        .select("id, title").eq("block_id", block.id).eq("session_type", sessionType).maybeSingle();
      if (e2 || !session) return null;

      const { data: items, error: e3 } = await sb.from("session_exercises")
        .select("order_index, prescription, notes, exercises(name, video_url)")
        .eq("session_id", session.id).order("order_index", { ascending: true });
      if (e3 || !items || !items.length) return null;

      return {
        title: session.title,
        items: items.map(it => ({
          n: (it.exercises && it.exercises.name) || "(exercício)",
          d: it.prescription || "",
          video: it.exercises ? it.exercises.video_url : null
        }))
      };
    } catch (e) {
      console.error("fallback de conteúdo: falha ao consultar Supabase", e);
      return null;
    }
  }

  function renderFromSupabase(t, content) {
    const list = document.getElementById("sesList");
    const titleEl = document.getElementById("sesTitle");
    if (!list) return;
    if (titleEl && content.title) titleEl.textContent = content.title;

    list.innerHTML = content.items.map((e, i) => `
      <div class="ex" id="ex${i}" onclick="toggleEx(${i})">
        <div class="box"></div>
        <div style="flex:1">
          <div class="nm">${e.n}</div>
          <div class="ds">${e.d}</div>
          ${e.video ? `<a class="vid" href="#" onclick="event.stopPropagation();event.preventDefault();openVideo('${e.video}')">▶ ver vídeo do exercício</a>` : ""}
        </div>
      </div>`).join("");

    // reseta o estado de "marcado" e a contagem do botão, mesma lógica do app original
    if (typeof window.curChecks === "object") window.curChecks = {};
    try { curChecks = {}; } catch (e) {} // curChecks é uma variável do escopo do index.html; ambas tentativas cobrem os dois jeitos de acesso
    if (typeof window.updateDoneBtn === "function") window.updateDoneBtn(content.items.length);
  }

  const _prevOpenSession = window.openSession;
  window.openSession = function (t) {
    if (typeof _prevOpenSession === "function") _prevOpenSession(t);
    const sessionType = SESSION_TYPE_MAP[t];
    if (!sessionType) return; // tipo sem mapeamento (não deveria acontecer com M/B/C)

    setTimeout(async () => {
      const sesView = document.getElementById("vSession");
      if (!sesView || sesView.classList.contains("hidden")) return; // gate de dor pode ter impedido a sessão de abrir

      const content = await loadPublishedSession(currentMonthNumber(), sessionType);
      if (content) {
        console.log("fallback de conteúdo: usando bloco publicado do Supabase para", t, "->", sessionType);
        renderFromSupabase(t, content);
      }
      // se content for null (caso de hoje), não faz nada — a lista de sempre (WEEKS) permanece
    }, 60);
  };

})();
