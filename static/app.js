/* ══════════════════════════════════════
   FinanzasHogar — app.js
   Toda la lógica habla con la API Flask (/api/...) en vez de localStorage.
   ══════════════════════════════════════ */

const CATEGORIAS = [
  { id: "mercado", nombre: "Mercado", icon: "🛒", color: "var(--green)" },
  { id: "servicios", nombre: "Servicios", icon: "💡", color: "var(--orange)" },
  { id: "transporte", nombre: "Transporte", icon: "🚗", color: "var(--accent)" },
  { id: "salud", nombre: "Salud", icon: "🏥", color: "var(--red)" },
  { id: "educacion", nombre: "Educación", icon: "📚", color: "var(--purple)" },
  { id: "hogar", nombre: "Hogar", icon: "🏠", color: "var(--teal)" },
  { id: "ocio", nombre: "Ocio", icon: "🎬", color: "var(--yellow)" },
  { id: "otros", nombre: "Otros", icon: "📦", color: "var(--text3)" },
];
const COLORES = ["#5b7fff","#2ecf82","#ff9040","#ff5252","#a78bfa","#2dd4bf","#ffc940","#ff70a6"];

let STATE = {
  user: null,
  usuarios: [],
  gastos: [],
  ingresos: [],
  prestamos: [],
  porras: [],
  mes: new Date().getMonth(),
  ano: new Date().getFullYear(),
  catFiltro: "todas",
  csvPendientes: [],   // movimientos leídos del PDF, antes de guardar
  cargosFijos: [],
};

/* ── Helper de red ── */
async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) { showLogin(); throw new Error("No autenticado"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de red");
  return data;
}
async function apiForm(path, formData) {
  const res = await fetch("/api" + path, { method: "POST", credentials: "include", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de red");
  return data;
}

/* ── Utilidades ── */
const cop = (n) => "$" + Math.round(n || 0).toLocaleString("es-CO");
const uid = () => Math.random().toString(36).slice(2, 10);
const catInfo = (id) => CATEGORIAS.find(c => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];

/* ── Máscara de moneda para inputs (separador de miles + signo $) ── */
function formatMoneyLive(el) {
  const digitsBeforeCursor = el.value.slice(0, el.selectionStart).replace(/\D/g, "").length;
  let digits = el.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  el.value = digits ? "$ " + Number(digits).toLocaleString("es-CO") : "";
  // Reubica el cursor contando dígitos desde el inicio (evita que salte al final)
  let pos = 0, seen = 0;
  while (pos < el.value.length && seen < digitsBeforeCursor) {
    if (/\d/.test(el.value[pos])) seen++;
    pos++;
  }
  el.setSelectionRange(pos, pos);
}
function moneyValue(el) { return el ? parseFloat((el.value || "").replace(/\D/g, "")) || 0 : 0; }
function setMoneyValue(el, num) {
  if (!el) return;
  el.value = num ? "$ " + Math.round(num).toLocaleString("es-CO") : "";
}
document.addEventListener("input", (e) => {
  if (e.target.classList && e.target.classList.contains("money-input")) formatMoneyLive(e.target);
});

function notify(msg, type = "info") {
  const cont = document.getElementById("notifCont");
  const el = document.createElement("div");
  el.className = "notif " + type;
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function avatarHtml(usuario, size = "sm") {
  const inicial = (usuario?.nombre || "?")[0].toUpperCase();
  const color = usuario?.color || "#5b7fff";
  return `<div class="av av-${size}" style="background:${color}22;color:${color}">${inicial}</div>`;
}

/* ══════════════════════════════════════
   LOGIN
   ══════════════════════════════════════ */
let usuarioSeleccionado = null;

async function initLogin() {
  try {
    const usuarios = await api("/auth/usuarios-publicos");
    const cont = document.getElementById("userLoginList");
    cont.innerHTML = usuarios.map(u => `
      <div class="user-card" data-id="${u.id}" onclick="seleccionarUsuarioLogin('${u.id}')">
        ${avatarHtml(u, "sm")}
        <div><div class="user-card-name">${u.nombre}</div><div class="user-card-role">${u.rol}</div></div>
      </div>`).join("");
  } catch (e) {
    notify("No se pudo cargar la lista de usuarios", "error");
  }
}
function seleccionarUsuarioLogin(id) {
  usuarioSeleccionado = id;
  document.querySelectorAll(".user-card").forEach(c => c.classList.toggle("sel", c.dataset.id === id));
  document.getElementById("loginPin").focus();
}
async function doLogin() {
  if (!usuarioSeleccionado) return notify("Selecciona un usuario", "error");
  const pin = document.getElementById("loginPin").value;
  try {
    const usuario = await api("/auth/login", { method: "POST", body: JSON.stringify({ user_id: usuarioSeleccionado, pin }) });
    STATE.user = usuario;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appShell").classList.add("show");
    document.getElementById("fabBtn").style.display = "flex";
    if (usuario.rol !== "admin") {
      document.getElementById("adminNavDesk").style.display = "none";
      document.getElementById("masUsuariosItem").style.display = "none";
    }
    await cargarTodo();
    initMonthSelectors();
    renderAll();
  } catch (e) {
    notify(e.message, "error");
  }
}
async function logout() {
  await api("/auth/logout", { method: "POST" }).catch(() => {});
  location.reload();
}
function showLogin() {
  document.getElementById("appShell").classList.remove("show");
  document.getElementById("loginScreen").style.display = "flex";
}

/* ══════════════════════════════════════
   CARGA DE DATOS
   ══════════════════════════════════════ */
async function cargarTodo() {
  [STATE.usuarios, STATE.prestamos, STATE.porras] = await Promise.all([
    api("/usuarios"),
    api("/prestamos"),
    api("/porras"),
  ]);
  await cargarMes();
}
async function cargarMes() {
  const mes = STATE.mes, ano = STATE.ano;
  [STATE.gastos, STATE.ingresos] = await Promise.all([
    api(`/gastos?mes=${mes}&ano=${ano}`),
    api(`/ingresos?mes=${mes}&ano=${ano}`),
  ]);
}
function initMonthSelectors() {
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const mesSel = document.getElementById("mesActual");
  mesSel.innerHTML = meses.map((m, i) => `<option value="${i}" ${i===STATE.mes?"selected":""}>${m}</option>`).join("");
  const anoSel = document.getElementById("anoActual");
  const actual = new Date().getFullYear();
  const anos = [actual-1, actual, actual+1];
  anoSel.innerHTML = anos.map(a => `<option value="${a}" ${a===STATE.ano?"selected":""}>${a}</option>`).join("");
  mesSel.onchange = anoSel.onchange = async () => {
    STATE.mes = parseInt(mesSel.value);
    STATE.ano = parseInt(anoSel.value);
    await cargarMes();
    renderAll();
  };
}

/* ══════════════════════════════════════
   NAVEGACIÓN
   ══════════════════════════════════════ */
const TITULOS = { dashboard:"Dashboard", gastos:"Gastos", ingresos:"Ingresos", prestamos:"Préstamos",
  tarjetas:"Tarjetas", alertas:"Alertas", usuarios:"Usuarios", porra:"Porra / San", perfil:"Mi perfil",
  ahorro:"Ahorro", inversion:"Inversión", nomina:"Nómina", reportes:"Reportes" };

function goPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  document.querySelectorAll("[data-page]").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  document.getElementById("topbarTitle").textContent = TITULOS[page] || page;
  document.getElementById("fabBtn").style.display = page === "gastos" || page === "dashboard" ? "flex" : "none";
  closeMasMenu();
  if (page === "usuarios") renderUsuarios();
  if (page === "perfil") renderPerfil();
  if (page === "porra") renderPorras();
  if (page === "tarjetas") renderTarjetas();
  if (page === "alertas") renderAlertas();
  if (page === "ahorro") renderAhorros();
  if (page === "inversion") renderInversiones();
  if (page === "nomina") renderNomina();
  if (page === "reportes") renderReportes();
}
function toggleMasMenu() {
  const m = document.getElementById("masMenu"), o = document.getElementById("masOverlay");
  const open = m.style.display === "block";
  m.style.display = open ? "none" : "block";
  o.style.display = open ? "none" : "block";
}
function closeMasMenu() {
  document.getElementById("masMenu").style.display = "none";
  document.getElementById("masOverlay").style.display = "none";
}
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
function openModal(id) { document.getElementById(id).classList.add("open"); }

/* ══════════════════════════════════════
   RENDER PRINCIPAL (dashboard + todo lo que depende del mes)
   ══════════════════════════════════════ */
function renderAll() {
  renderDashboard();
  renderGastos();
  renderIngresos();
  renderPrestamos();
}

function renderDashboard() {
  renderMercado();
  const totalGastos = STATE.gastos.reduce((s, g) => s + g.monto, 0);
  const totalIngresos = STATE.ingresos.reduce((s, i) => s + i.monto, 0);
  const balance = totalIngresos - totalGastos;
  const cuotasPend = STATE.prestamos.reduce((s, p) => s + Math.max(0, p.cuotas - p.pagadas), 0);
  const deudaPrestamos = STATE.prestamos.reduce((s, p) => {
    const restante = p.monto - (p.monto / p.cuotas) * p.pagadas;
    return s + Math.max(0, restante);
  }, 0);

  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card"><div class="stat-label">Gastos del mes</div><div class="stat-value">${cop(totalGastos)}</div></div>
    <div class="stat-card"><div class="stat-label">Ingresos del mes</div><div class="stat-value">${cop(totalIngresos)}</div></div>
    <div class="stat-card"><div class="stat-label">Balance</div><div class="stat-value" style="color:${balance>=0?'var(--green)':'var(--red)'}">${cop(balance)}</div></div>
    <div class="stat-card"><div class="stat-label">Deuda en préstamos</div><div class="stat-value" style="color:var(--orange)">${cop(deudaPrestamos)}</div><div class="stat-note">${cuotasPend} cuotas pendientes</div></div>`;

  // Donut por categoría
  const porCat = {};
  STATE.gastos.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto; });
  const entradas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const totalReal = entradas.reduce((s, [, v]) => s + v, 0);
  const total = totalReal || 1; // evita dividir entre cero en los arcos del donut
  let acc = 0;
  const R = 46, C = 2 * Math.PI * R;
  document.getElementById("donutArcs").innerHTML = entradas.map(([cat, val]) => {
    const info = catInfo(cat);
    const frac = val / total;
    const dash = frac * C;
    const offset = -acc * C;
    acc += frac;
    return `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${info.color}" stroke-width="14"
             stroke-dasharray="${dash} ${C-dash}" stroke-dashoffset="${offset}"/>`;
  }).join("");
  document.getElementById("donutTotal").textContent = cop(totalReal);
  document.getElementById("donutSub").textContent = entradas.length + " categorías este mes";
  document.getElementById("donutLegend").innerHTML = entradas.slice(0, 6).map(([cat, val]) => {
    const info = catInfo(cat);
    return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:5px">
      <span style="width:8px;height:8px;border-radius:50%;background:${info.color};flex-shrink:0"></span>
      <span style="flex:1">${info.icon} ${info.nombre}</span><b>${cop(val)}</b></div>`;
  }).join("") || `<div class="empty" style="padding:10px"><p>Sin gastos aún</p></div>`;

  // Balance por persona
  document.getElementById("balancePersonas").innerHTML = STATE.usuarios.map(u => {
    const gu = STATE.gastos.filter(g => g.responsable_id === u.id).reduce((s, g) => s + g.monto, 0);
    const iu = STATE.ingresos.filter(i => i.persona_id === u.id).reduce((s, i) => s + i.monto, 0);
    return `<div class="list-item">
      ${avatarHtml(u)}
      <div class="list-body"><div class="list-title">${u.nombre}</div><div class="list-sub">Gastó ${cop(gu)} · Ingresó ${cop(iu)}</div></div>
      <div class="list-right"><div class="list-amount" style="color:${iu-gu>=0?'var(--green)':'var(--red)'}">${cop(iu-gu)}</div></div>
    </div>`;
  }).join("");

  // Últimos movimientos
  const recientes = [...STATE.gastos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6);
  document.getElementById("recentList").innerHTML = recientes.map(g => movItemHtml(g)).join("")
    || `<div class="empty"><p>No hay movimientos este mes</p></div>`;

  renderAlertasDashboard();
}

function movItemHtml(g) {
  const info = catInfo(g.categoria);
  const resp = STATE.usuarios.find(u => u.id === g.responsable_id);
  return `<div class="list-item">
    <div class="list-icon" style="background:${info.color}22">${info.icon}</div>
    <div class="list-body"><div class="list-title">${g.descripcion} ${g.adjunto_url ? '📎' : ''}</div>
      <div class="list-sub">${resp ? resp.nombre : "—"} · ${g.fecha}</div></div>
    <div class="list-right"><div class="list-amount">${cop(g.monto)}</div>
      ${g.tipo==='cuota' ? `<div class="list-meta">Cuota ${g.cuota_actual}/${g.cuota_total}</div>` : ""}</div>
  </div>`;
}

/* ══════════════════════════════════════
   GASTOS
   ══════════════════════════════════════ */
function renderGastos() {
  const chips = document.getElementById("catChips");
  chips.innerHTML = `<div class="chip ${STATE.catFiltro==='todas'?'active':''}" onclick="filtrarCat('todas')">Todas</div>` +
    CATEGORIAS.map(c => `<div class="chip ${STATE.catFiltro===c.id?'active':''}" onclick="filtrarCat('${c.id}')">${c.icon} ${c.nombre}</div>`).join("");

  const lista = STATE.catFiltro === "todas" ? STATE.gastos : STATE.gastos.filter(g => g.categoria === STATE.catFiltro);
  const ordenada = [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha));
  document.getElementById("gastosList").innerHTML = ordenada.map(g => `
    <div onclick="openModalGasto('${g.id}')" style="cursor:pointer">${movItemHtml(g)}</div>
  `).join("") || `<div class="empty"><div class="icon">🧾</div><p>No hay gastos registrados</p></div>`;
}
function filtrarCat(cat) { STATE.catFiltro = cat; renderGastos(); }

function openModalGasto(id) {
  document.getElementById("gCat").innerHTML = CATEGORIAS.map(c => `<option value="${c.id}">${c.icon} ${c.nombre}</option>`).join("");
  document.getElementById("gResp").innerHTML = STATE.usuarios.map(u => `<option value="${u.id}">${u.nombre}</option>`).join("");
  const g = id ? STATE.gastos.find(x => x.id === id) : null;
  document.getElementById("mGastoTitle").textContent = g ? "Editar gasto" : "Nuevo gasto";
  document.getElementById("gEditId").value = id || "";
  document.getElementById("gDesc").value = g?.descripcion || "";
  setMoneyValue(document.getElementById("gMonto"), g?.monto);
  document.getElementById("gCat").value = g?.categoria || CATEGORIAS[0].id;
  document.getElementById("gResp").value = g?.responsable_id || STATE.user.id;
  document.getElementById("gFecha").value = g?.fecha || new Date().toISOString().slice(0, 10);
  document.getElementById("gTipo").value = g?.tipo || "unico";
  document.getElementById("gCuotaGrp").style.display = g?.tipo === "cuota" ? "" : "none";
  document.getElementById("gCuotaA").value = g?.cuota_actual || "";
  document.getElementById("gCuotaT").value = g?.cuota_total || "";
  document.getElementById("gFoto").value = "";
  STATE._fotoGastoSeleccionada = null;
  const wrap = document.getElementById("gFotoPreviewWrap");
  if (g?.adjunto_url) {
    wrap.style.display = "block";
    document.getElementById("gFotoPreview").src = "";
    api(`/gastos/${g.id}/foto`).then(r => { document.getElementById("gFotoPreview").src = r.url; }).catch(() => {});
  } else {
    wrap.style.display = "none";
  }
  openModal("mGasto");
}
function previewFotoGasto(input) {
  const file = input.files[0];
  if (!file) return;
  STATE._fotoGastoSeleccionada = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("gFotoPreviewWrap").style.display = "block";
    document.getElementById("gFotoPreview").src = e.target.result;
  };
  reader.readAsDataURL(file);
}
async function saveGasto() {
  const id = document.getElementById("gEditId").value;
  const payload = {
    descripcion: document.getElementById("gDesc").value,
    monto: moneyValue(document.getElementById("gMonto")),
    categoria: document.getElementById("gCat").value,
    responsable_id: document.getElementById("gResp").value,
    fecha: document.getElementById("gFecha").value,
    tipo: document.getElementById("gTipo").value,
    cuota_actual: parseInt(document.getElementById("gCuotaA").value) || null,
    cuota_total: parseInt(document.getElementById("gCuotaT").value) || null,
  };
  if (!payload.descripcion || !payload.monto) return notify("Completa descripción y monto", "error");
  try {
    let gastoId = id;
    if (id) await api(`/gastos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else {
      const creado = await api("/gastos", { method: "POST", body: JSON.stringify(payload) });
      gastoId = creado.id;
    }
    if (STATE._fotoGastoSeleccionada) {
      const fd = new FormData();
      fd.append("foto", STATE._fotoGastoSeleccionada);
      await apiForm(`/gastos/${gastoId}/foto`, fd);
    }
    closeModal("mGasto");
    await cargarMes();
    renderAll();
    notify("Gasto guardado", "success");
  } catch (e) { notify(e.message, "error"); }
}
async function eliminarGasto(id) {
  if (!confirm("¿Eliminar este gasto?")) return;
  await api(`/gastos/${id}`, { method: "DELETE" });
  await cargarMes();
  renderAll();
}

/* ══════════════════════════════════════
   INGRESOS
   ══════════════════════════════════════ */
function renderIngresos() {
  const total = STATE.ingresos.reduce((s, i) => s + i.monto, 0);
  document.getElementById("ingresosStats").innerHTML = STATE.usuarios.map(u => {
    const t = STATE.ingresos.filter(i => i.persona_id === u.id).reduce((s, i) => s + i.monto, 0);
    return `<div class="stat-card"><div class="stat-label">${u.nombre}</div><div class="stat-value">${cop(t)}</div></div>`;
  }).join("") + `<div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">${cop(total)}</div></div>`;

  const ordenados = [...STATE.ingresos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  document.getElementById("ingresosList").innerHTML = ordenados.map(i => {
    const u = STATE.usuarios.find(x => x.id === i.persona_id);
    return `<div class="list-item">
      ${avatarHtml(u)}
      <div class="list-body"><div class="list-title">${i.fuente || "Ingreso"}</div><div class="list-sub">${u?.nombre || "—"} · ${i.fecha}</div></div>
      <div class="list-right"><div class="list-amount" style="color:var(--green)">${cop(i.monto)}</div></div>
    </div>`;
  }).join("") || `<div class="empty"><p>No hay ingresos este mes</p></div>`;
}
function openModalIngreso() {
  document.getElementById("iPersona").innerHTML = STATE.usuarios.map(u => `<option value="${u.id}">${u.nombre}</option>`).join("");
  setMoneyValue(document.getElementById("iMonto"), 0);
  document.getElementById("iFuente").value = "";
  document.getElementById("iFecha").value = new Date().toISOString().slice(0, 10);
  openModal("mIngreso");
}
async function saveIngreso() {
  const payload = {
    persona_id: document.getElementById("iPersona").value,
    monto: moneyValue(document.getElementById("iMonto")),
    fuente: document.getElementById("iFuente").value,
    fecha: document.getElementById("iFecha").value,
  };
  if (!payload.monto) return notify("Ingresa un monto", "error");
  try {
    await api("/ingresos", { method: "POST", body: JSON.stringify(payload) });
    closeModal("mIngreso");
    await cargarMes();
    renderAll();
    notify("Ingreso guardado", "success");
  } catch (e) { notify(e.message, "error"); }
}

/* ══════════════════════════════════════
   PRÉSTAMOS
   ══════════════════════════════════════ */
function renderPrestamos() {
  const cont = document.getElementById("prestamosContent");
  if (!STATE.prestamos.length) { cont.innerHTML = `<div class="empty"><div class="icon">💳</div><p>Sin préstamos registrados</p></div>`; return; }
  cont.innerHTML = STATE.prestamos.map(p => {
    const resp = STATE.usuarios.find(u => u.id === p.responsable_id);
    const pct = Math.min(100, Math.round((p.pagadas / p.cuotas) * 100));
    const restante = p.monto - (p.monto / p.cuotas) * p.pagadas;
    return `<div class="loan-card">
      <div class="loan-header">
        <div class="loan-name">${p.nombre}</div>
        <span class="badge badge-blue">${resp?.nombre || "—"}</span>
      </div>
      <div class="loan-grid">
        <div class="loan-stat"><div class="ls-label">Cuota</div><div class="ls-val">${cop(p.cuota)}</div></div>
        <div class="loan-stat"><div class="ls-label">Restante</div><div class="ls-val">${cop(restante)}</div></div>
        <div class="loan-stat"><div class="ls-label">Progreso</div><div class="ls-val">${p.pagadas}/${p.cuotas}</div></div>
      </div>
      <div class="prog"><div class="prog-fill" style="width:${pct}%;background:var(--accent)"></div></div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn btn-ghost btn-sm" onclick="pagarCuota('${p.id}')">+ Registrar pago</button>
        <button class="btn btn-ghost btn-sm" onclick="openModalPrestamo('${p.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarPrestamo('${p.id}')">Eliminar</button>
      </div>
    </div>`;
  }).join("");
}
function openModalPrestamo(id) {
  document.getElementById("pResp").innerHTML = STATE.usuarios.map(u => `<option value="${u.id}">${u.nombre}</option>`).join("");
  const p = id ? STATE.prestamos.find(x => x.id === id) : null;
  document.getElementById("pEditId").value = id || "";
  document.getElementById("pNombre").value = p?.nombre || "";
  setMoneyValue(document.getElementById("pMonto"), p?.monto);
  setMoneyValue(document.getElementById("pCuota"), p?.cuota);
  document.getElementById("pCuotas").value = p?.cuotas || "";
  document.getElementById("pPagadas").value = p?.pagadas || 0;
  document.getElementById("pResp").value = p?.responsable_id || STATE.user.id;
  document.getElementById("pDiaPago").value = p?.dia_pago || "";
  document.getElementById("pFecha").value = p?.fecha || new Date().toISOString().slice(0, 10);
  openModal("mPrestamo");
}
async function savePrestamo() {
  const id = document.getElementById("pEditId").value;
  const payload = {
    nombre: document.getElementById("pNombre").value,
    monto: moneyValue(document.getElementById("pMonto")),
    cuota: moneyValue(document.getElementById("pCuota")),
    cuotas: parseInt(document.getElementById("pCuotas").value || 1),
    pagadas: parseInt(document.getElementById("pPagadas").value || 0),
    responsable_id: document.getElementById("pResp").value,
    dia_pago: parseInt(document.getElementById("pDiaPago").value) || null,
    fecha: document.getElementById("pFecha").value,
  };
  if (!payload.nombre || !payload.monto) return notify("Completa nombre y monto", "error");
  try {
    if (id) await api(`/prestamos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/prestamos", { method: "POST", body: JSON.stringify(payload) });
    closeModal("mPrestamo");
    STATE.prestamos = await api("/prestamos");
    renderPrestamos();
    renderDashboard();
    notify("Préstamo guardado", "success");
  } catch (e) { notify(e.message, "error"); }
}
async function pagarCuota(id) {
  const p = STATE.prestamos.find(x => x.id === id);
  if (p.pagadas >= p.cuotas) return notify("Ya está pagado por completo", "info");
  await api(`/prestamos/${id}`, { method: "PUT", body: JSON.stringify({ pagadas: p.pagadas + 1 }) });
  STATE.prestamos = await api("/prestamos");
  renderPrestamos();
  notify("Cuota registrada", "success");
}
async function eliminarPrestamo(id) {
  if (!confirm("¿Eliminar este préstamo?")) return;
  await api(`/prestamos/${id}`, { method: "DELETE" });
  STATE.prestamos = await api("/prestamos");
  renderPrestamos();
}

/* ══════════════════════════════════════
   ALERTAS
   ══════════════════════════════════════ */
function calcularAlertas() {
  const hoy = new Date();
  const alertas = [];
  STATE.prestamos.forEach(p => {
    if (p.pagadas >= p.cuotas || !p.dia_pago) return;
    const venc = new Date(hoy.getFullYear(), hoy.getMonth(), p.dia_pago);
    const dias = Math.round((venc - hoy) / 86400000);
    if (dias >= 0 && dias <= (p.alerta_dias || 5)) {
      alertas.push({ tipo: dias <= 1 ? "danger" : "warning",
        texto: `"${p.nombre}" vence en ${dias === 0 ? "hoy" : dias + " día(s)"} — cuota ${cop(p.cuota)}` });
    }
  });
  return alertas;
}
function renderAlertasDashboard() {
  const alertas = calcularAlertas();
  document.getElementById("alertasDash").innerHTML = alertas.length ? `<div class="card" style="margin-bottom:12px">
    <div class="card-header"><div class="card-title">⚠️ Alertas</div></div>
    ${alertas.map(a => `<div class="alert-item ${a.tipo}">${a.texto}</div>`).join("")}
  </div>` : "";
}
function renderAlertas() {
  const alertas = calcularAlertas();
  document.getElementById("alertasActivas").innerHTML = alertas.length
    ? alertas.map(a => `<div class="alert-item ${a.tipo}">${a.texto}</div>`).join("")
    : `<div class="empty"><p>No hay alertas activas</p></div>`;
}

/* ══════════════════════════════════════
   USUARIOS (admin)
   ══════════════════════════════════════ */
function renderUsuarios() {
  document.getElementById("usuariosGrid").innerHTML = STATE.usuarios.map(u => `
    <div class="card" style="display:flex;align-items:center;gap:12px">
      ${avatarHtml(u, "lg")}
      <div style="flex:1">
        <div style="font-weight:600;font-size:14px">${u.nombre}</div>
        <div style="font-size:12px;color:var(--text3)">${u.email || "—"} · <span class="badge badge-blue">${u.rol}</span></div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openModalUsuario('${u.id}')">Editar</button>
    </div>`).join("");
}
function openModalUsuario(id) {
  const colorCont = document.getElementById("colorPicker");
  colorCont.innerHTML = COLORES.map(c => `<div class="color-dot" style="background:${c}" data-color="${c}" onclick="document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('sel'));this.classList.add('sel')"></div>`).join("");
  const u = id ? STATE.usuarios.find(x => x.id === id) : null;
  document.getElementById("uEditId").value = id || "";
  document.getElementById("uNombre").value = u?.nombre || "";
  document.getElementById("uEmail").value = u?.email || "";
  document.getElementById("uRol").value = u?.rol || "miembro";
  document.getElementById("uPin").value = "";
  const colorSel = u?.color || COLORES[0];
  document.querySelectorAll(".color-dot").forEach(d => d.classList.toggle("sel", d.dataset.color === colorSel));
  openModal("mUsuario");
}
async function saveUsuario() {
  const id = document.getElementById("uEditId").value;
  const colorEl = document.querySelector(".color-dot.sel");
  const payload = {
    nombre: document.getElementById("uNombre").value,
    email: document.getElementById("uEmail").value,
    rol: document.getElementById("uRol").value,
    color: colorEl?.dataset.color || COLORES[0],
  };
  const pin = document.getElementById("uPin").value;
  if (pin) payload.pin = pin;
  if (!id && !pin) return notify("El PIN es obligatorio para un usuario nuevo", "error");
  try {
    if (id) await api(`/usuarios/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/usuarios", { method: "POST", body: JSON.stringify(payload) });
    closeModal("mUsuario");
    STATE.usuarios = await api("/usuarios");
    renderUsuarios();
    notify("Usuario guardado", "success");
  } catch (e) { notify(e.message, "error"); }
}

/* ══════════════════════════════════════
   PERFIL
   ══════════════════════════════════════ */
function renderPerfil() {
  document.getElementById("perfilAvatar").outerHTML = avatarHtml(STATE.user, "lg").replace('class="av av-lg"', 'class="av av-lg" id="perfilAvatar"');
  document.getElementById("perfilName").textContent = STATE.user.nombre;
  document.getElementById("perfilRole").textContent = STATE.user.rol;
  document.getElementById("pfNombre").value = STATE.user.nombre || "";
  document.getElementById("pfEmail").value = STATE.user.email || "";
  document.getElementById("pfEmailAlertas").value = STATE.user.email_alertas || "";
  document.getElementById("pfPinActual").value = "";
  document.getElementById("pfPinNuevo").value = "";
}
async function savePerfil() {
  const payload = {
    nombre: document.getElementById("pfNombre").value,
    email: document.getElementById("pfEmail").value,
    email_alertas: document.getElementById("pfEmailAlertas").value,
  };
  const actual = document.getElementById("pfPinActual").value;
  const nuevo = document.getElementById("pfPinNuevo").value;
  if (actual && nuevo) { payload.pin_actual = actual; payload.pin_nuevo = nuevo; }
  try {
    const usuario = await api("/usuarios/me", { method: "PUT", body: JSON.stringify(payload) });
    STATE.user = { ...STATE.user, ...usuario };
    notify("Perfil actualizado", "success");
  } catch (e) { notify(e.message, "error"); }
}

/* ══════════════════════════════════════
   TARJETAS — carga de PDF, asignación, cargos fijos, resumen
   ══════════════════════════════════════ */
function switchTabT(tab, el) {
  document.querySelectorAll("#page-tarjetas .tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  ["tCargar","tAsignar","tCargos","tResumen"].forEach(id => document.getElementById(id).style.display = "none");
  document.getElementById("t" + tab[0].toUpperCase() + tab.slice(1)).style.display = "";
  if (tab === "asignar") renderCsvAsignar();
  if (tab === "cargos") cargarCargosFijos();
  if (tab === "resumen") renderResumenTarjeta();
}
function handleDropPDF(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.remove("drag");
  const file = ev.dataTransfer.files[0];
  if (file) subirPDF(file);
}
function handlePDF(input) {
  const file = input.files[0];
  if (file) subirPDF(file);
}
let pdfFileActual = null;
async function subirPDF(file, password = "") {
  pdfFileActual = file;
  const statusEl = document.getElementById("pdfStatus");
  statusEl.style.display = "block";
  statusEl.innerHTML = `<div class="alert-item info">Procesando PDF…</div>`;
  const fd = new FormData();
  fd.append("pdf", file);
  if (password) fd.append("password", password);
  try {
    const data = await apiForm("/tarjetas/procesar-pdf", fd);
    document.getElementById("pdfPasswordWrap").style.display = "none";
    const todos = data.movimientos.map(m => ({ ...m, id: uid(), responsable_id: "" }));
    // Los pagos/abonos a la tarjeta (ej. "PAGOS RAPPIPAY APP") ya fueron hechos —
    // no son un gasto que haya que repartir entre las personas, así que se separan
    // y solo se muestran de forma informativa, sin pedir asignación.
    STATE.csvPendientes = todos.filter(m => !m.es_pago_o_ajuste);
    STATE.pagosDetectados = todos.filter(m => m.es_pago_o_ajuste);
    statusEl.innerHTML = `<div class="alert-item info">${STATE.csvPendientes.length} compras por asignar
      ${STATE.pagosDetectados.length ? ` · ${STATE.pagosDetectados.length} pagos/abonos detectados (no requieren asignación)` : ""}</div>`;
    renderCsvPreview();
  } catch (e) {
    if (e.message.includes("contraseña") || e.message.includes("protegido")) {
      document.getElementById("pdfPasswordWrap").style.display = "block";
      statusEl.innerHTML = `<div class="alert-item warning">Este PDF requiere contraseña</div>`;
    } else {
      statusEl.innerHTML = `<div class="alert-item danger">${e.message}</div>`;
    }
  }
}
function reintentarPDF() {
  const pass = document.getElementById("pdfPassword").value;
  if (pdfFileActual) subirPDF(pdfFileActual, pass);
}
function renderCsvPreview() {
  const cont = document.getElementById("csvPreview");
  if (!STATE.csvPendientes.length && !(STATE.pagosDetectados || []).length) { cont.innerHTML = ""; return; }
  const pagosHtml = (STATE.pagosDetectados || []).length ? `<div class="card" style="margin-top:12px">
    <div class="card-header"><div class="card-title">💳 Pagos / abonos detectados (${STATE.pagosDetectados.length})</div></div>
    <div class="list-sub" style="margin-bottom:8px">Estos ya se pagaron — no se dividen ni se asignan a nadie, solo son informativos.</div>
    ${STATE.pagosDetectados.map(m => `<div class="list-item">
      <div class="list-body"><div class="list-title">${m.descripcion}</div><div class="list-sub">${m.fecha || "—"}</div></div>
      <div class="list-amount" style="color:${m.monto<0?'var(--green)':'var(--text)'}">${cop(m.monto)}</div>
    </div>`).join("")}
  </div>` : "";
  if (!STATE.csvPendientes.length) { cont.innerHTML = pagosHtml; return; }
  cont.innerHTML = `<div class="card">
    <div class="card-header"><div class="card-title">Vista previa</div></div>
    ${STATE.csvPendientes.slice(0, 8).map(m => `<div class="list-item">
      <div class="list-body"><div class="list-title">${m.descripcion}</div><div class="list-sub">${m.fecha || "—"}${m.cuota_total ? ` · cuota ${m.cuota_actual}/${m.cuota_total}` : ""}</div></div>
      <div class="list-right">
        <div class="list-amount">${cop(m.monto)}</div>
        ${m.valor_total && m.valor_total !== m.monto ? `<div class="valor-compra-total">Compra total: ${cop(m.valor_total)}</div>` : ""}
      </div>
    </div>`).join("")}
    ${STATE.csvPendientes.length > 8 ? `<div class="list-sub" style="padding-top:8px">+ ${STATE.csvPendientes.length-8} más…</div>` : ""}
    <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="switchTabT('asignar', document.querySelectorAll('#page-tarjetas .tab')[1])">Continuar a asignación →</button>
  </div>${pagosHtml}`;
}
function renderTarjetas() {
  document.getElementById("asignarTodosSelect").innerHTML = `<option value="">— elegir —</option>` +
    STATE.usuarios.map(u => `<option value="${u.id}">${u.nombre}</option>`).join("");
  renderCsvAsignar();
}
function renderCsvAsignar() {
  const cont = document.getElementById("csvAsignar");
  if (!STATE.csvPendientes.length) { cont.innerHTML = `<div class="empty"><p>Carga un PDF primero</p></div>`; return; }
  cont.innerHTML = STATE.csvPendientes.map(m => {
    const compraHtml = m.valor_total && m.valor_total !== m.monto
      ? `<div class="valor-compra-total">Compra total: ${cop(m.valor_total)}</div>` : "";
    if (!m.dividir) {
      return `<div class="list-item">
        <div class="list-body"><div class="list-title">${m.descripcion}</div><div class="list-sub">${m.fecha || "—"} · cuota ${cop(m.monto)}</div>${compraHtml}</div>
        <select class="form-select" style="width:auto;font-size:12px;padding:5px 8px" onchange="asignarMov('${m.id}', this.value)">
          <option value="">Sin asignar</option>
          ${STATE.usuarios.map(u => `<option value="${u.id}" ${m.responsable_id===u.id?"selected":""}>${u.nombre}</option>`).join("")}
        </select>
        <button class="btn btn-ghost btn-sm" onclick="toggleDividirMov('${m.id}')">Dividir</button>
      </div>`;
    }
    const suma = (m.splits || []).reduce((s, x) => s + (x.monto || 0), 0);
    const cuadra = Math.abs(suma - m.monto) < 1;
    return `<div class="list-item" style="flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="list-body"><div class="list-title">${m.descripcion}</div><div class="list-sub">${m.fecha || "—"} · cuota total ${cop(m.monto)}</div>${compraHtml}</div>
        <button class="btn btn-ghost btn-sm" onclick="toggleDividirMov('${m.id}')">Cancelar división</button>
      </div>
      <div style="display:grid;gap:6px">
        ${STATE.usuarios.map(u => {
          const split = (m.splits || []).find(s => s.responsable_id === u.id);
          return `<div style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" ${split ? "checked" : ""} onchange="toggleSplitPersona('${m.id}','${u.id}', this.checked)">
            <span style="flex:1;font-size:13px">${u.nombre}</span>
            <input type="text" inputmode="numeric" class="form-input money-input" style="width:120px;padding:5px 8px;font-size:12px"
              placeholder="$ 0" value="${split ? '$ ' + split.monto.toLocaleString('es-CO') : ''}"
              ${split ? "" : "disabled"} oninput="actualizarSplitMonto('${m.id}','${u.id}', this)">
          </div>`;
        }).join("")}
      </div>
      <div class="list-sub" style="color:${cuadra ? 'var(--green)' : 'var(--red)'}">
        Repartido: ${cop(suma)} de ${cop(m.monto)} ${cuadra ? "✓" : "— no cuadra todavía"}
      </div>
    </div>`;
  }).join("");
}
function toggleDividirMov(id) {
  const m = STATE.csvPendientes.find(x => x.id === id);
  if (!m) return;
  m.dividir = !m.dividir;
  if (m.dividir) { m.splits = []; m.responsable_id = ""; }
  renderCsvAsignar();
}
function toggleSplitPersona(movId, userId, checked) {
  const m = STATE.csvPendientes.find(x => x.id === movId);
  if (!m) return;
  m.splits = m.splits || [];
  if (checked) {
    const restantes = m.splits.length;
    const partesFuturas = restantes + 1;
    const yaAsignado = m.splits.reduce((s, x) => s + x.monto, 0);
    const sugerido = Math.max(0, Math.round((m.monto - yaAsignado) / 1));
    m.splits.push({ responsable_id: userId, monto: restantes === 0 ? m.monto : sugerido });
  } else {
    m.splits = m.splits.filter(x => x.responsable_id !== userId);
  }
  renderCsvAsignar();
}
function actualizarSplitMonto(movId, userId, input) {
  const m = STATE.csvPendientes.find(x => x.id === movId);
  if (!m) return;
  const split = (m.splits || []).find(x => x.responsable_id === userId);
  if (split) split.monto = moneyValue(input);
}
function asignarMov(id, respId) {
  const m = STATE.csvPendientes.find(x => x.id === id);
  if (m) m.responsable_id = respId;
}
function asignarTodos() {
  const respId = document.getElementById("asignarTodosSelect").value;
  if (!respId) return;
  STATE.csvPendientes.forEach(m => { if (!m.dividir && !m.responsable_id) m.responsable_id = respId; });
  renderCsvAsignar();
}
async function guardarMovimientosAsignados() {
  const periodo = `${STATE.ano}-${String(STATE.mes+1).padStart(2,"0")}`;
  const filas = [];
  const idsGuardados = [];

  for (const m of STATE.csvPendientes) {
    if (m.dividir) {
      const suma = (m.splits || []).reduce((s, x) => s + x.monto, 0);
      if (!m.splits.length) continue;
      if (Math.abs(suma - m.monto) >= 1) {
        notify(`"${m.descripcion}": la división no suma el total de la cuota — revísala`, "error");
        continue;
      }
      m.splits.forEach(split => {
        const ratio = m.monto ? split.monto / m.monto : 0;
        filas.push({
          descripcion: `${m.descripcion} (dividido)`,
          monto: split.monto,
          valor_total: m.valor_total != null ? Math.round(m.valor_total * ratio) : null,
          capital_pendiente: m.capital_pendiente != null ? Math.round(m.capital_pendiente * ratio) : null,
          cuota_actual: m.cuota_actual, cuota_total: m.cuota_total,
          fecha: m.fecha, responsable_id: split.responsable_id, periodo,
        });
      });
      idsGuardados.push(m.id);
    } else if (m.responsable_id) {
      filas.push({
        descripcion: m.descripcion, monto: m.monto, valor_total: m.valor_total,
        capital_pendiente: m.capital_pendiente, cuota_actual: m.cuota_actual,
        cuota_total: m.cuota_total, fecha: m.fecha, responsable_id: m.responsable_id, periodo,
      });
      idsGuardados.push(m.id);
    }
  }

  if (!filas.length) return notify("Asigna o divide al menos un movimiento", "error");
  try {
    await api("/tarjetas/movimientos", { method: "POST", body: JSON.stringify({ movimientos: filas }) });
    STATE.csvPendientes = STATE.csvPendientes.filter(m => !idsGuardados.includes(m.id));
    notify("Movimientos guardados", "success");
    switchTabT("resumen", document.querySelectorAll("#page-tarjetas .tab")[3]);
  } catch (e) { notify(e.message, "error"); }
}
async function cargarCargosFijos() {
  const periodo = `${STATE.ano}-${String(STATE.mes+1).padStart(2,"0")}`;
  const [cargos, movimientos] = await Promise.all([
    api(`/cargos-fijos?periodo=${periodo}`),
    api(`/tarjetas/movimientos?periodo=${periodo}`),
  ]);
  STATE.cargosFijos = cargos;

  // Consumo por persona este período (para el reparto proporcional)
  const consumoPorPersona = {};
  movimientos.forEach(m => { consumoPorPersona[m.responsable_id] = (consumoPorPersona[m.responsable_id] || 0) + m.monto; });
  const totalConsumo = Object.values(consumoPorPersona).reduce((s, v) => s + v, 0);
  const usuariosConMovimiento = STATE.usuarios.filter(u => consumoPorPersona[u.id] > 0);

  document.getElementById("cargosFijosItems").innerHTML = STATE.cargosFijos.map(c => {
    let reparto;
    if (c.tipo_reparto === "igualitario") {
      const porPersona = STATE.usuarios.length ? c.monto / STATE.usuarios.length : 0;
      reparto = STATE.usuarios.map(u => ({ u, valor: porPersona }));
    } else {
      // proporcional al consumo de tarjeta de cada uno este período
      reparto = usuariosConMovimiento.map(u => ({
        u, valor: totalConsumo ? c.monto * (consumoPorPersona[u.id] / totalConsumo) : 0,
      }));
    }
    return `<div class="list-item" style="flex-direction:column;align-items:stretch;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="list-body"><div class="list-title">${c.descripcion}</div><div class="list-sub">${c.tipo_reparto === "igualitario" ? "Partes iguales" : "Proporcional al consumo"}</div></div>
        <div class="list-amount">${cop(c.monto)}</div>
        <button class="btn btn-danger btn-sm" onclick="eliminarCargoFijo('${c.id}')">✕</button>
      </div>
      <div style="display:grid;gap:3px;padding-left:4px">
        ${reparto.length ? reparto.map(r => `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2)">
          <span>${r.u.nombre}</span><span class="valor-compra-total" style="font-size:12px">${cop(r.valor)}</span>
        </div>`).join("") : `<div style="font-size:12px;color:var(--text3)">Sin consumo registrado este período para repartir proporcionalmente</div>`}
      </div>
    </div>`;
  }).join("") || `<div class="empty"><p>Sin cargos registrados</p></div>`;
}
async function agregarCargoFijo() {
  const periodo = `${STATE.ano}-${String(STATE.mes+1).padStart(2,"0")}`;
  const payload = {
    descripcion: document.getElementById("cfDesc").value,
    monto: moneyValue(document.getElementById("cfMonto")),
    tipo_reparto: document.getElementById("cfTipo").value,
    periodo,
  };
  if (!payload.descripcion || !payload.monto) return notify("Completa descripción y monto", "error");
  await api("/cargos-fijos", { method: "POST", body: JSON.stringify(payload) });
  document.getElementById("cfDesc").value = "";
  setMoneyValue(document.getElementById("cfMonto"), 0);
  cargarCargosFijos();
}
async function eliminarCargoFijo(id) {
  await api(`/cargos-fijos/${id}`, { method: "DELETE" });
  cargarCargosFijos();
}
async function renderResumenTarjeta() {
  const periodo = `${STATE.ano}-${String(STATE.mes+1).padStart(2,"0")}`;
  const [movimientos, cargosFijos] = await Promise.all([
    api(`/tarjetas/movimientos?periodo=${periodo}`),
    api(`/cargos-fijos?periodo=${periodo}`),
  ]);
  STATE.movimientosTarjeta = movimientos;

  const porPersona = {};
  movimientos.forEach(m => {
    const key = m.responsable_id;
    porPersona[key] = porPersona[key] || { total: 0, pendiente: 0, cargosFijos: 0 };
    porPersona[key].total += m.monto;
    porPersona[key].pendiente += m.capital_pendiente || 0;
  });
  const totalConsumo = Object.values(porPersona).reduce((s, d) => s + d.total, 0);

  // Reparte cada cargo fijo entre las personas con movimientos (igualitario o proporcional)
  cargosFijos.forEach(c => {
    const ids = Object.keys(porPersona);
    if (!ids.length) return;
    ids.forEach(uid => {
      const share = c.tipo_reparto === "igualitario"
        ? c.monto / ids.length
        : (totalConsumo ? c.monto * (porPersona[uid].total / totalConsumo) : 0);
      porPersona[uid].cargosFijos += share;
    });
  });

  const esAdmin = STATE.user.rol === "admin";

  const resumenHtml = `<div class="card" style="margin-bottom:12px">
    <div class="card-header"><div class="card-title">Resumen del período</div>
      <button class="btn btn-ghost btn-sm" onclick="descargarReciboTarjeta()">📷 Generar recibo</button></div>
    ${Object.entries(porPersona).map(([uid, d]) => {
      const u = STATE.usuarios.find(x => x.id === uid);
      const totalAPagar = d.total + d.cargosFijos;
      return `<div class="list-item">${avatarHtml(u)}
        <div class="list-body"><div class="list-title">${u?.nombre || "—"}</div>
          <div class="list-sub">Consumo ${cop(d.total)}${d.cargosFijos > 0 ? ` + cargos fijos ${cop(d.cargosFijos)}` : ""}</div>
          ${d.pendiente > 0 ? `<div class="list-sub">Cuotas pendientes por pagar (meses futuros): ${cop(d.pendiente)}</div>` : ""}</div>
        <div class="list-amount">${cop(totalAPagar)}</div>
      </div>`;
    }).join("") || `<div class="empty"><p>Sin movimientos guardados este período</p></div>`}
  </div>`;

  const detalleHtml = `<div class="card">
    <div class="card-header"><div class="card-title">Detalle de movimientos</div></div>
    ${movimientos.map(m => `
      <div class="list-item">
        <div class="list-body">
          <div class="list-title">${m.descripcion}</div>
          <div class="list-sub">${m.usuarios?.nombre || "—"} · ${m.fecha}${m.cuota_total ? ` · cuota ${m.cuota_actual}/${m.cuota_total}` : ""}</div>
        </div>
        <div class="list-right">
          <div class="list-amount">${cop(m.monto)}</div>
          ${m.valor_total && m.valor_total !== m.monto ? `<div class="valor-compra-total">Compra: ${cop(m.valor_total)}</div>` : ""}
        </div>
        ${esAdmin ? `
          <button class="btn btn-ghost btn-sm" onclick="openModalEditMov('${m.id}')">✎</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarMovimientoTarjeta('${m.id}')">✕</button>
        ` : ""}
      </div>`).join("") || `<div class="empty"><p>Sin movimientos</p></div>`}
  </div>`;

  STATE._resumenTarjetaPorPersona = porPersona; // para el recibo

  document.getElementById("csvResumen").innerHTML = resumenHtml + detalleHtml;
}
async function descargarReciboTarjeta() {
  const porPersona = STATE._resumenTarjetaPorPersona || {};
  const entradas = Object.entries(porPersona);
  if (!entradas.length) return notify("No hay movimientos guardados este período para generar el recibo", "error");
  if (typeof html2canvas === "undefined") return notify("No se pudo cargar el generador de imágenes", "error");

  const totalGeneral = entradas.reduce((s, [, d]) => s + d.total + d.cargosFijos, 0);

  // Elemento temporal fuera de pantalla, con el mismo estilo "recibo claro" que el resto de la app
  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.left = "-9999px";
  wrap.innerHTML = `<div class="rpt-card" style="width:360px">
    <div class="rpt-header">
      <div class="rpt-title">Distribución de tarjeta</div>
      <div class="rpt-sub">${MESES_NOMBRE[STATE.mes]} ${STATE.ano}</div>
    </div>
    <div class="rpt-stats">
      <div class="rpt-stat"><div class="rpt-stat-label">Total del período</div><div class="rpt-stat-val" style="color:#d9394c">${nomFmt(totalGeneral)}</div></div>
    </div>
    <div class="rpt-section-title">Por persona</div>
    ${entradas.map(([uid, d]) => {
      const u = STATE.usuarios.find(x => x.id === uid);
      const totalAPagar = d.total + d.cargosFijos;
      return `<div class="rpt-row">
        <div><div class="rl-main">${u?.nombre || "—"}</div>
          <div class="rl-sub">Consumo ${nomFmt(d.total)}${d.cargosFijos > 0 ? ` + cargos fijos ${nomFmt(d.cargosFijos)}` : ""}${d.pendiente > 0 ? ` · pendiente futuro ${nomFmt(d.pendiente)}` : ""}</div></div>
        <div class="rl-amt" style="color:#d9394c">${nomFmt(totalAPagar)}</div>
      </div>`;
    }).join("")}
    <div class="rpt-footer">Generado el ${new Date().toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"})} · FinanzasHogar</div>
  </div>`;
  document.body.appendChild(wrap);

  notify("Generando imagen…", "info");
  try {
    const el = wrap.firstElementChild;
    const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tarjeta-${MESES_NOMBRE[STATE.mes].toLowerCase()}-${STATE.ano}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], "tarjeta.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "Distribución de tarjeta" }).catch(() => {});
        }
      }
      notify("Imagen lista", "success");
    }, "image/png");
  } catch (e) {
    notify("No se pudo generar la imagen", "error");
  } finally {
    wrap.remove();
  }
}
function openModalEditMov(id) {
  const m = STATE.movimientosTarjeta.find(x => x.id === id);
  if (!m) return;
  document.getElementById("emResp").innerHTML = STATE.usuarios.map(u => `<option value="${u.id}">${u.nombre}</option>`).join("");
  document.getElementById("emId").value = m.id;
  document.getElementById("emDesc").value = m.descripcion;
  setMoneyValue(document.getElementById("emMonto"), m.monto);
  setMoneyValue(document.getElementById("emValorTotal"), m.valor_total);
  document.getElementById("emResp").value = m.responsable_id;
  document.getElementById("emFecha").value = m.fecha;
  document.getElementById("emCuotaA").value = m.cuota_actual || "";
  document.getElementById("emCuotaT").value = m.cuota_total || "";
  openModal("mEditMov");
}
async function saveEditMov() {
  const id = document.getElementById("emId").value;
  const payload = {
    descripcion: document.getElementById("emDesc").value,
    monto: moneyValue(document.getElementById("emMonto")),
    valor_total: moneyValue(document.getElementById("emValorTotal")) || null,
    responsable_id: document.getElementById("emResp").value,
    fecha: document.getElementById("emFecha").value,
    cuota_actual: parseInt(document.getElementById("emCuotaA").value) || null,
    cuota_total: parseInt(document.getElementById("emCuotaT").value) || null,
  };
  try {
    await api(`/tarjetas/movimientos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    closeModal("mEditMov");
    renderResumenTarjeta();
    notify("Movimiento actualizado", "success");
  } catch (e) { notify(e.message, "error"); }
}
async function eliminarMovimientoTarjeta(id) {
  if (!confirm("¿Eliminar este movimiento?")) return;
  await api(`/tarjetas/movimientos/${id}`, { method: "DELETE" });
  renderResumenTarjeta();
}

/* ══════════════════════════════════════
   PORRA / SAN
   ══════════════════════════════════════ */
function renderPorras() {
  document.getElementById("porrasList").innerHTML = STATE.porras.map(p => `
    <div class="card" style="cursor:pointer" onclick="verPorra('${p.id}')">
      <div class="card-header"><div class="card-title">🏆 ${p.nombre}</div><span class="badge badge-blue">${p.frecuencia}</span></div>
      <div class="card-sub">${(p.porra_participantes||[]).length} participantes · cuota ${cop(p.cuota)}</div>
    </div>`).join("") || `<div class="empty"><p>No hay porras creadas</p></div>`;
}
function verPorra(id) {
  const p = STATE.porras.find(x => x.id === id);
  if (!p) return;
  document.getElementById("porraDetalle").style.display = "block";
  document.getElementById("porraDetalle").innerHTML = `<div class="card">
    <div class="card-header"><div class="card-title">${p.nombre}</div><button class="btn btn-ghost btn-sm" onclick="document.getElementById('porraDetalle').style.display='none'">Cerrar</button></div>
    <div class="card-sub" style="margin-bottom:10px">${p.descripcion || ""}</div>
    <div class="sec-title" style="margin-bottom:8px">Participantes</div>
    ${(p.porra_participantes||[]).map(pp => {
      const u = pp.usuario_id ? STATE.usuarios.find(x => x.id === pp.usuario_id) : null;
      return `<div class="list-item"><div class="list-body">${u?.nombre || pp.nombre_externo}</div></div>`;
    }).join("") || `<div class="empty"><p>Sin participantes</p></div>`}
  </div>`;
}
function openModalPorra() {
  document.getElementById("pParticipantesCheck").innerHTML = STATE.usuarios.map(u => `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px">
      <input type="checkbox" value="${u.id}" class="porra-part-check"> ${u.nombre}
    </label>`).join("");
  document.getElementById("pNombrePorra").value = "";
  setMoneyValue(document.getElementById("pCuotaPorra"), 0);
  document.getElementById("pFechaInicio").value = new Date().toISOString().slice(0, 10);
  document.getElementById("pDescripcion").value = "";
  openModal("mPorra");
}
async function savePorra() {
  const participantes = [...document.querySelectorAll(".porra-part-check:checked")].map(c => ({ usuario_id: c.value }));
  const payload = {
    nombre: document.getElementById("pNombrePorra").value,
    cuota: moneyValue(document.getElementById("pCuotaPorra")),
    frecuencia: document.getElementById("pFrecuencia").value,
    fecha_inicio: document.getElementById("pFechaInicio").value,
    modalidad: document.getElementById("pModalidad").value,
    descripcion: document.getElementById("pDescripcion").value,
    participantes,
  };
  if (!payload.nombre || !payload.cuota) return notify("Completa nombre y cuota", "error");
  try {
    await api("/porras", { method: "POST", body: JSON.stringify(payload) });
    closeModal("mPorra");
    STATE.porras = await api("/porras");
    renderPorras();
    notify("Porra creada", "success");
  } catch (e) { notify(e.message, "error"); }
}

/* ══════════════════════════════════════
   MERCADO — TRM y precio del oro en el dashboard
   ══════════════════════════════════════ */
async function renderMercado() {
  const cont = document.getElementById("mercadoRow");
  cont.innerHTML = `<div class="stat-card-market"><div class="market-tag">Mercado</div><div class="stat-label">Dólar (TRM)</div><div class="stat-value">…</div></div>
    <div class="stat-card-market"><div class="market-tag">Mercado</div><div class="stat-label">Oro (gramo)</div><div class="stat-value">…</div></div>`;
  try {
    const [trm, oro] = await Promise.all([api("/mercado/trm"), api("/mercado/oro")]);
    cont.innerHTML = `
      <div class="stat-card-market">
        <div class="market-tag">Mercado · no es tu dinero</div>
        <div class="stat-label">Dólar (TRM oficial)</div>
        <div class="stat-value" style="color:var(--purple)">${cop(trm.valor)}</div>
        <div class="stat-note">Vigente desde ${trm.vigencia_desde ? trm.vigencia_desde.slice(0,10) : "—"}</div>
      </div>
      <div class="stat-card-market">
        <div class="market-tag">Mercado · no es tu dinero</div>
        <div class="stat-label">Oro (gramo, estimado)</div>
        <div class="stat-value" style="color:var(--yellow)">${cop(oro.precio_gramo)}</div>
        <div class="stat-note">Spot internacional + TRM · no es precio de joyería</div>
      </div>`;
  } catch (e) {
    cont.innerHTML = `<div class="stat-card-market" style="grid-column:span 2"><div class="stat-label">Datos de mercado</div>
      <div class="stat-note">No se pudieron cargar en este momento.</div></div>`;
  }
}

/* ══════════════════════════════════════
   AHORRO
   ══════════════════════════════════════ */
async function renderAhorros() {
  const ahorros = await api("/ahorros");
  const cont = document.getElementById("ahorrosList");
  cont.innerHTML = ahorros.map(a => {
    const pct = a.monto_objetivo ? Math.min(100, Math.round((a.saldo_actual / a.monto_objetivo) * 100)) : null;
    return `<div class="card" style="margin-bottom:10px">
      <div class="card-header">
        <div><div class="card-title">${a.nombre}</div>
          ${a.fecha_limite ? `<div class="card-sub">Meta: ${a.fecha_limite}</div>` : ""}</div>
        <button class="btn btn-danger btn-sm" onclick="eliminarAhorro('${a.id}')">✕</button>
      </div>
      <div class="stat-value" style="color:${a.color}">${cop(a.saldo_actual)}</div>
      ${a.monto_objetivo ? `
        <div class="stat-note">de ${cop(a.monto_objetivo)} (${pct}%)</div>
        <div class="prog"><div class="prog-fill" style="width:${pct}%;background:${a.color}"></div></div>
      ` : ""}
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn btn-primary btn-sm" onclick="openModalMovAhorro('${a.id}','deposito')">+ Depositar</button>
        <button class="btn btn-ghost btn-sm" onclick="openModalMovAhorro('${a.id}','retiro')">− Retirar</button>
      </div>
    </div>`;
  }).join("") || `<div class="empty"><div class="icon">🐷</div><p>Crea tu primera alcancía de ahorro</p></div>`;
}
function openModalAhorro() {
  document.getElementById("ahNombre").value = "";
  setMoneyValue(document.getElementById("ahMontoObjetivo"), 0);
  document.getElementById("ahFechaLimite").value = "";
  openModal("mAhorro");
}
async function saveAhorro() {
  const payload = {
    nombre: document.getElementById("ahNombre").value,
    monto_objetivo: moneyValue(document.getElementById("ahMontoObjetivo")) || null,
    fecha_limite: document.getElementById("ahFechaLimite").value || null,
  };
  if (!payload.nombre) return notify("Ponle un nombre a la alcancía", "error");
  await api("/ahorros", { method: "POST", body: JSON.stringify(payload) });
  closeModal("mAhorro");
  renderAhorros();
  notify("Alcancía creada", "success");
}
async function eliminarAhorro(id) {
  if (!confirm("¿Eliminar esta alcancía y todos sus movimientos?")) return;
  await api(`/ahorros/${id}`, { method: "DELETE" });
  renderAhorros();
}
function openModalMovAhorro(ahorroId, tipo) {
  document.getElementById("movAhorroId").value = ahorroId;
  document.getElementById("movTipo").value = tipo;
  document.getElementById("mMovAhorroTitle").textContent = tipo === "deposito" ? "Registrar depósito" : "Registrar retiro";
  setMoneyValue(document.getElementById("movMonto"), 0);
  document.getElementById("movFecha").value = new Date().toISOString().slice(0, 10);
  document.getElementById("movNota").value = "";
  openModal("mMovAhorro");
}
async function saveMovAhorro() {
  const ahorroId = document.getElementById("movAhorroId").value;
  const payload = {
    tipo: document.getElementById("movTipo").value,
    monto: moneyValue(document.getElementById("movMonto")),
    fecha: document.getElementById("movFecha").value,
    nota: document.getElementById("movNota").value,
  };
  if (!payload.monto) return notify("Ingresa un monto", "error");
  await api(`/ahorros/${ahorroId}/movimientos`, { method: "POST", body: JSON.stringify(payload) });
  closeModal("mMovAhorro");
  renderAhorros();
  notify("Movimiento registrado", "success");
}

/* ══════════════════════════════════════
   INVERSIÓN
   ══════════════════════════════════════ */
async function renderInversiones() {
  const inversiones = await api("/inversiones");

  const totalInvertido = inversiones.reduce((s, i) => s + i.precio_compra_total, 0);
  const totalActual = inversiones.reduce((s, i) => s + (i.valor_actual_total ?? i.precio_compra_total), 0);
  const diferencia = totalActual - totalInvertido;
  document.getElementById("inversionResumenCard").innerHTML = `
    <div class="card-header"><div class="card-title">Resumen del portafolio</div></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Invertido</div><div class="stat-value">${cop(totalInvertido)}</div></div>
      <div class="stat-card"><div class="stat-label">Valor actual</div><div class="stat-value">${cop(totalActual)}</div></div>
      <div class="stat-card"><div class="stat-label">Ganancia/Pérdida</div>
        <div class="stat-value" style="color:${diferencia>=0?'var(--green)':'var(--red)'}">${cop(diferencia)}</div></div>
    </div>`;

  document.getElementById("inversionesList").innerHTML = inversiones.map(i => `
    <div class="list-item">
      <div class="list-icon" style="background:var(--yellowbg)">${i.tipo_activo === "oro" ? "🥇" : i.tipo_activo === "plata" ? "🥈" : "💰"}</div>
      <div class="list-body">
        <div class="list-title">${i.descripcion || i.tipo_activo}</div>
        <div class="list-sub">${i.cantidad} ${i.unidad} · comprado a ${cop(i.precio_compra_unitario)}/${i.unidad} · ${i.fecha_compra}</div>
      </div>
      <div class="list-right">
        <div class="list-amount">${cop(i.valor_actual_total ?? i.precio_compra_total)}</div>
        ${i.ganancia_perdida != null ? `<div class="list-meta" style="color:${i.ganancia_perdida>=0?'var(--green)':'var(--red)'}">${i.ganancia_perdida>=0?'+':''}${cop(i.ganancia_perdida)}</div>` : ""}
      </div>
      <button class="btn btn-danger btn-sm" onclick="eliminarInversion('${i.id}')">✕</button>
    </div>`).join("") || `<div class="empty"><div class="icon">📈</div><p>Registra tu primera compra de inversión</p></div>`;
}
function openModalInversion() {
  document.getElementById("invResponsable").innerHTML = STATE.usuarios.map(u => `<option value="${u.id}">${u.nombre}</option>`).join("");
  document.getElementById("invDescripcion").value = "";
  document.getElementById("invCantidad").value = "";
  setMoneyValue(document.getElementById("invPrecioUnitario"), 0);
  document.getElementById("invFecha").value = new Date().toISOString().slice(0, 10);
  document.getElementById("invResponsable").value = STATE.user.id;
  openModal("mInversion");
}
async function saveInversion() {
  const payload = {
    tipo_activo: document.getElementById("invTipo").value,
    unidad: document.getElementById("invUnidad").value,
    descripcion: document.getElementById("invDescripcion").value,
    cantidad: parseFloat(document.getElementById("invCantidad").value || 0),
    precio_compra_unitario: moneyValue(document.getElementById("invPrecioUnitario")),
    responsable_id: document.getElementById("invResponsable").value,
    fecha_compra: document.getElementById("invFecha").value,
  };
  if (!payload.cantidad || !payload.precio_compra_unitario) return notify("Completa cantidad y precio", "error");
  await api("/inversiones", { method: "POST", body: JSON.stringify(payload) });
  closeModal("mInversion");
  renderInversiones();
  notify("Inversión registrada", "success");
}
async function eliminarInversion(id) {
  if (!confirm("¿Eliminar este registro de inversión?")) return;
  await api(`/inversiones/${id}`, { method: "DELETE" });
  renderInversiones();
}

/* ══════════════════════════════════════
   NÓMINA — Descuentos del salario (Colombia 2026)
   ══════════════════════════════════════ */
const NOMINA_2026 = { smlv: 1750905, auxTransporte: 249095, uvt: 52374 };
STATE.nomina = { ingresos: [], descuentos: [] };

function nomFmt(n) { return "$" + Math.round(n || 0).toLocaleString("es-CO"); }

function agregarIngresoNomina() {
  leerFilasNomina();
  STATE.nomina.ingresos.push({ id: uid(), desc: "", monto: 0, afectaIBC: false });
  renderFilasNomina();
  actualizarNomina();
}
function agregarDescuentoNomina() {
  leerFilasNomina();
  STATE.nomina.descuentos.push({ id: uid(), desc: "", monto: 0 });
  renderFilasNomina();
  actualizarNomina();
}
function quitarIngresoNomina(id) {
  leerFilasNomina();
  STATE.nomina.ingresos = STATE.nomina.ingresos.filter(x => x.id !== id);
  renderFilasNomina();
  actualizarNomina();
}
function quitarDescuentoNomina(id) {
  leerFilasNomina();
  STATE.nomina.descuentos = STATE.nomina.descuentos.filter(x => x.id !== id);
  renderFilasNomina();
  actualizarNomina();
}

// Lee lo que hay actualmente en los inputs de las filas y lo guarda en STATE
// (se usa antes de reconstruir el HTML de las filas, para no perder lo ya escrito)
function leerFilasNomina() {
  document.querySelectorAll("#nomIngresosList .nom-row").forEach(rowEl => {
    const item = STATE.nomina.ingresos.find(x => x.id === rowEl.dataset.id);
    if (!item) return;
    item.desc = rowEl.querySelector(".nom-desc").value;
    item.monto = moneyValue(rowEl.querySelector(".nom-monto"));
    item.afectaIBC = rowEl.querySelector(".nom-ibc").checked;
  });
  document.querySelectorAll("#nomDescuentosList .nom-row").forEach(rowEl => {
    const item = STATE.nomina.descuentos.find(x => x.id === rowEl.dataset.id);
    if (!item) return;
    item.desc = rowEl.querySelector(".nom-desc").value;
    item.monto = moneyValue(rowEl.querySelector(".nom-monto"));
  });
}

// Construye el HTML de las filas — SOLO se llama al agregar/quitar/entrar a la página,
// nunca en cada tecla (si no, se pierde el foco del input mientras se escribe).
function renderFilasNomina() {
  const ingCont = document.getElementById("nomIngresosList");
  document.getElementById("nomIngresosEmpty").style.display = STATE.nomina.ingresos.length ? "none" : "";
  ingCont.innerHTML = STATE.nomina.ingresos.map(row => `
    <div class="nom-row" data-id="${row.id}">
      <input type="text" class="form-input nom-desc" placeholder="Ej: Comisión" value="${row.desc}" oninput="actualizarNomina()">
      <input type="text" inputmode="numeric" class="form-input money-input nom-monto" placeholder="$ 0" value="${row.monto ? '$ ' + row.monto.toLocaleString('es-CO') : ''}" oninput="actualizarNomina()">
      <label class="nom-check"><input type="checkbox" class="nom-ibc" ${row.afectaIBC ? "checked" : ""} onchange="actualizarNomina()">Salud/pensión</label>
      <button class="btn btn-danger btn-icon" onclick="quitarIngresoNomina('${row.id}')">✕</button>
    </div>`).join("");

  const descCont = document.getElementById("nomDescuentosList");
  document.getElementById("nomDescuentosEmpty").style.display = STATE.nomina.descuentos.length ? "none" : "";
  descCont.innerHTML = STATE.nomina.descuentos.map(row => `
    <div class="nom-row" data-id="${row.id}">
      <input type="text" class="form-input nom-desc" placeholder="Ej: Libranza" value="${row.desc}" oninput="actualizarNomina()">
      <input type="text" inputmode="numeric" class="form-input money-input nom-monto" placeholder="$ 0" value="${row.monto ? '$ ' + row.monto.toLocaleString('es-CO') : ''}" oninput="actualizarNomina()">
      <button class="btn btn-danger btn-icon" onclick="quitarDescuentoNomina('${row.id}')">✕</button>
    </div>`).join("");
}

function calcularNomina(salarioBase, tieneAux, ingresos, descuentos) {
  const auxTransporte = tieneAux ? NOMINA_2026.auxTransporte : 0;
  const ingresosExtraTotal = ingresos.reduce((s, i) => s + (i.monto || 0), 0);
  const ingresosExtraIBC = ingresos.filter(i => i.afectaIBC).reduce((s, i) => s + (i.monto || 0), 0);

  // Ingreso Base de Cotización (nunca incluye el auxilio de transporte)
  const ibc = salarioBase + ingresosExtraIBC;

  const salud = ibc * 0.04;
  const pension = ibc * 0.04;

  // Fondo de Solidaridad Pensional — aplica desde 4 SMLV
  const numSmlv = ibc / NOMINA_2026.smlv;
  let fspPct = 0;
  if (numSmlv >= 20) fspPct = 0.02;
  else if (numSmlv >= 19) fspPct = 0.018;
  else if (numSmlv >= 18) fspPct = 0.016;
  else if (numSmlv >= 17) fspPct = 0.014;
  else if (numSmlv >= 16) fspPct = 0.012;
  else if (numSmlv >= 4) fspPct = 0.01;
  const fsp = ibc * fspPct;

  // Retención en la fuente — estimado simplificado (Art. 383 ET, procedimiento 1)
  const baseTrasAportes = Math.max(0, ibc - salud - pension - fsp);
  const rentaExenta = baseTrasAportes * 0.25;
  const baseGravable = Math.max(0, baseTrasAportes - rentaExenta);
  const baseUVT = baseGravable / NOMINA_2026.uvt;
  let retUVT = 0;
  if (baseUVT > 2300) retUVT = (baseUVT - 2300) * 0.39 + 522;
  else if (baseUVT > 945) retUVT = (baseUVT - 945) * 0.37 + 216;
  else if (baseUVT > 640) retUVT = (baseUVT - 640) * 0.35 + 162;
  else if (baseUVT > 360) retUVT = (baseUVT - 360) * 0.33 + 69;
  else if (baseUVT > 150) retUVT = (baseUVT - 150) * 0.28 + 10;
  else if (baseUVT > 95) retUVT = (baseUVT - 95) * 0.19;
  const retencion = retUVT * NOMINA_2026.uvt;

  const descuentosExtraTotal = descuentos.reduce((s, d) => s + (d.monto || 0), 0);
  const totalDevengado = salarioBase + auxTransporte + ingresosExtraTotal;
  const totalLey = salud + pension + fsp + retencion;
  const totalDeducido = totalLey + descuentosExtraTotal;
  const netoAPagar = totalDevengado - totalDeducido;

  return { auxTransporte, ibc, numSmlv, salud, pension, fsp, fspPct, retencion, ingresosExtraTotal,
    descuentosExtraTotal, totalDevengado, totalLey, totalDeducido, netoAPagar };
}

// Se llama cada vez que se abre la página de nómina (construye todo desde cero)
function renderNomina() {
  const auxCheck = document.getElementById("nomAuxTransporte");
  if (!auxCheck.dataset.bound) {
    auxCheck.addEventListener("change", () => { auxCheck.dataset.touched = "1"; actualizarNomina(); });
    auxCheck.dataset.bound = "1";
  }
  renderFilasNomina();
  actualizarNomina();
}

// Se llama en cada tecla — SOLO recalcula el resultado, nunca reconstruye los inputs
// de las filas (eso es lo que causaba que se perdiera el foco al escribir).
function actualizarNomina() {
  leerFilasNomina();
  const salarioInput = document.getElementById("nomSalario");
  const salarioBase = moneyValue(salarioInput);
  const auxCheck = document.getElementById("nomAuxTransporte");

  // Auto-marcar auxilio si el salario califica (≤ 2 SMLV) y el usuario no lo ha tocado a mano
  if (salarioBase > 0 && auxCheck.dataset.touched !== "1") {
    auxCheck.checked = salarioBase <= NOMINA_2026.smlv * 2;
  }

  const r = calcularNomina(salarioBase, auxCheck.checked, STATE.nomina.ingresos, STATE.nomina.descuentos);
  const cont = document.getElementById("nomResultado");

  if (!salarioBase) {
    cont.innerHTML = `<div class="empty"><div class="icon">🧮</div><p>Ingresa el salario básico para ver el desglose</p></div>`;
    return;
  }

  cont.innerHTML = `
    <div class="card-header"><div class="card-title">Desglose de nómina</div><div class="card-sub">${STATE.user?.nombre || ""} · ${new Date().toLocaleDateString("es-CO",{month:"long",year:"numeric"})}</div></div>
    <div id="reciboNomina">
      <div class="nom-line"><span class="nl-label">Salario básico</span><span>${nomFmt(salarioBase)}</span></div>
      ${r.auxTransporte ? `<div class="nom-line"><span class="nl-label">Auxilio de transporte</span><span>${nomFmt(r.auxTransporte)}</span></div>` : ""}
      ${STATE.nomina.ingresos.filter(i=>i.monto>0).map(i => `<div class="nom-line"><span class="nl-label">${i.desc || "Ingreso adicional"}</span><span style="color:var(--green)">+${nomFmt(i.monto)}</span></div>`).join("")}
      <div class="nom-line total"><span>Total devengado</span><span>${nomFmt(r.totalDevengado)}</span></div>
      <div class="sep"></div>
      <div class="nom-line"><span><span class="nl-label">Salud (4%)</span><div class="nl-sub">IBC ${nomFmt(r.ibc)}</div></span><span style="color:var(--red)">-${nomFmt(r.salud)}</span></div>
      <div class="nom-line"><span class="nl-label">Pensión (4%)</span><span style="color:var(--red)">-${nomFmt(r.pension)}</span></div>
      ${r.fsp > 0 ? `<div class="nom-line"><span><span class="nl-label">Fondo Solidaridad Pensional (${(r.fspPct*100).toFixed(1)}%)</span><div class="nl-sub">Aplica desde 4 SMLV · devengas ${r.numSmlv.toFixed(1)} SMLV</div></span><span style="color:var(--red)">-${nomFmt(r.fsp)}</span></div>` : ""}
      ${r.retencion > 0 ? `<div class="nom-line"><span><span class="nl-label">Retención en la fuente</span><div class="nl-sub">Estimado, Art. 383 ET</div></span><span style="color:var(--red)">-${nomFmt(r.retencion)}</span></div>` : ""}
      ${STATE.nomina.descuentos.filter(d=>d.monto>0).map(d => `<div class="nom-line"><span class="nl-label">${d.desc || "Descuento adicional"}</span><span style="color:var(--red)">-${nomFmt(d.monto)}</span></div>`).join("")}
      <div class="nom-line total"><span>Neto a pagar</span><span style="color:var(--green)">${nomFmt(r.netoAPagar)}</span></div>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:10px;line-height:1.5">
      Salud y pensión (4%+4%) son de ley. El Fondo de Solidaridad Pensional aplica solo si el IBC ≥ 4 SMLV ($${(NOMINA_2026.smlv*4).toLocaleString("es-CO")}).
      La retención en la fuente es un estimado del procedimiento 1 y puede variar según deducciones adicionales (dependientes, salud prepagada, intereses de vivienda, etc.) — no reemplaza el cálculo de nómina de tu empleador.
    </div>`;
}

async function descargarReciboNomina() {
  const salarioBase = moneyValue(document.getElementById("nomSalario"));
  if (!salarioBase) return notify("Ingresa el salario básico primero", "error");
  if (typeof html2canvas === "undefined") return notify("No se pudo cargar el generador de imágenes", "error");
  const el = document.getElementById("reciboNomina");
  notify("Generando imagen…", "info");
  try {
    const canvas = await html2canvas(el, { backgroundColor: "#111520", scale: 2 });
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nomina-${new Date().toISOString().slice(0,10)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // En móviles con Web Share API disponible, ofrece compartir directo (incluye WhatsApp)
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], "nomina.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "Desglose de nómina" }).catch(() => {});
        }
      }
      notify("Imagen lista", "success");
    }, "image/png");
  } catch (e) {
    notify("No se pudo generar la imagen", "error");
  }
}

/* ══════════════════════════════════════
   REPORTES — Imagen de ingresos y gastos del mes
   ══════════════════════════════════════ */
const MESES_NOMBRE = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function agruparGastosPorCategoria(gastos) {
  const map = {};
  gastos.forEach(g => {
    if (!map[g.categoria]) map[g.categoria] = { total: 0, count: 0 };
    map[g.categoria].total += g.monto;
    map[g.categoria].count++;
  });
  return Object.entries(map)
    .map(([id, v]) => ({ ...catInfo(id), ...v }))
    .sort((a, b) => b.total - a.total);
}

function renderReportes() {
  document.getElementById("rptPeriodoLabel").textContent = `${MESES_NOMBRE[STATE.mes]} ${STATE.ano}`;
  const cont = document.getElementById("rptPreview");

  const gastos = [...STATE.gastos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ingresos = [...STATE.ingresos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const totalIngresos = ingresos.reduce((s, i) => s + i.monto, 0);
  const balance = totalIngresos - totalGastos;
  const porCategoria = agruparGastosPorCategoria(gastos);
  const maxCat = porCategoria[0]?.total || 1;

  // Préstamos con cuota pendiente por pagar este mes (aún no completados)
  const prestamosActivos = STATE.prestamos.filter(p => p.pagadas < p.cuotas);
  const totalCuotasPrestamos = prestamosActivos.reduce((s, p) => s + p.cuota, 0);

  if (!gastos.length && !ingresos.length && !prestamosActivos.length) {
    cont.innerHTML = `<div class="card"><div class="empty"><div class="icon">📊</div><p>No hay movimientos en ${MESES_NOMBRE[STATE.mes]} ${STATE.ano}</p></div></div>`;
    return;
  }

  cont.innerHTML = `
    <div class="rpt-card" id="reciboReportes">
      <div class="rpt-header">
        <div class="rpt-title">Reporte financiero</div>
        <div class="rpt-sub">${MESES_NOMBRE[STATE.mes]} ${STATE.ano}</div>
      </div>

      <div class="rpt-stats">
        <div class="rpt-stat"><div class="rpt-stat-label">Ingresos</div><div class="rpt-stat-val" style="color:#1a9e5c">${nomFmt(totalIngresos)}</div></div>
        <div class="rpt-stat"><div class="rpt-stat-label">Gastos</div><div class="rpt-stat-val" style="color:#d9394c">${nomFmt(totalGastos)}</div></div>
        <div class="rpt-stat"><div class="rpt-stat-label">Balance</div><div class="rpt-stat-val" style="color:${balance>=0?'#1a9e5c':'#d9394c'}">${nomFmt(balance)}</div></div>
        <div class="rpt-stat"><div class="rpt-stat-label">Cuotas préstamos</div><div class="rpt-stat-val" style="color:#c2740c">${nomFmt(totalCuotasPrestamos)}</div></div>
      </div>

      <div class="rpt-section-title">🏦 Préstamos — cuotas a pagar este mes (${prestamosActivos.length})</div>
      ${prestamosActivos.map(p => {
        const resp = STATE.usuarios.find(u => u.id === p.responsable_id);
        return `<div class="rpt-row">
          <div><div class="rl-main">${p.nombre}</div><div class="rl-sub">${resp?.nombre || "—"} · cuota ${p.pagadas + 1}/${p.cuotas}${p.dia_pago ? ` · vence el día ${p.dia_pago}` : ""}</div></div>
          <div class="rl-amt" style="color:#c2740c">${nomFmt(p.cuota)}</div>
        </div>`;
      }).join("") || `<div style="font-size:12px;color:#999;padding:6px 0">Sin préstamos activos</div>`}

      <div class="rpt-section-title">Resumen de gastos por categoría</div>
      ${porCategoria.map(c => `
        <div class="rpt-cat-row">
          <div class="rpt-cat-top">
            <span>${c.icon} ${c.nombre} <span style="color:#aaa">(${c.count})</span></span>
            <b>${nomFmt(c.total)}</b>
          </div>
          <div class="rpt-cat-bar-wrap"><div class="rpt-cat-bar" style="width:${(c.total/maxCat*100).toFixed(0)}%;background:${c.color}"></div></div>
        </div>`).join("") || `<div style="font-size:12px;color:#999;padding:6px 0">Sin gastos este mes</div>`}

      <div class="rpt-section-title">Detalle de ingresos (${ingresos.length})</div>
      ${ingresos.map(i => {
        const u = STATE.usuarios.find(x => x.id === i.persona_id);
        return `<div class="rpt-row">
          <div><div class="rl-main">${i.fuente || "Ingreso"}</div><div class="rl-sub">${u?.nombre || "—"} · ${i.fecha}</div></div>
          <div class="rl-amt" style="color:#1a9e5c">+${nomFmt(i.monto)}</div>
        </div>`;
      }).join("") || `<div style="font-size:12px;color:#999;padding:6px 0">Sin ingresos este mes</div>`}

      <div class="rpt-section-title">Detalle de gastos (${gastos.length})</div>
      ${gastos.map(g => {
        const info = catInfo(g.categoria);
        const resp = STATE.usuarios.find(u => u.id === g.responsable_id);
        return `<div class="rpt-row">
          <div><div class="rl-main">${info.icon} ${g.descripcion}</div><div class="rl-sub">${resp?.nombre || "—"} · ${info.nombre} · ${g.fecha}${g.tipo==='cuota' ? ` · Cuota ${g.cuota_actual}/${g.cuota_total}` : ""}</div></div>
          <div class="rl-amt" style="color:#d9394c">-${nomFmt(g.monto)}</div>
        </div>`;
      }).join("") || `<div style="font-size:12px;color:#999;padding:6px 0">Sin gastos este mes</div>`}

      <div class="rpt-footer">Generado el ${new Date().toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"})} · FinanzasHogar</div>
    </div>`;
}

async function descargarReporteImg() {
  const el = document.getElementById("reciboReportes");
  if (!el) return notify("No hay datos para generar el reporte", "error");
  if (typeof html2canvas === "undefined") return notify("No se pudo cargar el generador de imágenes", "error");
  notify("Generando imagen…", "info");
  try {
    const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-${MESES_NOMBRE[STATE.mes].toLowerCase()}-${STATE.ano}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], "reporte.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "Reporte financiero" }).catch(() => {});
        }
      }
      notify("Imagen lista", "success");
    }, "image/png");
  } catch (e) {
    notify("No se pudo generar la imagen", "error");
  }
}

/* ══════════════════════════════════════
   ARRANQUE
   ══════════════════════════════════════ */
(async function start() {
  try {
    const me = await api("/auth/me");
    STATE.user = me;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appShell").classList.add("show");
    document.getElementById("fabBtn").style.display = "flex";
    if (me.rol !== "admin") {
      document.getElementById("adminNavDesk").style.display = "none";
      document.getElementById("masUsuariosItem").style.display = "none";
    }
    await cargarTodo();
    initMonthSelectors();
    renderAll();
  } catch (e) {
    initLogin();
  }
})();
