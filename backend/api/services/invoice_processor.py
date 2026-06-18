
from pydantic import BaseModel, Field
from typing import List
from enum import Enum
import xmltodict
import json
import api
from api.errors import ApiError
import re
from flask import current_app
import re
from pydantic import create_model
import threading

# Semáforo global para serializar las llamadas a OpenAI
# Evita que múltiples uploads simultáneos excedan el rate limit de TPM
_openai_semaphore = threading.Semaphore(1)

def clean_raw_xml(xml_string: str) -> str:
    """
    delete the cryptographic extensions of the XML to reduce its size
    by up to 80% and avoid confusing the AI, saving tokens.
    """
    cleaned_xml = re.sub(
        r'<ext:UBLExtensions>.*?</ext:UBLExtensions>', 
        '', 
        xml_string, 
        flags=re.DOTALL
    )
    return cleaned_xml


class CategoriaTributaria(str, Enum):
    COMPRAS = "Compras Generales"
    SERVICIOS = "Servicios Generales"
    HONORARIOS = "Honorarios y Consultoría"

class TipoContribuyente(str, Enum):
    PERSONA_JURIDICA = "Persona Jurídica"
    PERSONA_NATURAL = "Persona Natural"
    NO_ESPECIFICADO = "No especificado"

class ResponsabilidadTributaria(str, Enum):
    IVA = "01 - IVA"
    NO_APLICA = "ZZ - No Aplica"
    NO_ESPECIFICADO = "No especificado"

class RegimenFiscal(str, Enum):
    GRAN_CONTRIBUYENTE = "O-13"
    AUTORRETENEDOR = "O-15"
    AGENTE_RETENCION_IVA = "O-23"
    REGIMEN_SIMPLE = "O-47"
    ORDINARIO = "R-99-PN"



CAMPOS_DEFINICIONES = {
    "numero_factura": (str, Field(
        description=(
            "El prefijo y número alfanumérico de la factura (ej: FEAM168587, P-12206)."
            "Identifícalo visualmente como 'Número de Factura', 'Nro', o 'Folio'. "
            "IMPORTANTE: Si no logras encontrar el número en el documento, devuelve SIEMPRE 'No especificado'."
        )
    )),
    "fecha_emision": (str, Field(
        description=(
            "La fecha en la que se emitió la factura. Debe estar en formato ISO 8601 (YYYY-MM-DD). "
            "Busca la fecha de expedición o emisión. "
            "IMPORTANTE: Si no logras encontrar la fecha en el documento, devuelve SIEMPRE 'No especificado'."
        )
    )),
    "tipo_contribuyente_proveedor": (TipoContribuyente, Field(
        description=(
            "Clasificación jurídica del proveedor, es decir si es una Persona Jurídica o Persona Natural."
            "Infiérelo a partir del nombre comercial (ej. si termina en S.A.S., S.A., o LTDA es Persona Jurídica). Si no es claro, devuelve 'No especificado'."
        )
    )),
    "nit_proveedor": (str, Field(
        description=(
            "Numero de Identificación (NIT, Cedula de ciudadanía, Cedula de extranjería etc.) del emisor/vendedor." 
            "Si es NIT extráelo siempre SIN guiones y SIN el dígito de verificación final." 
            "Si no logras encontrar el numero de identificación en el documento, devuelve SIEMPRE 'No especificado'."
        )
    )),
    "regimen_fiscal_proveedor": (List[RegimenFiscal], Field(
        description=(
            "Responsabilidades fiscales especiales del Emisor/Vendedor"
            "Esta etiqueta suele tener valores separados por punto y coma (ej: 'O-13;O-15')."
            "Extrae los códigos que coincidan con: 'O-13', 'O-15', 'O-23', 'O-47'. "
            "REGLA DE ORO: Si no encuentras NINGUNO de los códigos 'O-' anteriores, o si la etiqueta dice 'R-99-PN', "
            "devuelve SIEMPRE una lista con el valor por defecto: ['R-99-PN']. NUNCA devuelvas una lista vacía si hay información del proveedor."
        )
    )),
    "responsabilidad_tributaria_proveedor": (ResponsabilidadTributaria, Field(
        description=(
            "Indica si el Emisor/Vendedor es responsable del impuesto sobre las ventas (IVA). "
            "Si el proveedor cobra IVA en los totales o dice 'Responsable de IVA', devuelve '01 - IVA'."
            "Si el documento dice explícitamente 'No responsable de IVA' o similar, devuelve 'ZZ - No Aplica'. "
            "IMPORTANTE: Si hay cobro de IVA en la factura y el documento no menciona nada sobre responsabilidades, devuelve '01 - IVA'."
        )
    )),
    "tipo_contribuyente_comprador": (TipoContribuyente, Field(
        description=(
            "Clasificación jurídica del cliente/adquirente (Persona Jurídica o Persona Natural)"
            "Aplica estrictamente las siguientes reglas: "
            "REGLA 1: Si la factura incluye el cobro del impuesto 'INC' (Impuesto Nacional al Consumo) en los totales o líneas, asume que el comprador es el consumidor final y devuelve SIEMPRE 'Persona Natural'. "
            "REGLA 2: Si el nombre del comprador es 'Consumidor Final', 'Cuantías Menores', devuelve SIEMPRE 'Persona Natural'. "
            "REGLA 3: Infiérelo a partir del nombre comercial (ej. si termina en S.A.S., S.A., o LTDA es 'Persona Jurídica'). "
            "IMPORTANTE: Si no es claro, devuelve 'No especificado'."
        )
    )),
    "nit_comprador": (str, Field(
        description=(
            "Numero de Identificación (NIT, Cedula de ciudadanía, Cedula de extranjería etc.) del cliente/adquirente." 
            "Si es NIT extráelo siempre SIN guiones y SIN el dígito de verificación final." 
            "Si no logras encontrar el numero de identificación en el documento, devuelve SIEMPRE 'No especificado'."
        )
    )),
    "regimen_fiscal_comprador": (List[str], Field(
        description=(
           "Responsabilidades fiscales especiales del cliente/adquirente"
            "Esta etiqueta suele tener valores separados por punto y coma (ej: 'O-13;O-15')."
            "Extrae los códigos que coincidan con: 'O-13', 'O-15', 'O-23', 'O-47'. "
            "REGLA DE ORO: Si no encuentras NINGUNO de los códigos 'O-' anteriores, o si la etiqueta dice 'R-99-PN', "
            "devuelve SIEMPRE una lista con el valor por defecto: ['R-99-PN']. NUNCA devuelvas una lista vacía si hay información del proveedor."
        )
    )),
    "base_gravable": (float, Field(
        description=(
            "El subtotal de la factura o base imponible ANTES de impuestos. Debe ser estrictamente numérico. "
            "Busca el 'Subtotal' o valor bruto de la factura antes de aplicar el IVA, descuentos u otros tributos."
        )
    )),
    "iva": (float, Field(
        description=(
            "Valor monetario total del impuesto IVA generado en la factura. "
            "Monto total del recargo por IVA. Si la factura no cobra IVA, cobra Impoconsumo (INC), o es exenta, devuelve exactamente 0.0."
        )
    )),
    "concepto": (CategoriaTributaria, Field(
        description=(
            "Analiza detalladamente la descripción de los artículos o servicios cobrados en la factura. "
            "1. 'Compras Generales': Si son bienes físicos, productos tangibles, repuestos, mercancía, hardware, etc. "
            "2. 'Servicios Generales': Si son labores manuales, alquileres, arrendamientos, transporte, parqueaderos, restaurantes, aseo, mantenimiento, seguros. "
            "3. 'Honorarios y Consultoría': Si son servicios intelectuales, profesionales, contabilidad, derecho, desarrollo de software, consultoría médica o ingeniería. "
            "Si hay varios, escoge la categoría del ítem de mayor valor."
        )
    ))
}


def obtener_valor_anidado(diccionario, rutas, valor_por_defecto=None):
    for llave in rutas:
        if isinstance(diccionario, dict) and llave in diccionario:
            diccionario = diccionario[llave]
        else:
            return valor_por_defecto

    if "#text" in diccionario:
        diccionario=diccionario["#text"]

    return diccionario


def validar_tipo_contribuyente(tipo_contribuyente) -> str:
    if tipo_contribuyente == "1":
        return "Persona Jurídica"
    elif tipo_contribuyente == "2":
        return "Persona Natural"
    else:
        return "No especificado"

def validar_campo_vacio(campo) -> str:
    if campo == "" or campo is None:
        return "No especificado"
    else:
        return campo

def validar_responsabilidad_tributaria(tax_scheme_id, tax_scheme_name) -> str:
    if tax_scheme_id is not None and tax_scheme_name is not None:
        return f"{tax_scheme_id} - {tax_scheme_name}"
    else:
        return "No especificado"


def convert_float_or_string(valor):
    try:
        return float(valor)
    except (ValueError, TypeError):
        return valor

        

def extract_invoice_data(clean_xml: str) -> dict:

    # Convertir XML a JSON string 
    # para que OpenAI consuma menos tokens y lo entienda más rápido
    xml_dict = xmltodict.parse(clean_xml)
    factura_reducida = json.dumps(xml_dict)


    # identificar si el xml es una factura DIAN con estructura conocida 
    # para extraer los datos de forma nativa sin usar OpenAI
    if 'Invoice' in xml_dict:
        invoice = xml_dict['Invoice']
        ubl_version = invoice.get('cbc:UBLVersionID', "")
        profile_id = invoice.get('cbc:ProfileID', "")
        if ubl_version == "UBL 2.1" and profile_id == "DIAN 2.1: Factura Electrónica de Venta":

            numero_factura = validar_campo_vacio(invoice.get('cbc:ID', ""))
            fecha_emision = validar_campo_vacio(invoice.get('cbc:IssueDate', ""))
            tipo_contribuyente_proveedor = validar_tipo_contribuyente(obtener_valor_anidado(invoice, ['cac:AccountingSupplierParty', "cbc:AdditionalAccountID"]))            
            nit_proveedor = validar_campo_vacio(obtener_valor_anidado(invoice, ['cac:AccountingSupplierParty', "cac:Party","cac:PartyLegalEntity","cbc:CompanyID"]))
            regimen_fiscal_proveedor = re.split(r'[;,]',validar_campo_vacio(obtener_valor_anidado(invoice, ['cac:AccountingSupplierParty', "cac:Party","cac:PartyTaxScheme","cbc:TaxLevelCode"])))
            tax_scheme_id = obtener_valor_anidado(invoice, ['cac:AccountingSupplierParty', "cac:Party","cac:PartyTaxScheme","cac:TaxScheme","cbc:ID"])
            tax_scheme_name = obtener_valor_anidado(invoice, ['cac:AccountingSupplierParty', "cac:Party","cac:PartyTaxScheme","cac:TaxScheme","cbc:Name"])
            responsabilidad_tributaria_proveedor = validar_responsabilidad_tributaria(tax_scheme_id, tax_scheme_name)
            tipo_contribuyente_comprador = validar_tipo_contribuyente(obtener_valor_anidado(invoice, ['cac:AccountingCustomerParty', "cbc:AdditionalAccountID"]))
            nit_comprador = validar_campo_vacio(obtener_valor_anidado(invoice, ['cac:AccountingCustomerParty', "cac:Party","cac:PartyLegalEntity","cbc:CompanyID"]))
            regimen_fiscal_comprador = re.split(r'[;,]',validar_campo_vacio(obtener_valor_anidado(invoice, ['cac:AccountingCustomerParty', "cac:Party","cac:PartyTaxScheme","cbc:TaxLevelCode"])))
            base_gravable = convert_float_or_string(validar_campo_vacio(obtener_valor_anidado(invoice, ['cac:TaxTotal', "cac:TaxSubtotal","cbc:TaxableAmount"])))
            iva = convert_float_or_string(validar_campo_vacio(obtener_valor_anidado(invoice, ['cac:TaxTotal', "cac:TaxSubtotal","cbc:TaxAmount"])))
         
            factura_estructurada={
                "numero_factura": numero_factura,
                "fecha_emision": fecha_emision,
                "tipo_contribuyente_proveedor": tipo_contribuyente_proveedor,
                "nit_proveedor": nit_proveedor,
                "regimen_fiscal_proveedor": regimen_fiscal_proveedor,
                "responsabilidad_tributaria_proveedor": responsabilidad_tributaria_proveedor,
                "tipo_contribuyente_comprador": tipo_contribuyente_comprador,
                "nit_comprador": nit_comprador,
                "regimen_fiscal_comprador": regimen_fiscal_comprador,
                "base_gravable": base_gravable,
                "iva": iva,
            }

           # se identifican los campos que fallaron (están como "No especificado" o vacíos)
            campos_para_modelo_dinamico = {}

            for key, value in factura_estructurada.items():
                # Validamos si falló (texto vacío, "No especificado", o lista vacía en régimen fiscal)
                if value == "No especificado" or value == "" or value == []:
                    campos_para_modelo_dinamico[key] = CAMPOS_DEFINICIONES[key]


            # Siempre se necesita extraer el concepto por IA
            campos_para_modelo_dinamico["concepto"] = CAMPOS_DEFINICIONES["concepto"]


            FacturaDinamica = create_model('FacturaDinamica', **campos_para_modelo_dinamico)
 
           
            # intenta calcular por IA si falla el mapeo directo de los campos en el XML
            with _openai_semaphore:
                try:
                    completion = api.openai_client.beta.chat.completions.parse(
                        model="gpt-4o", # O también se puede usar gpt-4o-mini que es más barato
                        messages=[
                            {
                                "role": "system", 
                                "content": (
                                    "Eres un contador experto en Colombia. "
                                    "Analiza la siguiente factura y extrae ÚNICAMENTE "
                                    "los datos solicitados en el esquema con precisión absoluta."
                                )
                            },
                            {"role": "user", "content": f"Extrae los datos de esta factura: {factura_reducida}"}
                        ],
                        response_format=FacturaDinamica, #  se inyecta la clase generada al vuelo
                        temperature=0.0
                    )
                
                except Exception as e:
                    raise ApiError(status_code=500, message=f"Error al procesar la factura con IA: {str(e)}", error_code="ERROR_PROCESSING_INVOICE")


            # Se extrae los resultados devueltos por la IA en forma de diccionario
            datos_recuperados_por_ia = completion.choices[0].message.parsed.model_dump()
            
            # Se actualiza el diccionario nativo con los datos recuperados
            for key, valor_ia in datos_recuperados_por_ia.items():
                factura_estructurada[key] = valor_ia

            return factura_estructurada


    else:

        # si la factura no se un formato conocido se intenta extraer todos los campor usando IA
        FacturaCompleta = create_model('FacturaCompleta', **CAMPOS_DEFINICIONES)
        with _openai_semaphore:
            try:
                completion = api.openai_client.beta.chat.completions.parse(
                    model="gpt-4o", 
                    messages=[
                        {
                            "role": "system", 
                            "content": (
                                "Eres un contador experto en Colombia. "
                                "Analiza la siguiente factura y extrae ÚNICAMENTE "
                                "los datos solicitados en el esquema con precisión absoluta."
                            )
                        },
                        {"role": "user", "content": f"Extrae los datos de esta factura: {factura_reducida}"}
                    ],
                    response_format=FacturaCompleta, 
                    temperature=0.0
                )
            except Exception as e:
                raise ApiError(status_code=500, message=f"Error al procesar la factura con IA: {str(e)}", error_code="ERROR_PROCESSING_INVOICE")


        # se extraes el objeto de Python 
        factura_estructurada = completion.choices[0].message.parsed
        
        # se convierte a diccionario para guardarlo en la base de datos
        return factura_estructurada.model_dump()



def calcular_retenciones(factura_extraida):
    """
    factura_extraida es el JSON 
    """

    subtotal = factura_extraida.get("base_gravable", 0)
    iva = factura_extraida.get("iva", 0)
    concepto = factura_extraida.get("concepto") # Ej: "compras"

    año_emision=factura_extraida.get("fecha_emision").split("-")[0]
    
    tipo_contribuyente_proveedor = factura_extraida.get("tipo_contribuyente_proveedor") 
    tipo_contribuyente_comprador = factura_extraida.get("tipo_contribuyente_comprador") 
    
    regimen_proveedor = factura_extraida.get("regimen_fiscal_proveedor",[]) # Ej: ["O-48"]
    regimen_comprador = factura_extraida.get("regimen_fiscal_comprador",[]) # Ej: ["O-48"]
   
    responsabilidad_proveedor = factura_extraida.get("responsabilidad_tributaria_proveedor", 'ZZ - No Aplica') 
    
    is_proveedor_declarante_renta = (tipo_contribuyente_proveedor == "PERSONA_JURIDICA")

    is_comprador_agente_retenedor = '0-23' in regimen_comprador
    is_proveedor_agente_retenedor = '0-23' in regimen_proveedor

    is_proveedor_responsable_iva = responsabilidad_proveedor == "01 - IVA"

    is_comprador_gran_contribuyente = "O-13" in regimen_comprador
    is_proveedor_gran_contribuyente = "O-13" in regimen_proveedor

    is_proveedor_regimen_simple = "O-47" in regimen_proveedor
    is_proveedor_autorretenedor = '0-15' in regimen_proveedor


    valor_uvt = current_app.config["VALOR_UVT"].get(año_emision, 52374)

    
    resultados = {
        "reterenta": 0.0,
        "reteiva": 0.0,
        "reteica": 0.0, # Lo dejamos en 0 por defecto territorial
        "justificaciones": []
    }

    aplica_reterenta = True
    aplica_reteiva = True
    aplica_reteica = True


    # --- 1. EARLY RETURNS (Excepciones Absolutas) ---


    """
    Regla 1: Identificación del Sujeto.

    ¿Quién practica la retención? El comprador (sujeto adquiriente de la operación).

    Por defecto: Si el comprador es una Persona Natural no comerciante, 
    que no cumple los topes de ingresos brutos, y por lo tanto, no es 
    gran contribuyente (O-13), no se le practica retención.
   
    """

    print("tipo_contribuyente_comprador", tipo_contribuyente_comprador)
    print("is_comprador_gran_contribuyente", is_comprador_gran_contribuyente)

    if tipo_contribuyente_comprador == "Persona Natural" and not is_comprador_gran_contribuyente:
        resultados["justificaciones"].append("Reterenta $0: Comprador Persona Natural no es gran Contribuyente (O-13).")
        resultados["justificaciones"].append("ReteIVA $0: Comprador Persona Natural no es gran Contribuyente (O-13).")
        resultados["justificaciones"].append("ReteICA $0: Comprador Persona Natural no es gran Contribuyente (O-13).")
        return resultados


    """
        Regla 2: Exenciones del Proveedor 

        -Si el proveedor pertenece al regimen autorretenedor  "O-15" 
        no se aplica la retencion de la renta, ni la reteica, ni la reteiva
        
        -Si el proveedor pertenece al regimen simple de tributacion  "O-47" 
        no se aplica la retencion de la renta ni la reteica.
      
    """

    if is_proveedor_autorretenedor:
        resultados["justificaciones"].append("ReteRenta $0: Proveedor Autorretenedor (O-15).")
        resultados["justificaciones"].append("ReteICA $0: Proveedor Autorretenedor (O-15).")
        resultados["justificaciones"].append("ReteIVA $0: Proveedor Autorretenedor (O-15).")
        return resultados

    elif is_proveedor_regimen_simple:
        aplica_reterenta = False
        aplica_reteica= False
        resultados["justificaciones"].append("ReteRenta $0: Proveedor Régimen Simple (O-47).")
        resultados["justificaciones"].append("ReteICA $0: Proveedor Régimen Simple (O-47).")

  
    """
        Regla 3: de Retención de IVA

        - Solo el comprador que tenga la calidad de Agente de Retención de IVA
        designado por la DIAN ('0-23') está obligado a aplicar esta retención, no obstante,
        si el comprador es UN gran contribuyente esta obligados por ley
        a practicar retención del IVA, independientemente de si ellos mismos 
        son responsables o no de este impuesto.


        - El proveedor debe estar incluido dentro de los responsables del impuesto
        sobre las ventas IVA (Responsabilidad 01).

        - Si el comprador y el vendedor son ambos agentes retenedores de IVA 
        o grandes contribuyentes, entonces no se aplica la retención entre iguales, exepto:
           
            - si el proveedor pertenece al regimen simple de tributacion (0-47), lo cual implica que no es un gran
            contribuyente (0-13) pero si puede ser agente retenedor de iva (0-23), el comprador debe practicarle 
            por ley la retención del IVA, rompiendo la regla de no retención mutua

    """
    if not is_comprador_agente_retenedor and not is_comprador_gran_contribuyente:
        aplica_reteiva = False
        resultados["justificaciones"].append("ReteIVA $0: Comprador no es agente de retención de IVA (0-23) y no es gran contribuyente (O-13).")

    elif not is_proveedor_responsable_iva:
        aplica_reteiva = False
        resultados["justificaciones"].append("ReteIVA $0: El proveedor no es responsable de IVA (01 - IVA).")
    
    elif (is_comprador_agente_retenedor or is_comprador_gran_contribuyente) and (is_proveedor_agente_retenedor or is_proveedor_gran_contribuyente ):
        if not is_proveedor_regimen_simple:
            aplica_reteiva = False
            resultados["justificaciones"].append("ReteIVA $0: El Proveedor y el Comprador son ambos agentes retenedores de IVA (0-23) o grandes contribuyentes (O-13) y el Proveedor no es régimen simple (0-47).")
        

    # --- 2. EVALUACIÓN DE RETERENTA ---
    if aplica_reterenta:
        regla = current_app.config["TAX_CONFIG"]["REGLAS_RETEFUENTE"].get(concepto)
        if regla:
            tope_pesos = regla["tope_uvt"] * valor_uvt
            
            if subtotal >= tope_pesos:
                resultados["reterenta"] = subtotal * regla["tarifa"]
                resultados["justificaciones"].append(
                    f"ReteRenta {regla['tarifa']*100}% aplicada: La base ({subtotal} COP) superó {regla['tope_uvt']} UVT ({tope_pesos} COP), valor UVT {valor_uvt} COP. para el año {año_emision}"
                )
            else:
                resultados["justificaciones"].append(
                    f"ReteRenta $0: La base ({subtotal} COP) no supera el tope de {regla['tope_uvt']} UVT ({tope_pesos} COP), valor UVT {valor_uvt} COP. para el año {año_emision}"
                )
        else:
            resultados["justificaciones"].append("Concepto no identificado para retención.")


    # --- 3. EVALUACIÓN DE RETEIVA ---
    if aplica_reteiva:
        resultados["reteiva"] = iva * current_app.config["TAX_CONFIG"]["TARIFA_RETEIVA"]
        resultados["justificaciones"].append("ReteIVA 15% aplicado sobre el impuesto generado.")

    # --- 4. EVALUACIÓN DE RETEICA ---
    resultados["justificaciones"].append("ReteICA $0: Pendiente parametrización de tarifa municipal (por mil) entre la ciudad origen y destino.")

    print("resultados", resultados)
    return resultados