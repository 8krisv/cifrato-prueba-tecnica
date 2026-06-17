import { useState, useRef } from "react";
import { api } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UploadCloud, FileText, CheckCircle, Calculator, Loader2, Receipt, Clock, ChevronRight, ChevronLeft, Trash2, MoreHorizontal, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import InvoiceModal from "@/components/InvoiceModal"

interface InvoiceRecord {
    id: string;
    file_name: string;
    status: string;
    created_at: string;
    updated_at: string;
}


export default function InvoicesPage() {

    const queryClient = useQueryClient();

    // Upload State
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Modal State
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

    // Delete & Selection State
    const [invoicesToDelete, setInvoicesToDelete] = useState<string[]>([]);
    const [invoicesToValidate, setInvoicesToValidate] = useState<string[]>([]);
    const [invoicesToCalculate, setInvoicesToCalculate] = useState<string[]>([]);
    const [processingInvoices, setProcessingInvoices] = useState<Record<string, 'VALIDATING' | 'CALCULATING'>>({});
    const [invoicesRequiringCorrection, setInvoicesRequiringCorrection] = useState<Set<string>>(new Set());
    const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
    const [showBulkMenu, setShowBulkMenu] = useState(false);

    // Pagination State
    const [page, setPage] = useState(1);
    const limit = 10;

    // Query para la lista de facturas
    const { data: queryData, isLoading } = useQuery<{ data: InvoiceRecord[], metadata: any }>({
        queryKey: ["invoices", "list", page],
        queryFn: async () => {
            const response = await api.get(`/invoice/list?page=${page}&limit=${limit}`);
            return response.data;
        },
    });

    const invoices = queryData?.data || [];
    const metadata = queryData?.metadata;

    // Mutación para eliminar facturas (individual o masiva)
    const deleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await Promise.all(ids.map(id => api.delete(`/invoice/delete/${id}`)));
        },
        onSuccess: () => {
            setInvoicesToDelete([]);
            setSelectedInvoices(new Set());
            // Esto refresca la tabla automáticamente
            queryClient.invalidateQueries({ queryKey: ["invoices", "list"] });
        },
        onError: (error) => {
            console.error("Error eliminando factura:", error);
            alert("Error al eliminar la factura.");
        }
    });

    // Mutación para validar (aprobar datos masivamente)
    const validateMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const results = await Promise.allSettled(ids.map(id => api.patch(`/invoice/validate/${id}`)));
            const failedIds = new Set<string>();

            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const err = result.reason as any;
                    if (err?.response?.data?.error_code === 'INCOMPLETE_DATA') {
                        failedIds.add(ids[index]);
                    }
                }
            });
            return failedIds;
        },
        onMutate: (ids) => {
            setProcessingInvoices(prev => {
                const newState = { ...prev };
                ids.forEach(id => newState[id] = 'VALIDATING');
                return newState;
            });
        },
        onSettled: (failedIds, _error, ids) => {
            setProcessingInvoices(prev => {
                const newState = { ...prev };
                ids.forEach(id => delete newState[id]);
                return newState;
            });
            if (failedIds && failedIds.size > 0) {
                setInvoicesRequiringCorrection(prev => {
                    const newSet = new Set(prev);
                    failedIds.forEach(id => newSet.add(id));
                    return newSet;
                });
            }
            setInvoicesToValidate([]);
            setSelectedInvoices(new Set());
            queryClient.invalidateQueries({ queryKey: ["invoices", "list"] });
        }
    });

    // Mutación para calcular retenciones masivamente
    const calculateMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await Promise.all(ids.map(id => api.patch(`/invoice/calculate/${id}`)));
        },
        onMutate: (ids) => {
            setProcessingInvoices(prev => {
                const newState = { ...prev };
                ids.forEach(id => newState[id] = 'CALCULATING');
                return newState;
            });
        },
        onSettled: (_data, _error, ids) => {
            setProcessingInvoices(prev => {
                const newState = { ...prev };
                ids.forEach(id => delete newState[id]);
                return newState;
            });
            setInvoicesToCalculate([]);
            setSelectedInvoices(new Set());
            queryClient.invalidateQueries({ queryKey: ["invoices", "list"] });
        }
    });


    const handleMultipleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setIsUploading(true);

        const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.xml'));

        // Crear los registros temporales (Stubs) y guardar sus IDs
        const optimisticInvoices: InvoiceRecord[] = files.map((file, index) => ({
            id: `temp-${Date.now()}-${index}`, // ID ficticio crucial para rastrear este archivo
            file_name: file.name,
            status: 'UPLOADING',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }));

        // Inyectar todos los temporales en la tabla de inmediato
        queryClient.setQueryData<{ data: InvoiceRecord[], metadata: any }>(["invoices", "list", page], (oldData) => {
            if (!oldData) return { data: optimisticInvoices, metadata: null };
            return {
                ...oldData,
                data: [...optimisticInvoices, ...oldData.data]
            };
        });

        // Mapear cada archivo a una Promesa de subida independiente
        const uploadPromises = files.map(async (file, index) => {
            const tempId = optimisticInvoices[index].id;
            const formData = new FormData();
            formData.append("file", file);

            try {
                // Petición al backend
                const response = await api.post("/invoice/upload", formData, {
                    headers: { "Content-Type": "multipart/form-data" }
                });

                const realInvoice: InvoiceRecord = {
                    id: response.data.invoice_id,
                    file_name: file.name,
                    status: 'PENDING_VALIDATION',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };

                // Se actualiza solo la fila de este archivo en la caché
                queryClient.setQueryData<{ data: InvoiceRecord[], metadata: any }>(["invoices", "list", page], (oldData) => {
                    if (!oldData) return oldData;
                    return {
                        ...oldData,
                        data: oldData.data.map(inv =>
                            inv.id === tempId ? realInvoice : inv
                        )
                    };
                });

            } catch (error) {
                console.error(`Error uploading ${file.name}:`, error);

                // Si falla, cambiamos el estado temporal a "ERROR" en lugar de desaparecerlo
                queryClient.setQueryData<{ data: InvoiceRecord[], metadata: any }>(["invoices", "list", page], (oldData) => {
                    if (!oldData) return oldData;
                    return {
                        ...oldData,
                        data: oldData.data.map(inv =>
                            inv.id === tempId ? { ...inv, status: 'ERROR' } : inv
                        )
                    };
                });
            }
        });

        // Ejecutar todas las promesas en paralelo
        // Al usar Promise.all con bloques try/catch individuales adentro, 
        // evitamos que si falla un archivo se detengan los demás.
        await Promise.all(uploadPromises);

        // Refetch final de seguridad
        // Cuando TODOS terminan, invalidamos para asegurar consistencia perfecta con la DB.
        await queryClient.invalidateQueries({ queryKey: ["invoices", "list"] });

        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };


    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const validInvoices = invoices.filter(inv => inv.status !== 'UPLOADING').map(inv => inv.id);
            setSelectedInvoices(new Set(validInvoices));
        } else {
            setSelectedInvoices(new Set());
        }
    };

    const handleSelectOne = (id: string, checked: boolean) => {
        const newSet = new Set(selectedInvoices);
        if (checked) {
            newSet.add(id);
        } else {
            newSet.delete(id);
        }
        setSelectedInvoices(newSet);
    };

    const formatStatus = (status: string, id: string) => {
        if (processingInvoices[id] === 'VALIDATING') {
            return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 shadow-sm"><Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> Aprobando...</span>;
        }
        if (processingInvoices[id] === 'CALCULATING') {
            return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 shadow-sm"><Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> Calculando...</span>;
        }

        switch (status) {
            case 'UPLOADING':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 shadow-sm"><Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> Cargando...</span>;
            case 'PENDING_VALIDATION':
                if (invoicesRequiringCorrection.has(id)) {
                    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 shadow-sm"><AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Requiere corrección manual</span>;
                }
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 shadow-sm"><Clock className="w-3.5 h-3.5 text-amber-500" /> Pendiente Validación</span>;
            case 'VALIDATED':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 shadow-sm"><CheckCircle className="w-3.5 h-3.5 text-blue-500" /> Validada</span>;
            case 'CALCULATED':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm"><Calculator className="w-3.5 h-3.5 text-emerald-500" /> Retenciones Calculadas</span>;
            default:
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 shadow-sm">{status}</span>;
        }
    };

    const validatableInvoices = Array.from(selectedInvoices).filter(id => invoices.find(inv => inv.id === id)?.status === 'PENDING_VALIDATION');
    const calculatableInvoices = Array.from(selectedInvoices).filter(id => invoices.find(inv => inv.id === id)?.status === 'VALIDATED');

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Mis Facturas</h1>
                    <p className="text-slate-500 text-sm mt-1">Sube, valida y calcula retenciones de forma masiva.</p>
                </div>

                <div className="flex items-center gap-3">
                    <input
                        type="file"
                        multiple
                        accept=".xml"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleMultipleUpload}
                    />
                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 cursor-pointer"
                        disabled={isUploading}
                    >
                        {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                        {isUploading ? 'Subiendo...' : 'Subir Facturas'}
                    </Button>
                </div>
            </div>

            {/* Tabla de facturas */}
            <Card className="p-0 bg-white ring-1 ring-slate-900/5 shadow-xl shadow-slate-200/40 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs uppercase bg-slate-50 text-slate-400 border-b border-slate-200 transition-colors">
                            {selectedInvoices.size > 0 ? (
                                <tr className="bg-white">
                                    <th colSpan={5} className="px-6 py-2">
                                        <div className="flex items-center gap-4 text-sm normal-case font-normal text-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer accent-emerald-600"
                                                checked={invoices.length > 0 && selectedInvoices.size === invoices.filter(inv => inv.status !== 'UPLOADING').length}
                                                onChange={handleSelectAll}
                                            />
                                            <span className="font-medium">{selectedInvoices.size} seleccionadas</span>

                                            <div className="relative">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-2 border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                                                    onClick={() => setShowBulkMenu(!showBulkMenu)}
                                                >
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </Button>

                                                {showBulkMenu && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => setShowBulkMenu(false)}></div>
                                                        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                                            <button
                                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                onClick={() => {
                                                                    setShowBulkMenu(false);
                                                                    setInvoicesToValidate(validatableInvoices);
                                                                }}
                                                                disabled={validatableInvoices.length === 0}
                                                            >
                                                                <CheckCircle className="w-4 h-4 text-slate-400" />
                                                                Aprobar datos ({validatableInvoices.length})
                                                            </button>
                                                            <button
                                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                onClick={() => {
                                                                    setShowBulkMenu(false);
                                                                    setInvoicesToCalculate(calculatableInvoices);
                                                                }}
                                                                disabled={calculatableInvoices.length === 0}
                                                            >
                                                                <Calculator className="w-4 h-4 text-slate-400" />
                                                                Calcular retenciones ({calculatableInvoices.length})
                                                            </button>
                                                            <div className="h-px bg-slate-100 my-1"></div>
                                                            <button
                                                                className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition-colors"
                                                                onClick={() => {
                                                                    setShowBulkMenu(false);
                                                                    setInvoicesToDelete(Array.from(selectedInvoices));
                                                                }}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                                Eliminar seleccionadas ({selectedInvoices.size})
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </th>
                                </tr>
                            ) : (
                                <tr className="animate-in fade-in duration-300">
                                    <th className="px-6 py-4 w-12 text-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer accent-emerald-600 transition-opacity"
                                            checked={false}
                                            onChange={handleSelectAll}
                                            disabled={invoices.length === 0}
                                        />
                                    </th>
                                    <th className="px-6 py-4 font-semibold">Archivo</th>
                                    <th className="px-6 py-4 font-semibold">Fecha de carga</th>
                                    <th className="px-6 py-4 font-semibold">Estado</th>
                                    <th className="px-6 py-4 font-semibold text-right">Acción</th>
                                </tr>
                            )}
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        Cargando facturas...
                                    </td>
                                </tr>
                            ) : invoices.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        <Receipt className="w-10 h-10 opacity-20 mx-auto mb-3" />
                                        No hay facturas cargadas. Sube un archivo XML para empezar.
                                    </td>
                                </tr>
                            ) : (
                                invoices.map(invoice => (
                                    <tr
                                        key={invoice.id}
                                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedInvoices.has(invoice.id) ? 'bg-emerald-50/50 hover:bg-emerald-50/80' : ''}`}
                                        onClick={() => invoice.status !== 'UPLOADING' && setSelectedInvoiceId(invoice.id)}
                                    >
                                        <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer accent-emerald-600"
                                                checked={selectedInvoices.has(invoice.id)}
                                                onChange={(e) => handleSelectOne(invoice.id, e.target.checked)}
                                                disabled={invoice.status === 'UPLOADING'}
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                                            <FileText className="w-4 h-4 text-emerald-600" />
                                            {invoice.file_name}
                                        </td>
                                        <td className="px-6 py-4">
                                            {new Date(invoice.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {formatStatus(invoice.status, invoice.id)}
                                        </td>
                                        <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                                            {invoice.status !== 'UPLOADING' && <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setInvoicesToDelete([invoice.id]);
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>}
                                            <ChevronRight className="w-4 h-4 text-slate-400" />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Controles de Paginación */}
                {metadata && metadata.total_pages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
                        <div className="text-sm text-slate-500">
                            Mostrando página <span className="font-medium text-slate-900">{metadata.current_page}</span> de <span className="font-medium text-slate-900">{metadata.total_pages}</span>
                            {' '}({metadata.total_items} resultados)
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={!metadata.has_previous || isLoading}
                                className="border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => p + 1)}
                                disabled={!metadata.has_next || isLoading}
                                className="border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                                Siguiente <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Renderizado Condicional del Modal */}
            {selectedInvoiceId && (
                <InvoiceModal
                    invoiceId={selectedInvoiceId}
                    onClose={() => setSelectedInvoiceId(null)}
                />
            )}

            {/* Modal de Confirmación de Eliminación */}
            {invoicesToDelete.length > 0 && (
                <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md bg-white border-0 ring-1 ring-slate-900/5 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
                                <Trash2 className="w-6 h-6 text-rose-600" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">
                                {invoicesToDelete.length === 1 ? '¿Eliminar Factura?' : `¿Eliminar ${invoicesToDelete.length} Facturas?`}
                            </h2>
                            <p className="text-slate-500 text-sm">
                                Esta acción no se puede deshacer. Los datos de {invoicesToDelete.length === 1 ? 'la factura se borrarán' : 'las facturas se borrarán'} permanentemente del sistema.
                            </p>
                        </div>
                        <div className="flex gap-3 px-6 py-4 bg-white border-t border-slate-200">
                            <Button
                                variant="outline"
                                className="flex-1 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                onClick={() => setInvoicesToDelete([])}
                                disabled={deleteMutation.isPending}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                                onClick={() => deleteMutation.mutate(invoicesToDelete)}
                                disabled={deleteMutation.isPending}
                            >
                                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                                Eliminar {invoicesToDelete.length > 1 ? 'todas' : ''}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Modal de Validación Masiva */}
            {invoicesToValidate.length > 0 && (
                <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md bg-white border-0 ring-1 ring-slate-900/5 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-6 h-6 text-blue-500" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">
                                ¿Aprobar Datos?
                            </h2>
                            <p className="text-slate-500 text-sm">
                                Se intentarán aprobar los datos de {invoicesToValidate.length} {invoicesToValidate.length === 1 ? 'factura' : 'facturas'}. Si alguna tiene campos sin especificar, el sistema la marcará automáticamente para corrección manual.
                            </p>
                        </div>
                        <div className="flex gap-3 px-6 py-4 bg-white border-t border-slate-200">
                            <Button
                                variant="outline"
                                className="flex-1 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                onClick={() => setInvoicesToValidate([])}
                                disabled={validateMutation.isPending}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                                onClick={() => validateMutation.mutate(invoicesToValidate)}
                                disabled={validateMutation.isPending}
                            >
                                {validateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                                Aprobar Datos
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Modal de Cálculo Masivo */}
            {invoicesToCalculate.length > 0 && (
                <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md bg-white border-0 ring-1 ring-slate-900/5 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                                <Calculator className="w-6 h-6 text-emerald-600" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">
                                ¿Calcular Retenciones?
                            </h2>
                            <p className="text-slate-500 text-sm">
                                Se procesarán {invoicesToCalculate.length} {invoicesToCalculate.length === 1 ? 'factura' : 'facturas'} para generar automáticamente los cálculos de ReteRenta, ReteIVA y ReteICA.
                            </p>
                        </div>
                        <div className="flex gap-3 px-6 py-4 bg-white border-t border-slate-200">
                            <Button
                                variant="outline"
                                className="flex-1 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                onClick={() => setInvoicesToCalculate([])}
                                disabled={calculateMutation.isPending}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                onClick={() => calculateMutation.mutate(invoicesToCalculate)}
                                disabled={calculateMutation.isPending}
                            >
                                {calculateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calculator className="w-4 h-4 mr-2" />}
                                Calcular
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
