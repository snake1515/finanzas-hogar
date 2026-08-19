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
  tarjetas:"Tarjetas", alertas:"Alertas", usuarios:"Usuarios", porra:"Porra / San", perfil:"Mi perfil" };

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
  const totalGastos = STATE.gastos.reduce((s, g) => s + g.monto, 0);
  const totalIngresos = STATE.ingresos.reduce((s, i) => s + i.monto, 0);
  const balance = totalIngresos - totalGastos;
  const cuotasPend = STATE.prestamos.reduce((s, p) => s + Math.max(0, p.cuotas - p.pagadas), 0);

  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card"><div class="stat-label">Gastos del mes</div><div class="stat-value">${cop(totalGastos)}</div></div>
    <div class="stat-card"><div class="stat-label">Ingresos del mes</div><div class="stat-value">${cop(totalIngresos)}</div></div>
    <div class="stat-card"><div class="stat-label">Balance</div><div class="stat-value" style="color:${balance>=0?'var(--green)':'var(--red)'}">${cop(balance)}</div></div>
    <div class="stat-card"><div class="stat-label">Cuotas pendientes</div><div class="stat-value">${cuotasPend}</div></div>`;

  // Donut por categoría
  const porCat = {};
  STATE.gastos.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto; });
  const entradas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const total = entradas.reduce((s, [, v]) => s + v, 0) || 1;
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
  document.getElementById("donutTotal").textContent = cop(total);
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
    <div class="list-body"><div class="list-title">${g.descripcion}</div>
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
  document.getElementById("gMonto").value = g?.monto || "";
  document.getElementById("gCat").value = g?.categoria || CATEGORIAS[0].id;
  document.getElementById("gResp").value = g?.responsable_id || STATE.user.id;
  document.getElementById("gFecha").value = g?.fecha || new Date().toISOString().slice(0, 10);
  document.getElementById("gTipo").value = g?.tipo || "unico";
  document.getElementById("gCuotaGrp").style.display = g?.tipo === "cuota" ? "" : "none";
  document.getElementById("gCuotaA").value = g?.cuota_actual || "";
  document.getElementById("gCuotaT").value = g?.cuota_total || "";
  openModal("mGasto");
}
async function saveGasto() {
  const id = document.getElementById("gEditId").value;
  const payload = {
    descripcion: document.getElementById("gDesc").value,
    monto: parseFloat(document.getElementById("gMonto").value || 0),
    categoria: document.getElementById("gCat").value,
    responsable_id: document.getElementById("gResp").value,
    fecha: document.getElementById("gFecha").value,
    tipo: document.getElementById("gTipo").value,
    cuota_actual: parseInt(document.getElementById("gCuotaA").value) || null,
    cuota_total: parseInt(document.getElementById("gCuotaT").value) || null,
  };
  if (!payload.descripcion || !payload.monto) return notify("Completa descripción y monto", "error");
  try {
    if (id) await api(`/gastos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/gastos", { method: "POST", body: JSON.stringify(payload) });
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
  document.getElementById("iMonto").value = "";
  document.getElementById("iFuente").value = "";
  document.getElementById("iFecha").value = new Date().toISOString().slice(0, 10);
  openModal("mIngreso");
}
async function saveIngreso() {
  const payload = {
    persona_id: document.getElementById("iPersona").value,
    monto: parseFloat(document.getElementById("iMonto").value || 0),
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
  document.getElementById("pMonto").value = p?.monto || "";
  document.getElementById("pCuota").value = p?.cuota || "";
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
    monto: parseFloat(document.getElementById("pMonto").value || 0),
    cuota: parseFloat(document.getElementById("pCuota").value || 0),
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
    STATE.csvPendientes = data.movimientos.map(m => ({ ...m, id: uid(), responsable_id: "" }));
    statusEl.innerHTML = `<div class="alert-item info">${STATE.csvPendientes.length} movimientos encontrados</div>`;
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
  if (!STATE.csvPendientes.length) { cont.innerHTML = ""; return; }
  cont.innerHTML = `<div class="card">
    <div class="card-header"><div class="card-title">Vista previa</div></div>
    ${STATE.csvPendientes.slice(0, 8).map(m => `<div class="list-item">
      <div class="list-body"><div class="list-title">${m.descripcion}</div><div class="list-sub">${m.fecha || "—"}</div></div>
      <div class="list-amount">${cop(m.monto)}</div>
    </div>`).join("")}
    ${STATE.csvPendientes.length > 8 ? `<div class="list-sub" style="padding-top:8px">+ ${STATE.csvPendientes.length-8} más…</div>` : ""}
    <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="switchTabT('asignar', document.querySelectorAll('#page-tarjetas .tab')[1])">Continuar a asignación →</button>
  </div>`;
}
function renderTarjetas() {
  document.getElementById("asignarTodosSelect").innerHTML = `<option value="">— elegir —</option>` +
    STATE.usuarios.map(u => `<option value="${u.id}">${u.nombre}</option>`).join("");
  renderCsvAsignar();
}
function renderCsvAsignar() {
  const cont = document.getElementById("csvAsignar");
  if (!STATE.csvPendientes.length) { cont.innerHTML = `<div class="empty"><p>Carga un PDF primero</p></div>`; return; }
  cont.innerHTML = STATE.csvPendientes.map(m => `
    <div class="list-item">
      <div class="list-body"><div class="list-title">${m.descripcion}</div><div class="list-sub">${m.fecha || "—"} · ${cop(m.monto)}</div></div>
      <select class="form-select" style="width:auto;font-size:12px;padding:5px 8px" onchange="asignarMov('${m.id}', this.value)">
        <option value="">Sin asignar</option>
        ${STATE.usuarios.map(u => `<option value="${u.id}" ${m.responsable_id===u.id?"selected":""}>${u.nombre}</option>`).join("")}
      </select>
    </div>`).join("");
}
function asignarMov(id, respId) {
  const m = STATE.csvPendientes.find(x => x.id === id);
  if (m) m.responsable_id = respId;
}
function asignarTodos() {
  const respId = document.getElementById("asignarTodosSelect").value;
  if (!respId) return;
  STATE.csvPendientes.forEach(m => { if (!m.responsable_id) m.responsable_id = respId; });
  renderCsvAsignar();
}
async function guardarMovimientosAsignados() {
  const listos = STATE.csvPendientes.filter(m => m.responsable_id);
  if (!listos.length) return notify("Asigna al menos un movimiento", "error");
  const periodo = `${STATE.ano}-${String(STATE.mes+1).padStart(2,"0")}`;
  const filas = listos.map(({ id, ...m }) => ({ ...m, periodo }));
  try {
    await api("/tarjetas/movimientos", { method: "POST", body: JSON.stringify({ movimientos: filas }) });
    STATE.csvPendientes = STATE.csvPendientes.filter(m => !m.responsable_id);
    notify("Movimientos guardados", "success");
    switchTabT("resumen", document.querySelectorAll("#page-tarjetas .tab")[3]);
  } catch (e) { notify(e.message, "error"); }
}
async function cargarCargosFijos() {
  const periodo = `${STATE.ano}-${String(STATE.mes+1).padStart(2,"0")}`;
  STATE.cargosFijos = await api(`/cargos-fijos?periodo=${periodo}`);
  document.getElementById("cargosFijosItems").innerHTML = STATE.cargosFijos.map(c => `
    <div class="list-item">
      <div class="list-body"><div class="list-title">${c.descripcion}</div><div class="list-sub">${c.tipo_reparto}</div></div>
      <div class="list-amount">${cop(c.monto)}</div>
      <button class="btn btn-danger btn-sm" onclick="eliminarCargoFijo('${c.id}')">✕</button>
    </div>`).join("") || `<div class="empty"><p>Sin cargos registrados</p></div>`;
}
async function agregarCargoFijo() {
  const periodo = `${STATE.ano}-${String(STATE.mes+1).padStart(2,"0")}`;
  const payload = {
    descripcion: document.getElementById("cfDesc").value,
    monto: parseFloat(document.getElementById("cfMonto").value || 0),
    tipo_reparto: document.getElementById("cfTipo").value,
    periodo,
  };
  if (!payload.descripcion || !payload.monto) return notify("Completa descripción y monto", "error");
  await api("/cargos-fijos", { method: "POST", body: JSON.stringify(payload) });
  document.getElementById("cfDesc").value = "";
  document.getElementById("cfMonto").value = "";
  cargarCargosFijos();
}
async function eliminarCargoFijo(id) {
  await api(`/cargos-fijos/${id}`, { method: "DELETE" });
  cargarCargosFijos();
}
async function renderResumenTarjeta() {
  const periodo = `${STATE.ano}-${String(STATE.mes+1).padStart(2,"0")}`;
  const movimientos = await api(`/tarjetas/movimientos?periodo=${periodo}`);
  const porPersona = {};
  movimientos.forEach(m => {
    const key = m.responsable_id;
    porPersona[key] = (porPersona[key] || 0) + m.monto;
  });
  document.getElementById("csvResumen").innerHTML = `<div class="card">
    <div class="card-header"><div class="card-title">Resumen del período</div></div>
    ${Object.entries(porPersona).map(([uid, total]) => {
      const u = STATE.usuarios.find(x => x.id === uid);
      return `<div class="list-item">${avatarHtml(u)}<div class="list-body"><div class="list-title">${u?.nombre || "—"}</div></div><div class="list-amount">${cop(total)}</div></div>`;
    }).join("") || `<div class="empty"><p>Sin movimientos guardados este período</p></div>`}
  </div>`;
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
  document.getElementById("pCuotaPorra").value = "";
  document.getElementById("pFechaInicio").value = new Date().toISOString().slice(0, 10);
  document.getElementById("pDescripcion").value = "";
  openModal("mPorra");
}
async function savePorra() {
  const participantes = [...document.querySelectorAll(".porra-part-check:checked")].map(c => ({ usuario_id: c.value }));
  const payload = {
    nombre: document.getElementById("pNombrePorra").value,
    cuota: parseFloat(document.getElementById("pCuotaPorra").value || 0),
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
