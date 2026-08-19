from flask import Blueprint, request, jsonify
from supabase_client import supabase
from decorators import login_required

gastos_bp = Blueprint("gastos", __name__)


@gastos_bp.route("", methods=["GET"])
@login_required
def listar_gastos():
    # Filtros opcionales por mes/año, como hacía el frontend con localStorage
    mes = request.args.get("mes")
    ano = request.args.get("ano")
    query = supabase.table("gastos").select("*, usuarios(nombre,color)")
    if mes and ano:
        inicio = f"{ano}-{int(mes)+1:02d}-01"
        fin_mes = int(mes) + 2
        fin = f"{ano}-{fin_mes:02d}-01" if fin_mes <= 12 else f"{int(ano)+1}-01-01"
        query = query.gte("fecha", inicio).lt("fecha", fin)
    res = query.order("fecha", desc=True).execute()
    return jsonify(res.data)


@gastos_bp.route("", methods=["POST"])
@login_required
def crear_gasto():
    data = request.get_json()
    nuevo = {
        "descripcion": data["descripcion"],
        "monto": data["monto"],
        "categoria": data["categoria"],
        "responsable_id": data["responsable_id"],
        "fecha": data["fecha"],
        "tipo": data.get("tipo", "unico"),
        "cuota_actual": data.get("cuota_actual"),
        "cuota_total": data.get("cuota_total"),
    }
    res = supabase.table("gastos").insert(nuevo).execute()
    return jsonify(res.data[0]), 201


@gastos_bp.route("/<gasto_id>", methods=["PUT"])
@login_required
def actualizar_gasto(gasto_id):
    data = request.get_json()
    res = supabase.table("gastos").update(data).eq("id", gasto_id).execute()
    return jsonify(res.data[0])


@gastos_bp.route("/<gasto_id>", methods=["DELETE"])
@login_required
def eliminar_gasto(gasto_id):
    supabase.table("gastos").delete().eq("id", gasto_id).execute()
    return jsonify({"ok": True})
