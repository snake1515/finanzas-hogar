from flask import Blueprint, request, jsonify
from supabase_client import supabase
from decorators import login_required

porras_bp = Blueprint("porras", __name__)


@porras_bp.route("", methods=["GET"])
@login_required
def listar_porras():
    res = supabase.table("porras").select("*, porra_participantes(*)").execute()
    return jsonify(res.data)


@porras_bp.route("", methods=["POST"])
@login_required
def crear_porra():
    data = request.get_json()
    participantes = data.pop("participantes", [])  # [{usuario_id} | {nombre_externo}]

    nuevo = {k: data[k] for k in
             ["nombre", "cuota", "frecuencia", "fecha_inicio", "modalidad", "descripcion"]
             if k in data}
    res = supabase.table("porras").insert(nuevo).execute()
    porra = res.data[0]

    if participantes:
        filas = [{**p, "porra_id": porra["id"]} for p in participantes]
        supabase.table("porra_participantes").insert(filas).execute()

    return jsonify(porra), 201


@porras_bp.route("/<porra_id>/pagos", methods=["POST"])
@login_required
def registrar_pago(porra_id):
    data = request.get_json()
    nuevo = {
        "porra_id": porra_id,
        "periodo": data["periodo"],
        "participante_id": data["participante_id"],
        "monto": data["monto"],
        "fecha": data["fecha"],
    }
    res = supabase.table("porra_pagos").insert(nuevo).execute()
    return jsonify(res.data[0]), 201


@porras_bp.route("/<porra_id>/ganador", methods=["POST"])
@login_required
def registrar_ganador(porra_id):
    data = request.get_json()
    nuevo = {
        "porra_id": porra_id,
        "periodo": data["periodo"],
        "ganador_id": data["ganador_id"],
        "pozo": data["pozo"],
        "fecha": data["fecha"],
        "notas": data.get("notas"),
    }
    res = supabase.table("porra_ganadores").insert(nuevo).execute()
    return jsonify(res.data[0]), 201
