import { api } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InvoiceDetail } from '@/types/invoice';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Loader2, Receipt, Edit2, Save, Calculator, CheckCircle, Clock, AlertTriangle, Info } from "lucide-react";
import { useState, useEffect, useMemo } from 'react';
import type { InvoiceNormalizedData } from '@/types/invoice';


// ============================================================
// Constantes del esquema de validación (espejo del backend)
// ============================================================
const CONCEPTOS = [
    "Compras Generales",
    "Servicios Generales",
    "Honorarios y Consultoría",
];

const REGIMENES_FISCALES = ["O-13", "O-15", "O-23", "O-47", "R-99-PN"];

const TIPOS_CONTRIBUYENTE = ["Persona Natural", "Persona Jurídica"];

const RESPONSABILIDADES_TRIBUTARIAS = ["01 - IVA", "ZZ - No aplica"];

const NO_ESPECIFICADO = "No especificado";

// ============================================================
// Componentes helper para los campos del formulario
// ============================================================

/** Campo de texto / número / fecha libre */
function TextField({ label, value, isEditing, onChange, type = "text" }: {
    label: string; value: any; isEditing: boolean; onChange: (v: string) => void; type?: string;
}) {
    const isInvalid = String(value) === NO_ESPECIFICADO;
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
            <span className="text-slate-500 text-sm min-w-[140px]">{label}:</span>
            {isEditing ? (
                <input
                    type={type}
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    className={`flex-1 bg-slate-50 border rounded px-2.5 py-1.5 text-slate-900 text-sm focus:outline-none transition-colors ${isInvalid ? 'border-red-400 focus:border-red-500 bg-red-50/50' : 'border-slate-200 focus:border-emerald-500'}`}
                />
            ) : (
                <span className={`font-medium text-sm text-right ${isInvalid ? 'text-red-500 italic' : 'text-slate-900'}`}>
                    {type === 'number' ? `$${Number(value).toLocaleString()}` : value}
                </span>
            )}
        </div>
    );
}

/** Campo con select (dropdown) restringido a opciones fijas */
function SelectField({ label, value, isEditing, onChange, options }: {
    label: string; value: string; isEditing: boolean; onChange: (v: string) => void; options: string[];
}) {
    const isInvalid = value === NO_ESPECIFICADO;
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
            <span className="text-slate-500 text-sm min-w-[140px]">{label}:</span>
            {isEditing ? (
                <select
                    value={options.includes(value) ? value : ''}
                    onChange={(e) => onChange(e.target.value)}
                    className={`flex-1 bg-slate-50 border rounded px-2.5 py-1.5 text-slate-900 text-sm focus:outline-none cursor-pointer transition-colors ${isInvalid || !options.includes(value) ? 'border-red-400 focus:border-red-500 bg-red-50/50' : 'border-slate-200 focus:border-emerald-500'}`}
                >
                    {!options.includes(value) && (
                        <option value="" disabled>— Seleccionar —</option>
                    )}
                    {options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            ) : (
                <span className={`font-medium text-sm text-right ${isInvalid ? 'text-red-500 italic' : 'text-slate-900'}`}>
                    {value}
                </span>
            )}
        </div>
    );
}

/** Campo multi-select con chips/tags para los regímenes fiscales */
function MultiSelectField({ label, values, isEditing, onChange, options }: {
    label: string; values: string[]; isEditing: boolean; onChange: (v: string[]) => void; options: string[];
}) {
    const hasInvalid = !values || values.length === 0 || values.some(v => v === NO_ESPECIFICADO);

    const toggleOption = (opt: string) => {
        if (values.includes(opt)) {
            onChange(values.filter(v => v !== opt));
        } else {
            onChange([...values, opt]);
        }
    };

    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-slate-500 text-sm">{label}:</span>
            {isEditing ? (
                <div className="flex flex-wrap gap-1.5">
                    {options.map(opt => {
                        const isSelected = values?.includes(opt);
                        return (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => toggleOption(opt)}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${isSelected
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300 shadow-sm'
                                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                                    }`}
                            >
                                {isSelected && <span className="mr-1">✓</span>}
                                {opt}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <span className={`font-medium text-sm ${hasInvalid ? 'text-red-500 italic' : 'text-slate-900'}`}>
                    {values && values.length > 0 ? values.join(', ') : NO_ESPECIFICADO}
                </span>
            )}
        </div>
    );
}


// ============================================================
// Props del modal
// ============================================================
interface InvoiceModalProps {
    invoiceId: string;
    onClose: () => void;
}


// ============================================================
// Componente principal
// ============================================================
function InvoiceModal({ invoiceId, onClose }: InvoiceModalProps) {

    const queryClient = useQueryClient();

    // --- Data Fetching ---
    const { data: invoiceDetail, isLoading: isLoadingDetail } = useQuery<InvoiceDetail>({
        queryKey: ['invoices', 'detail', invoiceId],
        queryFn: async () => {
            const response = await api.get(`/invoice/get/${invoiceId}`);
            return response.data.invoice_data;
        },
    });

    // --- Mutations ---
    const updateMutation = useMutation({
        mutationFn: (data: InvoiceNormalizedData) => api.patch(`/invoice/update/${invoiceId}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            setIsEditing(false);
        }
    });

    const validateMutation = useMutation({
        mutationFn: () => api.patch(`/invoice/validate/${invoiceId}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] })
    });

    const calculateMutation = useMutation({
        mutationFn: () => api.patch(`/invoice/calculate/${invoiceId}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] })
    });

    const isAnyActionPending = updateMutation.isPending || validateMutation.isPending || calculateMutation.isPending;

    // --- Edit State ---
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<InvoiceNormalizedData | null>(null);

    useEffect(() => {
        if (invoiceDetail) {
            setEditData(invoiceDetail.normalized_data);
        }
    }, [invoiceDetail]);

    // --- Validación: ¿se puede aprobar? ---
    const validationErrors = useMemo(() => {
        if (!editData) return [];
        const errors: string[] = [];
        const data = invoiceDetail?.normalized_data ?? editData;

        if (!data.numero_factura || data.numero_factura === NO_ESPECIFICADO) errors.push("Nº Factura");
        if (!data.fecha_emision || data.fecha_emision === NO_ESPECIFICADO) errors.push("Fecha Emisión");
        if (!data.concepto || data.concepto === NO_ESPECIFICADO || !CONCEPTOS.includes(data.concepto)) errors.push("Concepto");
        if (data.base_gravable == null || data.base_gravable === 0) errors.push("Base Gravable");
        if (data.iva == null) errors.push("IVA");
        if (!data.nit_proveedor || data.nit_proveedor === NO_ESPECIFICADO) errors.push("NIT Proveedor");
        if (!data.nit_comprador || data.nit_comprador === NO_ESPECIFICADO) errors.push("NIT Comprador");
        if (!data.tipo_contribuyente_proveedor || data.tipo_contribuyente_proveedor === NO_ESPECIFICADO) errors.push("Tipo Contribuyente Proveedor");
        if (!data.tipo_contribuyente_comprador || data.tipo_contribuyente_comprador === NO_ESPECIFICADO) errors.push("Tipo Contribuyente Comprador");
        if (!data.responsabilidad_tributaria_proveedor || data.responsabilidad_tributaria_proveedor === NO_ESPECIFICADO) errors.push("Responsabilidad Tributaria");
        if (!data.regimen_fiscal_proveedor || data.regimen_fiscal_proveedor.length === 0 || data.regimen_fiscal_proveedor.some(r => r === NO_ESPECIFICADO)) errors.push("Régimen Fiscal Proveedor");
        if (!data.regimen_fiscal_comprador || data.regimen_fiscal_comprador.length === 0 || data.regimen_fiscal_comprador.some(r => r === NO_ESPECIFICADO)) errors.push("Régimen Fiscal Comprador");

        return errors;
    }, [editData, invoiceDetail]);

    const canApprove = validationErrors.length === 0;

    // --- Status Badge ---
    const formatStatus = (status: string) => {
        switch (status) {
            case 'PENDING_VALIDATION':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 shadow-sm"><Clock className="w-3.5 h-3.5 text-amber-500" /> Pendiente Validación</span>;
            case 'VALIDATED':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 shadow-sm"><CheckCircle className="w-3.5 h-3.5 text-blue-500" /> Validada</span>;
            case 'CALCULATED':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm"><Calculator className="w-3.5 h-3.5 text-emerald-500" /> Retenciones Calculadas</span>;
            default:
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 shadow-sm">{status}</span>;
        }
    };


    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
            <Card className="w-full max-w-4xl max-h-[90vh] bg-slate-50 border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header Modal */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-white">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-emerald-600" />
                            Detalle de Factura
                        </h2>
                        {invoiceDetail && (
                            <p className="text-sm text-slate-500 mt-1">Nº {invoiceDetail.normalized_data.numero_factura}</p>
                        )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer">
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Contenido Modal */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoadingDetail ? (
                        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                            <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
                            <p>Obteniendo datos estructurados...</p>
                        </div>
                    ) : invoiceDetail && editData ? (
                        <div className="space-y-6">
                            {/* Status + Botón Corregir */}
                            <div className="flex justify-between items-center">
                                <div className="flex gap-3">
                                    {formatStatus(invoiceDetail.status)}
                                </div>
                                {invoiceDetail.status === 'PENDING_VALIDATION' && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                        onClick={() => setIsEditing(!isEditing)}
                                    >
                                        {isEditing ? <><X className="w-4 h-4 mr-2" /> Cancelar</> : <><Edit2 className="w-4 h-4 mr-2" /> Corregir Datos</>}
                                    </Button>
                                )}
                            </div>

                            {/* Alerta de campos incompletos */}
                            {invoiceDetail.status === 'PENDING_VALIDATION' && !canApprove && !isEditing && (
                                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                                    <div>
                                        <p className="font-semibold">No se puede aprobar esta factura</p>
                                        <p className="mt-0.5 text-amber-700">Los siguientes campos requieren corrección: <span className="font-medium">{validationErrors.join(', ')}</span></p>
                                    </div>
                                </div>
                            )}

                            {/* Grid de datos */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Columna Izquierda */}
                                <div className="space-y-4">
                                    <div className="bg-white rounded-xl p-5 border border-slate-200">
                                        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Información General
                                        </h3>
                                        <div className="space-y-3">
                                            <TextField label="Nº Factura" value={editData.numero_factura} isEditing={isEditing}
                                                onChange={(v) => setEditData({ ...editData, numero_factura: v })} />
                                            <TextField label="Fecha Emisión" value={editData.fecha_emision} isEditing={isEditing} type="date"
                                                onChange={(v) => setEditData({ ...editData, fecha_emision: v })} />
                                            <SelectField label="Concepto" value={editData.concepto} isEditing={isEditing} options={CONCEPTOS}
                                                onChange={(v) => setEditData({ ...editData, concepto: v })} />
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl p-5 border border-slate-200">
                                        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div> Comprador
                                        </h3>
                                        <div className="space-y-3">
                                            <TextField label="NIT" value={editData.nit_comprador} isEditing={isEditing}
                                                onChange={(v) => setEditData({ ...editData, nit_comprador: v })} />
                                            <SelectField label="Tipo Contribuyente" value={editData.tipo_contribuyente_comprador} isEditing={isEditing} options={TIPOS_CONTRIBUYENTE}
                                                onChange={(v) => setEditData({ ...editData, tipo_contribuyente_comprador: v })} />
                                            <MultiSelectField label="Régimen Fiscal" values={editData.regimen_fiscal_comprador ?? []} isEditing={isEditing} options={REGIMENES_FISCALES}
                                                onChange={(v) => setEditData({ ...editData, regimen_fiscal_comprador: v })} />
                                        </div>
                                    </div>
                                </div>

                                {/* Columna Derecha */}
                                <div className="space-y-4">
                                    <div className="bg-white rounded-xl p-5 border border-slate-200">
                                        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Proveedor (Vendedor)
                                        </h3>
                                        <div className="space-y-3">
                                            <TextField label="NIT" value={editData.nit_proveedor} isEditing={isEditing}
                                                onChange={(v) => setEditData({ ...editData, nit_proveedor: v })} />
                                            <SelectField label="Tipo Contribuyente" value={editData.tipo_contribuyente_proveedor} isEditing={isEditing} options={TIPOS_CONTRIBUYENTE}
                                                onChange={(v) => setEditData({ ...editData, tipo_contribuyente_proveedor: v })} />
                                            <SelectField label="Responsabilidad Tributaria" value={editData.responsabilidad_tributaria_proveedor} isEditing={isEditing} options={RESPONSABILIDADES_TRIBUTARIAS}
                                                onChange={(v) => setEditData({ ...editData, responsabilidad_tributaria_proveedor: v })} />
                                            <MultiSelectField label="Régimen Fiscal" values={editData.regimen_fiscal_proveedor ?? []} isEditing={isEditing} options={REGIMENES_FISCALES}
                                                onChange={(v) => setEditData({ ...editData, regimen_fiscal_proveedor: v })} />
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl p-5 border border-slate-200">
                                        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div> Montos
                                        </h3>
                                        <div className="space-y-3">
                                            <TextField label="Base Gravable" value={editData.base_gravable} isEditing={isEditing} type="number"
                                                onChange={(v) => setEditData({ ...editData, base_gravable: Number(v) })} />
                                            <TextField label="IVA" value={editData.iva} isEditing={isEditing} type="number"
                                                onChange={(v) => setEditData({ ...editData, iva: Number(v) })} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Resultados de Retención - Estilo Sistema Contable */}
                            {invoiceDetail.status === 'CALCULATED' && invoiceDetail.retention_data && (
                                <div className="mt-8 border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                                    <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                                        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                            <Calculator className="w-5 h-5 text-indigo-600" /> Resumen de Liquidación
                                        </h3>
                                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                            Liquidado
                                        </span>
                                    </div>

                                    <div className="flex flex-col md:flex-row">
                                        {/* Columna Izquierda: Justificaciones (Log de Auditoría) */}
                                        <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50">
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <Info className="w-4 h-4 text-slate-400" /> Trazabilidad del Cálculo
                                            </h4>

                                            {invoiceDetail.retention_data.justificaciones && invoiceDetail.retention_data.justificaciones.length > 0 ? (
                                                <ul className="space-y-3">
                                                    {invoiceDetail.retention_data.justificaciones.map((justificacion: string, idx: number) => (
                                                        <li key={idx} className="text-sm text-slate-600 flex items-start gap-3 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0"></div>
                                                            <span className="leading-relaxed">{justificacion}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-sm text-slate-400 italic">No se generaron justificaciones detalladas.</p>
                                            )}
                                        </div>

                                        {/* Columna Derecha: Totales Financieros */}
                                        <div className="w-full md:w-96 p-6 bg-white">
                                            <div className="space-y-3 text-sm">
                                                <div className="flex justify-between items-center text-slate-600">
                                                    <span>Base Gravable</span>
                                                    <span className="font-medium">${Number(invoiceDetail.normalized_data.base_gravable || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-slate-600">
                                                    <span>IVA Facturado</span>
                                                    <span className="font-medium">${Number(invoiceDetail.normalized_data.iva || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>

                                                <div className="pt-3 pb-3 border-t border-slate-100 flex justify-between items-center font-semibold text-slate-800">
                                                    <span>Total de la factura</span>
                                                    <span>${(Number(invoiceDetail.normalized_data.base_gravable || 0) + Number(invoiceDetail.normalized_data.iva || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>

                                                <div className="pt-2 space-y-2">
                                                    <div className="flex justify-between items-center text-rose-600">
                                                        <span className="flex items-center gap-1.5">
                                                            <div className="w-1 h-1 rounded-full bg-rose-400"></div>
                                                            Retención en la Fuente
                                                        </span>
                                                        <span className="font-medium">- ${Number(invoiceDetail.retention_data.reterenta || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-rose-600">
                                                        <span className="flex items-center gap-1.5">
                                                            <div className="w-1 h-1 rounded-full bg-rose-400"></div>
                                                            Retención de IVA
                                                        </span>
                                                        <span className="font-medium">- ${Number(invoiceDetail.retention_data.reteiva || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-rose-600">
                                                        <span className="flex items-center gap-1.5">
                                                            <div className="w-1 h-1 rounded-full bg-rose-400"></div>
                                                            Retención de ICA
                                                        </span>
                                                        <span className="font-medium">- ${Number(invoiceDetail.retention_data.reteica || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>

                                                <div className="mt-4 pt-4 border-t-2 border-slate-800 flex justify-between items-center">
                                                    <span className="text-sm font-bold text-slate-800 uppercase">Valor Neto a Pagar</span>
                                                    <span className="text-base font-black text-emerald-600">
                                                        ${(
                                                            (Number(invoiceDetail.normalized_data.base_gravable || 0) + Number(invoiceDetail.normalized_data.iva || 0)) -
                                                            (Number(invoiceDetail.retention_data.reterenta || 0) + Number(invoiceDetail.retention_data.reteiva || 0) + Number(invoiceDetail.retention_data.reteica || 0))
                                                        ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-red-400">Error al cargar el detalle de la factura.</div>
                    )}
                </div>

                {/* Footer Modal (Acciones) */}
                <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} className="border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer">
                        Cerrar
                    </Button>

                    {invoiceDetail && isEditing && (
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                            onClick={() => editData && updateMutation.mutate(editData)}
                            disabled={isAnyActionPending}
                        >
                            {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Guardar Correcciones
                        </Button>
                    )}

                    {invoiceDetail && !isEditing && invoiceDetail.status === 'PENDING_VALIDATION' && (
                        <Button
                            className="bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold cursor-pointer disabled:opacity-50"
                            onClick={() => validateMutation.mutate()}
                            disabled={isAnyActionPending || !canApprove}
                            title={!canApprove ? `Campos incompletos: ${validationErrors.join(', ')}` : 'Aprobar datos de la factura'}
                        >
                            {validateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Aprobar Datos
                        </Button>
                    )}

                    {invoiceDetail && !isEditing && invoiceDetail.status === 'VALIDATED' && (
                        <Button
                            className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold cursor-pointer"
                            onClick={() => calculateMutation.mutate()}
                            disabled={isAnyActionPending}
                        >
                            {calculateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
                            Calcular Retenciones
                        </Button>
                    )}
                </div>
            </Card>
        </div>
    );
}

export default InvoiceModal;