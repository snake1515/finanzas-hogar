from flask import Blueprint, request, jsonify
from supabase_client import supabase
from decorators import login_required

prestamos_bp = Blueprint("prestamos", __name__)


@prestamos_bp.route("", methods=["GET"])
@login_required
def listar_prestamos():
    res = supabase.table("prestamos").select("*, usuarios(nombre,color)").order("fecha").execute()
    return jsonify(res.data)


@prestamos_bp.route("", methods=["POST"])
@login_required
def crear_prestamo():
    data = request.get_json()
    nuevo = {
        "nombre": data["nombre"],
        "monto": data["monto"],
        "cuota": data["cuota"],
        "cuotas": data["cuotas"],
        "pagadas": data.get("pagadas", 0),
        "responsable_id": data["responsable_id"],
        "fecha": data["fecha"],
        "dia_pago": data.get("dia_pago"),
        "alerta_dias": data.get("alerta_dias", 5),
        # "credito" (bancario/tarjeta, con concepto) o "personal" (prestado a
        # o por alguien, con detalle de en qué se gastó).
        "tipo": data.get("tipo", "credito"),
        "concepto": data.get("concepto"),
        "detalle": data.get("detalle"),
    }
    res = supabase.table("prestamos").insert(nuevo).execute()
    return jsonify(res.data[0]), 201


@prestamos_bp.route("/<prestamo_id>", methods=["PUT"])
@login_required
def actualizar_prestamo(prestamo_id):
    res = supabase.table("prestamos").update(request.get_json()).eq("id", prestamo_id).execute()
    return jsonify(res.data[0])


@prestamos_bp.route("/<prestamo_id>", methods=["DELETE"])
@login_required
def eliminar_prestamo(prestamo_id):
    supabase.table("prestamos").delete().eq("id", prestamo_id).execute()
    return jsonify({"ok": True})

