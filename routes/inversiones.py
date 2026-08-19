from flask import Blueprint, request, jsonify
from supabase_client import supabase
from decorators import login_required
from routes.mercado import obtener_precio_oro_cop

inversiones_bp = Blueprint("inversiones", __name__)


@inversiones_bp.route("", methods=["GET"])
@login_required
def listar_inversiones():
    inversiones = supabase.table("inversiones").select("*, usuarios(nombre,color)") \
        .order("fecha_compra", desc=True).execute().data

    precio_oro_gr = None
    try:
        precio_oro_gr = obtener_precio_oro_cop()["precio_gramo"]
    except Exception:
        pass  # si la API de mercado falla, se listan sin valor actual

    for inv in inversiones:
        inv["precio_compra_total"] = inv["cantidad"] * inv["precio_compra_unitario"]
        if inv["tipo_activo"] == "oro" and precio_oro_gr and inv["unidad"] == "g":
            inv["precio_actual_unitario"] = precio_oro_gr
            inv["valor_actual_total"] = inv["cantidad"] * precio_oro_gr
            inv["ganancia_perdida"] = inv["valor_actual_total"] - inv["precio_compra_total"]
        else:
            inv["precio_actual_unitario"] = None
            inv["valor_actual_total"] = None
            inv["ganancia_perdida"] = None

    return jsonify(inversiones)


@inversiones_bp.route("", methods=["POST"])
@login_required
def crear_inversion():
    data = request.get_json()
    nuevo = {
        "tipo_activo": data["tipo_activo"],
        "descripcion": data.get("descripcion"),
        "cantidad": data["cantidad"],
        "unidad": data.get("unidad", "g"),
        "precio_compra_unitario": data["precio_compra_unitario"],
        "fecha_compra": data["fecha_compra"],
        "responsable_id": data.get("responsable_id"),
    }
    res = supabase.table("inversiones").insert(nuevo).execute()
    return jsonify(res.data[0]), 201


@inversiones_bp.route("/<inversion_id>", methods=["DELETE"])
@login_required
def eliminar_inversion(inversion_id):
    supabase.table("inversiones").delete().eq("id", inversion_id).execute()
    return jsonify({"ok": True})
