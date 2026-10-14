/* ============================================================
   GV RUN — Login REAL (Supabase Auth, código de 6 dígitos por e-mail)
   + sync com merge (anti-perda)                         v2 (staging)
   ------------------------------------------------------------
   O QUE MUDA em relação ao v1 (login só por e-mail)
   - O aluno digita o e-mail, recebe um CÓDIGO por e-mail e digita
     o código. Só então existe sessão real (JWT) no Supabase.
   - A checagem da lista de liberados (is_email_allowed) continua,
     antes de enviar o código.
   - load()/save()/merge/offline continuam IGUAIS.

   MODOS (GV_CONFIG.AUTH_MODE)
   - 'compat': TRANSIÇÃO. Se o envio do código falhar, aparece o
               botão "Continuar sem confirmar (temporário)" para
               ninguém ficar trancado de fora. Funciona enquanto o
               RLS do banco ainda aceita acesso sem sessão.
   - 'strict': só entra com código. Usar DEPOIS de fechar o RLS.

   ✅  ESTA CÓPIA JÁ TEM as chaves públicas (anon) do projeto GV Run,
       copiadas do gv-auth-sync.js que está no ar.
   ⚠️  PRÉ-REQUISITOS FORA DO CÓDIGO (ver docs/migracao_login_plano.md):
       SMTP próprio no Supabase, modelo de e-mail com {{ .Token }}
       e cadastro novo desligado. Sem isso, o código não chega.
   ============================================================ */

const GV_CONFIG = {
  SUPABASE_URL:  'https://kzgdlsstrffiubzkvqeo.supabase.co',
  SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Z2Rsc3N0cmZmaXViemt2cWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5OTk1NjksImV4cCI6MjEwMDU3NTU2OX0._1O1PSe94zPmtqfwc0PxpcMTf0Fl02QIgIAbAzaMmu4',
  AUTH_MODE: 'compat',            // 'compat' (transição) | 'strict'
};

const GV_SEM_CHAVES = /COLE_AQUI/.test(GV_CONFIG.SUPABASE_URL + GV_CONFIG.SUPABASE_ANON);
const sb = GV_SEM_CHAVES ? null : window.supabase.createClient(GV_CONFIG.SUPABASE_URL, GV_CONFIG.SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
window.sb = sb;
const CACHE_KEY = 'gvrun_state';
const EMAIL_KEY = 'gvrun_email';
const DIRTY_KEY = 'gvrun_dirty';

/* ---------- une dois estados sem perder histórico ---------- */
function mergeStates(a, b) {
  // a = base (nuvem), b = local; devolve a união
  if (!a) return b || {};
  if (!b) return a || {};
  const out = { ...a, ...b };            // campos simples: local vence (mais recente)

  // sessions: união por (data + tipo), sem duplicar
  const byKey = {};
  [...(a.sessions || []), ...(b.sessions || [])].forEach(s => {
    byKey[s.d + '|' + s.t] = { ...(byKey[s.d + '|' + s.t] || {}), ...s };
  });
  out.sessions = Object.values(byKey).sort((x, y) => (x.d < y.d ? -1 : 1));

  // pain: união por (data + cor), sem duplicar
  const pKey = {};
  [...(a.pain || []), ...(b.pain || [])].forEach(p => {
    pKey[p.d + '|' + p.c] = { ...(pKey[p.d + '|' + p.c] || {}), ...p };
  });
  out.pain = Object.values(pKey).sort((x, y) => (x.d < y.d ? -1 : 1));

  return out;
}

/* ============================================================
   TELAS
   ============================================================ */
const GV_CSS = `
    #gv-login{position:fixed;inset:0;z-index:99999;display:flex;
      align-items:center;justify-content:center;padding:24px;
      background:radial-gradient(120% 120% at 50% 0%, #16264a 0%, #0A1730 60%);
      font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#EAF2FF;}
    #gv-login .card{width:100%;max-width:380px;text-align:center;}
    #gv-login .eyebrow{font-size:12px;letter-spacing:.28em;text-transform:uppercase;
      color:#4CC4FF;margin:0 0 10px;font-weight:600;}
    #gv-login h1{font-size:30px;line-height:1.1;margin:0 0 6px;font-weight:800;letter-spacing:-.02em;}
    #gv-login p.sub{margin:0 0 26px;color:#9fb3d1;font-size:15px;}
    #gv-login label{display:block;text-align:left;font-size:13px;color:#9fb3d1;margin:0 0 6px;}
    #gv-login input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:12px;
      border:1px solid #2a3d63;background:#0d1c38;color:#EAF2FF;font-size:16px;outline:none;}
    #gv-login input.code{text-align:center;letter-spacing:.5em;font-size:24px;font-weight:700;}
    #gv-login input:focus{border-color:#4CC4FF;box-shadow:0 0 0 3px rgba(76,196,255,.18);}
    #gv-login button{width:100%;margin-top:14px;padding:14px 16px;border:0;border-radius:12px;
      background:#4CC4FF;color:#04121f;font-size:16px;font-weight:700;cursor:pointer;transition:filter .15s;}
    #gv-login button:hover{filter:brightness(1.07);}
    #gv-login button:disabled{opacity:.55;cursor:default;}
    #gv-login button.ghost{background:transparent;border:1px solid #2a3d63;color:#9fb3d1;font-weight:600;font-size:14px;}
    #gv-login .msg{min-height:20px;margin-top:14px;font-size:14px;}
    #gv-login .msg.err{color:#ff9a8a;}
    #gv-login .msg.ok{color:#7ee0a2;}
    #gv-login .hidden{display:none;}
`;

function injetarCss() {
  if (document.getElementById('gv-login-css')) return;
  const style = document.createElement('style');
  style.id = 'gv-login-css';
  style.textContent = GV_CSS;
  document.head.appendChild(style);
}

function montarTelaConfigErro() {
  injetarCss();
  if (document.getElementById('gv-login')) return;
  const wrap = document.createElement('div');
  wrap.id = 'gv-login';
  wrap.innerHTML = `<div class="card"><p class="eyebrow">GV Run</p><h1>Configuração pendente</h1>
    <p class="sub">As chaves do Supabase não foram preenchidas no arquivo gv-auth-sync.js.</p>
    <div class="msg err" id="gv-msg">Preencha SUPABASE_URL e SUPABASE_ANON e publique de novo.</div></div>`;
  document.body.appendChild(wrap);
}

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function montarTelaLogin(emailSugerido) {
  injetarCss();
  if (document.getElementById('gv-login')) return;

  const wrap = document.createElement('div');
  wrap.id = 'gv-login';
  wrap.innerHTML = `
    <div class="card">
      <p class="eyebrow">Corra sem dor</p>
      <h1>GV Run</h1>

      <div id="gv-step1">
        <p class="sub">Acesse com o e-mail que você usou na compra.</p>
        <label for="gv-email">Seu e-mail</label>
        <input id="gv-email" type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com" />
        <button id="gv-btn">Receber código</button>
      </div>

      <div id="gv-step2" class="hidden">
        <p class="sub" id="gv-sub2"></p>
        <label for="gv-code">Código de 6 dígitos</label>
        <input id="gv-code" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••" />
        <button id="gv-confirm">Entrar</button>
        <button id="gv-resend" class="ghost" disabled>Reenviar código</button>
        <button id="gv-back" class="ghost">Trocar e-mail</button>
      </div>

      <button id="gv-legacy" class="ghost hidden">Continuar sem confirmar (temporário)</button>
      <div class="msg" id="gv-msg"></div>
    </div>`;
  document.body.appendChild(wrap);

  const $ = id => wrap.querySelector('#' + id);
  const email = $('gv-email'), btn = $('gv-btn'), msg = $('gv-msg');
  const code = $('gv-code'), confirmBtn = $('gv-confirm'), resend = $('gv-resend'), legacy = $('gv-legacy');
  const compat = GV_CONFIG.AUTH_MODE !== 'strict';
  const diz = (t, tipo = '') => { msg.textContent = t; msg.className = 'msg ' + tipo; };
  let emailAtual = '', timerReenvio = null;

  if (emailSugerido) email.value = emailSugerido;
  if (compat && emailSugerido) legacy.classList.remove('hidden');   // quem já usava o app não fica trancado

  function iniciarCooldown(seg) {
    resend.disabled = true;
    let s = seg;
    resend.textContent = `Reenviar código (${s}s)`;
    clearInterval(timerReenvio);
    timerReenvio = setInterval(() => {
      s--;
      if (s <= 0) { clearInterval(timerReenvio); resend.disabled = false; resend.textContent = 'Reenviar código'; }
      else resend.textContent = `Reenviar código (${s}s)`;
    }, 1000);
  }

  async function enviarCodigo() {
    const e = (email.value || '').trim().toLowerCase();
    if (!EMAIL_OK.test(e)) return diz('Digite um e-mail válido.', 'err');
    btn.disabled = true; resend.disabled = true; diz('Verificando...');

    const { data: liberado, error } = await sb.rpc('is_email_allowed', { check_email: e });
    if (error) { btn.disabled = false; return diz('Erro ao verificar. Tente de novo.', 'err'); }
    if (!liberado) {
      btn.disabled = false;
      return diz('Este e-mail não está liberado. Use o mesmo e-mail da compra ou fale com o suporte.', 'err');
    }

    diz('Enviando o código...');
    const r = await sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: false } });
    btn.disabled = false;
    if (r && r.error) {
      if (compat) legacy.classList.remove('hidden');
      return diz('Não consegui enviar o código agora. Tente de novo em instantes.', 'err');
    }
    emailAtual = e;
    $('gv-step1').classList.add('hidden');
    $('gv-step2').classList.remove('hidden');
    $('gv-sub2').textContent = `Enviamos um código para ${e}. Digite abaixo.`;
    code.value = ''; code.focus && code.focus();
    diz('Código enviado. Confira também a caixa de spam.', 'ok');
    iniciarCooldown(60);
  }

  async function confirmar() {
    const token = (code.value || '').replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(token)) return diz('Digite o código de 6 dígitos que chegou no e-mail.', 'err');
    confirmBtn.disabled = true; diz('Confirmando...');
    const r = await sb.auth.verifyOtp({ email: emailAtual, token, type: 'email' });
    confirmBtn.disabled = false;
    if (r && r.error) return diz('Código inválido ou expirado. Confira ou peça um novo.', 'err');
    const s = r && r.data && r.data.session;
    clearInterval(timerReenvio);
    GVCloud._concluirLogin((s && s.user && s.user.email) || emailAtual, false);
  }

  btn.addEventListener('click', enviarCodigo);
  email.addEventListener('keydown', ev => { if (ev.key === 'Enter') enviarCodigo(); });
  confirmBtn.addEventListener('click', confirmar);
  code.addEventListener('keydown', ev => { if (ev.key === 'Enter') confirmar(); });
  resend.addEventListener('click', enviarCodigo);
  $('gv-back').addEventListener('click', () => {
    clearInterval(timerReenvio);
    $('gv-step2').classList.add('hidden'); $('gv-step1').classList.remove('hidden'); diz('');
  });
  legacy.addEventListener('click', () => {
    const e = (email.value || '').trim().toLowerCase();
    if (!EMAIL_OK.test(e)) return diz('Digite um e-mail válido.', 'err');
    clearInterval(timerReenvio);
    GVCloud._concluirLogin(e, true);
  });
}

function esconderTelaLogin() {
  const el = document.getElementById('gv-login');
  if (el) el.remove();
}

/* ============================================================
   GVCloud
   ============================================================ */
const GVCloud = {
  email: null,
  legacy: false,       // true = entrou sem sessão real (só no modo 'compat')
  offline: false,
  _sessaoReal: false,

  /* depois do login (com código ou legado): guarda quem é e limpa resquício de outro aluno */
  _concluirLogin(email, legado) {
    email = String(email || '').trim().toLowerCase();
    const anterior = localStorage.getItem(EMAIL_KEY);
    if (anterior && anterior.toLowerCase() !== email) {      // outro aluno no mesmo aparelho
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(DIRTY_KEY);
    }
    localStorage.setItem(EMAIL_KEY, email);
    this.email = email;
    this.legacy = !!legado;
    this._sessaoReal = !legado;
    esconderTelaLogin();
    this._resolveLogin && this._resolveLogin();
  },

  async init() {
    if (!sb) {                                   // chaves não preenchidas: avisa e não segue
      montarTelaConfigErro();
      await new Promise(() => {});
    }
    const saved = localStorage.getItem(EMAIL_KEY);
    let sess = null;
    try {
      const r = await sb.auth.getSession();
      sess = r && r.data && r.data.session;
    } catch (_e) { sess = null; }

    if (sess && sess.user && sess.user.email) {
      const e = sess.user.email.toLowerCase();
      if (saved && saved.toLowerCase() !== e) { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(DIRTY_KEY); }
      localStorage.setItem(EMAIL_KEY, e);
      this.email = e; this._sessaoReal = true; this.legacy = false;
    } else if (saved && typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.email = saved; this.offline = true;   // sem internet: segue com o cache, sincroniza depois
    } else {
      montarTelaLogin(saved);
      await new Promise(resolve => { this._resolveLogin = resolve; });
    }

    // sessão revogada/expirada de vez: volta para o login
    try {
      sb.auth.onAuthStateChange((evento) => {
        if (evento === 'SIGNED_OUT' && this._sessaoReal) this._recarregar();
      });
    } catch (_e) {}

    window.addEventListener('online', () => this._sincronizarPendente());
    await this._sincronizarPendente();
    return this.email;
  },

  _recarregar() { location.reload(); },

  async logout() {
    try { await sb.auth.signOut(); } catch (_e) {}
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(DIRTY_KEY);
    this._sessaoReal = false;
    this._recarregar();
  },

  /* ---------- LOAD ---------- */
  async load() {
    try {
      const { data, error } = await sb
        .from('user_progress')
        .select('data')
        .eq('email', this.email)
        .maybeSingle();
      if (error) throw error;

      if (data && data.data) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data.data));
        return data.data;
      }
      const cache = localStorage.getItem(CACHE_KEY);
      return cache ? JSON.parse(cache) : {};
    } catch (_e) {
      const cache = localStorage.getItem(CACHE_KEY);
      return cache ? JSON.parse(cache) : {};
    }
  },

  /* ---------- SAVE com merge (anti-perda de histórico) ---------- */
  async save(state) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state)); // instantâneo/offline
    try {
      // relê o que está na nuvem e funde antes de gravar
      const { data: nuvem } = await sb
        .from('user_progress')
        .select('data')
        .eq('email', this.email)
        .maybeSingle();

      const merged = mergeStates(nuvem && nuvem.data, state);

      const { error } = await sb.from('user_progress').upsert({
        email: this.email,
        data: merged,
        updated_at: new Date().toISOString()
      }, { onConflict: 'email' });
      if (error) throw error;

      localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); // cache com a versão fundida
      localStorage.removeItem(DIRTY_KEY);
    } catch (_e) {
      localStorage.setItem(DIRTY_KEY, '1');
    }
  },

  async _sincronizarPendente() {
    if (localStorage.getItem(DIRTY_KEY) !== '1') return;
    const cache = localStorage.getItem(CACHE_KEY);
    if (!cache) { localStorage.removeItem(DIRTY_KEY); return; }
    try {
      const { data: nuvem } = await sb
        .from('user_progress')
        .select('data')
        .eq('email', this.email)
        .maybeSingle();
      const merged = mergeStates(nuvem && nuvem.data, JSON.parse(cache));
      const { error } = await sb.from('user_progress').upsert({
        email: this.email,
        data: merged,
        updated_at: new Date().toISOString()
      }, { onConflict: 'email' });
      if (!error) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
        localStorage.removeItem(DIRTY_KEY);
      }
    } catch (_e) {}
  }
};

window.GVCloud = GVCloud;
