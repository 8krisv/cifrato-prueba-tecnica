import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";

function PublicNotFound() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-12 px-4 shadow-sm sm:rounded-2xl sm:px-10 border border-gray-100 text-center">
                    <h1 className="text-8xl font-bold text-gray-200">404</h1>
                    <h2 className="mt-4 text-xl font-semibold text-gray-900 tracking-tight">Página no encontrada</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        La página que buscas no existe.
                    </p>
                    <div className="mt-8">
                        <Link 
                            to="/login"
                            className={buttonVariants({ variant: "default", className: "w-full bg-black hover:bg-gray-800 text-white rounded-xl" })}
                        >
                            Ir al inicio de sesión
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PublicNotFound;