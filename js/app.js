// Control de Paneles Solares — datos guardados en localStorage del navegador
const KEY_DATA = 'solar_lecturas';
const KEY_CFG = 'solar_config';

const DEFAULT_CFG = {
  nombre: 'Mi instalación solar',
  paneles: 10,
  watts: 450,
  hsp: 5,
  tarifa: 0.15,
  moneda: 'USD',
  co2: 0.45,
};

const $ = (id) => document.getElementById(id);
const charts = {};

// ---------- Almacenamiento ----------
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { toast('No se pudo guardar'); }
}
let lecturas = load(KEY_DATA, []);
let cfg = { ...DEFAULT_CFG, ...load(KEY_CFG, {}) };

const kwp = () => (cfg.paneles * cfg.watts) / 1000;

// Performance Ratio: energía real / energía teórica (kWp × HSP)
function pr(l) {
  const hsp = l.hsp || cfg.hsp;
  const teorica = kwp() * hsp;
  return teorica > 0 ? (l.generada / teorica) * 100 : 0;
}

// ---------- Utilidades ----------
const fmt = (n, d = 1) => Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
const hoy = () => new Date().toISOString().slice(0, 10);

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function filtradas() {
  const dias = Number($('periodo').value);
  const orden = [...lecturas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!dias) return orden;
  const desde = new Date();
  desde.setDate(desde.getDate() - dias + 1);
  const d = desde.toISOString().slice(0, 10);
  return orden.filter((l) => l.fecha >= d);
}

// ---------- Navegación ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});
function showView(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'historial') renderTabla();
}

// ---------- Dashboard ----------
function renderDashboard() {
  const data = filtradas();
  const gen = data.reduce((s, l) => s + l.generada, 0);
  const con = data.reduce((s, l) => s + l.consumida, 0);
  const autoconsumo = data.reduce((s, l) => s + Math.min(l.generada, l.consumida), 0);
  const prProm = data.length ? data.reduce((s, l) => s + pr(l), 0) / data.length : 0;

  $('kpiGen').textContent = fmt(gen);
  $('kpiCon').textContent = fmt(con);
  $('kpiAuto').textContent = fmt(con ? (autoconsumo / con) * 100 : 0, 0);
  $('kpiPR').textContent = fmt(prProm, 0);
  $('kpiAhorro').textContent = fmt(gen * cfg.tarifa, 2);
  $('kpiMoneda').textContent = cfg.moneda;
  $('kpiCO2').textContent = fmt(gen * cfg.co2, 0);

  const labels = data.map((l) => l.fecha.slice(5));
  drawChart('chartDiario', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Generada (kWh)', data: data.map((l) => l.generada), backgroundColor: '#f59e0b' },
        { label: 'Consumida (kWh)', data: data.map((l) => l.consumida), backgroundColor: '#2563eb' },
      ],
    },
  });

  drawChart('chartPR', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'PR %', data: data.map((l) => +pr(l).toFixed(1)),
        borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.12)', fill: true, tension: .3,
      }],
    },
    options: { scales: { y: { suggestedMin: 0, suggestedMax: 100 } } },
  });

  // Agregado mensual
  const meses = {};
  data.forEach((l) => {
    const m = l.fecha.slice(0, 7);
    meses[m] ??= { gen: 0, con: 0 };
    meses[m].gen += l.generada;
    meses[m].con += l.consumida;
  });
  const mk = Object.keys(meses).sort();
  drawChart('chartMensual', {
    type: 'bar',
    data: {
      labels: mk,
      datasets: [
        { label: 'Generada', data: mk.map((m) => +meses[m].gen.toFixed(1)), backgroundColor: '#f59e0b' },
        { label: 'Consumida', data: mk.map((m) => +meses[m].con.toFixed(1)), backgroundColor: '#2563eb' },
        { label: 'Balance', type: 'line', data: mk.map((m) => +(meses[m].gen - meses[m].con).toFixed(1)), borderColor: '#16a34a' },
      ],
    },
  });

  renderAlertas(data);
}

function drawChart(id, config) {
  if (typeof Chart === 'undefined') return;
  charts[id]?.destroy();
  config.options = { responsive: true, maintainAspectRatio: true, ...config.options };
  charts[id] = new Chart($(id), config);
}

function renderAlertas(data) {
  const msgs = [];
  if (!data.length) msgs.push('No hay lecturas en este periodo. Ve a <b>Registro</b> o carga datos de ejemplo en <b>Sistema</b>.');
  const bajos = data.filter((l) => pr(l) < 60 && l.clima === 'Soleado');
  if (bajos.length) msgs.push(`⚠️ ${bajos.length} día(s) soleados con rendimiento menor al 60%: revisa suciedad, sombras o el inversor (${bajos.slice(-3).map((l) => l.fecha).join(', ')}).`);
  const ult = data.slice(-7);
  if (ult.length >= 5) {
    const prUlt = ult.reduce((s, l) => s + pr(l), 0) / ult.length;
    if (prUlt < 70) msgs.push(`🧽 El rendimiento promedio de los últimos 7 días es ${fmt(prUlt, 0)}%. Considera limpiar los paneles.`);
  }
  const deficit = data.filter((l) => l.consumida > l.generada * 1.5).length;
  if (deficit > data.length / 2 && data.length) msgs.push('🔌 Más de la mitad de los días el consumo supera ampliamente la generación. Evalúa ampliar el sistema o reducir consumo.');
  if (data.length && !msgs.length) msgs.push('✅ El sistema opera con normalidad.');
  $('alertas').innerHTML = `<h3>Alertas y recomendaciones</h3><ul>${msgs.map((m) => `<li>${m}</li>`).join('')}</ul>`;
}

// ---------- Registro ----------
$('fecha').value = hoy();

$('formLectura').addEventListener('submit', (e) => {
  e.preventDefault();
  const item = {
    id: $('editId').value || crypto.randomUUID(),
    fecha: $('fecha').value,
    generada: parseFloat($('generada').value),
    consumida: parseFloat($('consumida').value),
    hsp: parseFloat($('hsp').value) || null,
    clima: $('clima').value,
    notas: $('notas').value.trim(),
  };
  const idx = lecturas.findIndex((l) => l.id === item.id);
  const dup = lecturas.find((l) => l.fecha === item.fecha && l.id !== item.id);
  if (dup && !confirm(`Ya existe una lectura para ${item.fecha}. ¿Guardar otra de todos modos?`)) return;
  if (idx >= 0) lecturas[idx] = item; else lecturas.push(item);
  save(KEY_DATA, lecturas);
  toast(idx >= 0 ? 'Lectura actualizada' : 'Lectura guardada');
  resetForm();
});

$('cancelEdit').addEventListener('click', resetForm);

function resetForm() {
  $('formLectura').reset();
  $('editId').value = '';
  $('fecha').value = hoy();
  $('formTitle').textContent = 'Nueva lectura diaria';
  $('cancelEdit').hidden = true;
}

function editar(id) {
  const l = lecturas.find((x) => x.id === id);
  if (!l) return;
  $('editId').value = l.id;
  $('fecha').value = l.fecha;
  $('generada').value = l.generada;
  $('consumida').value = l.consumida;
  $('hsp').value = l.hsp ?? '';
  $('clima').value = l.clima;
  $('notas').value = l.notas;
  $('formTitle').textContent = 'Editar lectura';
  $('cancelEdit').hidden = false;
  showView('registro');
}

function eliminar(id) {
  if (!confirm('¿Eliminar esta lectura?')) return;
  lecturas = lecturas.filter((l) => l.id !== id);
  save(KEY_DATA, lecturas);
  renderTabla();
  toast('Lectura eliminada');
}

// ---------- Historial ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTabla() {
  const rows = [...lecturas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  $('tbody').innerHTML = rows.length ? rows.map((l) => {
    const bal = l.generada - l.consumida;
    return `<tr>
      <td>${l.fecha}</td><td>${fmt(l.generada, 2)}</td><td>${fmt(l.consumida, 2)}</td>
      <td class="${bal >= 0 ? 'pos' : 'neg'}">${bal >= 0 ? '+' : ''}${fmt(bal, 2)}</td>
      <td>${l.hsp ?? '-'}</td><td>${fmt(pr(l), 0)}%</td><td>${esc(l.clima)}</td><td>${esc(l.notas)}</td>
      <td><button class="btn sm" data-edit="${l.id}">Editar</button>
          <button class="btn sm danger" data-del="${l.id}">✕</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="9">Sin lecturas registradas.</td></tr>';
}

$('tbody').addEventListener('click', (e) => {
  const t = e.target;
  if (t.dataset.edit) editar(t.dataset.edit);
  if (t.dataset.del) eliminar(t.dataset.del);
});

// CSV
$('btnExport').addEventListener('click', () => {
  const head = 'fecha,generada_kwh,consumida_kwh,hsp,clima,notas';
  const body = [...lecturas].sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((l) => [l.fecha, l.generada, l.consumida, l.hsp ?? '', l.clima, `"${(l.notas || '').replace(/"/g, '""')}"`].join(','));
  const blob = new Blob([[head, ...body].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `paneles_solares_${hoy()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('fileImport').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const lines = (await file.text()).trim().split(/\r?\n/).slice(1);
  let n = 0;
  lines.forEach((line) => {
    const m = line.match(/^([^,]+),([^,]+),([^,]+),([^,]*),([^,]*),?(.*)$/);
    if (!m) return;
    lecturas.push({
      id: crypto.randomUUID(), fecha: m[1], generada: +m[2], consumida: +m[3],
      hsp: m[4] ? +m[4] : null, clima: m[5] || 'Soleado', notas: m[6].replace(/^"|"$/g, '').replace(/""/g, '"'),
    });
    n++;
  });
  save(KEY_DATA, lecturas);
  renderTabla();
  toast(`${n} lecturas importadas`);
  e.target.value = '';
});

// ---------- Configuración ----------
function fillConfig() {
  $('cfgNombre').value = cfg.nombre;
  $('cfgPaneles').value = cfg.paneles;
  $('cfgWatts').value = cfg.watts;
  $('cfgHsp').value = cfg.hsp;
  $('cfgTarifa').value = cfg.tarifa;
  $('cfgMoneda').value = cfg.moneda;
  $('cfgCO2').value = cfg.co2;
  $('cfgKwp').textContent = fmt(kwp(), 2);
  document.title = `${cfg.nombre} · Control Solar`;
}

['cfgPaneles', 'cfgWatts'].forEach((id) => $(id).addEventListener('input', () => {
  $('cfgKwp').textContent = fmt(($('cfgPaneles').value * $('cfgWatts').value) / 1000, 2);
}));

$('formConfig').addEventListener('submit', (e) => {
  e.preventDefault();
  cfg = {
    nombre: $('cfgNombre').value || DEFAULT_CFG.nombre,
    paneles: +$('cfgPaneles').value || 1,
    watts: +$('cfgWatts').value || 1,
    hsp: +$('cfgHsp').value || DEFAULT_CFG.hsp,
    tarifa: +$('cfgTarifa').value || 0,
    moneda: $('cfgMoneda').value || 'USD',
    co2: +$('cfgCO2').value || 0,
  };
  save(KEY_CFG, cfg);
  fillConfig();
  toast('Configuración guardada');
});

$('btnDemo').addEventListener('click', () => {
  if (lecturas.length && !confirm('Esto agregará 90 días de datos de ejemplo. ¿Continuar?')) return;
  lecturas = lecturas.concat(generarDemo(90));
  save(KEY_DATA, lecturas);
  toast('Datos de ejemplo cargados');
  showView('dashboard');
});

$('btnReset').addEventListener('click', () => {
  if (!confirm('Se borrarán todas las lecturas. Exporta un CSV antes si quieres conservarlas. ¿Continuar?')) return;
  lecturas = [];
  save(KEY_DATA, lecturas);
  toast('Datos borrados');
  renderDashboard();
});

// Genera lecturas realistas para una instalación de cfg.paneles × cfg.watts
function generarDemo(dias) {
  const climas = [
    { c: 'Soleado', f: [0.95, 1.1], p: 0.55 },
    { c: 'Parcialmente nublado', f: [0.65, 0.85], p: 0.25 },
    { c: 'Nublado', f: [0.3, 0.55], p: 0.13 },
    { c: 'Lluvioso', f: [0.1, 0.3], p: 0.07 },
  ];
  const out = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    let r = Math.random(), cl = climas[0];
    for (const x of climas) { if ((r -= x.p) <= 0) { cl = x; break; } }
    const hsp = +(cfg.hsp * (cl.f[0] + Math.random() * (cl.f[1] - cl.f[0]))).toFixed(1);
    const suciedad = i > 30 && i < 45 ? 0.62 : 0.82; // simula paneles sucios
    const generada = +(kwp() * hsp * (suciedad + Math.random() * 0.06)).toFixed(2);
    const finde = [0, 6].includes(d.getDay());
    const consumida = +((finde ? 22 : 16) + Math.random() * 8).toFixed(2);
    out.push({
      id: crypto.randomUUID(), fecha: d.toISOString().slice(0, 10),
      generada, consumida, hsp, clima: cl.c,
      notas: i === 30 ? 'Limpieza de paneles' : '',
    });
  }
  return out;
}

$('periodo').addEventListener('change', renderDashboard);

// ---------- Inicio ----------
fillConfig();
renderDashboard();
