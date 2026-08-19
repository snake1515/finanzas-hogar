from flask import Blueprint, request, jsonify
from supabase_client import supabase
from decorators import login_required

ahorros_bp = Blueprint("ahorros", __name__)


@ahorros_bp.route("", methods=["GET"])
@login_required
def listar_ahorros():
    ahorros = supabase.table("ahorros").select("*").order("created_at").execute().data
    for a in ahorros:
        movs = supabase.table("ahorro_movimientos").select("tipo,monto") \
            .eq("ahorro_id", a["id"]).execute().data
        depositado = sum(m["monto"] for m in movs if m["tipo"] == "deposito")
        retirado = sum(m["monto"] for m in movs if m["tipo"] == "retiro")
        a["saldo_actual"] = depositado - retirado
    return jsonify(ahorros)


@ahorros_bp.route("", methods=["POST"])
@login_required
def crear_ahorro():
    data = request.get_json()
    nuevo = {
        "nombre": data["nombre"],
        "monto_objetivo": data.get("monto_objetivo"),
        "fecha_limite": data.get("fecha_limite"),
        "color": data.get("color", "#2ecf82"),
    }
    res = supabase.table("ahorros").insert(nuevo).execute()
    return jsonify(res.data[0]), 201


@ahorros_bp.route("/<ahorro_id>", methods=["DELETE"])
@login_required
def eliminar_ahorro(ahorro_id):
    supabase.table("ahorros").delete().eq("id", ahorro_id).execute()
    return jsonify({"ok": True})


@ahorros_bp.route("/<ahorro_id>/movimientos", methods=["GET"])
@login_required
def listar_movimientos(ahorro_id):
    res = supabase.table("ahorro_movimientos").select("*") \
        .eq("ahorro_id", ahorro_id).order("fecha", desc=True).execute()
    return jsonify(res.data)


@ahorros_bp.route("/<ahorro_id>/movimientos", methods=["POST"])
@login_required
def crear_movimiento(ahorro_id):
    data = request.get_json()
    nuevo = {
        "ahorro_id": ahorro_id,
        "tipo": data["tipo"],      # 'deposito' | 'retiro'
        "monto": data["monto"],
        "fecha": data["fecha"],
        "nota": data.get("nota"),
    }
    res = supabase.table("ahorro_movimientos").insert(nuevo).execute()
    return jsonify(res.data[0]), 201
