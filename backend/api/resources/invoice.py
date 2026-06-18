from flask.views import MethodView
from flask_smorest import Blueprint
from flask import jsonify, request
from api.services.invoice_processor import calcular_retenciones, clean_raw_xml, extract_invoice_data
import xml.etree.ElementTree as ET
from api.errors import ApiError
from werkzeug.utils import secure_filename
import os
import uuid
from api import postgres_pool, storage
import json
from flask_jwt_extended import jwt_required, get_jwt_identity
from api.schemas import InvoiceUpdateSchema
import math

blp = Blueprint("Invoice", __name__, url_prefix="/invoice", description="Operations on invoices")


@blp.route("/upload")
class InvoiceUpload(MethodView):
    @jwt_required()
    def post(self):

        print("INICIANDO CARGA")
        # verify if the file is in the request
        if 'file' not in request.files:
            raise ApiError(status_code= 400, message="The file was not found in the request", error_code="FILE_NOT_FOUND")
    
        file = request.files['file']
        user_id = get_jwt_identity()

        # Verify if the file has a name
        if file.filename == '':
            raise ApiError(status_code= 400, message="Invalid file format, xml is required", error_code="INVALID_FILE_FORMAT")

        # Get the secure filename and calculate the extension
        filename = secure_filename(file.filename)
        extension = os.path.splitext(filename)[1].lower()


        # verify if the file already exists
        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM public.invoices WHERE file_name = %s", (filename,))
                result = cursor.fetchone()
                if result:
                    raise ApiError(status_code= 409, message="The file already exists", error_code="FILE_ALREADY_EXISTS")
        except ApiError:
            raise
        except Exception as e:
            print("e", e)
            raise ApiError(status_code= 500, message="Error al consultar la base de datos", error_code="DATABASE_ERROR")


        if extension == '.xml':
            
            try:
                # read and clean the xml file to save tokens
                raw_xml = file.read().decode('utf-8')
                clean_xml = clean_raw_xml(raw_xml) 
                # extract the data from the xml file to a structured format
                factura_estructurada = extract_invoice_data(clean_xml)

            except ET.ParseError as e:
                print(f"Error procesando factura: {e}")
                raise ApiError(status_code= 400, message="The XML file is malformed", error_code="MALFORMED_XML")
            except ApiError as e:
                print(f"Error procesando factura: {e}")
                raise
            except Exception as e:
                print(f"Error procesando factura: {e}")
                raise ApiError(status_code= 500, message=f"Error al procesar la factura: {str(e)}", error_code="PROCESSING_ERROR")

        else:
            raise ApiError(status_code= 400, message="Invalid file format, xml is required", error_code="INVALID_FILE_FORMAT")


        # Insert in postgres and save the file
        invoice_id = str(uuid.uuid4())
        
        # Usamos el nombre original (seguro) y el ID del usuario para la carpeta
        file_path = storage.save_file(file, filename, user_id)

        try:

            with postgres_pool.connection() as conn:

                cursor = conn.cursor()

                cursor.execute("""
                    INSERT INTO public.invoices (id, user_id, file_name, file_path, normalized_data, status)
                    VALUES (%s, %s, %s, %s, %s, 'PENDING_VALIDATION')
                    RETURNING id
                """, (invoice_id, user_id, filename, file_path, json.dumps(factura_estructurada)))

                result=cursor.fetchone()
                id_nuevo = result[0]

                if id_nuevo == None:
                    raise ApiError(status_code= 409, message="Error al guardar la factura", error_code="DATABASE_ERROR")

                conn.commit()

        except Exception as e:
            # In case of error, rollback the transaction
            conn.rollback()
            # In case of error, delete the file
            storage.delete_file(file_path)
            print("e", e)
            raise ApiError(status_code= 500, message="Error al guardar la factura", error_code="DATABASE_ERROR")

        
        return jsonify({
            "message": "Archivo extraído, pendiente validación humana",
            "invoice_id": invoice_id,
            "extracted_data": factura_estructurada
        }), 201 

"""
    Endpoint para actualizar el estado a VALIDATED de una factura con ID invoice_id
    cuya información estructurada ha sido validada manualmente como correcta por el usuario
"""

@blp.route("/validate/<string:invoice_id>")
class InvoiceValidate(MethodView):
    @jwt_required()
    def patch(self, invoice_id):
        user_id = get_jwt_identity()

        # Verify if the invoice exists and belongs to the user
        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT status, normalized_data FROM public.invoices WHERE id = %s AND user_id = %s", (invoice_id, user_id))
                result = cursor.fetchone()
                if not result:
                    raise ApiError(status_code= 404, message="The invoice was not found or does not belong to the user", error_code="INVOICE_NOT_FOUND")

                status = result[0]
                normalized_data = result[1]
                

                if status != 'PENDING_VALIDATION':
                    raise ApiError(status_code= 400, message="The invoice is not in PENDING_VALIDATION state", error_code="INVALID_STATE")

                # validar que normalized_data no tengo algun campo vacío o no especificado
                # si tiene algun campo vacío o no especificado, lanzar error
                for key, value in normalized_data.items():
                    if value == "" or value == None or value == "No especificado" or value == []:
                        raise ApiError(status_code= 400, message=f"The invoice data is incomplete, field {key} is empty", error_code="INCOMPLETE_DATA")

                # actualizar el esato a 'VALIDATED'
                cursor.execute("UPDATE public.invoices SET status = 'VALIDATED' WHERE id = %s AND user_id = %s", (invoice_id, user_id))
                conn.commit()
                
        except ApiError:
            raise
        except Exception as e:
            print("e", e)
            raise ApiError(status_code= 500, message="Error al consultar la base de datos", error_code="DATABASE_ERROR")
        

        return jsonify({
            "message": "Invoice validated successfully",
            "invoice_id": invoice_id,
            "status": "VALIDATED"
        }), 200 


"""
    Endpoint para actualizar la información estructurada automaticamente extraida de una 
    factura con ID invoice_id
"""

@blp.route("/update/<string:invoice_id>")
class InvoiceUpdate(MethodView):
    @blp.arguments(InvoiceUpdateSchema)
    @jwt_required()
    def patch(self, update_data, invoice_id):
        user_id = get_jwt_identity()
    
        if len(update_data.keys()) == 0:
            raise ApiError(status_code= 400, message="The invoice data is empty", error_code="INVALID_DATA")

        # verify if the invoice exists and belongs to the user
        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT normalized_data FROM public.invoices WHERE id = %s AND user_id = %s", (invoice_id, user_id))
                result = cursor.fetchone()
                if not result:
                    raise ApiError(status_code= 404, message="The invoice was not found or does not belong to the user", error_code="INVOICE_NOT_FOUND")
        except ApiError:
            raise
        except Exception as e:
            print("e", e)
            raise ApiError(status_code= 500, message="Error al consultar la base de datos", error_code="DATABASE_ERROR")

        normalized_data = result[0]
        

        update_keys = list(update_data.keys())
        for key in update_keys:
            if key not in normalized_data:
                raise ApiError(status_code= 400, message=f"The key {key} does not exist in the invoice data", error_code="INVALID_KEY")
            normalized_data[key] = update_data[key]
        
        # save the updated invoice data
        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE public.invoices SET normalized_data = %s WHERE id = %s", (json.dumps(normalized_data), invoice_id))
                conn.commit()
        except Exception as e:
            conn.rollback()
            print("e", e)
            raise ApiError(status_code= 500, message="Error al actualizar la factura", error_code="DATABASE_ERROR")

        return jsonify({
            "message": "Factura actualizada exitosamente",
            "invoice_id": invoice_id,
            "normalized_data": normalized_data
        }), 200


@blp.route("/delete/<string:invoice_id>")
class InvoiceDelete(MethodView):
    @jwt_required()
    def delete(self,invoice_id):
        user_id = get_jwt_identity()

        # verify if the invoice exists and belongs to the user
        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT file_path FROM public.invoices WHERE id = %s AND user_id = %s", (invoice_id, user_id))
                result = cursor.fetchone()
                if not result:
                    raise ApiError(status_code= 404, message="The invoice was not found or does not belong to the user", error_code="INVOICE_NOT_FOUND")
        except ApiError:
            raise
        except Exception as e:
            print("e", e)
            raise ApiError(status_code= 500, message="Error al consultar la base de datos", error_code="DATABASE_ERROR")

        file_path = result[0]
        storage.delete_file(file_path)

        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM public.invoices WHERE id = %s", (invoice_id,))
                conn.commit()
        except Exception as e:
            conn.rollback()
            print("e", e)
            raise ApiError(status_code= 500, message="Error al eliminar la factura de la base de datos", error_code="DATABASE_ERROR")


        return jsonify({
            "message": "Factura eliminada exitosamente",
            "invoice_id": invoice_id
        }), 200


@blp.route("/get/<string:invoice_id>")
class InvoiceGet(MethodView):
    @jwt_required()
    def get(self,invoice_id):
        user_id = get_jwt_identity()

        # verify if the invoice exists and belongs to the user
        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT file_name, normalized_data, retentions_data, status, created_at, updated_at FROM public.invoices WHERE id = %s AND user_id = %s", (invoice_id, user_id))
                result = cursor.fetchone()
                if not result:
                    raise ApiError(status_code= 404, message="The invoice was not found or does not belong to the user", error_code="INVOICE_NOT_FOUND")
        except ApiError:
            raise
        except Exception as e:
            print("e", e)
            raise ApiError(status_code= 500, message="Error al consultar la base de datos", error_code="DATABASE_ERROR")

        invoice = {
            "file_name": result[0],
            "normalized_data": result[1],
            "retention_data": result[2],
            "status": result[3],
            "created_at": result[4],
            "updated_at": result[5]
        }

        return jsonify({
            "message": "Factura obtenida exitosamente",
            "invoice_id": invoice_id,
            "invoice_data": invoice
        }), 200


"""
    Endpoint para calcular las retenciones de una factura con ID invoice_id
"""
@blp.route("/calculate/<string:invoice_id>")
class InvoiceCalculate(MethodView):
    @jwt_required()
    def patch(self,invoice_id):
        user_id = get_jwt_identity()

        # verify if the invoice exists and belongs to the user
        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT normalized_data ,status FROM public.invoices WHERE id = %s AND user_id = %s", (invoice_id, user_id))
                result = cursor.fetchone()
                if not result:
                    raise ApiError(status_code= 404, message="The invoice was not found or does not belong to the user", error_code="INVOICE_NOT_FOUND")
                
                if result[1] == "PENDING_VALIDATION":
                    raise ApiError(status_code= 400, message="The invoice is not validated", error_code="INVOICE_NOT_VALIDATED")
      
        except ApiError:
            raise
        except Exception as e:
            print("e", e)
            raise ApiError(status_code= 500, message="Error al consultar la base de datos", error_code="DATABASE_ERROR")

        normalized_data = result[0]

        retentions_data = calcular_retenciones(normalized_data)

        # actualizar el campo retentions_data de la factura
        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE public.invoices SET retentions_data = %s, status = 'CALCULATED' WHERE id = %s AND user_id = %s", (json.dumps(retentions_data), invoice_id, user_id))
                conn.commit()
        except ApiError:
            raise
        except Exception as e:
            conn.rollback()
            print("e", e)
            raise ApiError(status_code= 500, message="Error al actualizar la factura", error_code="DATABASE_ERROR")


        return jsonify({
            "message": "Factura calculada exitosamente",
            "invoice_id": invoice_id,
            "status": "CALCULATED",
            "normalized_data": normalized_data,
            "retentions_data": retentions_data
        }), 200


"""
    Endpoint para listar las facturas del usuario con paginación
"""
@blp.route("/list")
class InvoiceList(MethodView):
    @jwt_required()
    def get(self):
        user_id = get_jwt_identity()

        # Se obtiene parámetros de paginación desde el Query String (?page=1&limit=10)
        # Se definen valores por defecto seguros (página 1, 10 ítems por página)
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 10, type=int)

        # se Limita el máximo para proteger la BD
        if limit > 100:
            limit = 100
        if page < 1:
            page = 1

        # se calcula el OFFSET 
        offset = (page - 1) * limit

        try:
            with postgres_pool.connection() as conn:
                cursor = conn.cursor()

                # Se cuenta el total de registros del usuario (para la paginación del frontend)
                cursor.execute(
                    "SELECT COUNT(*) FROM public.invoices WHERE user_id = %s",
                    (user_id,)
                )
                total_items = cursor.fetchone()[0]

                # se trae solo los datos de esta página y ordenados por los más recientes.
                cursor.execute("""
                    SELECT id, file_name, status, created_at, updated_at 
                    FROM public.invoices 
                    WHERE user_id = %s 
                    ORDER BY created_at DESC 
                    LIMIT %s OFFSET %s
                """, (user_id, limit, offset))
                
                records = cursor.fetchall()

        except Exception as e:
            raise ApiError(status_code=500, message="Error al consultar la base de datos", error_code="DATABASE_ERROR")

        # Se formatean los registros a una lista de diccionarios
        invoices_list = []
        for row in records:
            invoices_list.append({
                "id": row[0],
                "file_name": row[1],
                "status": row[2],
                "created_at": row[3],
                "updated_at": row[4]
            })

   
        total_pages = math.ceil(total_items / limit) if total_items > 0 else 1

        return jsonify({
            "message": "Facturas obtenidas exitosamente",
            "metadata": {
                "total_items": total_items,
                "total_pages": total_pages,
                "current_page": page,
                "items_per_page": limit,
                "has_next": page < total_pages,
                "has_previous": page > 1
            },
            "data": invoices_list
        }), 200