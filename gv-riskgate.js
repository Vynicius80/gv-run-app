/* ============================================================
   GV RUN — Gatilho de risco (Etapa 3d)
   ------------------------------------------------------------
   Encaixa por cima de logPain (que já existe em gv-clinic.js):
   toda vez que o semáforo é registrado — pelo botão simples ou
   pelo mapa de dor — grava em risk_events. Quando detecta 3
   vermelhos seguidos que ainda não foram sinalizados, mostra a
   tela de transição para avaliação profissional, uma vez por
   sequência (não insiste a cada vermelho novo).

   Requer: gv-auth-sync.js (usa `sb`/`GVCloud`) e logPain já
   definido (gv-clinic.js).
   Carregar DEPOIS de gv-anamnesis.js, antes de </body>:
   <script src="gv-riskgate.js"></script>
   ============================================================ */
(function () {

  const css = `
  #riskOverlay{position:fixed;inset:0;background:var(--navy);z-index:1000;display:none;
    align-items:center;justify-content:center;padding:24px}
  #riskOverlay.open{display:flex}
  .rk-card{max-width:380px;width:100%}
  .rk-dots{display:flex;justify-content:center;gap:10px;margin-bottom:22px}
  .rk-dots div{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;
    font-size:18px;background:rgba(214,69,69,.22);border:1.5px solid var(--red)}
  .rk-card h2{font-size:24px;text-align:center;color:var(--txt);line-height:1.2;margin-bottom:14px}
  .rk-card p{font-size:14px;color:var(--mut);text-align:center;line-height:1.6;margin-bottom:26px}
  .rk-btn{display:block;width:100%;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:800;
    cursor:pointer;margin-bottom:10px}
  .rk-btn.dark{background:var(--navy2);border:1px solid var(--line);color:var(--ice)}
  .rk-btn.ghost{background:transparent;border:1.5px solid var(--line);color:var(--sky)}
  .rk-disclaimer{font-size:11px;color:var(--mut);text-align:center;margin-top:16px;line-height:1.5}
  `;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function buildOverlay() {
    if (document.getElementById("riskOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "riskOverlay";
    ov.innerHTML = `
      <div class="rk-card">
        <div class="rk-dots"><div>🔴</div><div>🔴</div><div>🔴</div></div>
        <h2>Percebemos uma sequência<br>de sinais de alerta</h2>
        <p>Você apresentou sinais de alerta em três registros consecutivos. Esse padrão merece uma avaliação individualizada — não é mais sobre o treino de hoje.</p>
        <button class="rk-btn dark" onclick="riskTalkToPhysio()">Falar com fisioterapeuta</button>
        <button class="rk-btn ghost" onclick="closeRiskOverlay()">Continuar acompanhando</button>
        <div class="rk-disclaimer">A transição é de automonitoramento para avaliação profissional — sem alarmismo, com um caminho claro.</div>
      </div>`;
    document.body.appendChild(ov);
  }

  let lastTriggerId = null;

  window.closeRiskOverlay = function () {
    const ov = document.getElementById("riskOverlay");
    if (ov) ov.classList.remove("open");
  };

  window.riskTalkToPhysio = async function () {
    if (lastTriggerId) {
      try { await sb.from("risk_events").update({ cta_clicado: true }).eq("id", lastTriggerId); }
      catch (e) { console.error("risk_events: falha ao marcar cta_clicado", e); }
    }
    window.open("https://instagram.com/vyni.fisio", "_blank");
    window.closeRiskOverlay();
  };

  function showRiskOverlay() {
    buildOverlay();
    document.getElementById("riskOverlay").classList.add("open");
  }

  const NIVEL_MAP = { g: "verde", y: "amarelo", r: "vermelho" };

  async function handleRiskEvent(color) {
    const nivel = NIVEL_MAP[color];
    if (!nivel) return;

    let insertedId = null;
    try {
      const { data, error } = await sb.from("risk_events")
        .insert({ email: GVCloud.email, nivel, data: new Date().toISOString().slice(0, 10) })
        .select().single();
      if (error) throw error;
      insertedId = data.id;
    } catch (e) {
      console.error("risk_events: falha ao gravar", e);
      return;
    }

    if (nivel !== "vermelho") return; // só a sequência de vermelhos nos interessa aqui

    let rows = [];
    try {
      const { data, error } = await sb.from("risk_events")
        .select("id, nivel, created_at")
        .eq("email", GVCloud.email)
        .order("created_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      console.error("risk_events: falha ao consultar sequência", e);
      return;
    }

    const last3 = rows.slice(0, 3);
    const prev3 = rows.slice(1, 4);
    const allRedNow = last3.length === 3 && last3.every(r => r.nivel === "vermelho");
    const allRedBefore = prev3.length === 3 && prev3.every(r => r.nivel === "vermelho");

    // dispara só no momento exato em que a sequência de 3 se forma —
    // não repete a cada vermelho novo enquanto a sequência continuar
    if (allRedNow && !allRedBefore) {
      lastTriggerId = insertedId;
      try { await sb.from("risk_events").update({ cta_mostrado: true }).eq("id", insertedId); }
      catch (e) { console.error("risk_events: falha ao marcar cta_mostrado", e); }
      setTimeout(showRiskOverlay, 400);
    }
  }

  const _prevLogPain = window.logPain;
  window.logPain = function (c) {
    if (typeof _prevLogPain === "function") _prevLogPain(c);
    try { handleRiskEvent(c); } catch (e) { console.error("gatilho de risco falhou", e); }
  };

})();
