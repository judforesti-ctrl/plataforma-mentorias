// Leitor de agendas no formato iCal (.ics): o "endereço secreto" do Google Agenda, a agenda publicada do Outlook/Hotmail e outras.
// Transforma o arquivo na lista de compromissos de um período: repetições (toda semana, todo mês...) abertas uma a uma,
// exceções aplicadas (ocorrência mudada, cancelada ou apagada) e horário convertido do fuso de origem. Sem dependências.
// Cada compromisso: { uid, serie, titulo, inicio, fim (ISO), dia_inteiro, local, link, organizador, organizador_email,
//                     resposta (aceito | talvez | sem_resposta | null), ocupa, particular }.
// Fica de fora o que foi cancelado e os convites que o dono da agenda recusou.

const DIA_MS = 86400000;
const SEMANA = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FUSO_PADRAO = 'America/Sao_Paulo';

// Nomes de fuso do Windows (Outlook) → nomes que o servidor entende.
const WINDOWS = {
  'E. South America Standard Time': 'America/Sao_Paulo', 'SA Eastern Standard Time': 'America/Fortaleza', 'Bahia Standard Time': 'America/Bahia',
  'Tocantins Standard Time': 'America/Araguaina', 'Central Brazilian Standard Time': 'America/Cuiaba', 'SA Western Standard Time': 'America/Manaus',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires', 'Montevideo Standard Time': 'America/Montevideo', 'Paraguay Standard Time': 'America/Asuncion',
  'Pacific SA Standard Time': 'America/Santiago', 'SA Pacific Standard Time': 'America/Bogota', 'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
  'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik', 'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest', 'GTB Standard Time': 'Europe/Bucharest',
  'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
};

// Salas online reconhecidas (o link vai para o botão "Entrar na reunião").
const SALA = /https?:\/\/(?:[\w-]+\.)*(?:meet\.google\.com|zoom\.us|zoom\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|meet\.jit\.si|gotomeeting\.com|gotomeet\.me|skype\.com)\/[^\s<>"'\\)\]]*/i;

// ---------- linhas e propriedades ----------
const desdobrar = (texto) => String(texto || '').replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
export const textoIcs = (v) => String(v || '').replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1').trim();

function lerLinha(l) {
  let aspas = false, i = 0;
  for (; i < l.length; i += 1) { const c = l[i]; if (c === '"') aspas = !aspas; else if (c === ':' && !aspas) break; }
  if (i >= l.length) return null;
  const partes = []; let atual = ''; aspas = false;
  for (const c of l.slice(0, i)) {
    if (c === '"') { aspas = !aspas; continue; }
    if (c === ';' && !aspas) { partes.push(atual); atual = ''; } else atual += c;
  }
  partes.push(atual);
  const params = {};
  for (const p of partes.slice(1)) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1); }
  return { nome: partes[0].toUpperCase(), params, valor: l.slice(i + 1) };
}

// Separa os blocos: compromissos (VEVENT), fusos (VTIMEZONE) e dados da agenda (nome, fuso).
function componentes(linhas) {
  const eventos = [], fusos = {}, cal = {};
  const pilha = [];
  for (const l of linhas) {
    if (!l) continue;
    const p = lerLinha(l);
    if (!p) continue;
    if (p.nome === 'BEGIN') { pilha.push({ tipo: p.valor.trim().toUpperCase(), props: {}, sub: [] }); continue; }
    if (p.nome === 'END') {
      const c = pilha.pop();
      if (!c) continue;
      const pai = pilha[pilha.length - 1];
      if (c.tipo === 'VEVENT') eventos.push(c.props);
      else if (pai && pai.tipo === 'VTIMEZONE') pai.sub.push(c);
      else if (c.tipo === 'VTIMEZONE') {
        const id = um(c.props, 'TZID');
        const std = c.sub.find((s) => s.tipo === 'STANDARD') || c.sub[0];
        const desl = std && deslocTexto(valor(std.props, 'TZOFFSETTO'));
        if (id && desl != null) fusos[id.valor.trim()] = desl;
      }
      continue;
    }
    const topo = pilha[pilha.length - 1];
    if (!topo) continue;
    if (topo.tipo === 'VCALENDAR') { if (!(p.nome in cal)) cal[p.nome] = p.valor; continue; }
    (topo.props[p.nome] = topo.props[p.nome] || []).push(p);
  }
  return { eventos, fusos, cal };
}
const um = (props, nome) => (props[nome] && props[nome][0]) || null;
const valor = (props, nome) => { const p = um(props, nome); return p ? p.valor : ''; };
const deslocTexto = (t) => { const m = /^([+-])(\d{2})(\d{2})/.exec(String(t || '').trim()); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null; };

// ---------- fusos e horários ----------
const formatos = new Map();
function zonaValida(z) {
  if (formatos.has(z)) return true;
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (_) { return false; }
}
// Diferença (em minutos) entre o relógio do fuso e o UTC num instante.
function deslocMin(iana, ms) {
  let f = formatos.get(iana);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: iana, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formatos.set(iana, f);
  }
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return Math.round((Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second) - ms) / 60000);
}
// "parede" = data e hora como aparecem no relógio do compromisso, guardadas como se fossem UTC. Converte para o instante real.
function paraUtc(parede, z) {
  if (z.utc) return parede;
  if (z.fixo != null) return parede - z.fixo * 60000;
  const a = deslocMin(z.iana, parede);
  let t = parede - a * 60000;
  const b = deslocMin(z.iana, t);
  if (b !== a) t = parede - b * 60000;
  return t;
}
function zona(tzid, ctx) {
  let t = String(tzid || '').replace(/^"|"$/g, '').trim();
  if (!t) return ctx.calTz && ctx.calTz !== tzid ? zona(ctx.calTz, { ...ctx, calTz: null }) : { iana: FUSO_PADRAO };
  if (zonaValida(t)) return { iana: t };
  const iana = /([A-Za-z_]+(?:\/[A-Za-z_+-]+)+)$/.exec(t);   // ex.: /mozilla.org/20050126_1/America/Sao_Paulo
  if (iana && zonaValida(iana[1])) return { iana: iana[1] };
  if (WINDOWS[t]) return { iana: WINDOWS[t] };
  if (ctx.fusos[t] != null) return { fixo: ctx.fusos[t] };
  return { iana: FUSO_PADRAO };
}
function partesData(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(v || '').trim());
  if (!m) return null;
  return { parede: Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)), data: !m[4], utc: !!m[7] };
}
// Um valor de data/hora (DTSTART, DTEND, RECURRENCE-ID, EXDATE...) → { parede, z, data }
function quando(prop, ctx, texto = null) {
  if (!prop) return null;
  const p = partesData(texto != null ? texto : prop.valor.split(',')[0]);
  if (!p) return null;
  const data = p.data || String(prop.params.VALUE || '').toUpperCase() === 'DATE';
  const z = p.utc ? { utc: true } : data ? { iana: FUSO_PADRAO } : zona(prop.params.TZID, ctx);
  return { parede: p.parede, z, data };
}
const real = (q) => paraUtc(q.parede, q.z);
function duracao(t) {   // P1D, PT1H30M, P1W, -PT15M
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(t || '').trim());
  if (!m) return null;
  const ms = ((+(m[2] || 0) * 7 + +(m[3] || 0)) * 24 * 3600 + +(m[4] || 0) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

// ---------- repetições ----------
// Datas (na "parede") de uma regra de repetição, do início até o fim do período.
// limite: parede máxima; antes: parede mínima de interesse (para pular anos antigos quando não há COUNT); passou(t): UNTIL.
function repetir(ini, rrule, { antes, limite, passou }) {
  const r = {};
  for (const par of String(rrule).split(';')) { const [k, v] = par.split('='); if (k && v != null) r[k.trim().toUpperCase()] = v.trim(); }
  const freq = r.FREQ;
  const intervalo = Math.max(1, parseInt(r.INTERVAL || '1', 10) || 1);
  const count = r.COUNT ? Math.max(0, parseInt(r.COUNT, 10) || 0) : null;
  const byday = (r.BYDAY ? r.BYDAY.split(',') : []).map((x) => {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(x.trim());
    return m ? { n: m[1] ? parseInt(m[1], 10) : 0, wd: SEMANA.indexOf(m[2].toUpperCase()) } : null;
  }).filter(Boolean);
  const bymd = (r.BYMONTHDAY ? r.BYMONTHDAY.split(',') : []).map(Number).filter((x) => x && Math.abs(x) <= 31);
  const bymes = (r.BYMONTH ? r.BYMONTH.split(',') : []).map(Number).filter((x) => x >= 1 && x <= 12);
  const bypos = (r.BYSETPOS ? r.BYSETPOS.split(',') : []).map(Number).filter(Boolean);
  const wkst = Math.max(0, SEMANA.indexOf(String(r.WKST || 'MO').toUpperCase()));
  const d0 = new Date(ini);
  const a0 = d0.getUTCFullYear(), m0 = d0.getUTCMonth(), dd0 = d0.getUTCDate(), wd0 = d0.getUTCDay();
  const hms = ini - Date.UTC(a0, m0, dd0);
  const diasNoMes = (a, m) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const doMes = (a, m) => {
    const total = diasNoMes(a, m);
    let c = [];
    if (bymd.length) c = bymd.map((x) => (x > 0 ? x : total + x + 1)).filter((x) => x >= 1 && x <= total);
    if (byday.length) {
      const pelaSemana = [];
      for (const { n, wd } of byday) {
        const todos = [];
        for (let d = 1; d <= total; d += 1) if (new Date(Date.UTC(a, m, d)).getUTCDay() === wd) todos.push(d);
        if (!n) pelaSemana.push(...todos);
        else { const x = n > 0 ? todos[n - 1] : todos[todos.length + n]; if (x) pelaSemana.push(x); }
      }
      c = bymd.length ? c.filter((x) => pelaSemana.includes(x)) : pelaSemana;
    }
    if (!bymd.length && !byday.length) c = dd0 <= total ? [dd0] : [];
    c = [...new Set(c)].sort((x, y) => x - y);
    if (bypos.length) c = bypos.map((p) => (p > 0 ? c[p - 1] : c[c.length + p])).filter(Boolean);
    return c.map((d) => Date.UTC(a, m, d) + hms);
  };
  // sem COUNT, pula direto para perto do período (uma reunião semanal criada há anos não precisa ser contada desde o começo)
  let passo0 = 0;
  if (count == null && antes > ini) {
    const dias = (antes - ini) / DIA_MS;
    passo0 = Math.max(0, Math.floor(freq === 'DAILY' ? dias / intervalo : freq === 'WEEKLY' ? dias / 7 / intervalo
      : freq === 'MONTHLY' ? dias / 31 / intervalo : freq === 'YEARLY' ? dias / 366 / intervalo : 0) - 1);
  }
  const out = [];
  let n = 0;
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return [ini];
  for (let passo = passo0; passo < passo0 + 5000; passo += 1) {
    let cand = [], inicioPeriodo;
    if (freq === 'DAILY') {
      const t = ini + passo * intervalo * DIA_MS;
      inicioPeriodo = t;
      const dt = new Date(t);
      if ((!bymes.length || bymes.includes(dt.getUTCMonth() + 1)) && (!byday.length || byday.some((b) => b.wd === dt.getUTCDay()))
        && (!bymd.length || bymd.includes(dt.getUTCDate()))) cand = [t];
    } else if (freq === 'WEEKLY') {
      const base = ini - ((wd0 - wkst + 7) % 7) * DIA_MS + passo * intervalo * 7 * DIA_MS;
      inicioPeriodo = base;
      const dias = byday.length ? byday.map((b) => b.wd) : [wd0];
      cand = [...new Set(dias)].map((wd) => base + ((wd - wkst + 7) % 7) * DIA_MS).sort((x, y) => x - y);
      if (bymes.length) cand = cand.filter((t) => bymes.includes(new Date(t).getUTCMonth() + 1));
    } else if (freq === 'MONTHLY') {
      const mm = m0 + passo * intervalo;
      const a = a0 + Math.floor(mm / 12), m = ((mm % 12) + 12) % 12;
      inicioPeriodo = Date.UTC(a, m, 1);
      if (!bymes.length || bymes.includes(m + 1)) cand = doMes(a, m);
    } else {
      const a = a0 + passo * intervalo;
      inicioPeriodo = Date.UTC(a, 0, 1);
      const meses = bymes.length ? bymes.map((x) => x - 1) : [m0];
      for (const m of meses) {
        if (bymd.length || byday.length) cand.push(...doMes(a, m));
        else if (dd0 <= diasNoMes(a, m)) cand.push(Date.UTC(a, m, dd0) + hms);
      }
      cand.sort((x, y) => x - y);
    }
    if (inicioPeriodo > limite) break;
    let parar = false;
    for (const t of cand) {
      if (t < ini) continue;
      if (t > limite || passou(t)) { parar = true; break; }
      n += 1;
      if (count != null && n > count) { parar = true; break; }
      out.push(t);
    }
    if (parar) break;
  }
  return out;
}

// ---------- a agenda inteira ----------
// de, ate: instantes (ms) do período que interessa. donos: e-mails do dono da agenda (para achar a resposta dele aos convites).
export function lerAgenda(texto, { de, ate, donos = [] } = {}) {
  const { eventos, fusos, cal } = componentes(desdobrar(texto));
  const ctx = { fusos, calTz: (cal['X-WR-TIMEZONE'] || '').trim() || null };
  const nomeAgenda = textoIcs(cal['X-WR-CALNAME'] || '');
  const meus = new Set(donos.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean));
  if (/^[^\s@]+@[^\s@]+$/.test(nomeAgenda)) meus.add(nomeAgenda.toLowerCase());
  const margem = 2 * DIA_MS;   // a "parede" difere do instante real em algumas horas

  // separa as séries (compromisso principal) das exceções (uma ocorrência mudada ou cancelada)
  const series = new Map(), excecoes = new Map(), soltos = [];
  for (const ev of eventos) {
    const uid = valor(ev, 'UID').trim();
    if (um(ev, 'RECURRENCE-ID')) { if (!excecoes.has(uid)) excecoes.set(uid, []); excecoes.get(uid).push(ev); continue; }
    if (!uid || series.has(uid)) soltos.push(ev); else series.set(uid, ev);
  }

  const out = [];
  const montar = (ev, ini, fim, data, uid, serie) => {
    if (String(valor(ev, 'STATUS')).toUpperCase() === 'CANCELLED') return;
    if (!(fim > de && ini < ate)) return;
    const email = (v) => String(v || '').replace(/^mailto:/i, '').trim().toLowerCase();
    let resposta = null;
    for (const a of ev.ATTENDEE || []) {
      if (!meus.has(email(a.valor))) continue;
      const ps = String(a.params.PARTSTAT || '').toUpperCase();
      if (ps === 'DECLINED') return;                       // convite recusado: não ocupa a agenda
      resposta = ps === 'ACCEPTED' ? 'aceito' : ps === 'TENTATIVE' ? 'talvez' : ps === 'NEEDS-ACTION' ? 'sem_resposta' : null;
    }
    const org = um(ev, 'ORGANIZER');
    const orgEmail = org ? email(org.valor) : '';
    const orgNome = org && org.params.CN ? textoIcs(org.params.CN) : '';
    const particular = ['PRIVATE', 'CONFIDENTIAL'].includes(String(valor(ev, 'CLASS')).toUpperCase());
    const local = textoIcs(valor(ev, 'LOCATION'));
    const fontesSala = [valor(ev, 'X-GOOGLE-CONFERENCE'), valor(ev, 'X-MICROSOFT-SKYPETEAMSMEETINGURL'), valor(ev, 'URL'), local, textoIcs(valor(ev, 'DESCRIPTION'))];
    let link = null;
    for (const f of fontesSala) { const m = SALA.exec(String(f || '')); if (m) { link = m[0].replace(/[.,;]+$/, ''); break; } }
    const localSemSala = local && !(link && local.replace(/\s+/g, '') === link) ? local : '';
    out.push({
      uid: `${uid}|${new Date(ini).toISOString()}`.slice(0, 500), serie,
      titulo: particular ? 'Particular' : (textoIcs(valor(ev, 'SUMMARY')) || 'Compromisso').slice(0, 300),
      inicio: new Date(ini).toISOString(), fim: new Date(fim).toISOString(), dia_inteiro: data,
      local: particular ? null : (localSemSala.slice(0, 300) || null),
      link: particular ? null : link && link.slice(0, 500),
      organizador: particular ? null : ((orgNome || orgEmail).slice(0, 200) || null),
      organizador_email: orgEmail.slice(0, 200) || null,
      organizador_eu: !orgEmail || meus.has(orgEmail),
      resposta, ocupa: String(valor(ev, 'TRANSP')).toUpperCase() !== 'TRANSPARENT', particular,
    });
  };

  // início e fim de uma ocorrência (instantes reais); dia inteiro começa à meia-noite de Brasília
  const intervalo = (ev, ini) => {
    const fimP = quando(um(ev, 'DTEND'), ctx);
    const dur = duracao(valor(ev, 'DURATION'));
    let a, b;
    if (ini.data) {
      const dias = fimP && fimP.data ? Math.max(1, Math.round((fimP.parede - partesDe(ev, ctx).parede) / DIA_MS)) : dur != null ? Math.max(1, Math.round(dur / DIA_MS)) : 1;
      a = paraUtc(ini.parede, { iana: FUSO_PADRAO });
      b = paraUtc(ini.parede + dias * DIA_MS, { iana: FUSO_PADRAO });
    } else {
      a = real(ini);
      const base = partesDe(ev, ctx);
      const d = fimP ? real(fimP) - real(base) : dur != null ? dur : 30 * 60000;
      b = a + Math.max(d, 5 * 60000);
    }
    return [a, b];
  };
  const partesDe = (ev, c) => quando(um(ev, 'DTSTART'), c);

  for (const [uid, ev] of series) {
    if (String(valor(ev, 'STATUS')).toUpperCase() === 'CANCELLED') continue;
    const ini = partesDe(ev, ctx);
    if (!ini) continue;
    const exc = new Map();
    for (const x of excecoes.get(uid) || []) {
      const rid = quando(um(x, 'RECURRENCE-ID'), ctx);
      if (rid) exc.set(rid.data ? rid.parede : real(rid), x);
    }
    excecoes.delete(uid);
    const rr = valor(ev, 'RRULE');
    if (!rr) {
      const [a, b] = intervalo(ev, ini);
      montar(ev, a, b, ini.data, uid, uid);
      continue;
    }
    // repetição: UNTIL, datas apagadas (EXDATE) e datas extras (RDATE)
    const r = Object.fromEntries(rr.split(';').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
    let passou = () => false;
    if (r.UNTIL) {
      const u = partesData(r.UNTIL);
      if (u && u.data) { const lim = u.parede + DIA_MS - 1; passou = (t) => t > lim; }
      else if (u) { const lim = u.utc ? u.parede : paraUtc(u.parede, ini.z); passou = (t) => (ini.data ? t : paraUtc(t, ini.z)) > lim; }
    }
    const apagadasHora = new Set(), apagadasDia = new Set();
    for (const x of ev.EXDATE || []) {
      for (const v of x.valor.split(',')) {
        const q = quando(x, ctx, v);
        if (!q) continue;
        if (q.data || ini.data) apagadasDia.add(q.parede - (q.parede % DIA_MS)); else apagadasHora.add(real(q));
      }
    }
    const datas = repetir(ini.parede, rr, { antes: de - margem - 7 * DIA_MS, limite: ate + margem, passou });
    for (const x of ev.RDATE || []) for (const v of x.valor.split(',')) { const q = quando(x, ctx, v); if (q && !q.data) datas.push(q.parede); }
    const vistos = new Set();
    for (const t of datas) {
      const q = { parede: t, z: ini.z, data: ini.data };
      const chave = ini.data ? t : real(q);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      if (apagadasDia.has(t - (t % DIA_MS)) || apagadasHora.has(chave)) continue;
      const trocada = exc.get(chave);
      if (trocada) {
        exc.delete(chave);
        const qi = partesDe(trocada, ctx);
        if (!qi) continue;
        const [a, b] = intervalo(trocada, qi);
        montar(trocada, a, b, qi.data, uid, uid);
        continue;
      }
      const [a, b] = intervalo(ev, q);
      montar(ev, a, b, ini.data, uid, uid);
    }
    // exceção que mudou de data para dentro do período, mas cuja data original está fora dele
    for (const x of exc.values()) {
      const qi = partesDe(x, ctx);
      if (!qi) continue;
      const [a, b] = intervalo(x, qi);
      montar(x, a, b, qi.data, uid, uid);
    }
  }
  // exceções sem a série no arquivo (convite para uma única ocorrência de uma reunião de outra pessoa) e compromissos sem UID
  for (const [uid, lista] of excecoes) for (const x of lista) { const qi = partesDe(x, ctx); if (qi) { const [a, b] = intervalo(x, qi); montar(x, a, b, qi.data, uid, uid); } }
  for (const ev of soltos) { const qi = partesDe(ev, ctx); if (qi) { const [a, b] = intervalo(ev, qi); const uid = valor(ev, 'UID') || `${valor(ev, 'SUMMARY')}`; montar(ev, a, b, qi.data, uid, uid); } }

  out.sort((x, y) => x.inicio.localeCompare(y.inicio));
  // a mesma ocorrência não entra duas vezes
  const unicos = new Map();
  for (const e of out) if (!unicos.has(e.uid)) unicos.set(e.uid, e);
  return { eventos: [...unicos.values()], nome: nomeAgenda, valida: /BEGIN:VCALENDAR/i.test(String(texto).slice(0, 3000)) };
}
