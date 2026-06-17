export interface InvoiceNormalizedData {
    base_gravable: number;
    concepto: string;
    fecha_emision: string;
    iva: number;
    nit_comprador: string;
    nit_proveedor: string;
    numero_factura: string;
    regimen_fiscal_comprador: string[];
    regimen_fiscal_proveedor: string[];
    responsabilidad_tributaria_proveedor: string;
    tipo_contribuyente_comprador: string;
    tipo_contribuyente_proveedor: string;
}



export interface InvoiceDetail {
    file_name: string;
    normalized_data: InvoiceNormalizedData;
    retention_data: any;
    status: string;
    created_at: string;
    updated_at: string;
}

