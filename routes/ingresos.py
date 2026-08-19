from flask import Blueprint, request, jsonify
from supabase_client import supabase
from decorators import login_required

ingresos_bp = Blueprint("ingresos", __name__)


@ingresos_bp.route("", methods=["GET"])
@login_required
def listar_ingresos():
    mes = request.args.get("mes")
    ano = request.args.get("ano")
    query = supabase.table("ingresos").select("*, usuarios(nombre,color)")
    if mes and ano:
        inicio = f"{ano}-{int(mes)+1:02d}-01"
        fin_mes = int(mes) + 2
        fin = f"{ano}-{fin_mes:02d}-01" if fin_mes <= 12 else f"{int(ano)+1}-01-01"
        query = query.gte("fecha", inicio).lt("fecha", fin)
    res = query.order("fecha", desc=True).execute()
    return jsonify(res.data)


@ingresos_bp.route("", methods=["POST"])
@login_required
def crear_ingreso():
    data = request.get_json()
    nuevo = {
        "persona_id": data["persona_id"],
        "monto": data["monto"],
        "fuente": data.get("fuente"),
        "fecha": data["fecha"],
    }
    res = supabase.table("ingresos").insert(nuevo).execute()
    return jsonify(res.data[0]), 201


@ingresos_bp.route("/<ingreso_id>", methods=["PUT"])
@login_required
def actualizar_ingreso(ingreso_id):
    res = supabase.table("ingresos").update(request.get_json()).eq("id", ingreso_id).execute()
    return jsonify(res.data[0])


@ingresos_bp.route("/<ingreso_id>", methods=["DELETE"])
@login_required
def eliminar_ingreso(ingreso_id):
    supabase.table("ingresos").delete().eq("id", ingreso_id).execute()
    return jsonify({"ok": True})
