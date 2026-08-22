import re
from flask import Blueprint, request, jsonify
import pdfplumber
from supabase_client import supabase
from decorators import login_required, admin_required

tarjetas_bp = Blueprint("tarjetas", __name__)


@tarjetas_bp.route("/procesar-pdf", methods=["POST"])
@login_required
def procesar_pdf():
    archivo = request.files.get("pdf")
    password = request.form.get("password", "")
    if not archivo:
        return jsonify({"error": "No se envió ningún PDF"}), 400

    try:
        with pdfplumber.open(archivo, password=password or None) as pdf:
            texto_completo = "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as e:
        return jsonify({"error": "PDF protegido o contraseña incorrecta", "detalle": str(e)}), 422

    movimientos = extraer_movimientos_rappicard(texto_completo)
    return jsonify({"movimientos": movimientos})


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

        movimientos.append({
            "fecha": fecha,
            "descripcion": desc,
            "tarjeta": tarjeta,
            "monto": monto,
            "valor_total": valor_transaccion,
            "cuota_actual": cuota_actual,
            "cuota_total": cuota_total,
            "capital_pendiente": capital_pendiente,
            "es_pago_o_ajuste": cuotas == "N/A",
        })

    return movimientos


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
    entre varias personas) desde el frontend."""
    filas = request.get_json()["movimientos"]
    permitido = {"descripcion", "monto", "valor_total", "capital_pendiente",
                 "fecha", "responsable_id", "cuota_actual", "cuota_total", "periodo"}
    filas_limpias = [{k: v for k, v in f.items() if k in permitido} for f in filas]
    res = supabase.table("csv_tx").insert(filas_limpias).execute()
    return jsonify(res.data), 201


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


