/* ============================================================
   GV RUN — Registro de corrida + matriz de carga (Etapa 3e)
   ------------------------------------------------------------
   Adiciona um botão na Home para registrar a corrida (tipo,
   duração, esforço) e calcula o nível de força recomendado hoje
   (completa / moderada / regenerativa / bloqueada), avisando o
   aluno na Home e na sessão de força.

   IMPORTANTE — escopo desta etapa: isto é a CAMADA DE AVISO.
   A lista de exercícios exibida NÃO muda automaticamente ainda
   (isso depende do conteúdo dos blocos mensais, ainda vazio).
   A função deriveForceLevel() já está pronta para, no futuro,
   escolher a variante certa da sessão assim que o conteúdo
   existir — hoje ela só informa e orienta.

   Requer: gv-auth-sync.js (usa `sb`/`GVCloud`), gv-clinic.js
   (usa currentPainColor, strengthBlocked).
   Carregar DEPOIS de gv-riskgate.js, antes de </body>:
   <script src="gv-runlog.js"></script>
   ============================================================ */
(function () {

  const css = `
  .rl-openbtn{width:100%;border:1.5px solid var(--line);background:rgba(87,160,255,.05);color:var(--sky);
    border-radius:14px;padding:14px;font-weight:800;font-size:14px;cursor:pointer;margin-bottom:12px;text-align:left;
    display:flex;align-items:center;gap:10px}
  .rl-banner{border-radius:14px;padding:13px 15px;font-size:13.5px;line-height:1.55;margin-bottom:14px}
  .rl-banner.regen{background:rgba(55,185,160,.1);border:1px solid rgba(55,185,160,.35);color:#BEEDE3}
  .rl-banner.mod{background:rgba(227,160,8,.1);border:1px solid rgba(227,160,8,.35);color:#F3DFAE}
  .rl-banner b{color:#fff}

  #runLogOverlay{position:fixed;inset:0;background:var(--navy);z-index:996;overflow-y:auto;display:none}
  #runLogOverlay.open{display:block}
  .rl-header{padding:16px 20px 12px;display:flex;align-items:center;gap:12px;position:sticky;top:0;
    background:linear-gradient(90deg,var(--navy),var(--deep));border-bottom:1px solid var(--line);z-index:2}
  .rl-header h3{flex:1;font-size:17px}
  .rl-close{background:none;border:none;color:var(--mut);font-size:20px;cursor:pointer;padding:0 4px}
  .rl-wrap{padding:20px}
  .rl-panel{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;margin-bottom:14px}
  .rl-label{display:block;font-size:12.5px;color:var(--mut);margin:14px 0 8px;font-weight:600}
  .rl-label:first-child{margin-top:0}
  .rl-chips{display:flex;gap:8px;flex-wrap:wrap}
  .rl-chip{border:1.5px solid var(--line);background:var(--navy);color:var(--mut);border-radius:99px;padding:9px 15px;
    font-size:12.5px;font-weight:700;cursor:pointer}
  .rl-chip.on{background:linear-gradient(135deg,var(--blue),var(--sky));border-color:transparent;color:#fff}
  .rl-intbig{text-align:center;padding:6px 0 2px}
  .rl-intbig .num{font-size:46px;font-weight:800;line-height:1;color:var(--sky)}
  input.rl-slider{width:100%;-webkit-appearance:none;height:10px;border-radius:99px;outline:none;margin-top:10px}
  input.rl-slider::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;
    box-shadow:0 3px 10px rgba(0,0,0,.4);cursor:pointer;margin-top:-8px}
  .rl-btn{display:block;width:100%;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:800;color:#fff;
    background:linear-gradient(90deg,var(--blue),var(--sky));cursor:pointer;box-shadow:0 8px 20px rgba(46,111,219,.3)}
  .rl-btn:disabled{opacity:.4}
  `;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const TIPOS = [
    ["rodagem_leve", "Rodagem leve"], ["rodagem_longa", "Rodagem longa"],
    ["tiros", "Tiros / ritmo"], ["longao", "Longão"],
    ["trilha", "Trilha / descida"], ["competicao", "Competição"], ["regenerativo", "Regenerativo"]
  ];
  const DURACOES = [30, 45, 60, 90, 120];

  let rlTipo = "rodagem_leve", rlDuracao = 60, rlRpe = 5;

  function buildOverlay() {
    if (document.getElementById("runLogOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "runLogOverlay";
    ov.innerHTML = `
      <div class="rl-header"><h3>Registrar corrida</h3><button class="rl-close" onclick="closeRunLog()">✕</button></div>
      <div class="rl-wrap">
        <div class="rl-panel">
          <span class="rl-label">Que tipo de corrida foi?</span>
          <div class="rl-chips" id="rlTipoChips">
            ${TIPOS.map(([v, l], i) => `<div class="rl-chip${i === 0 ? " on" : ""}" data-v="${v}">${l}</div>`).join("")}
          </div>
          <span class="rl-label">Quanto tempo?</span>
          <div class="rl-chips" id="rlDurChips">
            ${DURACOES.map((d, i) => `<div class="rl-chip${d === 60 ? " on" : ""}" data-v="${d}">${d < 60 ? d + " min" : (d / 60).toFixed(d % 60 === 0 ? 0 : 1) + " h"}</div>`).join("")}
          </div>
          <span class="rl-label">Quanto custou (esforço)?</span>
          <div class="rl-intbig"><div class="num" id="rlRpeNum">5</div></div>
          <input type="range" class="rl-slider" min="0" max="10" value="5" id="rlSlider" oninput="rlUpdateRpe(this.value)">
        </div>
        <button class="rl-btn" onclick="rlSubmit()">Registrar corrida ✔</button>
      </div>`;
    document.body.appendChild(ov);

    document.getElementById("rlTipoChips").addEventListener("click", e => {
      const c = e.target.closest(".rl-chip"); if (!c) return;
      [...c.parentNode.children].forEach(x => x.classList.remove("on"));
      c.classList.add("on"); rlTipo = c.getAttribute("data-v");
    });
    document.getElementById("rlDurChips").addEventListener("click", e => {
      const c = e.target.closest(".rl-chip"); if (!c) return;
      [...c.parentNode.children].forEach(x => x.classList.remove("on"));
      c.classList.add("on"); rlDuracao = parseInt(c.getAttribute("data-v"));
    });
  }

  window.rlUpdateRpe = function (v) {
    rlRpe = parseInt(v);
    document.getElementById("rlRpeNum").textContent = v;
  };

  window.openRunLog = function () {
    buildOverlay();
    rlTipo = "rodagem_leve"; rlDuracao = 60; rlRpe = 5;
    document.getElementById("rlSlider").value = 5;
    window.rlUpdateRpe(5);
    document.querySelectorAll("#rlTipoChips .rl-chip").forEach((c, i) => c.classList.toggle("on", i === 0));
    document.querySelectorAll("#rlDurChips .rl-chip").forEach(c => c.classList.toggle("on", parseInt(c.getAttribute("data-v")) === 60));
    document.getElementById("runLogOverlay").classList.add("open");
  };
  window.closeRunLog = function () {
    const ov = document.getElementById("runLogOverlay");
    if (ov) ov.classList.remove("open");
  };

  window.rlSubmit = async function () {
    const btn = document.querySelector("#runLogOverlay .rl-btn");
    btn.disabled = true; btn.textContent = "Salvando...";
    try {
      const { error } = await sb.from("runs").insert({
        email: GVCloud.email, tipo: rlTipo, duracao_min: rlDuracao, rpe: rlRpe,
        data: new Date().toISOString().slice(0, 10)
      });
      if (error) throw error;
    } catch (e) {
      console.error("runs: falha ao gravar", e);
    }
    btn.disabled = false; btn.textContent = "Registrar corrida ✔";
    window.closeRunLog();
    renderHomeBanner();
  };

  /* ---------------- a matriz de decisão ---------------- */
  window.deriveForceLevel = function (lastRun, semaforoColor) {
    if (semaforoColor === "r") return { level: "bloqueada", motivo: "Semáforo vermelho hoje" };

    let level = "completa", motivo = null;
    if (lastRun) {
      const hoursSince = (Date.now() - new Date(lastRun.created_at).getTime()) / 36e5;
      if (hoursSince <= 30) {
        if (["longao", "trilha", "competicao"].includes(lastRun.tipo) || (lastRun.duracao_min && lastRun.duracao_min > 90)) {
          level = "regenerativa"; motivo = "longão, trilha ou mais de 90 min nas últimas 24h";
        } else if ((lastRun.rpe && lastRun.rpe >= 7) || (lastRun.duracao_min && lastRun.duracao_min > 60)) {
          level = "moderada"; motivo = "esforço alto ou mais de 60 min nas últimas 24h";
        }
      }
    }
    if (semaforoColor === "y" && level === "completa") {
      level = "moderada"; motivo = "semáforo amarelo hoje";
    }
    return { level, motivo };
  };

  const LEVEL_INFO = {
    completa: null,
    moderada: { cls: "mod", ic: "🟡", tit: "Força moderada hoje", txt: "sem carga máxima nem pliometria — " },
    regenerativa: { cls: "regen", ic: "🌿", tit: "Força regenerativa hoje", txt: "carga leve, sem impacto — " },
    bloqueada: null // já tratado pelo bloqueio existente do semáforo vermelho
  };

  async function getLastRun() {
    try {
      const { data, error } = await sb.from("runs")
        .select("*").eq("email", GVCloud.email)
        .order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return (data && data[0]) || null;
    } catch (e) { console.error("runs: falha ao consultar última corrida", e); return null; }
  }

  async function renderHomeBanner() {
    const home = document.getElementById("vHome");
    if (!home) return;
    let holder = document.getElementById("rlBannerHolder");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "rlBannerHolder";
      const h2 = home.querySelector("h2.sec");
      if (h2) h2.before(holder); else home.prepend(holder);
    }
    const lastRun = await getLastRun();
    const color = typeof window.currentPainColor === "function" ? window.currentPainColor() : null;
    const { level, motivo } = window.deriveForceLevel(lastRun, color);
    const info = LEVEL_INFO[level];
    holder.innerHTML = info
      ? `<div class="rl-banner ${info.cls}">${info.ic} <b>${info.tit}.</b> ${info.txt}${motivo ? "porque você teve " + motivo + "." : ""}</div>`
      : "";
  }

  function injectRunButton() {
    const home = document.getElementById("vHome");
    if (!home || document.getElementById("rlOpenBtn")) return;
    const btn = document.createElement("button");
    btn.id = "rlOpenBtn";
    btn.className = "rl-openbtn";
    btn.innerHTML = `<span>🏃</span><span>Registrar corrida</span>`;
    btn.onclick = window.openRunLog;
    const h2 = home.querySelector("h2.sec");
    if (h2) h2.before(btn); else home.prepend(btn);
  }

  /* injeta nota informativa dentro da sessão de força, sem trocar a lista de exercícios */
  const _prevOpenSession = window.openSession;
  window.openSession = async function (t) {
    if (typeof _prevOpenSession === "function") _prevOpenSession(t);
    if (t === "M") return; // mobilidade não é afetada pela matriz de carga
    setTimeout(async () => {
      const sesView = document.getElementById("vSession");
      if (!sesView || sesView.classList.contains("hidden")) return; // gate de dor pode ter impedido a sessão de abrir
      const lastRun = await getLastRun();
      const color = typeof window.currentPainColor === "function" ? window.currentPainColor() : null;
      const { level, motivo } = window.deriveForceLevel(lastRun, color);
      const info = LEVEL_INFO[level];
      if (!info) return;
      const note = document.getElementById("sesLevelNote");
      if (note && !note.querySelector(".rl-banner")) {
        const div = document.createElement("div");
        div.className = `rl-banner ${info.cls}`;
        div.style.marginTop = "10px";
        div.innerHTML = `${info.ic} <b>${info.tit}.</b> Ajuste mentalmente a carga desta sessão para leve/moderada — o conteúdo detalhado por nível chega em breve.`;
        note.appendChild(div);
      }
    }, 50);
  };

  const _prevShow = window.show;
  window.show = function (id) {
    if (typeof _prevShow === "function") _prevShow(id);
    if (id === "vHome") {
      try { injectRunButton(); renderHomeBanner(); } catch (e) {}
    }
  };

})();
