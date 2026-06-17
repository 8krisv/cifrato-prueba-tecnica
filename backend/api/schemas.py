from marshmallow import Schema, fields, validate

CONCEPTOS = [
    "Compras Generales",
    "Servicios Generales",
    "Honorarios y Consultoría"
]

REGIMENES_FISCALES = [
    "O-13",
    "O-15",
    "O-23",
    "O-47",
    "R-99-PN"
]

TIPOS_CONTRIBUYENTE = [
    "Persona Natural",
    "Persona Jurídica"
]

RESPONSABILIDADES_TRIBUTARIAS = [
    "01 - IVA",
    "ZZ - No aplica"
]


class InvoiceUpdateSchema(Schema):
    iva = fields.Float(required=False)

    concepto = fields.Str(
        required=False,
        validate=validate.OneOf(CONCEPTOS)
    )

    base_gravable = fields.Float(required=False)

    fecha_emision = fields.Str(
        required=False,
        validate=validate.Regexp(r'^\d{4}-\d{2}-\d{2}$', error="El formato de fecha debe ser AAAA-MM-DD")
    )

    nit_comprador = fields.Str(required=False)
    nit_proveedor = fields.Str(required=False)
    numero_factura = fields.Str(required=False)

    regimen_fiscal_comprador = fields.List(
        fields.Str(validate=validate.OneOf(REGIMENES_FISCALES)),
        required=False
    )

    regimen_fiscal_proveedor = fields.List(
        fields.Str(validate=validate.OneOf(REGIMENES_FISCALES)),
        required=False
    )

    tipo_contribuyente_comprador = fields.Str(
        required=False,
        validate=validate.OneOf(TIPOS_CONTRIBUYENTE)
    )

    tipo_contribuyente_proveedor = fields.Str(
        required=False,
        validate=validate.OneOf(TIPOS_CONTRIBUYENTE)
    )

    responsabilidad_tributaria_proveedor = fields.Str(
        required=False,
        validate=validate.OneOf(RESPONSABILIDADES_TRIBUTARIAS)
    )

class UserLoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True)

