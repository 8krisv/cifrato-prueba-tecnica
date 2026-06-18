import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Outlet } from "react-router-dom";
import FullScreenLoader from "@/components/ui/FullScreenLoader";

function ProtectedRoute() {
    const { user, isLoading: authLoading } = useAuth();

    if (authLoading) {
        return <FullScreenLoader />
    }
    if (!user) {
        return <Navigate to="/login" replace />
    }
    return (
        <Outlet />
    )
}

export default ProtectedRoute