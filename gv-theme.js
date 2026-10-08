/* ============================================================
   GV RUN CLUB — Tema visual (camada final)
   ------------------------------------------------------------
   Moderniza a aparência do app sem mexer na estrutura do HTML,
   para que todos os módulos (mapa de dor, registro de corrida,
   anamnese, lembretes) continuem encaixando normalmente.

   Mantém a paleta da marca. Muda tipografia, cartões, botões,
   rótulos e navegação.

   Carregar por ÚLTIMO, depois de gv-inactivity.js:
   <script src="gv-theme.js"></script>
   Para voltar ao visual anterior, basta remover essa linha.
   ============================================================ */
(function () {

  // ---- fontes da marca (as mesmas da landing e do protocolo) ----
  function addLink(attrs) {
    const l = document.createElement("link");
    Object.keys(attrs).forEach(k => l.setAttribute(k, attrs[k]));
    document.head.appendChild(l);
  }
  addLink({ rel: "preconnect", href: "https://fonts.googleapis.com" });
  addLink({ rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" });
  addLink({ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" });

  const css = `
:root{
  --navy:#0A1730; --navy2:#0E1C38; --deep:#16305E; --blue:#2E6FDB; --sky:#57A0FF;
  --ice:#EAF2FF; --card:#112040; --line:rgba(87,160,255,.16);
  --txt:#EAF2FF; --mut:#93A9CC;
  --disp:'Barlow Condensed','Arial Narrow',Arial,sans-serif;
  --body:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
}

/* ---------- base ---------- */
html body{
  font-family:var(--body)!important;
  background:radial-gradient(120% 55% at 50% -12%, rgba(46,111,219,.24), transparent 62%), var(--navy)!important;
  background-attachment:fixed!important;
  color:var(--txt)!important;
  -webkit-font-smoothing:antialiased;
}
html body .wrap{padding:20px 16px!important}

/* ---------- topo ---------- */
html body header{
  background:rgba(10,23,48,.82)!important;
  -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px);
  border-bottom:1px solid var(--line)!important;
  padding:14px 20px 12px!important;
}
html body header .eyebrow{
  font-family:var(--body)!important; font-size:12px!important; font-weight:600!important;
  letter-spacing:0!important; text-transform:none!important; color:var(--sky)!important;
}
html body header h1{
  font-family:var(--disp)!important; font-size:27px!important; font-weight:800!important;
  letter-spacing:.005em!important; line-height:1.05!important; margin-top:1px!important;
}

/* ---------- rótulos: texto normal em vez de CAIXA ALTA espaçada ---------- */
html body .card .tag,
html body table.cmp th{
  font-family:var(--body)!important; font-size:12.5px!important; font-weight:600!important;
  letter-spacing:0!important; text-transform:none!important; color:var(--sky)!important;
  margin-bottom:4px!important;
}
/* títulos de seção viram títulos de verdade */
html body h2.sec{
  font-family:var(--disp)!important; font-size:22px!important; font-weight:700!important;
  letter-spacing:.005em!important; text-transform:none!important; color:var(--ice)!important;
  margin:22px 0 12px!important;
}

/* ---------- cartões ---------- */
html body .card{
  background:var(--card)!important; border:1px solid var(--line)!important;
  border-radius:14px!important; box-shadow:none!important; padding:18px!important;
}
html body .card h3{
  font-family:var(--disp)!important; font-size:22px!important; font-weight:700!important;
  line-height:1.1!important; letter-spacing:.005em!important;
}
html body .card p{font-size:14px!important; line-height:1.6!important; color:var(--mut)!important}

/* ---------- destaque: o cartão do mês na Home ---------- */
html body #vHome > .card:first-child{
  border-radius:20px!important; padding:22px 20px 20px!important;
  background:linear-gradient(160deg, #183566 0%, #112040 70%)!important;
  border:1px solid rgba(87,160,255,.28)!important;
}
html body #homeGreet{
  font-size:31px!important; line-height:1.02!important; font-weight:800!important; margin-top:2px!important;
}
/* o resumo da semana é uma linha de status, não um título */
html body #weekDoneTitle{
  font-family:var(--body)!important; font-size:15px!important; font-weight:600!important;
  line-height:1.5!important; color:var(--ice)!important;
}
html body #homeMsg{margin-top:10px!important}

/* barra do mês em 12 segmentos (um por mês do ano) */
html body #vHome .progress,
html body #vReport .progress{
  height:10px!important; border-radius:0!important; margin-top:16px!important;
  background:rgba(255,255,255,.08)!important;
  -webkit-mask:repeating-linear-gradient(90deg,#000 0 calc(100%/12 - 4px),transparent calc(100%/12 - 4px) calc(100%/12));
          mask:repeating-linear-gradient(90deg,#000 0 calc(100%/12 - 4px),transparent calc(100%/12 - 4px) calc(100%/12));
}
html body #vHome .progress i,
html body #vReport .progress i{
  border-radius:0!important; background:var(--sky)!important;
}

/* ---------- botões ---------- */
html body .btn{
  font-family:var(--body)!important; font-weight:700!important; font-size:15.5px!important;
  border-radius:14px!important; padding:16px 18px!important;
  background:linear-gradient(180deg,#3A7BEA,#2E6FDB)!important; color:#fff!important;
  box-shadow:0 1px 0 rgba(255,255,255,.12) inset, 0 10px 24px rgba(46,111,219,.28)!important;
  transition:transform .12s ease, background .15s ease;
}
html body .btn:active{transform:scale(.985)}
html body .btn.ghost{
  background:rgba(255,255,255,.025)!important; border:1px solid var(--line)!important;
  color:var(--ice)!important; box-shadow:none!important;
}
html body .btn:disabled{opacity:.5!important}
/* as três sessões da Home: blocos alinhados à esquerda, fáceis de tocar */
html body #vHome > .btn{text-align:left!important; padding:19px 20px!important; font-size:16px!important}

/* ---------- lista de exercícios ---------- */
html body .ex{padding:14px 0!important; border-bottom:1px solid rgba(255,255,255,.06)!important}
html body .ex .box{
  flex:0 0 24px!important; width:24px!important; height:24px!important;
  border-radius:7px!important; border:2px solid rgba(87,160,255,.55)!important;
}
html body .ex.done .box{background:var(--sky)!important; border-color:var(--sky)!important; color:#0A1730!important}
html body .ex .nm{font-size:15px!important; font-weight:600!important}
html body .ex .ds{font-size:13px!important; font-weight:600!important; color:var(--sky)!important}
html body .ex a.vid{font-size:12.5px!important; color:var(--mut)!important}

/* ---------- semáforo e avisos ---------- */
html body .sem{border-radius:14px!important; font-weight:700!important; padding:17px!important}
html body .sem small{font-weight:500!important; opacity:.92!important}
html body .banner{border-radius:12px!important}
html body .chip{font-size:12px!important; font-weight:600!important; border-radius:999px!important; padding:5px 12px!important}

/* ---------- campos ---------- */
html body input[type=text],
html body input[type=number],
html body input[type=password]{
  font-family:var(--body)!important; border-radius:12px!important;
  background:rgba(10,23,48,.7)!important; border:1px solid var(--line)!important;
}
html body input:focus{outline:none; border-color:var(--sky)!important; box-shadow:0 0 0 3px rgba(87,160,255,.18)!important}

/* ---------- navegação inferior ---------- */
html body nav{
  background:rgba(10,23,48,.9)!important;
  -webkit-backdrop-filter:blur(16px); backdrop-filter:blur(16px);
  border-top:1px solid var(--line)!important;
}
html body nav button{
  font-family:var(--body)!important; font-weight:600!important; font-size:11.5px!important;
  color:var(--mut)!important; position:relative;
}
html body nav button.on{color:var(--sky)!important}
html body nav button.on::before{
  content:""; position:absolute; top:0; left:50%; width:28px; height:3px; margin-left:-14px;
  border-radius:0 0 3px 3px; background:var(--sky);
}

/* ---------- acessibilidade ---------- */
html body :focus-visible{outline:2px solid var(--sky)!important; outline-offset:2px!important}
@media (prefers-reduced-motion:reduce){ html body *{transition:none!important} }
`;

  const st = document.createElement("style");
  st.id = "gv-theme";
  st.textContent = css;
  document.head.appendChild(st);

  // garante que o tema fique por último, mesmo se outro módulo
  // injetar estilos depois que a página terminar de carregar
  window.addEventListener("load", function () { document.head.appendChild(st); });
})();
