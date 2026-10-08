/* ============================================================
   GV RUN — Etapa clínica 1
   Semáforo da dor como gate da sessão de força + diário de tolerância
   ------------------------------------------------------------
   Este arquivo "encaixa por cima" do app. Ele NÃO substitui nada do
   index.html — só melhora o comportamento de algumas funções.
   IMPORTANTE: carregue este arquivo DEPOIS do <script> principal
   (logo antes de </body>), senão ele não tem efeito.
   ============================================================ */
(function () {

  /* ---------- Helpers de estado da dor ---------- */
  // cor do último registro (independente do dia) — é o "estado atual"
  window.currentPainColor = function () {
    return (S && S.pain && S.pain.length) ? S.pain[S.pain.length - 1].c : null;
  };
  // cor registrada HOJE (ou null se ainda não registrou hoje)
  window.painToday = function () {
    const lp = (S && S.pain && S.pain.length) ? S.pain[S.pain.length - 1] : null;
    return (lp && lp.d === today()) ? lp.c : null;
  };
  // força (B e C) fica bloqueada enquanto o estado atual for vermelho
  window.strengthBlocked = function () {
    return currentPainColor() === 'r';
  };

  // guarda a sessão que o aluno quer abrir enquanto ele registra a dor
  window.pendingSession = null;

  /* ---------- Textos de orientação ---------- */
  const GUIDE_YELLOW =
    `<div class="card"><span class="tag">Protocolo pós-dor (amarelo)</span><p>1 · Corte o volume de corrida pela metade; tire ritmo forte e descidas por 3–5 dias.<br><br>2 · Na força, volte às doses da semana anterior e mantenha só os exercícios sem dor. Respeite o ângulo de proteção.<br><br>3 · Mantenha a mobilidade diária.<br><br>4 · Teste de retorno: 15 min de trote leve → dor ≤ 3/10 durante e na manhã seguinte? Retome a progressão.<br><br>5 · Dor voltou 2x no mesmo lugar? Poste vídeo + descrição no grupo.</p></div>`;

  const GUIDE_GREEN =
    `<div class="card"><span class="tag" style="color:#7FDCA9">Tudo certo</span><p>Semáforo verde registrado. Treine e progrida normalmente. 👊</p></div>`;

  // Vermelho — versão ampliada, com bloqueio, mobilidade permitida e sinais de alerta
  const GUIDE_RED =
    `<div class="card" style="border-color:rgba(214,69,69,.5)">
      <span class="tag" style="color:#F0A0A0">🔴 Vermelho — força bloqueada</span>
      <p><b>A sessão de força fica bloqueada automaticamente</b> enquanto o semáforo estiver vermelho. Ela volta a liberar sozinha assim que você registrar um semáforo fora do vermelho — não force antes.</p>
      <p><b>Hoje você pode:</b> apenas <b>mobilidade articular</b>, sempre no ângulo indolor e mantendo a dor entre <b>0 e 3/10</b> durante o movimento. Passou disso, pare.</p>
      <p><b>Corrida:</b> suspenda ou reduza bastante enquanto estiver no vermelho — nada de ritmo forte, tiros ou descidas.</p>
      <p><b>Monitore:</b> anote o local da dor, quando começou, o que piora e o que melhora, e a nota de 0–10. Reavalie a cada 24–48 h.</p>
      <p><b>Procure avaliação presencial se houver:</b> dor que piora à noite ou em repouso, inchaço, calor ou vermelhidão local, sensação de falseio/instabilidade, formigamento ou dormência, ou dor que não melhora em alguns dias.</p>
      <p>Descreva o quadro e mande pra gente no grupo ou no direct <b style="color:var(--sky)">@vyni.fisio · @guicarlii</b>.</p>
    </div>`;

  const PROMPT_GATE =
    `<div class="card" style="border-color:rgba(87,160,255,.4)"><span class="tag" style="color:var(--sky)">Antes de treinar força</span><p>Registre como está a dor de hoje para liberar a sessão. 🟢 verde e 🟡 amarelo liberam (o amarelo entra no protocolo modificado); 🔴 vermelho bloqueia a força e libera só mobilidade.</p></div>`;

  /* ---------- Registro da dor (com continuação do gate) ---------- */
  window.logPain = function (c) {
    S.pain.push({ d: today(), c });
    save();
    renderPain(c);
    if (c === 'r') {
      pendingSession = null; // ficou no vermelho: nada de força
    } else if (pendingSession) {
      const t = pendingSession;
      pendingSession = null;
      openSession(t); // verde/amarelo: segue direto pra sessão que estava pendente
    }
  };

  /* ---------- Tela da dor (orientação persistente pelo estado atual) ---------- */
  window.renderPain = function (justLogged) {
    const cur = currentPainColor();
    const g = document.getElementById("painGuide");
    let html = "";
    if (pendingSession && !painToday()) html += PROMPT_GATE;
    if (cur === 'r') html += GUIDE_RED;
    else if (cur === 'y') html += GUIDE_YELLOW;
    else if (justLogged === 'g') html += GUIDE_GREEN;
    g.innerHTML = html;

    const h = document.getElementById("painHistory");
    if (!S.pain.length) { h.innerHTML = "<p>Nenhum registro ainda.</p>"; return; }
    const col = { g: "var(--green)", y: "var(--amber)", r: "var(--red)" },
          nm = { g: "Verde", y: "Amarelo", r: "Vermelho" };
    h.innerHTML = S.pain.slice(-14).reverse()
      .map(p => `<div class="log"><span class="dot" style="background:${col[p.c]}"></span>${br(p.d)} — ${nm[p.c]}</div>`)
      .join("");
  };

  /* ---------- Abertura da sessão com o gate clínico ----------
     IMPORTANTE: usa monthNow()/phaseOfMonth()/contentBlock(), as
     mesmas funções do index.html (sistema de 12 meses / GV Run
     Club). As funções antigas week()/phaseOf() eram do programa
     de 8 semanas e não existem mais — usá-las aqui quebrava a
     abertura de QUALQUER sessão com um erro silencioso. */
  const _openList = function (t) {
    // esta parte é idêntica ao app original: monta e mostra a sessão
    curSession = t; curChecks = {};
    const m = monthNow(), ph = phaseOfMonth(m), P = PHASE_INFO[ph];
    const list = WEEKS[contentBlock()][t];
    const titles = { M: "(A) Mobilidade e foot core", B: "(B) Controle e propriocepção", C: "(C) Força" };
    document.getElementById("sesTag").textContent = t === "M" ? `Mês ${m} · todos os dias` : `Mês ${m} · Fase ${ph} · ${P.name}`;
    document.getElementById("sesTitle").textContent = titles[t];
    document.getElementById("sesFocus").textContent = t === "M"
      ? "Antes de correr, complete com o RAMP: trote leve → ativação com faixa → esta rotina → 3–4 acelerações."
      : P.focus;
    const nb = document.getElementById("sesLevelNote");
    let note = "";
    // aviso extra: mobilidade durante estado vermelho
    if (t === "M" && strengthBlocked()) {
      note += `<div class="banner warn" style="margin-top:10px">🔴 Você está no vermelho: faça <b>apenas mobilidade no ângulo indolor</b>, mantendo a dor entre <b>0 e 3/10</b>. Se passar disso, pare.</div>`;
    }
    if (t !== "M" && S.level !== "int" && LEVEL_NOTE[ph][S.level]) note += `<div class="banner blue" style="margin-top:10px"><b>${levelName(S.level)}:</b> ${LEVEL_NOTE[ph][S.level]}</div>`;
    // protocolo modificado quando entra amarelo
    if (t !== "M" && painToday() === 'y') {
      note += `<div class="banner warn" style="margin-top:10px">🟡 Amarelo hoje: use as doses da semana anterior e mantenha só os exercícios sem dor. Respeite o ângulo de proteção.</div>`;
    }
    if (t !== "M") note += `<div class="banner warn" style="margin-top:10px">⚠️ ${SAFETY_NOTE}</div>`;
    nb.innerHTML = note;
    document.getElementById("sesList").innerHTML = list.map((e, i) => `<div class="ex" id="ex${i}" onclick="toggleEx(${i})"><div class="box"></div><div style="flex:1"><div class="nm">${e.n}</div><div class="ds">${e.d}</div>${VIDEOS[e.id] ? `<a class="vid" href="#" onclick="event.stopPropagation();event.preventDefault();openVideo('${VIDEOS[e.id]}')">▶ ver vídeo do exercício</a>` : ""}</div></div>`).join("");
    updateDoneBtn(list.length); show("vSession");
  };

  window.openSession = function (t) {
    // Mobilidade (A) sempre liberada. Força (B/C) passa pelo gate.
    if (t !== 'M') {
      if (strengthBlocked()) {
        alert("🔴 Sessão de força bloqueada enquanto a dor está no vermelho.\n\nHoje, só mobilidade articular (dor 0–3/10). Veja as orientações na aba Dor.");
        show('vPain');
        return;
      }
      if (!painToday()) {
        pendingSession = t;   // guarda a sessão e pede a dor primeiro
        show('vPain');
        return;
      }
    }
    _openList(t);
  };

  /* ---------- Conclusão da sessão: salva a dor de entrada junto ---------- */
  window.completeSession = function () {
    const total = document.querySelectorAll("#sesList .ex").length,
          done = Object.values(curChecks).filter(Boolean).length;
    S.sessions.push({ d: today(), t: curSession, ph: phaseOfMonth(monthNow()), done, total, pain: painToday() || null });
    save();
    alert("Sessão registrada! 💪 Consistência é o que previne lesão.");
    show("vHome");
  };

  /* ---------- Banner da home: vermelho persiste até sair do vermelho ---------- */
  const _origHome = window.renderHome;
  window.renderHome = function () {
    _origHome();
    const cur = currentPainColor(), pb = document.getElementById("painBanner");
    if (cur === 'r') {
      pb.classList.remove("hidden");
      pb.innerHTML = "🔴 Força bloqueada enquanto a dor está no vermelho. Hoje só mobilidade articular (dor 0–3/10). Veja as orientações na aba Dor.";
    }
    // amarelo/verde continuam com o comportamento original do app
  };

  /* ---------- Diário de tolerância (treino × dor, dia a dia) ---------- */
  window.renderDaily = function () {
    const el = document.getElementById("repDaily");
    if (!el) return;
    const days = {};
    (S.sessions || []).forEach(s => { (days[s.d] = days[s.d] || { ses: [], pain: null }).ses.push(s); });
    (S.pain || []).forEach(p => { (days[p.d] = days[p.d] || { ses: [], pain: null }).pain = p.c; });
    const dates = Object.keys(days).sort().reverse().slice(0, 14);
    if (!dates.length) { el.innerHTML = `<p style="color:var(--mut);margin-top:4px">Ainda sem registros diários. Marque uma sessão ou a dor para começar.</p>`; return; }
    const col = { g: "var(--green)", y: "var(--amber)", r: "var(--red)" };
    const icon = { M: "🌀", B: "🎯", C: "💪" };
    el.innerHTML = dates.map(d => {
      const day = days[d];
      const ses = day.ses.length
        ? day.ses.map(s => `${icon[s.t] || "•"} ${s.done}/${s.total}`).join(" &nbsp; ")
        : `<span style="color:var(--mut)">só dor</span>`;
      const dot = day.pain ? `<span class="dot" style="background:${col[day.pain]}"></span>` : `<span class="dot" style="background:var(--line)"></span>`;
      return `<div class="log">${dot}${br(d)} — ${ses}</div>`;
    }).join("");
  };

  // injeta o card do diário na aba Evolução e faz o relatório desenhá-lo
  function injectDaily() {
    const rep = document.getElementById("vReport");
    if (!rep || document.getElementById("repDaily")) return;
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<span class="tag">Diário de tolerância</span><h3>Treino × dor, dia a dia</h3><div id="repDaily"></div>`;
    const cards = rep.querySelectorAll(".card");
    if (cards[2]) rep.insertBefore(card, cards[2]); else rep.appendChild(card);
  }
  injectDaily();

  const _origReport = window.renderReport;
  window.renderReport = function () {
    if (typeof _origReport === "function") _origReport();
    renderDaily();
  };

})();
