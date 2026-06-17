from flask import wrappers
import os
from datetime import timedelta

class Config(object):
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "highly-secure-flask-secret-key")
    API_TITLE = 'My Flask API'
    API_VERSION = '1.0.0'
    OPENAPI_VERSION = '3.0.2'
    
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "highly-secure-jwt-secret-key")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=1) # Access token expire after 24 hours
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7) # refresh token expire after 7 days
    JWT_TOKEN_LOCATION = ["cookies", "headers"]

    ENV = os.environ.get("ENV")

    # 2. Configuramos la app según el entorno
    if ENV == "PRODUCTION":
        print("Iniciando en modo PRODUCCIÓN 🚀")
        JWT_COOKIE_SECURE = True         # Exige HTTPS (Obligatorio en Prod)
        JWT_COOKIE_CSRF_PROTECT = True   # Activa la protección CSRF
        DEBUG = False
    else:
        print("Iniciando en modo DESARROLLO 🛠️")
        JWT_COOKIE_SECURE = False        # Permite HTTP local (localhost)
        JWT_COOKIE_CSRF_PROTECT = False  # Apagarlo en dev facilita las pruebas en Postman
        DEBUG = True

    FRONTEND_DOMAIN= os.environ.get("FRONTEND_DOMAIN",None)

    TAX_CONFIG = {

    "REGLAS_RETEFUENTE": {
        "Compras Generales":    {"tope_uvt": 27, "tarifa": 0.025},
        "Servicios Generales":  {"tope_uvt": 4,  "tarifa": 0.040},
        "Honorarios y Consultoría": {"tope_uvt": 0,  "tarifa": 0.110}
    },
    "TARIFA_RETEIVA": 0.15
    }

    # Valor UVT por año, idealmente consultar de una API de DIAN
    VALOR_UVT={
        "2026": 52374,
        "2025": 49799,
        "2024": 47065
    }

    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
    FLASK_SECRET_KEY= os.environ.get("FLASK_SECRET_KEY")
    POSTGRES_USER= os.environ.get("POSTGRES_USER")
    POSTGRES_PASSWORD= os.environ.get("POSTGRES_PASSWORD")
    POSTGRES_HOST= os.environ.get("POSTGRES_HOST")
    POSTGRES_DB= os.environ.get("POSTGRES_DB")
    REDIS_HOST= os.environ.get("REDIS_HOST")
    REDIS_PASSWORD= os.environ.get("REDIS_PASSWORD")   




   