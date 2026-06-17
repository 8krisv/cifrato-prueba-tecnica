import os
import boto3

class StorageService:
    def __init__(self):
        self.provider = os.getenv('STORAGE_PROVIDER', 'local')
        # Carpeta base por defecto
        self.upload_folder = os.getenv('UPLOAD_FOLDER', 'uploads')
        self.s3_bucket = os.getenv('AWS_BUCKET_NAME')

    def save_file(self, file, filename, user_id) -> str:
        if self.provider == 's3':
            return self._save_to_s3(file, filename, user_id)
        else:
            return self._save_to_local(file, filename, user_id)

    def _save_to_local(self, file, filename, user_id) -> str:

        # se crea la ruta base + el ID del usuario (ej: uploads/12345)
        user_folder = os.path.join(self.upload_folder, str(user_id))
        
        # crear la carpeta si no existe
        os.makedirs(user_folder, exist_ok=True)
        
        # se construye la ruta final del archivo
        file_path = os.path.join(user_folder, filename)
        
        # se guarda el archivo
        file.seek(0) 
        file.save(file_path)
        
        return file_path

    def _save_to_s3(self, file, filename, user_id) -> str:
        s3_client = boto3.client('s3')
        file.seek(0)
        # En S3 no existen las "carpetas" reales, pero usar prefijos con "/" simula una estructura de directorios
        s3_key = f"{user_id}/{filename}"
        s3_client.upload_fileobj(file, self.s3_bucket, s3_key)
        
        return f"s3://{self.s3_bucket}/{s3_key}"


    def delete_file(self, file_path_or_uri: str) -> bool:
        """
        Elimina el archivo basándose en la configuración actual.
        Retorna True si fue exitoso o False si hubo un error.
        """
        if self.provider == 's3':
            return self._delete_from_s3(file_path_or_uri)
        else:
            return self._delete_from_local(file_path_or_uri)

    def _delete_from_local(self, file_path: str) -> bool:
        try:
            # os.path.exists verifica que el archivo realmente esté allí
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False # El archivo no existía
        except Exception as e:

            print(f"Error borrando archivo local ({file_path}): {str(e)}")
            return False

    def _delete_from_s3(self, file_uri: str) -> bool:
        try:

            # file_uri suele venir como "s3://mi_bucket/user_id/factura.xml"
            # se extrae únicamente la ruta después del bucket (el S3 Key)
            prefix = f"s3://{self.s3_bucket}/"
            
            if file_uri.startswith(prefix):
                s3_key = file_uri.replace(prefix, "")
            else:
                # Por si acaso la base de datos guardó solo "user_id/factura.xml"
                s3_key = file_uri

            s3_client = boto3.client('s3')
            
            # Nota: delete_object devuelve código HTTP 204 incluso si el archivo no existía previamente, 
            # por lo que no lanzará excepción a menos que haya error de red/permisos.
            s3_client.delete_object(Bucket=self.s3_bucket, Key=s3_key)
            return True
            
        except Exception as e:
            print(f"Error borrando archivo en S3 ({file_uri}): {str(e)}")
            return False