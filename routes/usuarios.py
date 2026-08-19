from flask import Blueprint, request, jsonify
from supabase_client import supabase
from decorators import login_required, admin_required
from routes.auth import hash_pin

usuarios_bp = Blueprint("usuarios", __name__)


@usuarios_bp.route("", methods=["GET"])
@login_required
def listar_usuarios():
    # nunca devolver pin_hash al frontend
    res = supabase.table("usuarios").select("id,nombre,email,email_alertas,rol,color").execute()
    return jsonify(res.data)


@usuarios_bp.route("", methods=["POST"])
@login_required
@admin_required
def crear_usuario():
    data = request.get_json()
    nuevo = {
        "nombre": data["nombre"],
        "email": data.get("email"),
        "email_alertas": data.get("email_alertas"),
        "rol": data.get("rol", "miembro"),
        "pin_hash": hash_pin(data["pin"]),
        "color": data.get("color", "#5b7fff"),
    }
    res = supabase.table("usuarios").insert(nuevo).execute()
    usuario = res.data[0]
    usuario.pop("pin_hash", None)
    return jsonify(usuario), 201


@usuarios_bp.route("/me", methods=["PUT"])
@login_required
def actualizar_mi_perfil():
    from flask import session
    data = request.get_json()
    permitido = {"nombre", "email", "email_alertas"}
    cambios = {k: v for k, v in data.items() if k in permitido}
    if "pin_actual" in data and "pin_nuevo" in data:
        import bcrypt
        actual = supabase.table("usuarios").select("pin_hash").eq("id", session["user_id"]).single().execute().data
        if not bcrypt.checkpw(data["pin_actual"].encode(), actual["pin_hash"].encode()):
            return jsonify({"error": "PIN actual incorrecto"}), 401
        cambios["pin_hash"] = hash_pin(data["pin_nuevo"])
    res = supabase.table("usuarios").update(cambios).eq("id", session["user_id"]).execute()
    usuario = res.data[0]
    usuario.pop("pin_hash", None)
    return jsonify(usuario)


@usuarios_bp.route("/<usuario_id>", methods=["PUT"])
@login_required
@admin_required
def actualizar_usuario(usuario_id):
    data = request.get_json()
    if "pin" in data:
        data["pin_hash"] = hash_pin(data.pop("pin"))
    res = supabase.table("usuarios").update(data).eq("id", usuario_id).execute()
    usuario = res.data[0]
    usuario.pop("pin_hash", None)
    return jsonify(usuario)


@usuarios_bp.route("/<usuario_id>", methods=["DELETE"])
@login_required
@admin_required
def eliminar_usuario(usuario_id):
    supabase.table("usuarios").delete().eq("id", usuario_id).execute()
    return jsonify({"ok": True})
