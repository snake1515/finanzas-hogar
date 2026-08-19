from functools import wraps
from flask import session, jsonify


def login_required(f):
    """Bloquea la ruta si no hay sesión activa (usuario logueado)."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "No autenticado"}), 401
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    """Bloquea la ruta si el usuario logueado no tiene rol admin."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if session.get("rol") != "admin":
            return jsonify({"error": "Requiere rol admin"}), 403
        return f(*args, **kwargs)
    return wrapper
