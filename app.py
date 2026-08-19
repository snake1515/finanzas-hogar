"""
FinanzasHogar - Backend Flask + Supabase
Sirve la API REST y el frontend (index.html) desde un solo servicio.
"""
import os
from flask import Flask, send_from_directory
from dotenv import load_dotenv

load_dotenv()

from routes.auth import auth_bp
from routes.gastos import gastos_bp
from routes.ingresos import ingresos_bp
from routes.prestamos import prestamos_bp
from routes.usuarios import usuarios_bp
from routes.tarjetas import tarjetas_bp
from routes.porras import porras_bp
from routes.cargos_fijos import cargos_fijos_bp


def create_app():
    app = Flask(__name__, static_folder="static", static_url_path="")
    app.config["SECRET_KEY"] = os.environ["SECRET_KEY"]

    # Blueprints — cada uno agrupa las rutas de un recurso
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(gastos_bp, url_prefix="/api/gastos")
    app.register_blueprint(ingresos_bp, url_prefix="/api/ingresos")
    app.register_blueprint(prestamos_bp, url_prefix="/api/prestamos")
    app.register_blueprint(usuarios_bp, url_prefix="/api/usuarios")
    app.register_blueprint(tarjetas_bp, url_prefix="/api/tarjetas")
    app.register_blueprint(porras_bp, url_prefix="/api/porras")
    app.register_blueprint(cargos_fijos_bp, url_prefix="/api/cargos-fijos")

    # Sirve el frontend (index.html) para cualquier ruta que no sea /api/*
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, "index.html")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
