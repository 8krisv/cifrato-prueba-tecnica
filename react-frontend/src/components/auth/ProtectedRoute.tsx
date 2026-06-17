import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Outlet } from "react-router-dom";


function ProtectedRoute() {
    const { user, isLoading: authLoading } = useAuth();

    if (authLoading) {
        return <div>Loading...</div>
    }
    if (!user) {
        return <Navigate to="/login" replace />
    }
    return (
        <Outlet />
    )
}

export default ProtectedRoute