from flask.views import MethodView
from flask_smorest import Blueprint
from api import postgres_pool, redis_pool, bcrypt
from api.errors import ApiError
from flask_jwt_extended import create_access_token,unset_access_cookies, set_access_cookies
from flask import jsonify
from api.schemas import UserLoginSchema
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
import redis
from datetime import datetime, timezone



blp = Blueprint("User", __name__, url_prefix="/user", description="Operations on user")

@blp.route("/login")
class UserLogin(MethodView):
    @blp.arguments(UserLoginSchema)
    def post(self, user_data):
     
        email = user_data["email"]
        password = user_data["password"]
     
        # Get a database conection from the pool connection
        with postgres_pool.connection() as conn:
            cursor = conn.cursor()

            # Verify if the user indeed exist in the database
            cursor.execute("SELECT password_hash, id FROM public.users WHERE email = %s", (email,))

            # fetch a row from the cursor object
            single_row=cursor.fetchone()

        # At the end of the `connection()` context, the transaction is committed
        # or rolled back, and the connection returned to the pool

        #if single_row is not empty, 
        if single_row:
            
            if bcrypt.check_password_hash(single_row[0], password):

                user_id=single_row[1]
                access_token = create_access_token(identity=user_id)

                response = jsonify({"message": "Login successful", "code": 200})
                # se inserta el token en la cookie HttpOnly de la respuesta
                set_access_cookies(response, access_token)

                return response, 200
               
            # si no cumple, retornar mensaje 
            else:
                raise ApiError(status_code= 401, message="Invalid credentials.",error_code="INVALID_CREDENTIALS")
        else:
            raise ApiError(status_code= 401, message="Invalid credentials.", error_code="INVALID_CREDENTIALS")
            


@blp.route("/logout")
class UserLogin(MethodView):
    @jwt_required()
    def post(self):
        token = get_jwt()
    
        #get the  unique identifier of the current encoded JWT
        jti = token["jti"] 
        ttype = token["type"]

        now = datetime.now(timezone.utc)
        """
        flask-jwt-extended encoded the expritation date of as the sum of the current date in utc timezone
        with a time delta
        https://github.com/vimalloc/flask-jwt-extended/blob/master/flask_jwt_extended/tokens.py#L37
        """
        expiry_date = datetime.fromtimestamp(token['exp'],tz=timezone.utc)
        remaining_expiry_time = expiry_date - now

        # add the uuid of the token as a key to the redis database
        with redis.Redis(connection_pool=redis_pool) as redis_conn:
            redis_conn.set(jti, "", ex=remaining_expiry_time)


        response = jsonify({"message": "logout successful", "code": 200})

        unset_access_cookies(response)

        return response, 200


@blp.route("/get")
class UserGet(MethodView):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()

        # Get a database conection from the pool connection
        with postgres_pool.connection() as conn:
            cursor = conn.cursor()

            # Verify if the user indeed exist in the database
            cursor.execute("SELECT id, email, full_name  FROM public.users WHERE id = %s", (user_id,))

            # fetch a row from the cursor object
            single_row=cursor.fetchone()

        if single_row:

            user_info = {
                "id": single_row[0],
                "email": single_row[1],
                "full_name": single_row[2]
            }

            return jsonify({"message": "User info", "code": 200, "data": user_info}), 200
        
        else:
            raise ApiError(status_code= 404, message="User not found.",error_code="USER_NOT_FOUND")


    
       
