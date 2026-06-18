import { Loader2 } from "lucide-react";

export default function FullScreenLoader() {
    return (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center transition-all duration-300">
            <div className="flex flex-col items-center gap-4">
                <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full blur-xl bg-blue-100 opacity-50 animate-pulse"></div>
                    <Loader2 className="h-10 w-10 text-black animate-spin relative z-10" />
                </div>
                <div className="flex flex-col items-center gap-1">
                    <h3 className="text-sm font-medium text-gray-900 tracking-tight">Cargando</h3>
                    <p className="text-xs text-gray-500">Por favor espera un momento...</p>
                </div>
            </div>
        </div>
    );
}
