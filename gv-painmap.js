/* ============================================================
   GV RUN — Mapa de dor anatômico (Etapa 3)
   ------------------------------------------------------------
   Adiciona um botão na aba Dor que abre o registro completo
   (corpo → intensidade → características → confirmação) e grava
   em pain_records no Supabase. Ao concluir, também atualiza o
   semáforo existente (logPain) derivando a cor pela intensidade,
   então o bloqueio de força continua funcionando normalmente.

   Requer: gv-auth-sync.js carregado antes (usa `sb` e `GVCloud`).
   Carregar DEPOIS de gv-clinic.js, antes de </body>:
   <script src="gv-painmap.js"></script>
   ============================================================ */
(function () {

  const css = `
  #painMapOverlay{position:fixed;inset:0;background:var(--navy);z-index:998;overflow-y:auto;display:none}
  #painMapOverlay.open{display:block}
  .pm-header{padding:16px 20px 12px;display:flex;align-items:center;gap:12px;position:sticky;top:0;
    background:linear-gradient(90deg,var(--navy),var(--deep));border-bottom:1px solid var(--line);z-index:2}
  .pm-header .pm-back{background:none;border:none;color:var(--sky);font-size:22px;cursor:pointer;padding:0;line-height:1;visibility:hidden}
  .pm-header .pm-back.show{visibility:visible}
  .pm-steps{display:flex;gap:5px;flex:1}
  .pm-steps div{flex:1;height:4px;border-radius:99px;background:rgba(255,255,255,.1)}
  .pm-steps div.on{background:linear-gradient(90deg,var(--blue),var(--sky))}
  .pm-close{background:none;border:none;color:var(--mut);font-size:20px;cursor:pointer;padding:0 4px}
  .pm-wrap{padding:20px 20px 40px}
  .pm-view{display:none}.pm-view.on{display:block}
  .pm-panel{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px;margin-bottom:14px}
  .pm-seg{display:flex;background:var(--navy);border-radius:11px;padding:3px;margin-bottom:18px;position:relative}
  .pm-seg button{flex:1;border:none;background:none;color:var(--mut);font-weight:700;font-size:13px;padding:9px 0;cursor:pointer;position:relative;z-index:2}
  .pm-seg button.on{color:#fff}
  .pm-pill{position:absolute;top:3px;left:3px;width:calc(50% - 3px);height:calc(100% - 6px);
    background:linear-gradient(135deg,var(--blue),var(--sky));border-radius:8px;transition:transform .28s cubic-bezier(.4,0,.2,1);z-index:1}
  .pm-stage{display:flex;justify-content:center;margin-bottom:16px}
  .pm-stage svg{width:210px;height:auto}
  .pm-bodyview.hidden{display:none}
  .pm-zone{stroke:rgba(87,160,255,.22);stroke-width:.6;cursor:pointer;transition:fill .18s,filter .18s}
  .pm-zone:hover{filter:brightness(1.18)}
  .pm-zone.sel{fill:#E14B4B!important;filter:drop-shadow(0 0 8px rgba(225,75,75,.55))}
  #pmSvgAnt .pm-zone{fill:url(#pmGradFront)}
  #pmSvgPost .pm-zone{fill:url(#pmGradBack)}
  .pm-subrow{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:14px;min-height:32px}
  .pm-subrow button{border:1.4px solid var(--line);background:var(--navy);color:var(--mut);border-radius:9px;padding:7px 11px;font-size:11px;font-weight:700;cursor:pointer}
  .pm-subrow button.on{background:linear-gradient(135deg,var(--blue),var(--sky));border-color:transparent;color:#fff}
  .pm-selline{background:var(--navy);border:1px solid var(--line);border-radius:11px;padding:12px 14px;font-size:13px;text-align:center;color:var(--mut)}
  .pm-selline b{color:var(--sky);display:block;font-size:15px;margin-top:2px}
  .pm-btn{display:block;width:100%;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:800;color:#fff;
    background:linear-gradient(90deg,var(--blue),var(--sky));cursor:pointer;box-shadow:0 8px 20px rgba(46,111,219,.3)}
  .pm-btn.ghost{background:transparent;border:1.5px solid var(--line);color:var(--sky);box-shadow:none}
  .pm-btn:disabled{opacity:.35}
  .pm-btn+.pm-btn{margin-top:9px}
  .pm-intbig{text-align:center;padding:10px 0 4px}
  .pm-intbig .pm-num{font-size:60px;font-weight:800;line-height:1;transition:color .2s;font-family:inherit}
  .pm-intbig .pm-lbl{font-size:14px;font-weight:700;margin-top:4px;transition:color .2s}
  input.pm-slider{width:100%;-webkit-appearance:none;height:10px;border-radius:99px;outline:none;margin-top:14px}
  input.pm-slider::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:#fff;
    box-shadow:0 3px 10px rgba(0,0,0,.4),0 0 0 5px rgba(255,255,255,.15);cursor:pointer;margin-top:-9px}
  .pm-sliderlabels{display:flex;justify-content:space-between;font-size:10.5px;color:var(--mut);font-weight:700;margin-top:6px}
  .pm-qgroup{margin-bottom:20px}.pm-qgroup:last-child{margin-bottom:0}
  .pm-ql{font-size:13px;font-weight:700;color:var(--ice);margin-bottom:10px}
  .pm-chiprow{display:flex;gap:8px;flex-wrap:wrap}
  .pm-chip{border:1.5px solid var(--line);background:var(--navy);color:var(--mut);border-radius:99px;padding:9px 15px;font-size:12.5px;font-weight:700;cursor:pointer}
  .pm-chip.on{background:linear-gradient(135deg,var(--blue),var(--sky));border-color:transparent;color:#fff}
  .pm-chip.tup.on{background:linear-gradient(135deg,#A93232,#D64545)}
  .pm-chip.tdown.on{background:linear-gradient(135deg,#1F7A4D,#2FA36B)}
  .pm-chip.tsame.on{background:linear-gradient(135deg,#B87F00,#E3A008)}
  .pm-hero{text-align:center;padding:16px 10px 6px}
  .pm-hero .pm-ico{font-size:48px}
  .pm-hero h2{font-size:22px;margin-top:12px}
  .pm-srow{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07)}
  .pm-srow:last-child{border:none}
  .pm-srow .k{font-size:12px;color:var(--mut);font-weight:600}
  .pm-srow .v{font-size:14px;font-weight:700;color:var(--ice);text-align:right}
  .pm-pillint{display:inline-block;padding:3px 11px;border-radius:99px;font-size:12.5px;font-weight:800;color:#fff}
  .pm-openbtn{width:100%;border:1.5px solid var(--line);background:rgba(87,160,255,.08);color:var(--sky);
    border-radius:14px;padding:14px;font-weight:800;font-size:14px;cursor:pointer;margin-bottom:14px;text-align:left;
    display:flex;align-items:center;gap:10px}
  .pm-openbtn .ic{font-size:20px}
  `;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------------- SVG do corpo (mesma anatomia validada) ---------------- */
  const BODY_SVG = `
    <svg viewBox="0 0 200 480" id="pmSvgAnt" class="pm-bodyview" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="pmGradFront" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%" stop-color="#4468ac"/><stop offset="50%" stop-color="#2c4884"/><stop offset="100%" stop-color="#1c3260"/>
      </linearGradient></defs>
      <ellipse cx="100" cy="28" rx="14" ry="17" fill="rgba(255,255,255,.07)" stroke="rgba(87,160,255,.22)" stroke-width="1" style="pointer-events:none"/>
      <path d="M91,42 L89,54 L111,54 L109,42 Z" fill="rgba(255,255,255,.07)" stroke="rgba(87,160,255,.22)" stroke-width="1" style="pointer-events:none"/>
      <path class="pm-zone" data-region="Tronco" d="M100,58 C 80,56 64,60 62,72 C 60,84 64,96 70,100 C 66,110 64,120 66,128 C 68,134 74,136 100,137 C 126,136 132,134 134,128 C 136,120 134,110 130,100 C 136,96 140,84 138,72 C 136,60 120,56 100,58 Z"/>
      <path class="pm-zone" data-region="Quadril" d="M66,128 C64,138 64,150 68,160 C74,170 86,176 100,177 C 114,176 126,170 132,160 C 136,150 136,138 134,128 C 126,134 116,136 100,137 C 84,136 74,134 66,128 Z"/>
      <path class="pm-zone" data-region="Braço" data-side="direito" d="M68,68 C52,76 42,102 40,132 C38,156 40,176 47,192 L60,187 C55,170 54,150 56,128 C58,106 63,90 72,78 Z"/>
      <path class="pm-zone" data-region="Braço" data-side="esquerdo" d="M132,68 C148,76 158,102 160,132 C162,156 160,176 153,192 L140,187 C145,170 146,150 144,128 C142,106 137,90 128,78 Z"/>
      <path class="pm-zone" data-region="Coxa anterior" data-side="direito" d="M69,160 C65,172 63,188 64,206 C65,226 67,246 71,262 L91,262 C93,248 93,230 91,212 C89,196 87,182 82,168 C77,163 72,161 69,160 Z"/>
      <path class="pm-zone" data-region="Coxa anterior" data-side="esquerdo" d="M131,160 C135,172 137,188 136,206 C135,226 133,246 129,262 L109,262 C107,248 107,230 109,212 C111,196 113,182 118,168 C123,163 128,161 131,160 Z"/>
      <path class="pm-zone" data-region="Joelho" data-side="direito" data-sub="1" d="M72,262 C70,270 70,280 72,288 L90,288 C92,280 92,270 90,262 Z"/>
      <path class="pm-zone" data-region="Joelho" data-side="esquerdo" data-sub="1" d="M128,262 C130,270 130,280 128,288 L110,288 C108,280 108,270 110,262 Z"/>
      <path class="pm-zone" data-region="Canela" data-side="direito" data-sub="2" d="M73,288 C71,302 70,320 70,338 C70,350 71,360 73,368 L89,368 C91,360 92,350 92,338 C92,320 91,302 89,288 Z"/>
      <path class="pm-zone" data-region="Canela" data-side="esquerdo" data-sub="2" d="M127,288 C129,302 130,320 130,338 C130,350 129,360 127,368 L111,368 C109,360 108,350 108,338 C108,320 109,302 111,288 Z"/>
      <path class="pm-zone" data-region="Tornozelo" data-side="direito" d="M73,368 C72,374 72,380 74,384 L88,384 C90,380 90,374 89,368 Z"/>
      <path class="pm-zone" data-region="Tornozelo" data-side="esquerdo" d="M127,368 C128,374 128,380 126,384 L112,384 C110,380 110,374 111,368 Z"/>
      <path class="pm-zone" data-region="Pé" data-side="direito" d="M74,384 C69,386 60,388 55,394 C50,401 52,408 62,410 L94,410 C99,408 99,398 96,390 C93,384 90,384 74,384 Z"/>
      <path class="pm-zone" data-region="Pé" data-side="esquerdo" d="M126,384 C131,386 140,388 145,394 C150,401 148,408 138,410 L106,410 C101,408 101,398 104,390 C107,384 110,384 126,384 Z"/>
    </svg>
    <svg viewBox="0 0 200 480" id="pmSvgPost" class="pm-bodyview hidden" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="pmGradBack" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%" stop-color="#4468ac"/><stop offset="50%" stop-color="#2c4884"/><stop offset="100%" stop-color="#1c3260"/>
      </linearGradient></defs>
      <ellipse cx="100" cy="28" rx="14" ry="17" fill="rgba(255,255,255,.07)" stroke="rgba(87,160,255,.22)" stroke-width="1" style="pointer-events:none"/>
      <path d="M91,42 L89,54 L111,54 L109,42 Z" fill="rgba(255,255,255,.07)" stroke="rgba(87,160,255,.22)" stroke-width="1" style="pointer-events:none"/>
      <path class="pm-zone" data-region="Tronco (costas)" d="M100,58 C 80,56 64,60 62,72 C 60,84 64,96 70,100 C 66,110 64,120 66,128 C 68,134 74,136 100,137 C 126,136 132,134 134,128 C 136,120 134,110 130,100 C 136,96 140,84 138,72 C 136,60 120,56 100,58 Z"/>
      <path class="pm-zone" data-region="Lombar" d="M70,100 C68,110 68,120 70,128 L130,128 C132,120 132,110 130,100 C 118,106 82,106 70,100 Z"/>
      <path class="pm-zone" data-region="Glúteo" d="M66,128 C64,138 64,152 70,163 C 80,172 92,176 100,176 C 108,176 120,172 130,163 C 136,152 136,138 134,128 C126,134 116,136 100,137 C 84,136 74,134 66,128 Z"/>
      <path class="pm-zone" data-region="Braço" data-side="direito" d="M68,68 C52,76 42,102 40,132 C38,156 40,176 47,192 L60,187 C55,170 54,150 56,128 C58,106 63,90 72,78 Z"/>
      <path class="pm-zone" data-region="Braço" data-side="esquerdo" d="M132,68 C148,76 158,102 160,132 C162,156 160,176 153,192 L140,187 C145,170 146,150 144,128 C142,106 137,90 128,78 Z"/>
      <path class="pm-zone" data-region="Isquiotibiais" data-side="direito" d="M70,163 C66,176 64,192 65,208 C66,228 68,246 71,262 L91,262 C93,248 93,230 91,214 C89,198 86,182 80,170 C76,167 73,165 70,163 Z"/>
      <path class="pm-zone" data-region="Isquiotibiais" data-side="esquerdo" d="M130,163 C134,176 136,192 135,208 C134,228 132,246 129,262 L109,262 C107,248 107,230 109,214 C111,198 114,182 120,170 C124,167 127,165 130,163 Z"/>
      <path class="pm-zone" data-region="Joelho posterior" data-side="direito" data-sub="1" d="M72,262 C70,270 70,280 72,288 L90,288 C92,280 92,270 90,262 Z"/>
      <path class="pm-zone" data-region="Joelho posterior" data-side="esquerdo" data-sub="1" d="M128,262 C130,270 130,280 128,288 L110,288 C108,280 108,270 110,262 Z"/>
      <path class="pm-zone" data-region="Panturrilha" data-side="direito" data-sub="2" d="M72,288 C68,300 67,314 69,326 C71,336 74,340 79,342 C84,340 87,332 88,320 C89,308 88,296 89,288 Z"/>
      <path class="pm-zone" data-region="Panturrilha" data-side="esquerdo" data-sub="2" d="M128,288 C132,300 133,314 131,326 C129,336 126,340 121,342 C116,340 113,332 112,320 C111,308 112,296 111,288 Z"/>
      <path class="pm-zone" data-region="Tendão de Aquiles" data-side="direito" d="M76,342 C74,350 73,358 74,366 L86,366 C87,358 86,350 84,342 Z"/>
      <path class="pm-zone" data-region="Tendão de Aquiles" data-side="esquerdo" d="M124,342 C126,350 127,358 126,366 L114,366 C113,358 114,350 116,342 Z"/>
      <path class="pm-zone" data-region="Tornozelo" data-side="direito" d="M73,366 C72,374 72,380 74,384 L88,384 C90,380 90,374 89,366 Z"/>
      <path class="pm-zone" data-region="Tornozelo" data-side="esquerdo" d="M127,366 C128,374 128,380 126,384 L112,384 C110,380 110,374 111,366 Z"/>
      <path class="pm-zone" data-region="Planta do pé" data-side="direito" d="M74,384 C69,386 60,390 56,396 C52,402 54,408 63,409 L93,409 C98,408 98,399 95,391 C92,385 90,384 74,384 Z"/>
      <path class="pm-zone" data-region="Planta do pé" data-side="esquerdo" d="M126,384 C131,386 140,390 144,396 C148,402 146,408 137,409 L107,409 C102,408 102,399 105,391 C108,385 110,384 126,384 Z"/>
    </svg>`;

  /* ---------------- monta o overlay no DOM ---------------- */
  function buildOverlay() {
    if (document.getElementById("painMapOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "painMapOverlay";
    ov.innerHTML = `
      <div class="pm-header">
        <button class="pm-back" id="pmBack">←</button>
        <div class="pm-steps" id="pmSteps"><div class="on"></div><div></div><div></div><div></div></div>
        <button class="pm-close" onclick="closePainMap()">✕</button>
      </div>
      <div class="pm-wrap">
        <div class="pm-view on" id="pm1">
          <span class="tag">Passo 1 de 4</span>
          <h3>Onde você sentiu dor?</h3>
          <div class="pm-panel" style="margin-top:14px">
            <div class="pm-seg" id="pmSeg">
              <div class="pm-pill" id="pmPill"></div>
              <button class="on" onclick="pmSetView('ant')">Frente</button>
              <button onclick="pmSetView('post')">Costas</button>
            </div>
            <div class="pm-stage">${BODY_SVG}</div>
            <div class="pm-subrow" id="pmSubrow"></div>
            <div class="pm-selline">Selecionado<b id="pmSelName">Toque em um ponto do corpo</b></div>
          </div>
          <button class="pm-btn" id="pm1Next" disabled onclick="pmToStep(2)">Continuar →</button>
        </div>

        <div class="pm-view" id="pm2">
          <span class="tag">Passo 2 de 4</span>
          <h3 id="pm2Title">Qual a intensidade?</h3>
          <div class="pm-panel" style="margin-top:14px">
            <div class="pm-intbig"><div class="pm-num" id="pmIntNum">5</div><div class="pm-lbl" id="pmIntLbl">Dor moderada</div></div>
            <input type="range" class="pm-slider" min="0" max="10" value="5" id="pmSlider" oninput="pmUpdateIntensity(this.value)">
            <div class="pm-sliderlabels"><span>0 · Sem dor</span><span>10 · Máxima</span></div>
          </div>
          <button class="pm-btn" onclick="pmToStep(3)">Continuar →</button>
        </div>

        <div class="pm-view" id="pm3">
          <span class="tag">Passo 3 de 4</span>
          <h3>Mais alguns detalhes</h3>
          <div class="pm-panel" style="margin-top:14px">
            <div class="pm-qgroup"><div class="pm-ql">Quando começou?</div>
              <div class="pm-chiprow" data-group="onset">
                <div class="pm-chip on">Hoje</div><div class="pm-chip">2–3 dias</div>
                <div class="pm-chip">Mais de 1 semana</div><div class="pm-chip">Mais de 1 mês</div>
              </div></div>
            <div class="pm-qgroup"><div class="pm-ql">Quando aparece?</div>
              <div class="pm-chiprow" data-group="timing">
                <div class="pm-chip on">Durante a corrida</div><div class="pm-chip">Depois da corrida</div>
                <div class="pm-chip">No dia seguinte</div><div class="pm-chip">Em repouso</div><div class="pm-chip">O tempo todo</div>
              </div></div>
            <div class="pm-qgroup"><div class="pm-ql">Está piorando?</div>
              <div class="pm-chiprow" data-group="trend">
                <div class="pm-chip tdown">Melhorando</div><div class="pm-chip tsame on">Igual</div><div class="pm-chip tup">Piorando</div>
              </div></div>
          </div>
          <button class="pm-btn" onclick="pmSubmit()">Concluir registro ✔</button>
        </div>

        <div class="pm-view" id="pm4">
          <div class="pm-hero"><div class="pm-ico" id="pmIco">✅</div><h2 id="pmResultTitle">Registro salvo</h2></div>
          <div class="pm-panel">
            <div class="pm-srow"><span class="k">Local</span><span class="v" id="pmSumLocal">—</span></div>
            <div class="pm-srow"><span class="k">Intensidade</span><span class="v"><span class="pm-pillint" id="pmSumInt">—</span></span></div>
            <div class="pm-srow"><span class="k">Começou</span><span class="v" id="pmSumOnset">—</span></div>
            <div class="pm-srow"><span class="k">Aparece</span><span class="v" id="pmSumTiming">—</span></div>
            <div class="pm-srow"><span class="k">Tendência</span><span class="v" id="pmSumTrend">—</span></div>
          </div>
          <div class="banner blue" style="margin-top:14px">Isso entra no seu histórico de dor e ajusta o semáforo automaticamente. Acompanhamento, não diagnóstico — a leitura clínica é do fisioterapeuta.</div>
          <button class="pm-btn ghost" style="margin-top:16px" onclick="pmRestart()">Registrar outro ponto</button>
          <button class="pm-btn" onclick="closePainMap()">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    // liga os cliques das zonas do corpo (delegação simples)
    ov.querySelectorAll(".pm-zone").forEach(z => z.addEventListener("click", () => pmMark(z)));
    ov.querySelectorAll('.pm-chiprow[data-group] .pm-chip').forEach(c => {
      c.addEventListener("click", () => pmChip(c));
    });
  }

  /* ---------------- estado ---------------- */
  let pmStep = 1;
  let pmSel = { region: null, side: null, sub: null, label: "", intensity: 5, onset: "Hoje", timing: "Durante a corrida", trend: "Igual" };

  window.openPainMap = function () {
    buildOverlay();
    document.getElementById("painMapOverlay").classList.add("open");
    pmRestart();
  };
  window.closePainMap = function () {
    const ov = document.getElementById("painMapOverlay");
    if (ov) ov.classList.remove("open");
  };

  window.pmToStep = function (n) {
    document.getElementById("pm" + pmStep).classList.remove("on");
    pmStep = n;
    document.getElementById("pm" + pmStep).classList.add("on");
    document.getElementById("pmBack").classList.toggle("show", n > 1 && n < 4);
    const steps = document.getElementById("pmSteps").children;
    for (let i = 0; i < 4; i++) steps[i].classList.toggle("on", i < n);
    if (n === 2) document.getElementById("pm2Title").textContent = "Qual a intensidade no " + pmSel.label.toLowerCase() + "?";
    document.getElementById("painMapOverlay").scrollTop = 0;
  };
  document.addEventListener("click", e => { if (e.target && e.target.id === "pmBack" && pmStep > 1) window.pmToStep(pmStep - 1); });

  window.pmSetView = function (which) {
    const btns = document.querySelectorAll("#pmSeg button");
    btns.forEach(b => b.classList.remove("on"));
    const pill = document.getElementById("pmPill");
    if (which === "ant") {
      btns[0].classList.add("on"); pill.style.transform = "translateX(0)";
      document.getElementById("pmSvgPost").classList.add("hidden");
      document.getElementById("pmSvgAnt").classList.remove("hidden");
    } else {
      btns[1].classList.add("on"); pill.style.transform = "translateX(100%)";
      document.getElementById("pmSvgAnt").classList.add("hidden");
      document.getElementById("pmSvgPost").classList.remove("hidden");
    }
    document.querySelectorAll(".pm-zone").forEach(z => z.classList.remove("sel"));
    document.getElementById("pmSubrow").innerHTML = "";
    document.getElementById("pmSelName").textContent = "Toque em um ponto do corpo";
    document.getElementById("pm1Next").disabled = true;
  };

  const PM_KNEE = ["Anterior", "Medial", "Lateral", "Posterior"];
  const PM_SHIN = ["Proximal", "Média", "Distal"];
  const PM_FEM = ["Coxa anterior", "Canela", "Panturrilha", "Isquiotibiais"];
  function pmSideLabel(region, side) {
    if (!side) return "";
    const fem = PM_FEM.includes(region);
    if (side === "direito") return fem ? "direita" : "direito";
    if (side === "esquerdo") return fem ? "esquerda" : "esquerdo";
    return side;
  }

  window.pmMark = function (el) {
    document.querySelectorAll(".pm-zone").forEach(z => z.classList.remove("sel"));
    el.classList.add("sel");
    const region = el.getAttribute("data-region");
    const side = el.getAttribute("data-side");
    const subType = el.getAttribute("data-sub");
    const label = region + (side ? " " + pmSideLabel(region, side) : "");
    pmSel.region = region; pmSel.side = side; pmSel.sub = null; pmSel.label = label;
    document.getElementById("pmSelName").textContent = label;
    document.getElementById("pm1Next").disabled = false;

    const subrow = document.getElementById("pmSubrow");
    subrow.innerHTML = "";
    const list = subType === "1" ? PM_KNEE : subType === "2" ? PM_SHIN : null;
    if (list) {
      list.forEach(s => {
        const b = document.createElement("button");
        b.textContent = s;
        b.onclick = () => {
          subrow.querySelectorAll("button").forEach(x => x.classList.remove("on"));
          b.classList.add("on");
          pmSel.sub = s;
          pmSel.label = label + " — " + s.toLowerCase();
          document.getElementById("pmSelName").textContent = pmSel.label;
        };
        subrow.appendChild(b);
      });
    }
  };

  const PM_COLORS = ['#2FA36B','#2FA36B','#5CB86E','#9BC24A','#E3C542','#E3A008','#E08A2A','#E0722A','#D9552E','#D6402E','#D64545'];
  const PM_LABELS = ['Sem dor','Dor muito leve','Dor leve','Dor leve','Dor moderada','Dor moderada','Dor moderada/alta','Dor alta','Dor alta','Dor muito alta','Dor máxima'];
  window.pmUpdateIntensity = function (v) {
    v = parseInt(v);
    pmSel.intensity = v;
    document.getElementById("pmIntNum").textContent = v;
    document.getElementById("pmIntNum").style.color = PM_COLORS[v];
    document.getElementById("pmIntLbl").textContent = PM_LABELS[v];
    document.getElementById("pmIntLbl").style.color = PM_COLORS[v];
  };

  window.pmChip = function (el) {
    const group = el.parentNode.getAttribute("data-group");
    [...el.parentNode.children].forEach(c => c.classList.remove("on"));
    el.classList.add("on");
    pmSel[group] = el.textContent;
  };

  /* ---------------- grava no Supabase + sincroniza o semáforo ---------------- */
  function pmDeriveColor(intensity) {
    if (intensity <= 3) return 'g';
    if (intensity <= 6) return 'y';
    return 'r';
  }

  window.pmSubmit = async function () {
    const btn = document.querySelector("#pm3 .pm-btn");
    btn.disabled = true; btn.textContent = "Salvando...";

    let ok = true;
    try {
      const { error } = await sb.from("pain_records").insert({
        email: GVCloud.email,
        workout_ref: new Date().toISOString().slice(0, 10),
        body_region: pmSel.region,
        body_side: pmSel.side || null,
        anatomical_subregion: pmSel.sub || null,
        intensity: pmSel.intensity,
        onset: pmSel.onset,
        timing: pmSel.timing,
        trend: pmSel.trend
      });
      if (error) throw error;
    } catch (e) {
      console.error("pain_records insert falhou:", e);
      ok = false;
    }

    // sincroniza o semáforo existente — mantém o bloqueio de força funcionando
    try {
      const cor = pmDeriveColor(pmSel.intensity);
      if (typeof window.logPain === "function") window.logPain(cor);
    } catch (e) { console.error("sync semáforo falhou:", e); }

    btn.disabled = false; btn.textContent = "Concluir registro ✔";

    document.getElementById("pmResultTitle").textContent = ok ? "Registro salvo" : "Salvo localmente";
    document.getElementById("pmIco").textContent = ok ? "✅" : "⚠️";
    document.getElementById("pmSumLocal").textContent = pmSel.label;
    const pill = document.getElementById("pmSumInt");
    pill.textContent = pmSel.intensity + " / 10";
    pill.style.background = PM_COLORS[pmSel.intensity];
    pill.style.color = pmSel.intensity >= 5 ? "#fff" : "#0A1730";
    document.getElementById("pmSumOnset").textContent = pmSel.onset;
    document.getElementById("pmSumTiming").textContent = pmSel.timing;
    document.getElementById("pmSumTrend").textContent = pmSel.trend;

    window.pmToStep(4);
  };

  window.pmRestart = function () {
    pmSel = { region: null, side: null, sub: null, label: "", intensity: 5, onset: "Hoje", timing: "Durante a corrida", trend: "Igual" };
    pmStep = 1;
    document.querySelectorAll(".pm-view").forEach(v => v.classList.remove("on"));
    document.getElementById("pm1").classList.add("on");
    document.getElementById("pmBack").classList.remove("show");
    document.querySelectorAll(".pm-zone").forEach(z => z.classList.remove("sel"));
    document.getElementById("pmSubrow").innerHTML = "";
    document.getElementById("pmSelName").textContent = "Toque em um ponto do corpo";
    document.getElementById("pm1Next").disabled = true;
    document.getElementById("pmSlider").value = 5;
    window.pmUpdateIntensity(5);
    const steps = document.getElementById("pmSteps").children;
    for (let i = 0; i < 4; i++) steps[i].classList.toggle("on", i === 0);
  };

  /* ---------------- botão de entrada na aba Dor ---------------- */
  function injectOpenButton() {
    const pain = document.getElementById("vPain");
    if (!pain || document.getElementById("pmOpenBtn")) return;
    const btn = document.createElement("button");
    btn.id = "pmOpenBtn";
    btn.className = "pm-openbtn";
    btn.innerHTML = `<span class="ic">🗺️</span><span>Registrar no mapa do corpo — mais preciso</span>`;
    btn.onclick = window.openPainMap;
    const h2 = pain.querySelector("h2.sec");
    if (h2) h2.after(btn); else pain.prepend(btn);
  }
  try { injectOpenButton(); } catch (e) {}
  const _prevShow = window.show;
  window.show = function (id) {
    if (typeof _prevShow === "function") _prevShow(id);
    if (id === "vPain") injectOpenButton();
  };

})();
