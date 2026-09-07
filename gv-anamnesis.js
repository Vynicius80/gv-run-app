/* ============================================================
   GV RUN — Anamnese (Etapa 3c)
   ------------------------------------------------------------
   Roda uma vez, automaticamente, depois que o onboarding padrão
   termina (não altera finishOnboard, só encaixa por cima). Para
   alunos já existentes, aparece na primeira Home da sessão até
   ser respondida ou pulada. Também acessível a qualquer momento
   pelo Perfil, com pré-preenchimento do que já foi respondido.

   Requer: gv-auth-sync.js (usa `sb`/`GVCloud`).
   Carregar DEPOIS de gv-painhistory.js, antes de </body>:
   <script src="gv-anamnesis.js"></script>
   ============================================================ */
(function () {

  const css = `
  #anamOverlay{position:fixed;inset:0;background:var(--navy);z-index:999;overflow-y:auto;display:none}
  #anamOverlay.open{display:block}
  .an-header{padding:16px 20px 12px;display:flex;align-items:center;gap:12px;position:sticky;top:0;
    background:linear-gradient(90deg,var(--navy),var(--deep));border-bottom:1px solid var(--line);z-index:2}
  .an-steps{display:flex;gap:5px;flex:1}
  .an-steps div{flex:1;height:4px;border-radius:99px;background:rgba(255,255,255,.1)}
  .an-steps div.on{background:linear-gradient(90deg,var(--blue),var(--sky))}
  .an-skip{background:none;border:none;color:var(--mut);font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
  .an-wrap{padding:20px 20px 40px}
  .an-view{display:none}.an-view.on{display:block}
  .an-panel{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;margin-bottom:14px}
  .an-label{display:block;font-size:12.5px;color:var(--mut);margin:14px 0 7px;font-weight:600}
  .an-label:first-child{margin-top:0}
  .an-opts{display:grid;grid-template-columns:1fr 1fr;gap:9px}
  .an-opt{border:1.5px solid var(--line);background:var(--navy);border-radius:12px;padding:12px 10px;text-align:center;
    cursor:pointer;font-weight:700;font-size:13px;color:var(--mut)}
  .an-opt.on{background:linear-gradient(135deg,var(--blue),var(--sky));border-color:transparent;color:#fff}
  .an-yn{display:flex;gap:9px}
  .an-yn button{flex:1;padding:12px;border-radius:11px;border:1.5px solid var(--line);background:var(--navy);
    color:var(--mut);font-weight:800;font-size:14px;cursor:pointer}
  .an-yn button.yes.on{background:linear-gradient(90deg,#1F7A4D,var(--green));border-color:transparent;color:#fff}
  .an-yn button.no.on{background:var(--navy2);border-color:var(--sky);color:var(--sky)}
  .an-input{width:100%;background:var(--navy);border:1.5px solid var(--line);border-radius:12px;padding:13px;
    color:var(--txt);font-size:15px}
  .an-followup{margin-top:10px;padding-left:14px;border-left:2px solid var(--line);display:none}
  .an-followup.show{display:block}
  .an-btn{display:block;width:100%;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:800;color:#fff;
    background:linear-gradient(90deg,var(--blue),var(--sky));cursor:pointer;box-shadow:0 8px 20px rgba(46,111,219,.3)}
  .an-btn.ghost{background:transparent;border:1.5px solid var(--line);color:var(--sky);box-shadow:none}
  .an-hero{text-align:center;padding:16px 10px 6px}
  .an-hero .ic{font-size:48px}
  .an-hero h2{font-size:22px;margin-top:12px}
  .an-srow{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}
  .an-srow:last-child{border:none}
  .an-srow .k{font-size:12px;color:var(--mut)}
  .an-srow .v{font-size:13.5px;font-weight:700;color:var(--ice);text-align:right}
  .an-openbtn{width:100%;border:1.5px solid var(--line);background:rgba(87,160,255,.05);color:var(--sky);
    border-radius:14px;padding:14px;font-weight:800;font-size:14px;cursor:pointer;margin-bottom:14px;text-align:left;
    display:flex;align-items:center;gap:10px}
  `;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const FREQ_MAP = { "1–2x": 2, "3–4x": 4, "5x": 5, "6x+": 6 };
  const FREQ_LABELS = Object.keys(FREQ_MAP);

  function buildOverlay() {
    if (document.getElementById("anamOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "anamOverlay";
    ov.innerHTML = `
      <div class="an-header">
        <div class="an-steps" id="anSteps"><div class="on"></div><div></div><div></div></div>
        <button class="an-skip" onclick="skipAnamnesis()">Pular por agora</button>
      </div>
      <div class="an-wrap">

        <div class="an-view on" id="an1">
          <span class="tag">Passo 1 de 3</span>
          <h3>Queremos te conhecer melhor</h3>
          <p style="color:var(--mut);font-size:13.5px;margin-top:6px">3 passos rápidos. Isso ajusta o programa ao seu histórico desde já.</p>
          <div class="an-panel" style="margin-top:14px">
            <span class="an-label">Há quanto tempo você corre?</span>
            <div class="an-opts" data-field="tempo_correndo">
              <div class="an-opt" data-v="Menos de 1 ano">Menos de 1 ano</div>
              <div class="an-opt" data-v="1–3 anos">1–3 anos</div>
              <div class="an-opt" data-v="3–7 anos">3–7 anos</div>
              <div class="an-opt" data-v="7+ anos">7+ anos</div>
            </div>
            <span class="an-label">Quantas vezes por semana?</span>
            <div class="an-opts" data-field="freq_semanal">
              <div class="an-opt" data-v="1–2x">1–2x</div>
              <div class="an-opt" data-v="3–4x">3–4x</div>
              <div class="an-opt" data-v="5x">5x</div>
              <div class="an-opt" data-v="6x+">6x+</div>
            </div>
            <span class="an-label">Você participa de provas?</span>
            <div class="an-yn" data-field="participa_provas">
              <button class="yes" data-v="true">Sim</button>
              <button class="no" data-v="false">Não</button>
            </div>
          </div>
          <button class="an-btn" onclick="anToStep(2)">Continuar →</button>
        </div>

        <div class="an-view" id="an2">
          <span class="tag">Passo 2 de 3</span>
          <h3>Já teve alguma lesão na corrida?</h3>
          <div class="an-panel" style="margin-top:14px">
            <div class="an-yn" data-field="teve_lesao" id="anLesaoYn">
              <button class="yes" data-v="true">Sim</button>
              <button class="no" data-v="false">Não</button>
            </div>
            <div class="an-followup" id="anLesaoFollow">
              <span class="an-label">Qual região?</span>
              <input type="text" class="an-input" id="anLesaoRegiao" placeholder="Ex: joelho direito">
              <span class="an-label">Precisou de fisioterapia?</span>
              <div class="an-yn" data-field="lesao_fisio"><button class="yes" data-v="true">Sim</button><button class="no" data-v="false">Não</button></div>
              <span class="an-label">Houve cirurgia?</span>
              <div class="an-yn" data-field="lesao_cirurgia"><button class="yes" data-v="true">Sim</button><button class="no" data-v="false">Não</button></div>
              <span class="an-label">Voltou completamente a correr?</span>
              <div class="an-yn" data-field="lesao_retorno"><button class="yes" data-v="true">Sim</button><button class="no" data-v="false">Não</button></div>
            </div>
          </div>
          <button class="an-btn" onclick="anToStep(3)">Continuar →</button>
        </div>

        <div class="an-view" id="an3">
          <span class="tag">Passo 3 de 3</span>
          <h3>Como você está agora</h3>
          <div class="an-panel" style="margin-top:14px">
            <span class="an-label">Está sentindo alguma dor no momento?</span>
            <div class="an-yn" data-field="dor_atual"><button class="yes" data-v="true">Sim</button><button class="no" data-v="false">Não</button></div>
            <span class="an-label">Está fazendo fisioterapia?</span>
            <div class="an-yn" data-field="fazendo_fisio"><button class="yes" data-v="true">Sim</button><button class="no" data-v="false">Não</button></div>
            <span class="an-label">Reduzindo volume por causa de dor?</span>
            <div class="an-yn" data-field="reduzindo_volume"><button class="yes" data-v="true">Sim</button><button class="no" data-v="false">Não</button></div>
          </div>
          <button class="an-btn" onclick="anSubmit()">Concluir perfil ✔</button>
        </div>

        <div class="an-view" id="an4">
          <div class="an-hero"><div class="ic" id="anIco">✅</div><h2 id="anTitle">Perfil criado</h2></div>
          <div class="an-panel" id="anSummary"></div>
          <button class="an-btn ghost" onclick="closeAnamnesis()">Fechar</button>
        </div>

      </div>`;
    document.body.appendChild(ov);

    // liga os cliques de opção/sim-não (delegação)
    ov.addEventListener("click", (e) => {
      const opt = e.target.closest(".an-opt");
      if (opt) {
        const group = opt.parentNode;
        [...group.children].forEach(c => c.classList.remove("on"));
        opt.classList.add("on");
        anState[group.getAttribute("data-field")] = opt.getAttribute("data-v");
        return;
      }
      const ynBtn = e.target.closest(".an-yn button");
      if (ynBtn) {
        const group = ynBtn.parentNode;
        [...group.children].forEach(c => c.classList.remove("on"));
        ynBtn.classList.add("on");
        const field = group.getAttribute("data-field");
        const val = ynBtn.getAttribute("data-v") === "true";
        anState[field] = val;
        if (field === "teve_lesao") {
          document.getElementById("anLesaoFollow").classList.toggle("show", val);
        }
      }
    });
  }

  let anState = {};
  let anStep = 1;
  let anAutoTriggered = false; // evita reabrir mais de uma vez por sessão

  window.anToStep = function (n) {
    document.getElementById("an" + anStep).classList.remove("on");
    anStep = n;
    document.getElementById("an" + anStep).classList.add("on");
    const steps = document.getElementById("anSteps").children;
    for (let i = 0; i < 3; i++) if (steps[i]) steps[i].classList.toggle("on", i < n);
    const skipBtn = document.querySelector(".an-skip");
    if (skipBtn) skipBtn.style.visibility = n < 4 ? "visible" : "hidden";
    document.getElementById("anamOverlay").scrollTop = 0;
  };

  window.skipAnamnesis = function () {
    closeAnamnesisOverlay();
  };
  window.closeAnamnesis = function () {
    closeAnamnesisOverlay();
  };
  function closeAnamnesisOverlay() {
    const ov = document.getElementById("anamOverlay");
    if (ov) ov.classList.remove("open");
  }

  function buildPayload() {
    const lesoes = anState.teve_lesao ? [{
      regiao: document.getElementById("anLesaoRegiao").value || null,
      fisio: !!anState.lesao_fisio,
      cirurgia: !!anState.lesao_cirurgia,
      retorno_completo: !!anState.lesao_retorno
    }] : [];
    return {
      email: GVCloud.email,
      tempo_correndo: anState.tempo_correndo || null,
      freq_semanal: anState.freq_semanal ? FREQ_MAP[anState.freq_semanal] : null,
      participa_provas: anState.participa_provas ?? null,
      teve_lesao: anState.teve_lesao ?? null,
      lesoes_previas: lesoes,
      fez_cirurgia: anState.teve_lesao ? !!anState.lesao_cirurgia : null,
      dor_atual: anState.dor_atual ?? null,
      fazendo_fisio: anState.fazendo_fisio ?? null,
      reduzindo_volume: anState.reduzindo_volume ?? null,
      atualizado_em: new Date().toISOString()
    };
  }

  window.anSubmit = async function () {
    const btn = document.querySelector("#an3 .an-btn");
    btn.disabled = true; btn.textContent = "Salvando...";
    const payload = buildPayload();
    let ok = true;
    try {
      const { error } = await sb.from("athlete_anamnesis").upsert(payload, { onConflict: "email" });
      if (error) throw error;
    } catch (e) {
      console.error("anamnese: falha ao salvar", e);
      ok = false;
    }
    btn.disabled = false; btn.textContent = "Concluir perfil ✔";

    // marca localmente que já respondeu, pra não perguntar de novo nesta sessão/dispositivo
    try {
      if (typeof S === "object" && S) { S.anamnesisDone = true; if (typeof save === "function") save(); }
    } catch (e) {}

    document.getElementById("anTitle").textContent = ok ? "Perfil criado" : "Salvo localmente";
    document.getElementById("anIco").textContent = ok ? "✅" : "⚠️";
    document.getElementById("anSummary").innerHTML = `
      <div class="an-srow"><span class="k">Experiência</span><span class="v">${anState.tempo_correndo || "—"}</span></div>
      <div class="an-srow"><span class="k">Frequência</span><span class="v">${anState.freq_semanal || "—"} por semana</span></div>
      <div class="an-srow"><span class="k">Histórico de lesão</span><span class="v">${anState.teve_lesao ? "Sim" : "Não"}</span></div>
      <div class="an-srow"><span class="k">Dor atual</span><span class="v">${anState.dor_atual ? "Sim" : "Não"}</span></div>`;
    window.anToStep(4);
  };

  /* ---------------- abertura + pré-preenchimento ---------------- */
  async function loadExisting() {
    try {
      const { data, error } = await sb.from("athlete_anamnesis").select("*").eq("email", GVCloud.email).maybeSingle();
      if (error || !data) return;
      anState.tempo_correndo = data.tempo_correndo;
      anState.freq_semanal = Object.keys(FREQ_MAP).find(k => FREQ_MAP[k] === data.freq_semanal);
      anState.participa_provas = data.participa_provas;
      anState.teve_lesao = data.teve_lesao;
      anState.dor_atual = data.dor_atual;
      anState.fazendo_fisio = data.fazendo_fisio;
      anState.reduzindo_volume = data.reduzindo_volume;
      if (data.lesoes_previas && data.lesoes_previas[0]) {
        const l = data.lesoes_previas[0];
        anState.lesao_fisio = l.fisio; anState.lesao_cirurgia = l.cirurgia; anState.lesao_retorno = l.retorno_completo;
        document.getElementById("anLesaoRegiao").value = l.regiao || "";
      }
      // reflete visualmente as seleções carregadas
      document.querySelectorAll("[data-field]").forEach(group => {
        const field = group.getAttribute("data-field");
        if (!(field in anState) || anState[field] === null || anState[field] === undefined) return;
        [...group.children].forEach(opt => {
          const v = opt.getAttribute("data-v");
          const match = (v === "true" && anState[field] === true) || (v === "false" && anState[field] === false) || (v === String(anState[field]));
          opt.classList.toggle("on", !!match);
        });
      });
      document.getElementById("anLesaoFollow").classList.toggle("show", !!anState.teve_lesao);
    } catch (e) { console.error("anamnese: falha ao pré-carregar", e); }
  }

  window.openAnamnesis = async function () {
    buildOverlay();
    anState = {}; anStep = 1;
    document.querySelectorAll(".an-view").forEach(v => v.classList.remove("on"));
    document.getElementById("an1").classList.add("on");
    const steps = document.getElementById("anSteps").children;
    for (let i = 0; i < 3; i++) steps[i].classList.toggle("on", i === 0);
    document.getElementById("anamOverlay").classList.add("open");
    await loadExisting();
  };

  /* ---------------- gatilhos automáticos ---------------- */
  // 1) logo após o onboarding padrão terminar
  function wrapFinishOnboard() {
    if (typeof window.finishOnboard !== "function" || window.finishOnboard.__anamWrapped) return;
    const orig = window.finishOnboard;
    const wrapped = function () {
      orig.apply(this, arguments);
      anAutoTriggered = true;
      setTimeout(() => { window.openAnamnesis(); }, 300);
    };
    wrapped.__anamWrapped = true;
    window.finishOnboard = wrapped;
  }
  try { wrapFinishOnboard(); } catch (e) {}
  // finishOnboard pode ainda não existir no momento em que este arquivo carrega, tenta de novo em breve
  setTimeout(wrapFinishOnboard, 300);

  // 2) primeira Home da sessão, para alunos que já existiam antes desta função
  function injectProfileButton() {
    const prof = document.getElementById("vProfile");
    if (!prof || document.getElementById("anOpenBtn")) return;
    const btn = document.createElement("button");
    btn.id = "anOpenBtn";
    btn.className = "an-openbtn";
    btn.innerHTML = `<span>📋</span><span>Meu perfil de corredor</span>`;
    btn.onclick = window.openAnamnesis;
    prof.prepend(btn);
  }

  const _prevShow = window.show;
  window.show = function (id) {
    if (typeof _prevShow === "function") _prevShow(id);
    if (id === "vProfile") { try { injectProfileButton(); } catch (e) {} }
    if (id === "vHome" && !anAutoTriggered) {
      anAutoTriggered = true;
      try {
        if (typeof S === "object" && S && !S.anamnesisDone) {
          setTimeout(() => { window.openAnamnesis(); }, 500);
        }
      } catch (e) {}
    }
  };

})();
