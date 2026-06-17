import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, Receipt, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardLayout() {
    const { user, logout } = useAuth();
    const location = useLocation();

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans selection:bg-emerald-500/30">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex backdrop-blur-xl">
                <div className="h-16 flex items-center px-6 border-b border-slate-200">
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-teal-500">
                        Mi Panel
                    </span>
                </div>
                <nav className="flex-1 px-4 py-6 space-y-2">
                    <Link
                        to="/invoices"
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${location.pathname.includes('/invoices')
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'text-slate-500 hover:text-zinc-200 hover:bg-slate-100'
                            }`}
                    >
                        <Receipt className="w-5 h-5" />
                        Facturas
                    </Link>
                </nav>
                <div className="p-4 border-t border-slate-200">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <UserCircle className="w-8 h-8 text-slate-500" />
                        <div className="overflow-hidden">
                            <p className="text-sm font-medium text-slate-900 truncate">{user?.full_name || 'Usuario'}</p>
                            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                        </div>
                    </div>
                    <Button onClick={logout} variant="ghost" className="w-full justify-start text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer">
                        <LogOut className="w-4 h-4 mr-2" />
                        Cerrar Sesión
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0">
                <header className="h-16 border-b border-slate-200 flex items-center px-6 md:px-8 bg-slate-50/80 backdrop-blur-md sticky top-0 z-10">
                    <div className="md:hidden flex-1 flex items-center justify-between">
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-teal-500">
                            Mi Panel
                        </span>
                        <Button onClick={logout} variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </header>
                <div className="flex-1 p-6 md:p-8 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}