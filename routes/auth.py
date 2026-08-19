from flask import Blueprint, request, session, jsonify
import bcrypt
from supabase_client import supabase
from decorators import login_required

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/usuarios-publicos", methods=["GET"])
def usuarios_publicos():
    """Lista para la pantalla de login: solo id, nombre y rol (nunca el pin_hash)."""
    res = supabase.table("usuarios").select("id,nombre,rol,color").execute()
    return jsonify(res.data)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    user_id = data.get("user_id")
    pin = data.get("pin", "")

    res = supabase.table("usuarios").select("*").eq("id", user_id).single().execute()
    usuario = res.data
    if not usuario:
        return jsonify({"error": "Usuario no encontrado"}), 404

    if not bcrypt.checkpw(pin.encode(), usuario["pin_hash"].encode()):
        return jsonify({"error": "PIN incorrecto"}), 401

    session["user_id"] = usuario["id"]
    session["rol"] = usuario["rol"]
    session["nombre"] = usuario["nombre"]

    return jsonify({
        "id": usuario["id"], "nombre": usuario["nombre"],
        "rol": usuario["rol"], "color": usuario["color"]
    })


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    return jsonify({
        "id": session["user_id"], "nombre": session["nombre"], "rol": session["rol"]
    })


# ── Helper para crear/actualizar el hash del PIN (úsalo desde el endpoint de usuarios) ──
def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()
