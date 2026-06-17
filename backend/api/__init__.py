from flask import Flask
from .Config import Config
from flask_smorest import Api
from flask_cors import CORS
from .errors import register_error_handlers
from psycopg_pool import ConnectionPool
import redis
from openai import OpenAI
from api.services.storage_service import StorageService
from flask_jwt_extended import JWTManager
from flask_bcrypt import Bcrypt 


postgres_pool = None
redis_pool = None
openai_client = None
storage = None
bcrypt=None

def create_app():
    global openai_client, postgres_pool, redis_pool, storage, bcrypt

    app = Flask(__name__)
    
    app.config.from_object(Config)

    if app.config['FRONTEND_DOMAIN'] is not None:
        CORS(app, origins=[app.config['FRONTEND_DOMAIN']], supports_credentials=True)
   
    register_error_handlers(app)

    bcrypt = Bcrypt(app)

    jwt = JWTManager(app)

    ###########################################
    # Json Web Token Related Functions        #
    ###########################################

    # Verify if the token is in the blocklist
    @jwt.token_in_blocklist_loader
    def check_if_token_is_revoked(jwt_header, jwt_payload: dict):
        jti = jwt_payload["jti"]
        with redis.Redis(connection_pool=redis_pool) as redis_conn:
            token_in_redis = redis_conn.get(jti)
        return token_in_redis is not None


    ###########################################
    # SETUP DATABASE POOLS CONNECTIONS        #
    ###########################################
        
    # set connection pool for PostgreSQL database in production
    postgres_pool = ConnectionPool(conninfo=f"postgresql://{app.config['POSTGRES_USER']}:{app.config['POSTGRES_PASSWORD']}@{app.config['POSTGRES_HOST']}:5432/{app.config['POSTGRES_DB']}",
                            min_size=1,
                            max_size=10)
        
    redis_pool = redis.ConnectionPool(host=f"{app.config['REDIS_HOST']}",password=app.config['REDIS_PASSWORD'], port=6379, db=0)

    openai_client = OpenAI(api_key=app.config['OPENAI_API_KEY'])
    storage = StorageService()

    from api.resources.user import blp as user_blp
    from api.resources.invoice import blp as invoice_blp

    api = Api(app)
  
    api.register_blueprint(user_blp)
    api.register_blueprint(invoice_blp)


    return app