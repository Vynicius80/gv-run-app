/* ============================================================
   GV RUN — Histórico de dor (Etapa 3b)
   ------------------------------------------------------------
   Adiciona um botão na aba Dor que abre o histórico agregado,
   lendo pain_records do Supabase. Mostra resumo, cards por
   região com tendência, e um card de padrão quando uma região
   se repete — sempre como acompanhamento, nunca diagnóstico.

   Requer: gv-auth-sync.js (usa `sb`/`GVCloud`) e, de preferência,
   gv-painmap.js carregado (reaproveita o botão de registrar).
   Carregar DEPOIS de gv-painmap.js, antes de </body>:
   <script src="gv-painhistory.js"></script>
   ============================================================ */
(function () {

  const css = `
  #painHistOverlay{position:fixed;inset:0;background:var(--navy);z-index:997;overflow-y:auto;display:none}
  #painHistOverlay.open{display:block}
  .ph-header{padding:16px 20px 12px;display:flex;align-items:center;gap:12px;position:sticky;top:0;
    background:linear-gradient(90deg,var(--navy),var(--deep));border-bottom:1px solid var(--line);z-index:2}
  .ph-header h3{font-size:17px;flex:1}
  .ph-close{background:none;border:none;color:var(--mut);font-size:20px;cursor:pointer;padding:0 4px}
  .ph-wrap{padding:20px 20px 40px}
  .ph-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
  .ph-sum{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 10px;text-align:center}
  .ph-sum .v{font-size:24px;font-weight:800;color:var(--txt)}
  .ph-sum .k{font-size:10.5px;color:var(--mut);font-weight:700;margin-top:2px}
  .ph-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:12px}
  .ph-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06)}
  .ph-row:last-child{border:none}
  .ph-row .nm{font-size:13.5px;font-weight:700;width:104px;flex:none}
  .ph-row .bar{flex:1;height:8px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden}
  .ph-row .bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--amber),var(--red))}
  .ph-row .meta{font-size:11px;color:var(--mut);width:74px;text-align:right;flex:none}
  .ph-row .trend{font-size:15px;width:20px;text-align:center;flex:none}
  .ph-empty{text-align:center;padding:50px 20px;color:var(--mut)}
  .ph-empty .ic{font-size:40px;margin-bottom:10px}
  .ph-pattern{background:linear-gradient(135deg,rgba(214,69,69,.14),var(--card));border:1px solid rgba(214,69,69,.4);
    border-radius:16px;padding:18px;margin-top:4px}
  .ph-pattern .tag{color:#F0A0A0;font-size:9.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase}
  .ph-pattern h3{font-size:16px;margin:6px 0 6px;color:var(--ice)}
  .ph-pattern p{font-size:13px;color:var(--mut);margin-bottom:14px;line-height:1.5}
  .ph-btn{display:block;width:100%;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:800;
    color:#fff;background:var(--navy2);border:1px solid var(--line);cursor:pointer;text-align:center}
  .ph-disclaimer{font-size:11px;color:var(--mut);text-align:center;margin-top:14px;line-height:1.5}
  .ph-openbtn{width:100%;border:1.5px solid var(--line);background:rgba(87,160,255,.05);color:var(--sky);
    border-radius:14px;padding:14px;font-weight:800;font-size:14px;cursor:pointer;margin-bottom:14px;text-align:left;
    display:flex;align-items:center;gap:10px}
  `;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function buildOverlay() {
    if (document.getElementById("painHistOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "painHistOverlay";
    ov.innerHTML = `
      <div class="ph-header">
        <h3>Histórico de dor</h3>
        <button class="ph-close" onclick="closePainHistory()">✕</button>
      </div>
      <div class="ph-wrap" id="phWrap">
        <div class="ph-empty">Carregando...</div>
      </div>`;
    document.body.appendChild(ov);
  }

  const FEM = ["Coxa anterior", "Canela", "Panturrilha", "Isquiotibiais"];
  function sideLabel(region, side) {
    if (!side) return "";
    const fem = FEM.includes(region);
    if (side === "direito") return fem ? "direita" : "direito";
    if (side === "esquerdo") return fem ? "esquerda" : "esquerdo";
    return side;
  }
  function fmtDate(d) {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    return day + "/" + m;
  }

  window.openPainHistory = async function () {
    buildOverlay();
    document.getElementById("painHistOverlay").classList.add("open");
    const wrap = document.getElementById("phWrap");
    wrap.innerHTML = `<div class="ph-empty">Carregando...</div>`;

    let rows = [];
    try {
      const { data, error } = await sb.from("pain_records")
        .select("*")
        .eq("email", GVCloud.email)
        .order("created_at", { ascending: true });
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      console.error("erro ao carregar pain_records:", e);
      wrap.innerHTML = `<div class="ph-empty"><div class="ic">⚠️</div>Não consegui carregar seu histórico agora.<br>Tente novamente em instantes.</div>`;
      return;
    }

    // janela de 60 dias
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    rows = rows.filter(r => new Date(r.created_at) >= cutoff);

    if (!rows.length) {
      wrap.innerHTML = `<div class="ph-empty"><div class="ic">🗺️</div>Você ainda não registrou nenhuma dor.<br>Use o mapa do corpo quando sentir algo.</div>`;
      return;
    }

    // agrega por região+lado
    const groups = {};
    rows.forEach(r => {
      const key = r.body_region + "|" + (r.body_side || "");
      if (!groups[key]) groups[key] = { region: r.body_region, side: r.body_side, items: [] };
      groups[key].items.push(r);
    });
    const list = Object.values(groups).map(g => {
      const items = g.items;
      const count = items.length;
      const lastDate = items[items.length - 1].created_at.slice(0, 10);
      const avgInt = items.reduce((s, i) => s + i.intensity, 0) / count;
      let trend = "—", trendColor = "var(--mut)";
      if (count >= 2) {
        const mid = Math.floor(count / 2);
        const older = items.slice(0, Math.max(mid, 1));
        const newer = items.slice(mid);
        const avgOld = older.reduce((s, i) => s + i.intensity, 0) / older.length;
        const avgNew = newer.reduce((s, i) => s + i.intensity, 0) / newer.length;
        const diff = avgNew - avgOld;
        if (diff > 0.6) { trend = "↗"; trendColor = "#E14B4B"; }
        else if (diff < -0.6) { trend = "↘"; trendColor = "#2FA36B"; }
        else { trend = "→"; trendColor = "#E3A008"; }
      }
      return { ...g, count, lastDate, avgInt, trend, trendColor };
    }).sort((a, b) => b.count - a.count);

    const totalRegistros = rows.length;
    const totalRegioes = list.length;
    const top = list[0];
    const maxCount = top.count;

    const rowsHtml = list.map(g => {
      const label = g.region + (g.side ? " " + sideLabel(g.region, g.side) : "");
      const pct = Math.round((g.count / maxCount) * 100);
      return `<div class="ph-row">
        <span class="nm">${label}</span>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <span class="meta">${g.count}× · ${g.avgInt.toFixed(1)}/10</span>
        <span class="trend" style="color:${g.trendColor}">${g.trend}</span>
      </div>`;
    }).join("");

    const showPattern = totalRegistros >= 4 && (top.count >= 5 || top.count / totalRegistros >= 0.5);
    const patternHtml = showPattern ? `
      <div class="ph-pattern">
        <span class="tag">Padrão identificado</span>
        <h3>${top.region}${top.side ? " " + sideLabel(top.region, top.side) : ""} voltou ${top.count} vezes</h3>
        <p>É o mesmo ponto se repetindo com frequência nos últimos 60 dias. Vale uma avaliação — o app mostra o padrão, mas não diagnostica.</p>
        <button class="ph-btn" onclick="window.open('https://instagram.com/vyni.fisio','_blank')">Falar com fisioterapeuta</button>
      </div>` : "";

    wrap.innerHTML = `
      <div class="ph-summary">
        <div class="ph-sum"><div class="v">${totalRegistros}</div><div class="k">REGISTROS<br>60 DIAS</div></div>
        <div class="ph-sum"><div class="v">${totalRegioes}</div><div class="k">REGIÕES<br>DIFERENTES</div></div>
        <div class="ph-sum"><div class="v">${top.count}</div><div class="k">MAIOR<br>RECORRÊNCIA</div></div>
      </div>
      <div class="ph-card">${rowsHtml}</div>
      ${patternHtml}
      <div class="ph-disclaimer">Isto é acompanhamento, não diagnóstico. A leitura clínica é sempre do fisioterapeuta.</div>`;
  };

  window.closePainHistory = function () {
    const ov = document.getElementById("painHistOverlay");
    if (ov) ov.classList.remove("open");
  };

  function injectButton() {
    const pain = document.getElementById("vPain");
    if (!pain || document.getElementById("phOpenBtn")) return;
    const btn = document.createElement("button");
    btn.id = "phOpenBtn";
    btn.className = "ph-openbtn";
    btn.innerHTML = `<span>📊</span><span>Ver histórico de dor</span>`;
    btn.onclick = window.openPainHistory;
    // encaixa depois do botão do mapa, se existir; senão, no topo
    const mapBtn = document.getElementById("pmOpenBtn");
    if (mapBtn) mapBtn.after(btn);
    else {
      const h2 = pain.querySelector("h2.sec");
      if (h2) h2.after(btn); else pain.prepend(btn);
    }
  }
  try { injectButton(); } catch (e) {}
  const _prevShow = window.show;
  window.show = function (id) {
    if (typeof _prevShow === "function") _prevShow(id);
    if (id === "vPain") injectButton();
  };

})();
