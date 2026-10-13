/* ============================================================
   GV RUN — Motor de prescrição · Etapa 3 (MODO SOMBRA)
   ------------------------------------------------------------
   O QUE FAZ
   - Calcula, no aparelho, o que o motor PRESCREVERIA para o aluno
     (gates clínicos + avaliação -> degrau inicial + série extra no
     lado fraco + explicação em linguagem simples).
   - Em MODO SOMBRA: só lê e escreve no console. NÃO altera tela,
     NÃO grava no banco, NÃO muda a lista de exercícios do app.
   - Qualquer erro é engolido: o app continua exatamente como está.

   ONDE CARREGAR (index.html)
     <script src="gv-clinic.js"></script>
     <script src="gv-engine.js"></script>     <-- AQUI
     <script src="gv-ui.js"></script>
   Depende de: gv-auth-sync.js (window.sb) e gv-clinic.js (openSession).
   Este arquivo NÃO contém chaves do Supabase: usa o `sb` do app.

   DESLIGAR
   - Rápido, num aparelho:  localStorage.setItem('gv_engine_off','1')
   - Geral: apague a linha <script src="gv-engine.js"></script>

   REGRAS CLÍNICAS (código, não editáveis por tabela)
   1. Vermelho bloqueia B e C; libera só mobilidade (dor 0-3/10).
   2. Check de 24h da manhã seguinte vale como semáforo do dia.
   3. Dia seguinte a longão/competição: força regenerativa.
   4. Só os rótulos "Simetria ideal" e "Assimetria alta — atenção".
      Nada de linguagem diagnóstica ou "risco de lesão".
   5. Nenhuma periodização de corrida.
   ============================================================ */
(function (root) {
  'use strict';

  var VERSION = '0.4.0-shadow';

  /* ---------------- parâmetros de reserva (iguais ao engine_config) ----------------
     Usados se a leitura do banco falhar. Valores = seeds da Etapa 2. */
  var DEFAULT_CFG = {
    lsi_corte_atencao: 85,
    lsi_selo_app: 90,
    serie_extra_lado_fraco: 1,
    longao: { tipos: ['longao', 'trilha', 'competicao'], duracao_min_gt: 90, janela_horas: 30 },
    moderada: { rpe_gte: 7, duracao_min_gt: 60, janela_horas: 30 },
    regenerativa: { series_fator: 0.5, esforco_max: 'facil', sem_subir_degrau: true },
    nivel_pontos: { ini_max: 1, int_max: 3 },
    dor_mobilidade_max: 3,
    /* Etapa 4 — semana (as chaves sessoes_por_semana e gruda_semanas também existem no banco) */
    sessoes_por_semana: { A: 7, B: 2, C1: 3, C2: 3 },
    gruda_semanas: 4,
    selecao: { max_itens: { A: null, B: 5, C1: 5, C2: 5 } },
    dias_forca: [1, 2, 3, 4, 5, 6],      // 0 = domingo; sem domingo = 1 dia livre por semana
    b_junto_de_forca: true               // B cai em dia de força (padrão aceito)
  };

  /* Quando mais de uma regra pede para recuar degrau, vale o MAIOR recuo
     (não soma). Decisão provisória, a confirmar com o dono clínico. */
  var DELTA_MODO = 'maior_recuo';

  var SESSOES_FORCA = ['B', 'C1', 'C2'];
  var MAPA_SESSAO_APP = { M: 'A', B: 'B', C: 'C1' };
  var CAMPOS_PERMITIDOS = ['lsi_sym', 'lado_abaixo_da_meta', 'valgo', 'sessoes_facil_seguidas',
    'sessoes_incompletas_seguidas', 'dor_durante_max', 'dor_24h_delta', 'esforco_ultimo',
    'reps_completas', 'carga_semana_pct_media4'];

  /* Textos do aluno para os gates (também passam pelo lint de linguagem) */
  var GATE_TEXTOS = {
    bloqueada: 'Hoje o foco é mobilidade leve. Vamos retomar a força quando a dor melhorar.',
    regenerativa: 'Depois do treino longo, a força de hoje é regenerativa para você recuperar.',
    moderada: 'Hoje a força é moderada: sem carga máxima e sem pliometria.',
    completa: ''
  };

  /* ================= utilidades ================= */
  function toNum(x) {
    if (x === null || x === undefined || x === '') return null;
    var n = Number(x);
    return isNaN(n) ? null : n;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lowerFirst(s) {
    s = String(s || '');
    return (s.length > 1 && s.charAt(1) === s.charAt(1).toLowerCase() && s.charAt(1) !== s.charAt(1).toUpperCase())
      ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  /* ================= LSI (idêntico ao index.html) ================= */
  function lsiSym(d, e) {
    d = toNum(d); e = toNum(e);
    if (!(d > 0) || !(e > 0)) return null;
    return Math.round(Math.min(d, e) / Math.max(d, e) * 100);
  }
  function rotuloLsi(sym, cfg) {
    if (sym === null || sym === undefined) return null;
    var corte = (cfg && cfg.lsi_corte_atencao != null) ? cfg.lsi_corte_atencao : DEFAULT_CFG.lsi_corte_atencao;
    return sym < corte ? 'Assimetria alta — atenção' : 'Simetria ideal';
  }
  function avg3(arr) {
    var v = (arr || []).map(Number).filter(function (x) { return !isNaN(x) && x > 0; });
    if (!v.length) return null;
    return Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length);
  }
  function ladoFraco(d, e) {
    d = toNum(d); e = toNum(e);
    if (!(d > 0) || !(e > 0)) return null;
    return d < e ? 'Direita' : (e < d ? 'Esquerda' : null);
  }
  function ladoPt(l) { return l === 'Direita' ? 'direito' : (l === 'Esquerda' ? 'esquerdo' : ''); }

  /* ================= avaliação do app -> resultados ================= */
  /* a = S.assess0 ou S.assess8 (formato do index.html) */
  function fromAppAssessment(a) {
    var out = {};
    if (!a || typeof a !== 'object') return out;
    ['calf', 'bridge', 'balance'].forEach(function (k) {
      if (a[k] && typeof a[k] === 'object') out[k] = { valorD: toNum(a[k].d), valorE: toNum(a[k].e), valgoD: null, valgoE: null };
    });
    if (a.stepdown && typeof a.stepdown === 'object') {
      out.stepdown = {
        valorD: toNum(a.stepdown.d), valorE: toNum(a.stepdown.e),
        valgoD: typeof a.stepdown.dFall === 'boolean' ? a.stepdown.dFall : null,
        valgoE: typeof a.stepdown.eFall === 'boolean' ? a.stepdown.eFall : null
      };
    }
    if (a.hop && typeof a.hop === 'object') out.hop = { valorD: avg3(a.hop.dArr), valorE: avg3(a.hop.eArr), valgoD: null, valgoE: null };
    return out;
  }

  /* fatos de um teste (alimentam as condições das regras) */
  function factsForTest(test, res, cfg) {
    var d = res.valorD, e = res.valorE;
    var sym = lsiSym(d, e);
    var goal = toNum(test.goal);
    var abaixo = (test.regra_pontuacao === 'meta_lado' && goal !== null)
      ? Math.min(d || 0, e || 0) < goal : null;
    var valgo = (res.valgoD == null && res.valgoE == null) ? null : (res.valgoD === true || res.valgoE === true);
    return { lsi_sym: sym, lado_abaixo_da_meta: abaixo, valgo: valgo, lado_fraco: ladoFraco(d, e) };
  }

  function testePontua(test, res, cfg) {
    var d = res.valorD, e = res.valorE, goal = toNum(test.goal);
    if (test.regra_pontuacao === 'meta_lado') return d > 0 && e > 0 && goal !== null && Math.min(d, e) >= goal;
    if (test.regra_pontuacao === 'sem_valgo') return res.valgoD === false && res.valgoE === false;
    if (test.regra_pontuacao === 'lsi_selo') { var s = lsiSym(d, e); return s !== null && s >= cfg.lsi_selo_app; }
    return false;
  }
  function scoreAssessment(resultados, tests, cfg) {
    cfg = mergeCfg(cfg);
    var pontos = 0;
    (tests || []).forEach(function (t) {
      var r = resultados && resultados[t.slug];
      if (r && testePontua(t, r, cfg)) pontos++;
    });
    var np = cfg.nivel_pontos;
    var nivel = pontos <= np.ini_max ? 'ini' : (pontos <= np.int_max ? 'int' : 'av');
    return { pontos: pontos, nivel: nivel };
  }

  /* ================= avaliador de condições (lista permitida) ================= */
  function compare(op, v, ref) {
    switch (op) {
      case '<': return typeof v === 'number' && v < ref;
      case '<=': return typeof v === 'number' && v <= ref;
      case '>': return typeof v === 'number' && v > ref;
      case '>=': return typeof v === 'number' && v >= ref;
      case '=': return v === ref;
      case '!=': return v !== ref;
      default: return false;
    }
  }
  function evalCondicao(c, facts) {
    if (!c || typeof c !== 'object') return false;
    if (Array.isArray(c.todos)) return c.todos.length > 0 && c.todos.every(function (x) { return evalCondicao(x, facts); });
    if (Array.isArray(c.qualquer)) return c.qualquer.length > 0 && c.qualquer.some(function (x) { return evalCondicao(x, facts); });
    if (CAMPOS_PERMITIDOS.indexOf(c.campo) < 0) return false;
    var v = facts ? facts[c.campo] : undefined;
    if (v === undefined || v === null) return false; // dado ausente nunca dispara regra
    return compare(c.operador, v, c.valor);
  }

  /* ================= linguagem: nada de diagnóstico ================= */
  var LINT_RE = /(risco de les|les[aã]o|les[oõ]es|diagn[oó]stic)/i;
  function lintLinguagem(txt) { return !LINT_RE.test(String(txt || '')); }
  function renderExplicacao(tpl, vars) {
    var out = String(tpl || '').replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
    return out.replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
  }

  /* ================= configuração ================= */
  function mergeCfg(c) {
    var out = clone(DEFAULT_CFG);
    if (c) Object.keys(c).forEach(function (k) { out[k] = c[k]; });
    return out;
  }
  function cfgFromRows(rows) {
    var c = {};
    (rows || []).forEach(function (r) { c[r.chave] = r.valor; });
    return mergeCfg(c);
  }

  /* ================= gates clínicos ================= */
  var ORDEM_COR = { g: 0, y: 1, r: 2 };
  function pior(cores) {
    return cores.reduce(function (a, b) { return ORDEM_COR[b] > ORDEM_COR[a] ? b : a; });
  }
  /* entrada:
       corHoje        'g'|'y'|'r'|null  registro de dor feito HOJE
       ultimoRegistro 'g'|'y'|'r'|null  último registro, de qualquer dia (o vermelho persiste, como no app)
       check24Cor     'g'|'y'|'r'|null  check de 24h de HOJE (vale como semáforo do dia)
       lastRun        {tipo,duracao_min,rpe,created_at}|null
       agora          ms (injetável para teste)
     Cor do dia: se houver registro de hoje (dor e/ou check de 24h), vale o PIOR dos dois.
     Sem registro de hoje, vale o último registro (vermelho persiste até um registro fora do vermelho). */
  function gateDoDia(inp, cfgIn) {
    var cfg = mergeCfg(cfgIn);
    inp = inp || {};
    var hoje = [inp.corHoje, inp.check24Cor].filter(Boolean);
    var cor = hoje.length ? pior(hoje) : (inp.ultimoRegistro || null);
    var motivos = [];
    var nivel = 'completa';

    if (cor === 'r') {
      nivel = 'bloqueada';
      motivos.push(inp.check24Cor === 'r' ? 'Check de 24h em vermelho' : 'Semáforo vermelho');
    } else {
      var lr = inp.lastRun, agora = inp.agora != null ? inp.agora : Date.now();
      if (lr && lr.created_at) {
        var horas = (agora - new Date(lr.created_at).getTime()) / 36e5;
        var lg = cfg.longao, md = cfg.moderada;
        if (horas <= lg.janela_horas &&
            (lg.tipos.indexOf(lr.tipo) >= 0 || (lr.duracao_min && lr.duracao_min > lg.duracao_min_gt))) {
          nivel = 'regenerativa'; motivos.push('longão, trilha ou mais de ' + lg.duracao_min_gt + ' min nas últimas 24h');
        } else if (horas <= md.janela_horas &&
            ((lr.rpe && lr.rpe >= md.rpe_gte) || (lr.duracao_min && lr.duracao_min > md.duracao_min_gt))) {
          nivel = 'moderada'; motivos.push('esforço alto ou mais de ' + md.duracao_min_gt + ' min nas últimas 24h');
        }
      }
      if (cor === 'y' && nivel === 'completa') { nivel = 'moderada'; motivos.push('semáforo amarelo hoje'); }
    }
    return {
      nivel: nivel,
      motivos: motivos,
      corDoDia: cor,
      apenasMobilidade: nivel === 'bloqueada',
      semProgressao: nivel === 'bloqueada' || nivel === 'regenerativa',
      semPliometria: nivel !== 'completa',
      dorMaxMobilidade: cfg.dor_mobilidade_max,
      semaforoPendente: !inp.corHoje && !inp.check24Cor && cor !== 'r',
      texto: GATE_TEXTOS[nivel] || ''
    };
  }

  /* ================= biblioteca ================= */
  /* rows no formato de public.v_biblioteca_ativa */
  function agruparBiblioteca(rows) {
    var fam = {}, ordem = [];
    (rows || []).forEach(function (r) {
      var f = fam[r.familia];
      if (!f) {
        f = fam[r.familia] = { slug: r.familia, nome: r.familia_nome, pilar: r.pilar, padrao_motor: r.padrao_motor,
          sessao: r.sessao, gerenciado: r.gerenciado_pelo_motor !== false, steps: [] };
        ordem.push(r.familia);
      }
      f.steps.push(r);
    });
    ordem.forEach(function (s) { fam[s].steps.sort(function (a, b) { return a.ordem - b.ordem; }); });
    return { map: fam, ordem: ordem };
  }

  function passoView(s) {
    return {
      step_id: s.step_id, ordem: s.ordem, nome: s.degrau_nome, series: s.series,
      reps_min: s.reps_min, reps_max: s.reps_max, tempo_min_s: s.tempo_min_s, tempo_max_s: s.tempo_max_s,
      hold_s: s.hold_s, unidade: s.unidade, por_lado: !!s.por_lado, lateralidade: s.lateralidade,
      resistencia_tipo: s.resistencia_tipo, carga_ref: s.carga_ref, prescricao_texto: s.prescricao_texto,
      video_url: s.video_url || null
    };
  }

  /* escolhe o degrau: base = menor degrau ativo com ordem >= 1 */
  function escolherDegrau(fam, delta, mes) {
    var steps = fam.steps.filter(function (s) { return (s.mes_liberacao == null) || (mes == null) || s.mes_liberacao <= mes; });
    if (!steps.length) return null;
    var base = null;
    for (var i = 0; i < steps.length; i++) { if (steps[i].ordem >= 1) { base = steps[i]; break; } }
    if (!base) base = steps[0];
    if (!delta) return { passo: base, base: base, clamp: false };
    var alvo = base.ordem + delta, cand = null;
    steps.forEach(function (s) { if (s.ordem <= alvo && (cand === null || s.ordem > cand.ordem)) cand = s; });
    if (cand === null) return { passo: base, base: base, clamp: true };
    return { passo: cand, base: base, clamp: false };
  }

  /* ================= prescrição inicial a partir da avaliação ================= */
  /* args: { biblioteca: rows, tests: [...], regras: [...], cfg, avaliacao: {slug:{valorD..}} | null, mes } */
  function prescricaoInicial(args) {
    var cfg = mergeCfg(args.cfg);
    var bib = agruparBiblioteca(args.biblioteca);
    var tests = args.tests || [];
    var regras = (args.regras || []).filter(function (r) { return r.ativa !== false && r.tipo === 'avaliacao'; })
      .slice().sort(function (a, b) { return (a.prioridade || 0) - (b.prioridade || 0); });
    var aval = args.avaliacao && Object.keys(args.avaliacao).length ? args.avaliacao : null;
    var itens = [], alertas = [];

    bib.ordem.forEach(function (slug) {
      var fam = bib.map[slug];
      var item = {
        familia: slug, nome: fam.nome, pilar: fam.pilar, sessao: fam.sessao, gerenciado: fam.gerenciado,
        origem: 'padrao', delta_solicitado: 0, delta_aplicado: 0, lado_fraco: null, series_extra: 0,
        series_por_lado: null, regras: [], explicacoes: [], alertas: []
      };

      var deltas = [], extras = [], disparos = [];
      if (aval && fam.gerenciado) {
        tests.filter(function (t) { return (t.familias_alimentadas || []).indexOf(slug) >= 0; }).forEach(function (t) {
          var res = aval[t.slug];
          if (!res) return;
          var facts = factsForTest(t, res, cfg);
          regras.forEach(function (r) {
            if (r.familias && r.familias.indexOf(slug) < 0) return;
            if (!evalCondicao(r.condicao, facts)) return;
            disparos.push({ regra: r, facts: facts, teste: t.slug });
            if (r.acao.tipo === 'degrau_inicial_delta') deltas.push(Number(r.acao.valor) || 0);
            if (r.acao.tipo === 'extra_series') extras.push({ valor: Number(r.acao.valor) || cfg.serie_extra_lado_fraco, lado: facts.lado_fraco, facts: facts });
          });
        });
      }
      if (disparos.length) item.origem = 'avaliacao';

      // degrau
      var delta = deltas.length ? (DELTA_MODO === 'maior_recuo' ? Math.min.apply(null, deltas) : deltas.reduce(function (a, b) { return a + b; }, 0)) : 0;
      item.delta_solicitado = delta;
      var esc = escolherDegrau(fam, delta, args.mes);
      if (!esc) { item.alertas.push({ tipo: 'sem_degrau_ativo', detalhe: 'Família sem degrau ativo liberado neste mês.' }); itens.push(item); alertas.push({ familia: slug, tipo: 'sem_degrau_ativo' }); return; }
      item.passo = passoView(esc.passo);
      item.delta_aplicado = esc.passo.ordem - esc.base.ordem;
      if (esc.clamp) {
        var al = { tipo: 'sem_degrau_abaixo', detalhe: 'A regra pede um degrau mais leve, mas a biblioteca não tem degrau ativo abaixo de ' + esc.base.degrau_nome + '.' };
        item.alertas.push(al); alertas.push({ familia: slug, tipo: al.tipo, detalhe: al.detalhe });
      }

      var vars = { exercicio: lowerFirst(fam.nome) };
      // regras de degrau
      disparos.forEach(function (d) {
        if (d.regra.acao.tipo !== 'degrau_inicial_delta') return;
        var aplicada = !(Number(d.regra.acao.valor) < 0 && esc.clamp);
        item.regras.push({ codigo: d.regra.codigo, aplicada: aplicada, teste: d.teste });
        if (aplicada) item.explicacoes.push(renderExplicacao(d.regra.explicacao_template, vars));
      });

      // série extra no lado fraco
      var ex = null;
      extras.forEach(function (x) { if (!ex || x.valor > ex.valor) ex = x; });
      disparos.forEach(function (d) {
        if (d.regra.acao.tipo !== 'extra_series') return;
        var ok = !!(ex && esc.passo.por_lado && ex.lado);
        item.regras.push({ codigo: d.regra.codigo, aplicada: ok, teste: d.teste });
      });
      if (ex) {
        if (!esc.passo.por_lado) {
          var a2 = { tipo: 'extra_series_pede_exercicio_unilateral', detalhe: 'Há assimetria, mas o degrau escolhido é bilateral: falta um exercício unilateral para dar a série extra no lado fraco.' };
          item.alertas.push(a2); alertas.push({ familia: slug, tipo: a2.tipo, detalhe: a2.detalhe });
        } else if (ex.lado) {
          item.lado_fraco = ex.lado; item.series_extra = ex.valor;
          var s0 = esc.passo.series;
          item.series_por_lado = { direito: s0, esquerdo: s0 };
          item.series_por_lado[ladoPt(ex.lado)] = s0 + ex.valor;
          var rExtra = null;
          disparos.forEach(function (d) { if (!rExtra && d.regra.acao.tipo === 'extra_series') rExtra = d.regra; });
          if (rExtra) item.explicacoes.push(renderExplicacao(rExtra.explicacao_template, { exercicio: vars.exercicio, lado: ladoPt(ex.lado) }));
        }
      }
      if (item.series_por_lado === null && esc.passo.por_lado) item.series_por_lado = { direito: esc.passo.series, esquerdo: esc.passo.series };
      itens.push(item);
    });

    var lintFalhas = [];
    itens.forEach(function (i) { i.explicacoes.forEach(function (t) { if (!lintLinguagem(t)) lintFalhas.push(t); }); });
    return {
      versao: VERSION,
      semAvaliacao: !aval,
      nivel: aval ? scoreAssessment(aval, tests, cfg) : null,
      itens: itens,
      alertas: alertas,
      lintFalhas: lintFalhas
    };
  }

  /* ================= aplica o gate sobre a prescrição ================= */
  function aplicarGate(presc, gate, sessao, cfgIn) {
    var cfg = mergeCfg(cfgIn);
    var p = clone(presc);
    var forca = SESSOES_FORCA.indexOf(sessao) >= 0;
    p.sessao = sessao;
    p.gate = gate;
    p.itens = p.itens.filter(function (i) { return i.sessao === sessao; });
    p.alertas = p.alertas.filter(function (a) { return p.itens.some(function (i) { return i.familia === a.familia; }); });

    if (gate.nivel === 'bloqueada') {
      if (forca) {
        p.alertas.push({ tipo: 'sessao_bloqueada', detalhe: 'Semáforo vermelho: B e C bloqueadas.' });
        p.itens = [];
      } else {
        var antes = p.itens.length;
        p.itens = p.itens.filter(function (i) { return i.pilar === 'mobilidade'; });
        if (p.itens.length < antes) p.alertas.push({ tipo: 'foot_core_oculto_no_vermelho', detalhe: 'No vermelho só mobilidade é liberada (dor 0–3/10); itens de foot core ficam fora.' });
      }
      return p;
    }
    if (gate.semPliometria) {
      var n0 = p.itens.length;
      p.itens = p.itens.filter(function (i) { return i.pilar !== 'pliometria'; });
      if (p.itens.length < n0) p.alertas.push({ tipo: 'pliometria_removida', detalhe: 'Sem pliometria hoje.' });
    }
    if (gate.nivel === 'regenerativa' && forca) {
      var fator = cfg.regenerativa.series_fator;
      p.itens.forEach(function (i) {
        if (!i.passo) return;
        i.series_regenerativa = Math.max(1, Math.ceil(i.passo.series * fator));
        if (i.series_por_lado) i.series_por_lado = { direito: i.series_regenerativa, esquerdo: i.series_regenerativa };
        i.series_extra = 0;
        i.explicacoes = i.explicacoes.filter(function (t) { return t.indexOf('série a mais') < 0; });
        i.explicacoes.push(GATE_TEXTOS.regenerativa);
      });
      p.semProgressao = true;
    }
    return p;
  }

  /* plano de uma sessão = prescrição inicial + gate */
  function planoDoDia(args) {
    var cfg = mergeCfg(args.cfg);
    var presc = prescricaoInicial(args);
    var gate = gateDoDia(args.estadoDia, cfg);
    return aplicarGate(presc, gate, args.sessao, cfg);
  }

  /* ============================================================
     ETAPA 4 — SELEÇÃO SEMANAL
     Monta a semana (segunda a domingo): em que dia cai cada sessão,
     quais exercícios cada tipo de sessão leva, garantindo cobertura
     dos pilares, prioridade aos déficits e estabilidade ("gruda").
     É um MODELO da semana: os gates (vermelho, pós-longão...) são
     aplicados no dia, com o semáforo real daquele dia.
     ============================================================ */
  var SESSOES = ['A', 'B', 'C1', 'C2'];
  var PILARES_ESPERADOS = ['mobilidade', 'foot_core', 'propriocepcao', 'tronco_quadril',
    'cadeia_posterior', 'anterior', 'gluteo', 'abdutores', 'adutores'];
  var SESSAO_NOME = {
    A: 'Mobilidade e foot core', B: 'Controle e propriocepção',
    C1: 'Força — cadeia posterior', C2: 'Força — anterior e quadril'
  };
  var DIAS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  function parseISO(s) { return new Date(s + 'T12:00:00Z'); }
  function isoDe(d) { return d.toISOString().slice(0, 10); }
  function somaDias(iso, n) { var d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return isoDe(d); }
  function diaSemana(iso) { return parseISO(iso).getUTCDay(); }               // 0 = domingo
  function segundaDe(iso) { return somaDias(iso, -((diaSemana(iso) + 6) % 7)); }
  function difSemanas(a, b) { return Math.round((parseISO(b) - parseISO(a)) / (7 * 864e5)); }
  function ordemSegunda(a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }        // segunda primeiro, domingo por último

  /* em que dias cai cada sessão de força e o B */
  function distribuirSessoes(freq, diasForca, bJunto) {
    freq = freq || {}; var alertas = [];
    var nC1 = freq.C1 != null ? freq.C1 : 3, nC2 = freq.C2 != null ? freq.C2 : 3, nB = freq.B != null ? freq.B : 2;
    var dias = (diasForca || []).slice().sort(ordemSegunda);
    var fila = [], r1 = nC1, r2 = nC2;
    while (r1 > 0 || r2 > 0) { if (r1 > 0) { fila.push('C1'); r1--; } if (r2 > 0) { fila.push('C2'); r2--; } }
    var usar = dias.slice(0, fila.length), forca = {};
    usar.forEach(function (d, i) { forca[d] = fila[i]; });
    var entregues = { C1: 0, C2: 0 };
    usar.forEach(function (d) { entregues[forca[d]]++; });
    if (entregues.C1 < nC1 || entregues.C2 < nC2) {
      alertas.push({ tipo: 'dias_insuficientes', detalhe: 'Só há ' + dias.length + ' dia(s) para força; pedido: C1 ' + nC1 + 'x e C2 ' + nC2 + 'x. Entregue: C1 ' + entregues.C1 + 'x e C2 ' + entregues.C2 + 'x.' });
    }
    var bDias = [], i, k;
    if (bJunto !== false && usar.length) {
      for (k = 0; k < nB; k++) { i = Math.floor(k * usar.length / nB); if (bDias.indexOf(usar[i]) < 0) bDias.push(usar[i]); }
    } else {
      var livres = [1, 2, 3, 4, 5, 6, 0].filter(function (d) { return !forca[d]; });
      var base = livres.length ? livres : usar;
      for (k = 0; k < nB && base.length; k++) { i = Math.floor(k * base.length / nB); if (bDias.indexOf(base[i]) < 0) bDias.push(base[i]); }
    }
    if (bDias.length < nB) alertas.push({ tipo: 'b_menos_que_pedido', detalhe: 'Pedido: B ' + nB + 'x por semana; só coube ' + bDias.length + 'x.' });
    return { forca: forca, B: bDias, alertas: alertas };
  }

  /* quais famílias cada tipo de sessão leva nesta semana */
  function selecionarSemana(itens, cfg, historico, segunda) {
    var cap = (cfg.selecao && cfg.selecao.max_itens) || {};
    var gruda = cfg.gruda_semanas, alertas = [], selecao = {}, novoHist = {}, chosenItens = {};
    var ativos = itens.filter(function (i) { return i.passo; });
    var pilaresComDeficit = {};
    function temDeficit(i) {
      return i.origem === 'avaliacao' && i.gerenciado &&
        (i.delta_solicitado < 0 || i.series_extra > 0 || !!i.lado_fraco);
    }
    ativos.forEach(function (i) { if (temDeficit(i)) pilaresComDeficit[i.pilar] = true; });
    function pontos(i, s, idx) {
      var h = historico && historico[s] && historico[s][i.familia];
      // dentro da janela "gruda": continuidade vale; passou da janela: cede a vez para rotacionar
      var cont = h ? (difSemanas(h, segunda) < gruda ? 10 : -5) : 0;
      return (temDeficit(i) ? 1000 : 0) + (pilaresComDeficit[i.pilar] ? 100 : 0) + cont - idx / 1000;
    }
    SESSOES.forEach(function (s) {
      var cands = ativos.filter(function (i) { return i.sessao === s; });
      cands.forEach(function (c, idx) { c._p = pontos(c, s, idx); });
      var limite = cap[s] != null ? cap[s] : cands.length;
      var hs = (historico && historico[s]) || {};
      var forcados = cands.filter(function (c) { return hs[c.familia] && difSemanas(hs[c.familia], segunda) < gruda; });
      var livres = cands.filter(function (c) { return forcados.indexOf(c) < 0; });
      var porPontos = function (a, b) { return b._p - a._p; };
      forcados.sort(porPontos); livres.sort(porPontos);
      if (forcados.length > limite) alertas.push({ tipo: 'gruda_excede_limite', sessao: s, detalhe: 'Há mais exercícios "grudados" do que vagas em ' + s + '; ficaram os de maior prioridade.' });
      var escolhidos = forcados.slice(0, limite);
      for (var k = 0; k < livres.length && escolhidos.length < limite; k++) escolhidos.push(livres[k]);
      chosenItens[s] = { escolhidos: escolhidos, forcados: forcados, limite: limite, todos: cands };
    });

    // garantia de cobertura: cada pilar que tem exercício na biblioteca aparece na semana
    var pilaresDaBib = {};
    ativos.forEach(function (i) { pilaresDaBib[i.pilar] = true; });
    function cobertos() { var m = {}; SESSOES.forEach(function (s) { chosenItens[s].escolhidos.forEach(function (i) { m[i.pilar] = (m[i.pilar] || 0) + 1; }); }); return m; }
    Object.keys(pilaresDaBib).forEach(function (p) {
      var cob = cobertos();
      if (cob[p]) return;
      var melhor = null;
      ativos.forEach(function (i) { if (i.pilar === p && (!melhor || i._p > melhor._p)) melhor = i; });
      if (!melhor) return;
      var bloco = chosenItens[melhor.sessao];
      if (bloco.escolhidos.length < bloco.limite) { bloco.escolhidos.push(melhor); alertas.push({ tipo: 'cobertura_forcada', familia: melhor.familia, detalhe: 'Incluído para cobrir o pilar ' + p + '.' }); return; }
      var cand = null;
      bloco.escolhidos.forEach(function (i) {
        if (bloco.forcados.indexOf(i) >= 0) return;
        if ((cob[i.pilar] || 0) < 2) return;                    // tirar esse descobriria outro pilar
        if (!cand || i._p < cand._p) cand = i;
      });
      if (cand) {
        bloco.escolhidos.splice(bloco.escolhidos.indexOf(cand), 1, melhor);
        alertas.push({ tipo: 'cobertura_forcada', familia: melhor.familia, detalhe: 'Trocou ' + cand.familia + ' por ' + melhor.familia + ' para cobrir o pilar ' + p + '.' });
      } else {
        alertas.push({ tipo: 'cobertura_nao_garantida', detalhe: 'Não coube um exercício do pilar ' + p + ' na semana.' });
      }
    });

    SESSOES.forEach(function (s) {
      var esc = chosenItens[s].escolhidos.slice().sort(function (a, b) { return b._p - a._p; });
      selecao[s] = esc.map(function (i) { return i.familia; });
      var hs = (historico && historico[s]) || {};
      novoHist[s] = {};
      esc.forEach(function (i) { novoHist[s][i.familia] = (hs[i.familia] && difSemanas(hs[i.familia], segunda) >= 0) ? hs[i.familia] : segunda; });
    });
    ativos.forEach(function (i) { delete i._p; });
    return { selecao: selecao, historicoNovo: novoHist, alertas: alertas };
  }

  /* args = os de prescricaoInicial + { dataRef:'AAAA-MM-DD', historico, diasForca } */
  function planoSemanal(args) {
    args = args || {};
    var cfg = mergeCfg(args.cfg);
    var ref = args.dataRef || isoDe(new Date());
    var segunda = segundaDe(ref);
    var base = prescricaoInicial(args);
    var freq = cfg.sessoes_por_semana;
    var dist = distribuirSessoes(freq, args.diasForca || cfg.dias_forca, cfg.b_junto_de_forca);
    var sel = selecionarSemana(clone(base.itens), cfg, args.historico || {}, segunda);

    var alertas = [].concat(base.alertas.map(function (a) { return a; }), dist.alertas, sel.alertas);
    var dias = [], resumo = [];
    for (var i = 0; i < 7; i++) {
      var iso = somaDias(segunda, i), wd = diaSemana(iso), sess = [];
      if (dist.forca[wd]) sess.push(dist.forca[wd]);
      if (dist.B.indexOf(wd) >= 0) sess.push('B');
      if (i < freq.A) sess.push('A');
      dias.push({ data: iso, dia: DIAS_PT[wd], sessoes: sess });
      resumo.push(DIAS_PT[wd] + ': ' + (sess.length ? sess.map(function (s) { return SESSAO_NOME[s]; }).join(' + ') : 'descanso'));
    }
    SESSOES.forEach(function (s) {
      var agendada = dias.some(function (d) { return d.sessoes.indexOf(s) >= 0; });
      if (agendada && !sel.selecao[s].length) alertas.push({ tipo: 'sessao_sem_exercicios', sessao: s, detalhe: 'A sessão ' + s + ' está na semana, mas a biblioteca não tem exercício ativo para ela.' });
    });

    var pilaresBib = {}, naSemana = {};
    base.itens.forEach(function (it) { if (it.passo) pilaresBib[it.pilar] = true; });
    SESSOES.forEach(function (s) { sel.selecao[s].forEach(function (f) { var it = base.itens.filter(function (x) { return x.familia === f; })[0]; if (it) naSemana[it.pilar] = true; }); });
    var semExercicio = PILARES_ESPERADOS.filter(function (p) { return !pilaresBib[p]; });
    semExercicio.forEach(function (p) { alertas.push({ tipo: 'pilar_sem_exercicio', pilar: p, detalhe: 'O pilar "' + p + '" não tem exercício ativo na biblioteca.' }); });

    return {
      versao: VERSION, segunda: segunda, dias: dias, selecao: sel.selecao, historicoNovo: sel.historicoNovo,
      resumo: resumo, alertas: alertas, prescricao: base,
      cobertura: { pilaresNaBiblioteca: Object.keys(pilaresBib), pilaresNaSemana: Object.keys(naSemana), pilaresSemExercicio: semExercicio }
    };
  }

  /* plano de UM dia: sessões agendadas + exercícios escolhidos + gate do dia.
     args = os de planoSemanal + { data, estadoDia } */
  function planoDeHoje(args) {
    var cfg = mergeCfg(args.cfg);
    var sem = planoSemanal(args);
    var data = args.data || args.dataRef || isoDe(new Date());
    var dia = sem.dias.filter(function (d) { return d.data === data; })[0] || { data: data, dia: DIAS_PT[diaSemana(data)], sessoes: [] };
    var gate = gateDoDia(args.estadoDia, cfg);
    var sessoes = dia.sessoes.map(function (s) {
      var presc = clone(sem.prescricao);
      presc.itens = presc.itens.filter(function (i) { return i.sessao === s && sem.selecao[s].indexOf(i.familia) >= 0; })
        .sort(function (a, b) { return sem.selecao[s].indexOf(a.familia) - sem.selecao[s].indexOf(b.familia); });
      return aplicarGate(presc, gate, s, cfg);
    });
    return { data: data, dia: dia.dia, sessoesDoDia: dia.sessoes, gate: gate, sessoes: sessoes, semana: { segunda: sem.segunda, resumo: sem.resumo, alertas: sem.alertas, cobertura: sem.cobertura, selecao: sem.selecao, historicoNovo: sem.historicoNovo } };
  }

  var Core = {
    VERSION: VERSION, DEFAULT_CFG: DEFAULT_CFG, SESSAO_NOME: SESSAO_NOME,
    segundaDe: segundaDe, somaDias: somaDias, diaSemana: diaSemana, distribuirSessoes: distribuirSessoes,
    selecionarSemana: selecionarSemana, planoSemanal: planoSemanal, planoDeHoje: planoDeHoje, GATE_TEXTOS: GATE_TEXTOS, CAMPOS_PERMITIDOS: CAMPOS_PERMITIDOS,
    lsiSym: lsiSym, rotuloLsi: rotuloLsi, avg3: avg3, ladoFraco: ladoFraco,
    fromAppAssessment: fromAppAssessment, factsForTest: factsForTest, scoreAssessment: scoreAssessment,
    evalCondicao: evalCondicao, lintLinguagem: lintLinguagem, renderExplicacao: renderExplicacao,
    mergeCfg: mergeCfg, cfgFromRows: cfgFromRows, gateDoDia: gateDoDia,
    agruparBiblioteca: agruparBiblioteca, escolherDegrau: escolherDegrau,
    prescricaoInicial: prescricaoInicial, aplicarGate: aplicarGate, planoDoDia: planoDoDia
  };

  /* ============================================================
     CAMADA DE INTEGRAÇÃO (navegador) — somente leitura, modo sombra
     ============================================================ */
  var Engine = { version: VERSION, core: Core, lastReport: null, _check24: null, _cache: null };

  function ligado() {
    try {
      if (root.GV_ENGINE_SHADOW === false) return false;
      return root.localStorage.getItem('gv_engine_off') !== '1';
    } catch (e) { return false; }
  }
  Engine.enabled = ligado;

  /* o app ainda não tem o check de 24h; quando existir, chame: GVEngine.setCheck24('g'|'y'|'r') */
  Engine.setCheck24 = function (cor) { Engine._check24 = { cor: cor, dia: new Date().toISOString().slice(0, 10) }; };

  function carregarBase() {
    var agora = Date.now();
    if (Engine._cache && agora - Engine._cache.t < 10 * 60 * 1000) return Promise.resolve(Engine._cache.v);
    var sb = root.sb;
    if (!sb) return Promise.reject(new Error('window.sb ausente (gv-auth-sync.js não carregou)'));
    return Promise.all([
      sb.from('v_biblioteca_ativa').select('*'),
      sb.from('assessment_tests').select('*'),
      sb.from('prescription_rules').select('*'),
      sb.from('engine_config').select('chave,valor')
    ]).then(function (r) {
      var err = r.map(function (x) { return x.error; }).filter(Boolean)[0];
      if (err) throw err;
      var v = { biblioteca: r[0].data, tests: r[1].data, regras: r[2].data, cfg: cfgFromRows(r[3].data) };
      Engine._cache = { t: agora, v: v };
      return v;
    });
  }

  function ultimaCorrida() {
    var sb = root.sb, email = root.GVCloud && root.GVCloud.email;
    if (!sb || !email) return Promise.resolve(null);
    return sb.from('runs').select('*').eq('email', email).order('created_at', { ascending: false }).limit(1)
      .then(function (r) { return (r && r.data && r.data[0]) || null; }, function () { return null; });
  }

  function estadoDoApp() {
    var st = null;
    try { st = (typeof S !== 'undefined') ? S : null; } catch (e) { st = null; }
    var hoje = new Date().toISOString().slice(0, 10);
    var corHoje = null;
    try { corHoje = typeof root.painToday === 'function' ? root.painToday() : null; } catch (e) {}
    var ultimo = null;
    try { ultimo = typeof root.currentPainColor === 'function' ? root.currentPainColor() : null; } catch (e) {}
    var mes = 1;
    try { mes = typeof root.monthNow === 'function' ? root.monthNow() : (st && st.current_month) || 1; } catch (e) {}
    var c24 = (Engine._check24 && Engine._check24.dia === hoje) ? Engine._check24.cor : null;
    var aval = st ? (st.assess8 || st.assess0) : null;
    return { st: st, corHoje: corHoje, ultimoRegistro: ultimo, check24Cor: c24, mes: mes, avaliacaoApp: aval };
  }

  /* roda o motor para a sessão do app (M/B/C) e registra no console */
  Engine.sombra = function (sessaoApp) {
    var rel = { versao: VERSION, modo: 'sombra', sessaoApp: sessaoApp, quando: new Date().toISOString() };
    try {
      var est = estadoDoApp();
      var sessao = MAPA_SESSAO_APP[sessaoApp] || sessaoApp;
      return Promise.all([carregarBase(), ultimaCorrida()]).then(function (res) {
        var base = res[0], lastRun = res[1];
        var avaliacao = fromAppAssessment(est.avaliacaoApp);
        var plano = planoDoDia({
          biblioteca: base.biblioteca, tests: base.tests, regras: base.regras, cfg: base.cfg,
          avaliacao: avaliacao, mes: est.mes, sessao: sessao,
          estadoDia: { corHoje: est.corHoje, ultimoRegistro: est.ultimoRegistro, check24Cor: est.check24Cor, lastRun: lastRun, agora: Date.now() }
        });
        rel.sessao = sessao; rel.plano = plano;
        // Etapa 4: a semana do motor e a sessão que ele colocaria HOJE (só leitura)
        try {
          var hojeISO = (typeof root.today === 'function') ? root.today() : new Date().toISOString().slice(0, 10);
          var dh = planoDeHoje({
            biblioteca: base.biblioteca, tests: base.tests, regras: base.regras, cfg: base.cfg,
            avaliacao: avaliacao, mes: est.mes, dataRef: hojeISO, data: hojeISO, historico: {},
            estadoDia: { corHoje: est.corHoje, ultimoRegistro: est.ultimoRegistro, check24Cor: est.check24Cor, lastRun: lastRun, agora: Date.now() }
          });
          rel.semana = { segunda: dh.semana.segunda, resumo: dh.semana.resumo, selecao: dh.semana.selecao,
            cobertura: dh.semana.cobertura, alertas: dh.semana.alertas.map(function (a) { return a.tipo + (a.pilar ? ':' + a.pilar : '') + (a.sessao ? ':' + a.sessao : ''); }) };
          rel.hoje = { data: dh.data, dia: dh.dia, sessoesDoMotor: dh.sessoesDoDia, sessaoDoApp: sessao,
            coincide: dh.sessoesDoDia.indexOf(sessao) >= 0 };
        } catch (e) { rel.semanaErro = String(e && e.message || e); }
        // comparação com o que o app decide hoje (gv-runlog) — só leitura
        try {
          if (typeof root.deriveForceLevel === 'function') {
            var ref = root.deriveForceLevel(lastRun, est.ultimoRegistro);
            rel.comparacao = { runlog: ref.level, motor: plano.gate.nivel, igual: ref.level === plano.gate.nivel };
          }
        } catch (e) {}
        rel.itensMotor = plano.itens.map(function (i) { return i.nome + ' · ' + (i.passo ? i.passo.nome : '—'); });
        return new Promise(function (ok) {
          setTimeout(function () {
            try {
              var nomes = [].slice.call(document.querySelectorAll('#sesList .nm')).map(function (n) { return n.textContent; });
              rel.itensApp = nomes;
            } catch (e) {}
            Engine.lastReport = rel;
            try { console.info('[GVEngine · sombra]', rel); } catch (e) {}
            ok(rel);
          }, 600);
        });
      }).catch(function (e) {
        rel.erro = String(e && e.message || e);
        Engine.lastReport = rel;
        try { console.warn('[GVEngine · sombra] falhou (sem efeito no app):', rel.erro); } catch (x) {}
        return rel;
      });
    } catch (e) {
      rel.erro = String(e && e.message || e);
      Engine.lastReport = rel;
      return Promise.resolve(rel);
    }
  };
  Engine.dump = function () { return Engine.lastReport; };
  Engine.carregarBase = carregarBase; // usado pela página de teste (modo "nuvem")

  /* encaixe por cima de openSession (depois do gv-clinic.js) */
  var browser = typeof root.window !== 'undefined' && typeof root.document !== 'undefined';
  if (browser) {
    if (typeof root.openSession === 'function') {
      var _prev = root.openSession;
      root.openSession = function (t) {
        // try/finally: o modo sombra roda mesmo que o openSession original lance erro,
        // e o erro original continua chegando ao chamador (o motor não engole nem altera nada).
        try {
          return _prev.apply(this, arguments);
        } finally {
          try { if (ligado()) setTimeout(function () { Engine.sombra(t); }, 400); } catch (e) {}
        }
      };
    } else if (root.document.getElementById('vSession')) {
      try { console.warn('[GVEngine] openSession não encontrada: carregue gv-engine.js DEPOIS de gv-clinic.js.'); } catch (e) {}
    }
    root.GVEngine = Engine;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Core: Core, Engine: Engine };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
