
import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

interface User {
    id: string;
    full_name: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Instancia de Axios 
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,  //  Permite enviar y recibir cookies HttpOnly
});

// Le decimos a Axios que busque automáticamente la cookie CSRF que envía Flask...
api.defaults.xsrfCookieName = "csrf_access_token";

// ...y que ponga su valor en este header en cada petición POST, PUT, DELETE, etc.
api.defaults.xsrfHeaderName = "X-CSRF-TOKEN";


export function AuthProvider({ children }: { children: React.ReactNode }) {

    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);


    // Flujo 1: Verificar sesión activa al cargar/recargar la aplicación
    const checkAuthStatus = async () => {
        try {
            // El navegador envía la cookie automáticamente aquí
            const response = await api.get("/user/get");
            setUser(response.data.data); // Guardamos la info del usuario (nombre, email) en el estado
        } catch (error) {
            // Si responde 401 o no hay cookie, el usuario simplemente no está loggeado
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Ejecutamos la verificación en el primer render
        checkAuthStatus();

        // Flujo 3: Interceptor para capturar la expiración del token en tiempo real
        const interceptor = api.interceptors.response.use(
            (response) => response,
            async (error) => {
                const isLoginRequest = error.config?.url?.includes("/user/login");
                // Si cualquier petición (excepto login) devuelve 401, significa que el token expiró
                if (error.response?.status === 401 && !isLoginRequest) {
                    setUser(null);
                    window.location.href = "/login"; // Redirección inmediata
                }
                return Promise.reject(error);
            }
        );

        return () => api.interceptors.response.eject(interceptor);
    }, []);

    // Flujo 2: Iniciar Sesión
    const login = async (email: string, password: string) => {

        setIsLoading(true);
        try {
            // Enviamos las credenciales. El backend validará y responderá con el header 'Set-Cookie'
            await api.post("/user/login", { email, password });

            // Una vez loggeados con éxito, pedimos los datos del usuario para hidratar el estado
            const userResponse = await api.get("/user/get");

            console.log("User response", userResponse.data.data);

            setUser(userResponse.data.data);
        }
        catch (error) {
            setUser(null);
            throw error; // Re-lanzamos el error para que el componente de formulario lo maneje (ej. mostrar alerta)
        }
        finally {
            setIsLoading(false);
        }
    };

    // Flujo 4: Cerrar Sesión
    const logout = async () => {
        try {
            // Avisamos al backend para que destruya la cookie (seteando su expiración en el pasado)
            await api.post("/user/logout");
        } catch (error) {
            console.error("Error al cerrar sesión en el servidor", error);
        } finally {
            // Limpiamos el estado global sin importar si la petición falló
            setUser(null);
            window.location.href = "/login";
        }
    };


    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )

}

// Hook personalizado para usar el contexto
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth debe ser usado dentro de un AuthProvider");
    }
    return context;
}