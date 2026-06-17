import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage"
import ProtectedRoute from "./components/auth/ProtectedRoute"
import DashboardLayout from "./components/layout/DashboardLayout"
import InvoicesPage from "./pages/InvoicesPage"
import AppNotFound from "./pages/AppNotFound"
import PublicNotFound from "./pages/PublicNotFound"
import { AuthProvider } from "@/contexts/AuthContext";


const queryClient = new QueryClient()

function App() {

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Rutas públicas */}
            <Route path="/login" element={<LoginPage />} />

            {/* Rutas protegidas */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardLayout />}>
                <Route index element={<Navigate to="invoices" replace />} />
                <Route path="invoices" element={<InvoicesPage />} />
              </Route>
              <Route path="*" element={<AppNotFound />} />
            </Route>
            <Route path="*" element={<PublicNotFound />} />
          </Routes>
          <ReactQueryDevtools initialIsOpen={false} />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App  
