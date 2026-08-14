/* ============================================================
   GV RUN — Login só por e-mail + sync com merge (anti-perda)
   ============================================================ */

const GV_CONFIG = {
  SUPABASE_URL:  'https://kzgdlsstrffiubzkvqeo.supabase.co',
  SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Z2Rsc3N0cmZmaXViemt2cWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5OTk1NjksImV4cCI6MjEwMDU3NTU2OX0._1O1PSe94zPmtqfwc0PxpcMTf0Fl02QIgIAbAzaMmu4',
};

const sb = window.supabase.createClient(GV_CONFIG.SUPABASE_URL, GV_CONFIG.SUPABASE_ANON);

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
   TELA DE LOGIN
   ============================================================ */
function montarTelaLogin() {
  if (document.getElementById('gv-login')) return;

  const css = `
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
    #gv-login input:focus{border-color:#4CC4FF;box-shadow:0 0 0 3px rgba(76,196,255,.18);}
    #gv-login button{width:100%;margin-top:14px;padding:14px 16px;border:0;border-radius:12px;
      background:#4CC4FF;color:#04121f;font-size:16px;font-weight:700;cursor:pointer;transition:filter .15s;}
    #gv-login button:hover{filter:brightness(1.07);}
    #gv-login button:disabled{opacity:.55;cursor:default;}
    #gv-login .msg{min-height:20px;margin-top:14px;font-size:14px;}
    #gv-login .msg.err{color:#ff9a8a;}
    #gv-login .msg.ok{color:#7ee0a2;}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.id = 'gv-login';
  wrap.innerHTML = `
    <div class="card">
      <p class="eyebrow">Corra sem dor</p>
      <h1>GV Run</h1>
      <p class="sub">Acesse com o e-mail que você usou na compra.</p>
      <label for="gv-email">Seu e-mail</label>
      <input id="gv-email" type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com" />
      <button id="gv-btn">Acessar</button>
      <div class="msg" id="gv-msg"></div>
    </div>`;
  document.body.appendChild(wrap);

  const email = wrap.querySelector('#gv-email');
  const btn   = wrap.querySelector('#gv-btn');
  const msg   = wrap.querySelector('#gv-msg');
  const diz   = (t, tipo='') => { msg.textContent = t; msg.className = 'msg ' + tipo; };

  async function entrar() {
    const e = (email.value || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return diz('Digite um e-mail válido.', 'err');
    btn.disabled = true; diz('Verificando...');

    const { data: liberado, error } = await sb.rpc('is_email_allowed', { check_email: e });

    if (error) { btn.disabled = false; return diz('Erro ao verificar. Tente de novo.', 'err'); }
    if (!liberado) {
      btn.disabled = false;
      return diz('Este e-mail não está liberado. Use o mesmo e-mail da compra ou fale com o suporte.', 'err');
    }

    // acesso liberado — guarda o e-mail como identificador
    localStorage.setItem(EMAIL_KEY, e);
    GVCloud.email = e;
    esconderTelaLogin();
    GVCloud._resolveLogin && GVCloud._resolveLogin();
  }

  btn.addEventListener('click', entrar);
  email.addEventListener('keydown', ev => { if (ev.key === 'Enter') entrar(); });
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

  async init() {
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) {
      this.email = saved;
    } else {
      montarTelaLogin();
      await new Promise(resolve => { this._resolveLogin = resolve; });
    }
    window.addEventListener('online', () => this._sincronizarPendente());
    await this._sincronizarPendente();
    return this.email;
  },

  async logout() {
    localStorage.removeItem(EMAIL_KEY);
    location.reload();
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
