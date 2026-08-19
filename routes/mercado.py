import time
import requests
from flask import Blueprint, request, jsonify
from supabase_client import supabase
from decorators import login_required, admin_required

mercado_bp = Blueprint("mercado", __name__)

# Caché simple en memoria (se resetea si el servicio de Render se reinicia,
# lo cual está bien para datos que cambian cada pocas horas)
_cache = {"trm": None, "trm_ts": 0, "oro": None, "oro_ts": 0}
TRM_TTL = 6 * 3600      # la TRM se fija 1 vez al día hábil, 6h de caché es de sobra
ORO_TTL = 30 * 60       # el oro se mueve más seguido, 30 min de caché


def obtener_trm():
    if _cache["trm"] and (time.time() - _cache["trm_ts"] < TRM_TTL):
        return _cache["trm"]

    url = "https://www.datos.gov.co/resource/32sa-8pi3.json"
    params = {"$order": "vigenciadesde DESC", "$limit": 1}
    r = requests.get(url, params=params, timeout=10)
    r.raise_for_status()
    dato = r.json()[0]
    resultado = {
        "valor": float(dato["valor"]),
        "vigencia_desde": dato.get("vigenciadesde"),
        "fuente": "datos.gov.co (oficial)",
    }
    _cache["trm"], _cache["trm_ts"] = resultado, time.time()
    return resultado


def obtener_precio_oro_cop():
    if _cache["oro"] and (time.time() - _cache["oro_ts"] < ORO_TTL):
        return _cache["oro"]

    trm = obtener_trm()

    # xaus.com da el precio en USD por gramo; lo convertimos con la TRM oficial
    # en vez de pedirle a xaus.com que convierta a COP directamente, para tener
    # control sobre qué tasa de cambio se usa y que ambos valores sean consistentes.
    r = requests.get("https://xaus.com/api/v1/spot", timeout=10)
    r.raise_for_status()
    data = r.json()
    precio_gramo_usd = data["per_gram_usd"]
    precio_gramo_cop = precio_gramo_usd * trm["valor"]

    resultado = {
        "precio_gramo_usd": precio_gramo_usd,
        "precio_gramo": round(precio_gramo_cop, 2),   # COP por gramo
        "precio_onza": round(precio_gramo_cop * 31.1035, 2),
        "trm_usada": trm["valor"],
        "nota": "Estimado: spot internacional (xaus.com) convertido con TRM oficial. "
                "Puede diferir del precio de compra/venta en joyerías o casas de empeño locales.",
    }
    _cache["oro"], _cache["oro_ts"] = resultado, time.time()
    return resultado


@mercado_bp.route("/trm", methods=["GET"])
@login_required
def trm():
    try:
        return jsonify(obtener_trm())
    except Exception as e:
        return jsonify({"error": "No se pudo consultar la TRM", "detalle": str(e)}), 502


@mercado_bp.route("/oro", methods=["GET"])
@login_required
def oro():
    try:
        return jsonify(obtener_precio_oro_cop())
    except Exception as e:
        return jsonify({"error": "No se pudo consultar el precio del oro", "detalle": str(e)}), 502


@mercado_bp.route("/salario-minimo", methods=["GET"])
@login_required
def listar_salario_minimo():
    res = supabase.table("salario_minimo").select("*").order("anio", desc=True).execute()
    return jsonify(res.data)


@mercado_bp.route("/salario-minimo", methods=["POST"])
@login_required
@admin_required
def guardar_salario_minimo():
    data = request.get_json()
    fila = {
        "anio": data["anio"],
        "valor": data["valor"],
        "auxilio_transporte": data.get("auxilio_transporte", 0),
    }
    # upsert: si ya existe el año, lo actualiza
    res = supabase.table("salario_minimo").upsert(fila, on_conflict="anio").execute()
    return jsonify(res.data[0]), 201
