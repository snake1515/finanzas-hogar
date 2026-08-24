import re
import io
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
import pdfplumber
from supabase_client import supabase
from decorators import login_required, admin_required

tarjetas_bp = Blueprint("tarjetas", __name__)

EXTRACTOS_BUCKET = "extractos-tarjeta"

@tarjetas_bp.route("/procesar-pdf", methods=["POST"])
@login_required
def procesar_pdf():
    archivo = request.files.get("pdf")
    password = request.form.get("password", "")
    periodo = request.form.get("periodo", "")  # "YYYY-MM", enviado por el frontend
    if not archivo:
        return jsonify({"error": "No se envió ningún PDF"}), 400

    contenido = archivo.read()

    try:
        with pdfplumber.open(io.BytesIO(contenido), password=password or None) as pdf:
            texto_completo = "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as e:
        return jsonify({"error": "PDF protegido o contraseña incorrecta", "detalle": str(e)}), 422

    movimientos = extraer_movimientos_rappicard(texto_completo)

    # Guarda el PDF original en Supabase Storage para poder consultarlo después.
    # Si esto falla (bucket/tabla no configurados), no bloqueamos el procesamiento
    # de los movimientos — solo se informa que el extracto no quedó guardado.
    extracto_guardado = None
    if periodo:
        try:
            nombre_archivo = archivo.filename or "extracto.pdf"
            marca = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            ruta = f"{periodo}/{marca}_{nombre_archivo}"
            supabase.storage.from_(EXTRACTOS_BUCKET).upload(
                ruta, contenido, {"content-type": "application/pdf"}
            )
            fila = supabase.table("extractos").insert({
                "periodo": periodo,
                "nombre_archivo": nombre_archivo,
                "storage_path": ruta,
            }).execute()
            extracto_guardado = fila.data[0] if fila.data else None
        except Exception as e:
            extracto_guardado = {"error": str(e)}

    return jsonify({
        "movimientos": movimientos,
        "extracto": extracto_guardado,
    })


# ── Parser del extracto RappiCard/Davivienda ── (sin cambios, ya validado)
PATRON_FILA = re.compile(
    r"^(Fisica|Virtual|-)\s+(\d{4}-\d{2}-\d{2})\s*(.*?)\s*"
    r"\$(-?[\d.,]+)\s+"
    r"(\$[\d.,]+|N/A)\s+"
    r"(\d+\s*de\s*\d+|N/A)\s+"
    r"(\$[\d.,]+|N/A)\s+"
    r"([\d,]+%)\s+"
    r"([\d,]+%)\s*$"
)

# ── Clasificación de líneas sin cuotas (cuotas == "N/A") ──
# Pagos/abonos reales a la tarjeta: ya se pagaron, no se dividen entre nadie.
PATRON_PAGO = re.compile(r"PAGO|ABONO|REVERSO|AJUSTE\s*CR[EÉ]DITO", re.I)
# Cargos fijos del propio extracto (intereses, cuota de manejo, IVA, seguros,
# comisiones): SÍ deben poder dividirse entre las personas, igual que un
# "cargo fijo" manual — por eso se marcan aparte de los pagos.
PATRON_CARGO_FIJO = re.compile(
    r"CUOTA\s*DE\s*MANEJO|MANEJO\s*(DE\s*)?TARJETA|INTERES|IVA|SEGURO|"
    r"COMISI[OÓ]N|COSTO\s*POR\s*RETIRO",
    re.I,
)


def _clasificar_sin_cuotas(desc):
    """Para líneas que no son compra a cuotas (cuotas == 'N/A'): decide si es
    un cargo fijo divisible (intereses, cuota de manejo...) o un pago/ajuste
    puramente informativo. Por defecto, si no matchea nada, se trata como
    pago/ajuste (comportamiento previo, más seguro)."""
    if PATRON_CARGO_FIJO.search(desc):
        return False, True  # (es_pago_o_ajuste, es_cargo_fijo)
    return True, False


def _parse_money(s):
    if s is None or s.strip() in ("N/A", ""):
        return None
    return float(s.replace("$", "").replace(".", "").replace(",", "."))


def extraer_movimientos_rappicard(texto: str):
    lineas = texto.splitlines()
    movimientos = []

    for i, linea in enumerate(lineas):
        m = PATRON_FILA.match(linea.strip())
        if not m:
            continue
        tarjeta, fecha, desc, valor, cap_fact, cuotas, cap_pend, tasa_mv, tasa_ea = m.groups()
        desc = desc.strip()

        if not desc:
            partes = []
            anterior = lineas[i - 1].strip() if i > 0 else ""
            siguiente = lineas[i + 1].strip() if i + 1 < len(lineas) else ""
            if anterior and not PATRON_FILA.match(anterior) and "transacciones" not in anterior and "Capital" not in anterior:
                partes.append(anterior)
            if siguiente and not PATRON_FILA.match(siguiente):
                partes.append(siguiente)
            desc = " ".join(partes).strip()

        cuota_actual, cuota_total = None, None
        if cuotas != "N/A":
            a, b = cuotas.split(" de ")
            cuota_actual, cuota_total = int(a), int(b)

        valor_transaccion = _parse_money(valor)
        capital_facturado = _parse_money(cap_fact)
        capital_pendiente = _parse_money(cap_pend)

        # "monto" = lo que se factura ESTE período (cuota). "valor_total" = el
        # valor completo de la compra original, para que no se pierda ese dato.
        monto = capital_facturado if capital_facturado is not None else valor_transaccion

        # NOTA: no deduplicamos aquí. Un extracto real puede traer legítimamente
        # dos transacciones con la misma fecha/descripción/monto (ej. dos
        # compras separadas por el mismo valor en el mismo local, el mismo
        # día) — descartarlas por parecerse borraría una compra real. La
        # protección contra duplicados vive en el guardado (ver /movimientos),
        # que evita volver a insertar el mismo lote si ya se guardó antes.

        es_sin_cuotas = (cuotas == "N/A")
        if es_sin_cuotas:
            es_pago, es_cargo_fijo = _clasificar_sin_cuotas(desc)
        else:
            es_pago, es_cargo_fijo = False, False

        movimientos.append({
            "fecha": fecha,
            "descripcion": desc,
            "tarjeta": tarjeta,
            "monto": monto,
            "valor_total": valor_transaccion,
            "cuota_actual": cuota_actual,
            "cuota_total": cuota_total,
            "capital_pendiente": capital_pendiente,
            "es_pago_o_ajuste": es_pago,
            "es_cargo_fijo": es_cargo_fijo,
        })

    return movimientos


@tarjetas_bp.route("/extractos", methods=["GET"])
@login_required
def listar_extractos():
    periodo = request.args.get("periodo")
    query = supabase.table("extractos").select("*")
    if periodo:
        query = query.eq("periodo", periodo)
    res = query.order("created_at", desc=True).execute()
    extractos = res.data or []
    for e in extractos:
        try:
            firmada = supabase.storage.from_(EXTRACTOS_BUCKET).create_signed_url(e["storage_path"], 3600)
            e["url"] = firmada.get("signedURL") or firmada.get("signed_url") or firmada.get("signedUrl")
        except Exception:
            e["url"] = None
    return jsonify(extractos)


@tarjetas_bp.route("/extractos/<extracto_id>", methods=["DELETE"])
@login_required
@admin_required
def eliminar_extracto(extracto_id):
    fila = supabase.table("extractos").select("storage_path").eq("id", extracto_id).single().execute()
    if fila.data:
        try:
            supabase.storage.from_(EXTRACTOS_BUCKET).remove([fila.data["storage_path"]])
        except Exception:
            pass
    supabase.table("extractos").delete().eq("id", extracto_id).execute()
    return jsonify({"ok": True})


@tarjetas_bp.route("/movimientos", methods=["GET"])
@login_required
def listar_movimientos():
    periodo = request.args.get("periodo")
    query = supabase.table("csv_tx").select("*, usuarios(nombre,color)")
    if periodo:
        query = query.eq("periodo", periodo)
    res = query.order("fecha", desc=True).execute()
    return jsonify(res.data)


@tarjetas_bp.route("/movimientos", methods=["POST"])
@login_required
def guardar_movimientos():
    """Guarda en lote los movimientos ya asignados (y opcionalmente divididos
    entre varias personas) desde el frontend.

    Protección contra guardado duplicado: si el mismo período ya tiene
    guardado un movimiento IDÉNTICO (misma fecha, descripción, monto, valor
    total, cuota y responsable) — por ejemplo porque el usuario procesó y
    guardó el mismo extracto más de una vez — no lo vuelve a insertar. Esto
    es distinto de rechazar transacciones que se parecen entre sí: si el
    extracto trae dos compras reales idénticas (mismo local, mismo valor,
    mismo día), ambas se guardan la primera vez sin problema; lo que se
    bloquea es reinsertar ese mismo lote una segunda vez.
    """
    filas = request.get_json()["movimientos"]
    permitido = {"descripcion", "monto", "valor_total", "capital_pendiente",
                 "fecha", "responsable_id", "cuota_actual", "cuota_total", "periodo"}
    filas_limpias = [{k: v for k, v in f.items() if k in permitido} for f in filas]

    periodos = {f.get("periodo") for f in filas_limpias if f.get("periodo")}

    def firma(f):
        return (f.get("fecha"), f.get("descripcion"), f.get("monto"), f.get("valor_total"),
                f.get("cuota_actual"), f.get("cuota_total"), f.get("responsable_id"))

    conteo_existentes = {}
    if periodos:
        res_exist = supabase.table("csv_tx").select(
            "fecha,descripcion,monto,valor_total,cuota_actual,cuota_total,responsable_id"
        ).in_("periodo", list(periodos)).execute()
        for e in (res_exist.data or []):
            k = firma(e)
            conteo_existentes[k] = conteo_existentes.get(k, 0) + 1

    a_insertar, omitidos = [], 0
    for f in filas_limpias:
        k = firma(f)
        disponibles = conteo_existentes.get(k, 0)
        if disponibles > 0:
            conteo_existentes[k] = disponibles - 1
            omitidos += 1
            continue
        a_insertar.append(f)

    guardados = []
    if a_insertar:
        res = supabase.table("csv_tx").insert(a_insertar).execute()
        guardados = res.data or []

    return jsonify({"guardados": guardados, "omitidos_por_duplicado": omitidos}), 201


@tarjetas_bp.route("/movimientos/<mov_id>", methods=["PUT"])
@login_required
@admin_required
def editar_movimiento(mov_id):
    data = request.get_json()
    permitido = {"descripcion", "monto", "valor_total", "capital_pendiente",
                 "fecha", "responsable_id", "cuota_actual", "cuota_total"}
    cambios = {k: v for k, v in data.items() if k in permitido}
    res = supabase.table("csv_tx").update(cambios).eq("id", mov_id).execute()
    return jsonify(res.data[0])


@tarjetas_bp.route("/movimientos/<mov_id>", methods=["DELETE"])
@login_required
@admin_required
def eliminar_movimiento(mov_id):
    supabase.table("csv_tx").delete().eq("id", mov_id).execute()
    return jsonify({"ok": True})










