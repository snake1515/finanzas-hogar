from flask import Blueprint, request, jsonify
from supabase_client import supabase
from decorators import login_required

cargos_fijos_bp = Blueprint("cargos_fijos", __name__)


@cargos_fijos_bp.route("", methods=["GET"])
@login_required
def listar_cargos():
    periodo = request.args.get("periodo")
    query = supabase.table("cargos_fijos").select("*")
    if periodo:
        query = query.eq("periodo", periodo)
    res = query.execute()
    return jsonify(res.data)


@cargos_fijos_bp.route("", methods=["POST"])
@login_required
def crear_cargo():
    data = request.get_json()
    nuevo = {
        "descripcion": data["descripcion"],
        "monto": data["monto"],
        "tipo_reparto": data["tipo_reparto"],
        "periodo": data.get("periodo"),
    }
    res = supabase.table("cargos_fijos").insert(nuevo).execute()
    return jsonify(res.data[0]), 201


@cargos_fijos_bp.route("/<cargo_id>", methods=["DELETE"])
@login_required
def eliminar_cargo(cargo_id):
    supabase.table("cargos_fijos").delete().eq("id", cargo_id).execute()
    return jsonify({"ok": True})
