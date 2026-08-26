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
        # Solo se usa cuando tipo_reparto == "individual" (una sola persona
        # asume el 100% del cargo, sin dividirlo entre nadie más).
        "responsable_id": data.get("responsable_id"),
    }
    try:
        res = supabase.table("cargos_fijos").insert(nuevo).execute()
        return jsonify(res.data[0]), 201
    except Exception as e:
        # Devolvemos el mensaje real de Supabase/Postgres en vez de un 500
        # genérico, para poder diagnosticar sin tener que ir a los logs de Render.
        return jsonify({"error": str(e)}), 500


@cargos_fijos_bp.route("/<cargo_id>", methods=["DELETE"])
@login_required
def eliminar_cargo(cargo_id):
    supabase.table("cargos_fijos").delete().eq("id", cargo_id).execute()
    return jsonify({"ok": True})


