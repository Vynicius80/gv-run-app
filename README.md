# GV Run Club · App

PWA do GV Run Club — sistema de prevenção e performance para corredores.
Stack: HTML/CSS/JS puro + Supabase. Sem build.
Sobe na Vercel: GitHub → import → Deploy.

Produção: https://gv-run-app.vercel.app

---

## COMO FUNCIONA O ACESSO

Não há senha. O aluno entra com o **e-mail da compra**:

1. Compra aprovada na Hotmart → webhook `hotmart-webhook` (Edge Function do Supabase)
2. O webhook grava o e-mail na tabela `allowed_emails` e o tipo de assinatura em `user_progress.subscription_type`
3. O aluno abre o app, digita o e-mail, e o `gv-auth-sync.js` valida contra a `allowed_emails`

Para liberar alguém manualmente, basta inserir o e-mail na `allowed_emails`.

---

## O PROGRAMA

Jornada contínua de **12 meses**, em 4 fases. Um bloco de treino por mês.

| Fase | Meses | Foco |
|---|---|---|
| 1 · Fundação | 1–2 | Corrigir assimetrias de base, aprender a técnica |
| 2 · Construção | 3–5 | Resistência e controle dinâmico sob fadiga |
| 3 · Performance preventiva | 6–9 | Potência elástica e força rápida |
| 4 · Manutenção | 10–12 | Consolidar os ganhos e reavaliar o ano |

Três sessões por bloco:
- **(A) Mobilidade e foot core** — diária, ~10 min (foot core primeiro, mobilidade depois)
- **(B) Controle e propriocepção** — 2×/semana
- **(C) Força** — 2×/semana

---

## DE ONDE VEM O CONTEÚDO

O app busca o bloco do mês no Supabase. Se o bloco ainda não estiver publicado,
usa o conteúdo local do `index.html` como fallback — assim o app nunca fica vazio.

- **Supabase** (preferencial): tabelas `monthly_blocks`, `block_sessions`, `session_exercises`, `exercises`
- **Local** (fallback): objeto `WEEKS` no `index.html`, com 8 blocos. O mês N usa o bloco N, parando no 8.

Para publicar o bloco de um mês:

```sql
update monthly_blocks set is_published = true, published_at = now()
where month_number = 1;
```

A partir daí, o conteúdo do Supabase substitui o local automaticamente, sem mexer em código.

---

## ARQUIVOS

| Arquivo | O que faz |
|---|---|
| `index.html` | App principal: onboarding, avaliação, sessões, relatório, perfil |
| `gv-auth-sync.js` | Login por e-mail e sincronização do progresso com o Supabase |
| `gv-clinic.js` | Semáforo da dor e bloqueio de força no vermelho |
| `gv-ui.js` | Ajustes de interface |
| `gv-painmap.js` | Mapa corporal de dor (grava em `pain_records`) |
| `gv-painhistory.js` | Histórico de dor com detecção de padrão recorrente |
| `gv-anamnesis.js` | Anamnese no onboarding (grava em `athlete_anamnesis`) |
| `gv-riskgate.js` | Gatilho de 3 semáforos vermelhos → convite para avaliação |
| `gv-runlog.js` | Registro de corrida e matriz de carga (força completa/moderada/regenerativa) |
| `gv-contentfallback.js` | Busca o bloco do mês no Supabase; cai no conteúdo local se não houver |
| `gv-inactivity.js` | Lembrete na Home quando o aluno passa dias sem treinar |
| `fisio-dashboard.html` | Painel interno do fisioterapeuta (acesso por senha, fora da navegação do app) |

**A ordem dos scripts no `index.html` importa** — cada módulo encaixa por cima do anterior.
Mantenha a sequência que já está no arquivo.

---

## VÍDEOS

Ficam em dois lugares:

- **`VIDEOS` no `index.html`** — usados pelo conteúdo local (fallback)
- **Coluna `video_url` da tabela `exercises`** — usados pelo conteúdo do Supabase

Suba no YouTube como "Não listado" e cole o link. O botão "▶ ver vídeo" aparece sozinho onde houver link.

---

## BANCO (Supabase · projeto GV Run)

| Tabela | Conteúdo |
|---|---|
| `allowed_emails` | Quem tem acesso ao app |
| `user_progress` | Progresso do aluno (jsonb) + tipo de assinatura |
| `exercises` | Acervo de exercícios com vídeo, padrão motor e degrau |
| `phases`, `monthly_blocks`, `block_sessions`, `session_exercises` | Estrutura do conteúdo mensal |
| `assessment_tests`, `user_test_results` | Bateria de testes e resultados |
| `pain_records` | Registros do mapa de dor |
| `athlete_anamnesis` | Anamnese do aluno |
| `risk_events` | Histórico do semáforo (alimenta o gatilho de 3 vermelhos) |
| `runs` | Corridas registradas (alimentam a matriz de carga) |

---

## MANUTENÇÃO

**Para testar:** sempre em aba anônima. O service worker guarda a versão antiga em cache.
Se o app não atualizar: DevTools → Application → Storage → Clear site data → Unregister.

**Atenção:** confirme que está no projeto **GV Run** do Supabase antes de rodar qualquer SQL.
Existe outro projeto na mesma conta, e rodar no errado já custou horas de depuração.

---

Programa educativo e preventivo do Método GV — Vynicius Dal Savio (CREFITO-10 248955-F)
e Guilherme Dias Carli (CREFITO-10 111237-F). Não substitui avaliação fisioterapêutica individual.
