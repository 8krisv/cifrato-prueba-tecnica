import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";

function AppNotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] px-4">
            <div className="text-center">
                <h1 className="text-9xl font-bold text-gray-200">404</h1>
                <h2 className="mt-4 text-2xl font-semibold text-gray-900 tracking-tight">Página no encontrada</h2>
                <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
                    Lo sentimos, no pudimos encontrar la página que estás buscando. Puede que haya sido eliminada o que la dirección sea incorrecta.
                </p>
                <div className="mt-8">
                    <Link
                        to="/"
                        className={buttonVariants({ variant: "default", className: "bg-black hover:bg-gray-800 text-white rounded-xl" })}
                    >
                        Volver al inicio
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default AppNotFound;
