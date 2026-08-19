import re
from flask import Blueprint, request, jsonify
import pdfplumber
from supabase_client import supabase
from decorators import login_required

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
        # pdfplumber lanza error si la contraseña es incorrecta o falta
        return jsonify({"error": "PDF protegido o contraseña incorrecta", "detalle": str(e)}), 422

    movimientos = extraer_movimientos_rappicard(texto_completo)
    return jsonify({"movimientos": movimientos})


# ── Parser del extracto RappiCard/Davivienda ──
# Verificado contra un extracto real. La tabla "Detalle de transacciones" tiene
# columnas: Tarjeta | Fecha | Descripción | Valor transacción | Capital facturado
# del periodo | Cuotas | Capital pendiente por facturar | Tasa M.V | Tasa E.A
#
# Caso especial: cuando la Descripción ocupa dos líneas (ej. "AJUSTE COMPRA PAGO
# MIN ALTERNO"), pdfplumber extrae la 1ra línea de la descripción ANTES de la
# fila con los números, y la 2da línea DESPUÉS — por eso se revisan las líneas
# vecinas cuando la fila no trae descripción en su propia línea.

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

        # Descripción partida en dos líneas: buscar antes/después de esta fila
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

        # "monto" = lo que realmente se factura ESTE período. Para compras a
        # cuotas es el capital facturado del periodo (una fracción del valor
        # total). Para pagos/abonos/ajustes (sin cuotas, cap_fact = N/A) se usa
        # el valor de la transacción tal cual (suele venir negativo).
        monto = capital_facturado if capital_facturado is not None else valor_transaccion

        movimientos.append({
            "fecha": fecha,
            "descripcion": desc,
            "tarjeta": tarjeta,               # Fisica / Virtual / - (pago o ajuste)
            "monto": monto,
            "valor_transaccion": valor_transaccion,
            "cuota_actual": cuota_actual,
            "cuota_total": cuota_total,
            "capital_pendiente": _parse_money(cap_pend),
            "es_pago_o_ajuste": cuotas == "N/A",   # útil para que el frontend no lo sume como gasto
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
    """Guarda en lote los movimientos ya asignados a un responsable desde el frontend."""
    filas = request.get_json()["movimientos"]
    # csv_tx solo tiene estas columnas — se descartan los campos auxiliares del parser
    permitido = {"descripcion", "monto", "fecha", "responsable_id", "cuota_actual", "cuota_total", "periodo"}
    filas_limpias = [{k: v for k, v in f.items() if k in permitido} for f in filas]
    res = supabase.table("csv_tx").insert(filas_limpias).execute()
    return jsonify(res.data), 201
