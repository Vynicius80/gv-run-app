/* ============================================================
   GV RUN — Lembrete de inatividade (Home)
   ------------------------------------------------------------
   Mostra um aviso caloroso na Home quando o aluno passa alguns
   dias sem treinar. Tom cresce com o tempo, nunca com culpa.
   Trata separadamente quem nunca fez a primeira sessão (usa a
   data de início do programa) de quem já treinou e sumiu (usa
   a última sessão registrada).

   Requer: nada além do que já existe (S, window.show).
   Carregar por último, depois de gv-contentfallback.js:
   <script src="gv-inactivity.js"></script>
   ============================================================ */
(function () {

  const css = `
  .ia-banner{border-radius:14px;padding:13px 15px;font-size:13.5px;line-height:1.55;margin-bottom:14px}
  .ia-banner.gentle{background:rgba(87,160,255,.08);border:1px solid var(--line);color:var(--ice)}
  .ia-banner.firm{background:rgba(227,160,8,.1);border:1px solid rgba(227,160,8,.35);color:#F3DFAE}
  .ia-banner b{color:#fff}
  `;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function daysSince(dateStr) {
    if (!dateStr) return null;
    return Math.floor((Date.now() - new Date(dateStr + "T00:00:00").getTime()) / 864e5);
  }

  function computeStatus() {
    if (typeof S !== "object" || !S) return null;
    const sessions = S.sessions || [];
    if (sessions.length) {
      const lastDate = sessions.reduce((max, s) => (!max || s.d > max) ? s.d : max, null);
      return { days: daysSince(lastDate), mode: "retomada" };
    }
    if (S.start) {
      return { days: daysSince(S.start), mode: "ativacao" };
    }
    return null;
  }

  function bannerFor(info) {
    if (!info || info.days === null || info.days < 0) return null;
    const { days, mode } = info;

    if (mode === "ativacao") {
      if (days >= 3) {
        return { tone: "gentle", html: `👋 Você criou seu perfil há <b>${days} dias</b>. Bora fazer sua primeira sessão? Começa com a mobilidade, é rápido.` };
      }
      return null;
    }

    if (days >= 14) {
      return { tone: "firm", html: `🌱 Sentimos sua falta! Já fazem <b>${days} dias</b> desde o seu último treino. Sem problema — vamos retomar no seu ritmo, começando pela mobilidade.` };
    }
    if (days >= 7) {
      return { tone: "firm", html: `Faz <b>${days} dias</b> desde o seu último treino. Retomar aos poucos ajuda a não perder o que você já construiu.` };
    }
    if (days >= 3) {
      return { tone: "gentle", html: `Já fazem <b>${days} dias</b> desde sua última sessão. Que tal um treino rápido hoje?` };
    }
    return null;
  }

  function render() {
    const home = document.getElementById("vHome");
    if (!home) return;
    let holder = document.getElementById("iaBannerHolder");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "iaBannerHolder";
      const h2 = home.querySelector("h2.sec");
      if (h2) h2.before(holder); else home.prepend(holder);
    }
    const info = computeStatus();
    const b = bannerFor(info);
    holder.innerHTML = b ? `<div class="ia-banner ${b.tone}">${b.html}</div>` : "";
  }

  const _prevShow = window.show;
  window.show = function (id) {
    if (typeof _prevShow === "function") _prevShow(id);
    if (id === "vHome") {
      try { render(); } catch (e) { console.error("lembrete de inatividade falhou", e); }
    }
  };

})();
