// Control de Paneles Solares — datos en Supabase (tablas solar_*), preferencias de tema en localStorage
const SUPABASE_URL = 'https://mhmqgjgfkcrgbtrhmtqw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_up1bYZnUEh0JxdhfBIRTUQ_FO2jrb4X'; // llave pública; el acceso lo controla RLS
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const KEY_PREFS = 'solar_prefs';
const DEFAULT_CFG = { tarifa: 0.15, moneda: 'MXN', co2: 0.45 };
const DEFAULT_SUC = { paneles: 10, watts: 450, hsp: 5 };
const PALETA = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#6366f1'];
const TEMAS = ['auto', 'light', 'dark'];
const TEMA_INFO = { auto: ['🖥️', 'automático'], light: ['☀️', 'claro'], dark: ['🌙', 'oscuro'] };

const $ = (id) => document.getElementById(id);
const charts = {};

let lecturas = [];
let empresas = [];
let sucursales = [];
let cfg = { ...DEFAULT_CFG };
let usuarioId = null;

// ---------- Preferencias locales ----------
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(KEY_PREFS)) || {}; } catch { return {}; }
}
let prefs = { tema: 'auto', acento: 'solar', ...loadPrefs() };
function savePrefs() {
  try { localStorage.setItem(KEY_PREFS, JSON.stringify(prefs)); } catch { /* sin almacenamiento */ }
}

// ---------- Capa de datos (Supabase) ----------
const aEmpresa = (r) => ({ id: r.id, nombre: r.nombre, rfc: r.rfc || '' });
const aSucursal = (r) => ({
  id: r.id, empresaId: r.empresa_id, nombre: r.nombre, ubicacion: r.ubicacion || '',
  paneles: +r.paneles, watts: +r.watts, hsp: +r.hsp,
});
const aLectura = (r) => ({
  id: r.id, sucursalId: r.sucursal_id, fecha: r.fecha, generada: +r.generada_kwh, consumida: +r.consumida_kwh,
  hsp: r.hsp == null ? null : +r.hsp, clima: r.clima, notas: r.notas || '',
});
const deSucursal = (s) => ({
  empresa_id: s.empresaId, nombre: s.nombre, ubicacion: s.ubicacion || null,
  paneles: s.paneles, watts: s.watts, hsp: s.hsp,
});
const deLectura = (l) => ({
  sucursal_id: l.sucursalId, fecha: l.fecha, generada_kwh: l.generada, consumida_kwh: l.consumida,
  hsp: l.hsp, clima: l.clima, notas: l.notas || null,
});

function ok({ data, error }) {
  if (error) throw error;
  return data;
}

function mensajeError(err) {
  if (err?.code === '23505') return 'Ya existe un registro con ese nombre';
  if (err?.code === '23514') return 'Hay un valor fuera de rango';
  if (err?.code === '42501' || err?.status === 401) return 'Sesión expirada: vuelve a iniciar sesión';
  return err?.message || 'Error inesperado';
}

// Ejecuta una acción asíncrona mostrando errores en un aviso
async function intentar(fn, boton) {
  if (boton) boton.disabled = true;
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(mensajeError(err));
  } finally {
    if (boton) boton.disabled = false;
  }
}

async function todas(tabla, ...orden) {
  const out = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    let q = sb.from(tabla).select('*');
    orden.forEach((c) => { q = q.order(c); });
    const data = ok(await q.range(desde, desde + paso - 1));
    out.push(...data);
    if (data.length < paso) return out;
  }
}

async function cargarDatos() {
  const [e, s, l, c] = await Promise.all([
    todas('solar_empresas', 'nombre', 'id'),
    todas('solar_sucursales', 'nombre', 'id'),
    todas('solar_lecturas', 'fecha', 'id'),
    sb.from('solar_config').select('*').eq('id', 1).maybeSingle().then(ok),
  ]);
  empresas = e.map(aEmpresa);
  sucursales = s.map(aSucursal);
  lecturas = l.map(aLectura);
  cfg = c ? { tarifa: +c.tarifa, moneda: c.moneda, co2: +c.co2 } : { ...DEFAULT_CFG };
}

// Busca por nombre (sin distinguir mayúsculas) o crea la razón social / sucursal en la base
async function asegurarSucursal(empNombre, sucNombre) {
  const igual = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  let emp = empresas.find((e) => igual(e.nombre, empNombre));
  if (!emp) {
    emp = aEmpresa(ok(await sb.from('solar_empresas').insert({ nombre: empNombre.trim() }).select().single()));
    empresas.push(emp);
  }
  let suc = sucursales.find((s) => s.empresaId === emp.id && igual(s.nombre, sucNombre));
  if (!suc) {
    const fila = deSucursal({ empresaId: emp.id, nombre: sucNombre.trim(), ...DEFAULT_SUC });
    suc = aSucursal(ok(await sb.from('solar_sucursales').insert(fila).select().single()));
    sucursales.push(suc);
  }
  return suc;
}

// ---------- Entidades y cálculos ----------
const empById = (id) => empresas.find((e) => e.id === id);
const sucById = (id) => sucursales.find((s) => s.id === id);
const kwp = (s) => (s ? (s.paneles * s.watts) / 1000 : 0);
const colorSuc = (id) => PALETA[Math.max(0, sucursales.findIndex((s) => s.id === id)) % PALETA.length];
const colorEmp = (id) => PALETA[(Math.max(0, empresas.findIndex((e) => e.id === id)) + 3) % PALETA.length];

// Energía teórica = kWp × HSP; Performance Ratio = real / teórica
function teorica(l) {
  const s = sucById(l.sucursalId);
  return kwp(s) * (l.hsp || s?.hsp || 0);
}
function pr(l) {
  const t = teorica(l);
  return t > 0 ? (l.generada / t) * 100 : 0;
}

// ---------- Utilidades ----------
const fmt = (n, d = 1) => Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
const fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = () => fechaLocal(new Date());
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function agrupar(data, keyFn) {
  const m = {};
  data.forEach((l) => {
    const g = (m[keyFn(l)] ??= { gen: 0, con: 0, teo: 0, auto: 0, n: 0 });
    g.gen += l.generada;
    g.con += l.consumida;
    g.teo += teorica(l);
    g.auto += Math.min(l.generada, l.consumida);
    g.n++;
  });
  return m;
}
const prDe = (g) => (g.teo > 0 ? (g.gen / g.teo) * 100 : 0);

// ---------- Sesión ----------
function mostrarLogin() {
  usuarioId = null;
  empresas = []; sucursales = []; lecturas = [];
  $('loader').hidden = true;
  $('app').hidden = true;
  $('login').hidden = false;
  $('loginEmail').focus();
}

async function entrar(session) {
  if (usuarioId === session.user.id) return; // renovación de token
  usuarioId = session.user.id;
  $('login').hidden = true;
  $('loader').hidden = false;
  try {
    await cargarDatos();
  } catch (err) {
    console.error(err);
    toast(mensajeError(err));
  }
  $('usuario').textContent = session.user.email;
  $('loader').hidden = true;
  $('app').hidden = false;
  fillConfig();
  resetForm();
  showView('dashboard');
}

$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').hidden = true;
  $('loginBtn').disabled = true;
  const { error } = await sb.auth.signInWithPassword({
    email: $('loginEmail').value.trim(),
    password: $('loginPass').value,
  });
  $('loginBtn').disabled = false;
  if (error) {
    $('loginError').textContent = error.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos' : error.message;
    $('loginError').hidden = false;
  } else {
    $('loginPass').value = '';
  }
});

$('btnSalir').addEventListener('click', () => sb.auth.signOut());

sb.auth.onAuthStateChange((evento, session) => {
  // Diferido: no se deben esperar llamadas a Supabase dentro de este callback
  setTimeout(() => {
    if (session) entrar(session);
    else mostrarLogin();
  }, 0);
});

// ---------- Tema claro / oscuro y paleta ----------
function aplicarTema() {
  const root = document.documentElement;
  if (prefs.tema === 'auto') delete root.dataset.theme; else root.dataset.theme = prefs.tema;
  root.dataset.accent = prefs.acento;
  const [icono, nombre] = TEMA_INFO[prefs.tema];
  $('btnTema').textContent = icono;
  $('btnTema').title = `Modo: ${nombre}`;
  document.querySelectorAll('.swatches button').forEach((b) => b.classList.toggle('active', b.dataset.accent === prefs.acento));
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = css('--muted');
    Chart.defaults.borderColor = css('--border');
  }
  if (!$('app').hidden && $('dashboard').classList.contains('active')) renderDashboard();
}

$('btnTema').addEventListener('click', () => {
  prefs.tema = TEMAS[(TEMAS.indexOf(prefs.tema) + 1) % TEMAS.length];
  savePrefs();
  aplicarTema();
  toast(`Modo ${TEMA_INFO[prefs.tema][1]}`);
});

document.querySelectorAll('.swatches button').forEach((b) => b.addEventListener('click', () => {
  prefs.acento = b.dataset.accent;
  savePrefs();
  $('palette').open = false;
  aplicarTema();
}));

document.addEventListener('click', (e) => {
  if (!$('palette').contains(e.target)) $('palette').open = false;
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (prefs.tema === 'auto') aplicarTema();
});

// ---------- Selects de razón social / sucursal ----------
function opcionesEmpresas(sel, todas) {
  const prev = sel.value;
  sel.innerHTML = (todas ? '<option value="">Todas</option>' : '')
    + empresas.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}
function opcionesSucursales(sel, empresaId, todas) {
  const prev = sel.value;
  const lista = sucursales.filter((s) => !empresaId || s.empresaId === empresaId);
  sel.innerHTML = (todas ? '<option value="">Todas</option>' : '')
    + lista.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}
function refrescarSelects() {
  opcionesEmpresas($('fEmpresa'), true);
  opcionesSucursales($('fSucursal'), $('fEmpresa').value, true);
  opcionesEmpresas($('regEmpresa'), false);
  opcionesSucursales($('regSucursal'), $('regEmpresa').value, false);
  opcionesEmpresas($('sucEmpresa'), false);
  const vacio = !sucursales.length;
  $('sinSucursales').hidden = !vacio;
  $('formLectura').querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = vacio; });
}

$('fEmpresa').addEventListener('change', () => {
  opcionesSucursales($('fSucursal'), $('fEmpresa').value, true);
  renderActual();
});
$('fSucursal').addEventListener('change', renderActual);
$('periodo').addEventListener('change', renderActual);
$('regEmpresa').addEventListener('change', () => opcionesSucursales($('regSucursal'), $('regEmpresa').value, false));

function filtradas() {
  const dias = Number($('periodo').value);
  const emp = $('fEmpresa').value;
  const suc = $('fSucursal').value;
  let desde = '';
  if (dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias + 1);
    desde = fechaLocal(d);
  }
  return lecturas.filter((l) => {
    const s = sucById(l.sucursalId);
    if (!s) return false;
    if (emp && s.empresaId !== emp) return false;
    if (suc && l.sucursalId !== suc) return false;
    return !desde || l.fecha >= desde;
  }).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ---------- Navegación ----------
document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
document.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  showView(a.dataset.goto);
}));

function showView(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === name));
  $('filtros').hidden = !['dashboard', 'historial'].includes(name);
  refrescarSelects();
  renderActual();
}
function renderActual() {
  const activa = document.querySelector('.view.active')?.id;
  if (activa === 'dashboard') renderDashboard();
  if (activa === 'historial') renderTabla();
  if (activa === 'empresas') renderEmpresas();
}

// ---------- Dashboard ----------
function renderDashboard() {
  const data = filtradas();
  const total = agrupar(data, () => 'all').all || { gen: 0, con: 0, teo: 0, auto: 0 };

  $('kpiGen').textContent = fmt(total.gen);
  $('kpiCon').textContent = fmt(total.con);
  $('kpiAuto').textContent = fmt(total.con ? (total.auto / total.con) * 100 : 0, 0);
  $('kpiPR').textContent = fmt(prDe(total), 0);
  $('kpiAhorro').textContent = fmt(total.gen * cfg.tarifa, 2);
  $('kpiMoneda').textContent = cfg.moneda;
  $('kpiCO2').textContent = fmt(total.gen * cfg.co2, 0);

  const cPri = css('--primary');
  const cSec = css('--secondary');

  // Diario (suma de las sucursales filtradas)
  const porFecha = agrupar(data, (l) => l.fecha);
  const fechas = Object.keys(porFecha).sort();
  drawChart('chartDiario', {
    type: 'bar',
    data: {
      labels: fechas.map((f) => f.slice(5)),
      datasets: [
        { label: 'Generada (kWh)', data: fechas.map((f) => +porFecha[f].gen.toFixed(2)), backgroundColor: cPri, borderRadius: 3 },
        { label: 'Consumida (kWh)', data: fechas.map((f) => +porFecha[f].con.toFixed(2)), backgroundColor: cSec, borderRadius: 3 },
      ],
    },
  });

  drawChart('chartPR', {
    type: 'line',
    data: {
      labels: fechas.map((f) => f.slice(5)),
      datasets: [{
        label: 'PR %', data: fechas.map((f) => +prDe(porFecha[f]).toFixed(1)),
        borderColor: cPri, backgroundColor: cPri + '26', fill: true, tension: 0.3, pointRadius: 2,
      }],
    },
    options: { scales: { y: { suggestedMin: 0, suggestedMax: 100 } } },
  });

  // Por sucursal (un color por sucursal)
  const porSuc = agrupar(data, (l) => l.sucursalId);
  const sucIds = sucursales.map((s) => s.id).filter((id) => porSuc[id]);
  drawChart('chartSucursal', {
    type: 'bar',
    data: {
      labels: sucIds.map((id) => sucById(id).nombre),
      datasets: [
        { label: 'Generada (kWh)', data: sucIds.map((id) => +porSuc[id].gen.toFixed(1)), backgroundColor: sucIds.map(colorSuc), borderRadius: 4 },
        { label: 'Consumida (kWh)', data: sucIds.map((id) => +porSuc[id].con.toFixed(1)), backgroundColor: sucIds.map((id) => colorSuc(id) + '59'), borderColor: sucIds.map(colorSuc), borderWidth: 1.5, borderRadius: 4 },
      ],
    },
    options: { plugins: { legend: { labels: { generateLabels: leyendaSucursal } } } },
  });

  // Por razón social
  const porEmp = agrupar(data, (l) => sucById(l.sucursalId).empresaId);
  const empIds = empresas.map((e) => e.id).filter((id) => porEmp[id]);
  drawChart('chartEmpresa', {
    type: 'doughnut',
    data: {
      labels: empIds.map((id) => empById(id).nombre),
      datasets: [{ data: empIds.map((id) => +porEmp[id].gen.toFixed(1)), backgroundColor: empIds.map(colorEmp), borderColor: css('--card'), borderWidth: 3 }],
    },
    options: { aspectRatio: 2, cutout: '62%', plugins: { legend: { position: 'right' } } },
  });

  // Mensual
  const porMes = agrupar(data, (l) => l.fecha.slice(0, 7));
  const meses = Object.keys(porMes).sort();
  drawChart('chartMensual', {
    type: 'bar',
    data: {
      labels: meses,
      datasets: [
        { label: 'Generada', data: meses.map((m) => +porMes[m].gen.toFixed(1)), backgroundColor: cPri, borderRadius: 4 },
        { label: 'Consumida', data: meses.map((m) => +porMes[m].con.toFixed(1)), backgroundColor: cSec, borderRadius: 4 },
        { label: 'Balance', type: 'line', data: meses.map((m) => +(porMes[m].gen - porMes[m].con).toFixed(1)), borderColor: css('--c3'), backgroundColor: css('--c3') },
      ],
    },
    options: { aspectRatio: 3 },
  });

  // Comparativo
  $('tbodyComp').innerHTML = sucIds.length ? sucIds.map((id) => {
    const s = sucById(id), g = porSuc[id], p = prDe(g);
    const pc = p >= 75 ? css('--green') : p >= 60 ? '#d97706' : css('--red');
    return `<tr>
      <td><span class="dot" style="background:${colorSuc(id)}"></span>${esc(s.nombre)}</td>
      <td>${esc(empById(s.empresaId)?.nombre)}</td>
      <td>${fmt(kwp(s), 2)}</td><td>${fmt(g.gen)}</td><td>${fmt(g.con)}</td>
      <td>${fmt(g.con ? (g.auto / g.con) * 100 : 0, 0)}%</td>
      <td><span class="badge" style="--bc:${pc}">${fmt(p, 0)}%</span></td>
      <td>${fmt(g.gen * cfg.tarifa, 2)} ${esc(cfg.moneda)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="8">Sin datos en este periodo.</td></tr>';

  renderAlertas(data);
}

// Leyenda neutra para la gráfica multicolor por sucursal
function leyendaSucursal(chart) {
  return chart.data.datasets.map((ds, i) => ({
    text: ds.label,
    fillStyle: i === 0 ? css('--muted') : css('--muted') + '59',
    strokeStyle: css('--muted'),
    lineWidth: i === 0 ? 0 : 1.5,
    hidden: !chart.isDatasetVisible(i),
    datasetIndex: i,
    fontColor: css('--muted'),
  }));
}

function drawChart(id, config) {
  if (typeof Chart === 'undefined') return;
  charts[id]?.destroy();
  config.options = { responsive: true, maintainAspectRatio: true, ...config.options };
  charts[id] = new Chart($(id), config);
}

function renderAlertas(data) {
  const msgs = [];
  if (!data.length) {
    msgs.push(sucursales.length
      ? 'No hay lecturas para este filtro. Ve a <b>Registro</b> para capturar una.'
      : 'Empieza en <b>Empresas</b>: registra una razón social y sus sucursales.');
  }
  const porSuc = {};
  data.forEach((l) => (porSuc[l.sucursalId] ??= []).push(l));
  Object.entries(porSuc).forEach(([id, ls]) => {
    const nombre = `<b>${esc(sucById(id).nombre)}</b>`;
    const bajos = ls.filter((l) => pr(l) < 60 && l.clima === 'Soleado');
    if (bajos.length) msgs.push(`⚠️ ${nombre}: ${bajos.length} día(s) soleados con rendimiento menor al 60% (${bajos.slice(-3).map((l) => l.fecha).join(', ')}). Revisa suciedad, sombras o el inversor.`);
    const ult = ls.slice(-7);
    if (ult.length >= 5) {
      const p = prDe(agrupar(ult, () => 'x').x);
      if (p < 70) msgs.push(`🧽 ${nombre}: el rendimiento de los últimos 7 registros es ${fmt(p, 0)}%. Considera limpiar los paneles.`);
    }
    if (ls.filter((l) => l.consumida > l.generada * 1.5).length > ls.length / 2) {
      msgs.push(`🔌 ${nombre}: el consumo supera ampliamente a la generación en la mayoría de los días. Evalúa ampliar el sistema.`);
    }
  });
  if (data.length && !msgs.length) msgs.push('✅ Todas las sucursales operan con normalidad.');
  $('alertas').innerHTML = `<h3>Alertas y recomendaciones</h3><ul>${msgs.map((m) => `<li>${m}</li>`).join('')}</ul>`;
}

// ---------- Registro ----------
$('formLectura').addEventListener('submit', (e) => {
  e.preventDefault();
  const sucursalId = $('regSucursal').value;
  if (!sucursalId) { toast('Selecciona una sucursal'); return; }
  const id = $('editId').value;
  const item = {
    sucursalId,
    fecha: $('fecha').value,
    generada: parseFloat($('generada').value),
    consumida: parseFloat($('consumida').value),
    hsp: parseFloat($('hsp').value) || null,
    clima: $('clima').value,
    notas: $('notas').value.trim(),
  };
  const dup = lecturas.find((l) => l.fecha === item.fecha && l.sucursalId === sucursalId && l.id !== id);
  if (dup && !confirm(`Ya existe una lectura de ${sucById(sucursalId).nombre} para ${item.fecha}. ¿Guardar otra de todos modos?`)) return;
  intentar(async () => {
    if (id) {
      const r = aLectura(ok(await sb.from('solar_lecturas').update(deLectura(item)).eq('id', id).select().single()));
      lecturas[lecturas.findIndex((l) => l.id === id)] = r;
      toast('Lectura actualizada');
    } else {
      lecturas.push(aLectura(ok(await sb.from('solar_lecturas').insert(deLectura(item)).select().single())));
      toast('Lectura guardada');
    }
    resetForm();
  }, e.submitter);
});

$('cancelEdit').addEventListener('click', resetForm);

function resetForm() {
  const emp = $('regEmpresa').value, suc = $('regSucursal').value;
  $('formLectura').reset();
  $('regEmpresa').value = emp; // conserva la sucursal para capturar varios días seguidos
  opcionesSucursales($('regSucursal'), emp, false);
  $('regSucursal').value = suc;
  $('editId').value = '';
  $('fecha').value = hoy();
  $('formTitle').textContent = 'Nueva lectura diaria';
  $('cancelEdit').hidden = true;
}

function editar(id) {
  const l = lecturas.find((x) => x.id === id);
  if (!l) return;
  showView('registro');
  const s = sucById(l.sucursalId);
  $('regEmpresa').value = s.empresaId;
  opcionesSucursales($('regSucursal'), s.empresaId, false);
  $('regSucursal').value = s.id;
  $('editId').value = l.id;
  $('fecha').value = l.fecha;
  $('generada').value = l.generada;
  $('consumida').value = l.consumida;
  $('hsp').value = l.hsp ?? '';
  $('clima').value = l.clima;
  $('notas').value = l.notas;
  $('formTitle').textContent = 'Editar lectura';
  $('cancelEdit').hidden = false;
}

function eliminar(id, boton) {
  if (!confirm('¿Eliminar esta lectura?')) return;
  intentar(async () => {
    ok(await sb.from('solar_lecturas').delete().eq('id', id));
    lecturas = lecturas.filter((l) => l.id !== id);
    renderTabla();
    toast('Lectura eliminada');
  }, boton);
}

// ---------- Historial ----------
function renderTabla() {
  const rows = filtradas().reverse();
  $('histCount').textContent = `(${rows.length})`;
  $('tbody').innerHTML = rows.length ? rows.map((l) => {
    const s = sucById(l.sucursalId);
    const bal = l.generada - l.consumida;
    return `<tr>
      <td>${l.fecha}</td>
      <td>${esc(empById(s.empresaId)?.nombre)}</td>
      <td><span class="dot" style="background:${colorSuc(s.id)}"></span>${esc(s.nombre)}</td>
      <td>${fmt(l.generada, 2)}</td><td>${fmt(l.consumida, 2)}</td>
      <td class="${bal >= 0 ? 'pos' : 'neg'}">${bal >= 0 ? '+' : ''}${fmt(bal, 2)}</td>
      <td>${l.hsp ?? '-'}</td><td>${fmt(pr(l), 0)}%</td><td>${esc(l.clima)}</td><td>${esc(l.notas)}</td>
      <td><button class="btn sm" data-edit="${l.id}">Editar</button>
          <button class="btn sm danger" data-del="${l.id}">✕</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="11">Sin lecturas para este filtro.</td></tr>';
}

$('tbody').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.edit) editar(t.dataset.edit);
  if (t.dataset.del) eliminar(t.dataset.del, t);
});

// ---------- CSV ----------
const CLIMAS = ['Soleado', 'Parcialmente nublado', 'Nublado', 'Lluvioso'];
const csvCell = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

$('btnExport').addEventListener('click', () => {
  const data = filtradas();
  const head = 'fecha,razon_social,sucursal,generada_kwh,consumida_kwh,hsp,clima,notas';
  const body = data.map((l) => {
    const s = sucById(l.sucursalId);
    return [l.fecha, empById(s.empresaId)?.nombre, s.nombre, l.generada, l.consumida, l.hsp ?? '', l.clima, l.notas || '']
      .map(csvCell).join(',');
  });
  const blob = new Blob(['﻿' + [head, ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `paneles_solares_${hoy()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`${data.length} lecturas exportadas (según filtros)`);
});

$('fileImport').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const [head = [], ...body] = parseCSV((await file.text()).replace(/^﻿/, ''));
  e.target.value = '';
  const idx = (n) => head.findIndex((h) => h.trim().toLowerCase() === n);
  const c = {
    f: idx('fecha'), e: idx('razon_social'), s: idx('sucursal'), g: idx('generada_kwh'),
    con: idx('consumida_kwh'), h: idx('hsp'), cl: idx('clima'), n: idx('notas'),
  };
  if (c.f < 0 || c.g < 0 || c.con < 0) { toast('CSV no válido: faltan columnas'); return; }
  toast('Importando…');
  await intentar(async () => {
    const nuevas = [];
    for (const r of body) {
      const generada = parseFloat(r[c.g]), consumida = parseFloat(r[c.con]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test((r[c.f] || '').trim()) || isNaN(generada) || isNaN(consumida)) continue;
      const empN = (r[c.e] || '').trim(), sucN = (r[c.s] || '').trim();
      // Sin razón social/sucursal: usa la sucursal filtrada o la primera
      const suc = empN || sucN
        ? await asegurarSucursal(empN || 'Mi empresa', sucN || 'Principal')
        : sucById($('fSucursal').value) || sucursales[0] || await asegurarSucursal('Mi empresa', 'Principal');
      const clima = (r[c.cl] || '').trim();
      nuevas.push(deLectura({
        sucursalId: suc.id, fecha: r[c.f].trim(), generada, consumida,
        hsp: parseFloat(r[c.h]) || null, clima: CLIMAS.includes(clima) ? clima : 'Soleado', notas: (r[c.n] || '').trim(),
      }));
    }
    for (let i = 0; i < nuevas.length; i += 500) {
      const data = ok(await sb.from('solar_lecturas').insert(nuevas.slice(i, i + 500)).select());
      lecturas.push(...data.map(aLectura));
    }
    refrescarSelects();
    renderTabla();
    toast(`${nuevas.length} lecturas importadas`);
  });
});

// ---------- Empresas y sucursales ----------
function renderEmpresas() {
  $('tbodyEmp').innerHTML = empresas.length ? empresas.map((e) => `<tr>
      <td><span class="dot" style="background:${colorEmp(e.id)}"></span>${esc(e.nombre)}</td>
      <td>${esc(e.rfc) || '-'}</td>
      <td>${sucursales.filter((s) => s.empresaId === e.id).length}</td>
      <td><button class="btn sm" data-emp-edit="${e.id}">Editar</button>
          <button class="btn sm danger" data-emp-del="${e.id}">✕</button></td>
    </tr>`).join('') : '<tr><td colspan="4">Sin razones sociales.</td></tr>';

  $('tbodySuc').innerHTML = sucursales.length ? sucursales.map((s) => `<tr>
      <td><span class="dot" style="background:${colorSuc(s.id)}"></span>${esc(s.nombre)}</td>
      <td>${esc(empById(s.empresaId)?.nombre)}</td>
      <td>${esc(s.ubicacion) || '-'}</td>
      <td>${s.paneles}</td><td>${s.watts}</td><td>${fmt(kwp(s), 2)}</td><td>${s.hsp}</td>
      <td>${lecturas.filter((l) => l.sucursalId === s.id).length}</td>
      <td><button class="btn sm" data-suc-edit="${s.id}">Editar</button>
          <button class="btn sm danger" data-suc-del="${s.id}">✕</button></td>
    </tr>`).join('') : '<tr><td colspan="9">Sin sucursales. Registra primero una razón social.</td></tr>';
}

$('formEmpresa').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = $('empId').value;
  const datos = { nombre: $('empNombre').value.trim(), rfc: $('empRfc').value.trim() || null };
  intentar(async () => {
    if (id) {
      Object.assign(empById(id), aEmpresa(ok(await sb.from('solar_empresas').update(datos).eq('id', id).select().single())));
    } else {
      empresas.push(aEmpresa(ok(await sb.from('solar_empresas').insert(datos).select().single())));
    }
    toast(id ? 'Razón social actualizada' : 'Razón social registrada');
    resetEmpresa();
    refrescarSelects();
    renderEmpresas();
  }, e.submitter);
});
function resetEmpresa() {
  $('formEmpresa').reset();
  $('empId').value = '';
  $('empTitle').textContent = 'Nueva razón social';
  $('empCancel').hidden = true;
}
$('empCancel').addEventListener('click', resetEmpresa);

$('formSucursal').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!$('sucEmpresa').value) { toast('Registra primero una razón social'); return; }
  const id = $('sucId').value;
  const datos = {
    empresaId: $('sucEmpresa').value,
    nombre: $('sucNombre').value.trim(),
    ubicacion: $('sucUbicacion').value.trim(),
    paneles: +$('sucPaneles').value || DEFAULT_SUC.paneles,
    watts: +$('sucWatts').value || DEFAULT_SUC.watts,
    hsp: +$('sucHsp').value || DEFAULT_SUC.hsp,
  };
  intentar(async () => {
    if (id) {
      Object.assign(sucById(id), aSucursal(ok(await sb.from('solar_sucursales').update(deSucursal(datos)).eq('id', id).select().single())));
    } else {
      sucursales.push(aSucursal(ok(await sb.from('solar_sucursales').insert(deSucursal(datos)).select().single())));
    }
    toast(id ? 'Sucursal actualizada' : 'Sucursal registrada');
    resetSucursal();
    refrescarSelects();
    renderEmpresas();
  }, e.submitter);
});
function resetSucursal() {
  const emp = $('sucEmpresa').value;
  $('formSucursal').reset();
  $('sucEmpresa').value = emp;
  $('sucId').value = '';
  $('sucTitle').textContent = 'Nueva sucursal';
  $('sucCancel').hidden = true;
  actualizarKwp();
}
$('sucCancel').addEventListener('click', resetSucursal);

function actualizarKwp() {
  $('sucKwp').textContent = fmt(($('sucPaneles').value * $('sucWatts').value) / 1000, 2);
}
['sucPaneles', 'sucWatts'].forEach((id) => $(id).addEventListener('input', actualizarKwp));

$('empresas').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.empEdit) {
    const x = empById(d.empEdit);
    $('empId').value = x.id;
    $('empNombre').value = x.nombre;
    $('empRfc').value = x.rfc || '';
    $('empTitle').textContent = 'Editar razón social';
    $('empCancel').hidden = false;
    $('empNombre').focus();
  }
  if (d.empDel) {
    const x = empById(d.empDel);
    const sucs = sucursales.filter((s) => s.empresaId === x.id).map((s) => s.id);
    const nLect = lecturas.filter((l) => sucs.includes(l.sucursalId)).length;
    if (!confirm(`¿Eliminar "${x.nombre}"?${sucs.length ? ` También se eliminarán ${sucs.length} sucursal(es) y ${nLect} lectura(s).` : ''}`)) return;
    intentar(async () => {
      ok(await sb.from('solar_empresas').delete().eq('id', x.id)); // cascada en la base
      empresas = empresas.filter((y) => y.id !== x.id);
      sucursales = sucursales.filter((s) => !sucs.includes(s.id));
      lecturas = lecturas.filter((l) => !sucs.includes(l.sucursalId));
      toast('Razón social eliminada');
      refrescarSelects();
      renderEmpresas();
    }, b);
  }
  if (d.sucEdit) {
    const s = sucById(d.sucEdit);
    $('sucId').value = s.id;
    $('sucEmpresa').value = s.empresaId;
    $('sucNombre').value = s.nombre;
    $('sucUbicacion').value = s.ubicacion || '';
    $('sucPaneles').value = s.paneles;
    $('sucWatts').value = s.watts;
    $('sucHsp').value = s.hsp;
    $('sucTitle').textContent = 'Editar sucursal';
    $('sucCancel').hidden = false;
    actualizarKwp();
    $('sucNombre').focus();
  }
  if (d.sucDel) {
    const s = sucById(d.sucDel);
    const nLect = lecturas.filter((l) => l.sucursalId === s.id).length;
    if (!confirm(`¿Eliminar la sucursal "${s.nombre}"?${nLect ? ` También se eliminarán ${nLect} lectura(s).` : ''}`)) return;
    intentar(async () => {
      ok(await sb.from('solar_sucursales').delete().eq('id', s.id));
      sucursales = sucursales.filter((y) => y.id !== s.id);
      lecturas = lecturas.filter((l) => l.sucursalId !== s.id);
      toast('Sucursal eliminada');
      refrescarSelects();
      renderEmpresas();
    }, b);
  }
});

// ---------- Parámetros generales ----------
function fillConfig() {
  $('cfgTarifa').value = cfg.tarifa;
  $('cfgMoneda').value = cfg.moneda;
  $('cfgCO2').value = cfg.co2;
}

$('formConfig').addEventListener('submit', (e) => {
  e.preventDefault();
  const nuevo = {
    tarifa: +$('cfgTarifa').value || 0,
    moneda: $('cfgMoneda').value.trim() || 'MXN',
    co2: +$('cfgCO2').value || 0,
  };
  intentar(async () => {
    ok(await sb.from('solar_config').update(nuevo).eq('id', 1));
    cfg = nuevo;
    toast('Parámetros guardados');
  }, e.submitter);
});

$('btnReset').addEventListener('click', (e) => {
  const texto = prompt('Se borrarán TODAS las razones sociales, sucursales y lecturas de la base de datos para todos los usuarios.\nEscribe BORRAR para confirmar:');
  if (texto !== 'BORRAR') return;
  intentar(async () => {
    ok(await sb.from('solar_empresas').delete().not('id', 'is', null)); // cascada a sucursales y lecturas
    lecturas = []; empresas = []; sucursales = [];
    refrescarSelects();
    renderEmpresas();
    toast('Datos borrados');
  }, e.currentTarget);
});

// ---------- Inicio ----------
// Limpia los datos que la versión anterior guardaba en el navegador
try {
  ['solar_lecturas', 'solar_empresas', 'solar_sucursales', 'solar_config'].forEach((k) => localStorage.removeItem(k));
} catch { /* sin almacenamiento */ }
actualizarKwp();
aplicarTema();
