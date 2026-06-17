import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Eye, EyeOff, Loader2, Receipt, ArrowRight, Code2, AlertCircle, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"



export default function LoginPage() {


  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDismissing, setIsDismissing] = useState(false)

  // Get the auth context
  const { login, user } = useAuth()
  const navigate = useNavigate()

  // Si ya está autenticado, redirigir al dashboard
  useEffect(() => {
    if (user) navigate("/", { replace: true })
  }, [user, navigate])


  useEffect(() => {
    setIsLoaded(true)
  }, [])


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)
    try {
      await login(email, password)
      navigate("/")
    } catch (error: unknown) {
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as { response?: { data?: { message?: string } } }
        setErrorMessage(axiosError.response?.data?.message ?? "Error de autenticación.")
      } else {
        setErrorMessage("No se pudo conectar con el servidor.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-slate-50 font-sans selection:bg-emerald-500/30 overflow-hidden relative">
      {/* Global Background Elements */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {/* Desktop blurs (positioned mostly to the left, degrading to the right) */}
        <div className="hidden lg:block absolute top-[10%] left-[-10%] w-[60%] h-[70%] rounded-full bg-emerald-600/20 blur-[140px]" />
        <div className="hidden lg:block absolute top-[40%] left-[10%] w-[40%] h-[50%] rounded-full bg-emerald-600/10 blur-[120px]" />
        <div className="hidden lg:block absolute bottom-[-10%] left-[-5%] w-[50%] h-[60%] rounded-full bg-blue-600/20 blur-[140px]" />
        
        {/* Mobile blurs */}
        <div className="lg:hidden absolute top-[10%] right-[10%] w-[80%] h-[80%] rounded-full bg-emerald-600/10 blur-[100px]" />
        <div className="lg:hidden absolute bottom-[-10%] left-[10%] w-[80%] h-[80%] rounded-full bg-cyan-600/10 blur-[100px]" />
        
        {/* Global Noise */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
      </div>

      {/* Left Column: Branding and Context */}
      <div className="hidden lg:flex w-1/2 relative z-10 flex-col justify-between p-12 lg:p-16">

        {/* Content */}
        <div className={`relative z-10 transition-all duration-1000 transform ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
          <div className="space-y-6 max-w-lg">
            <h1 className="text-4xl xl:text-5xl font-extrabold text-slate-900 leading-[1.15] tracking-tight">
              Prueba Técnica Oficial <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">Cifrato</span>
            </h1>

            <div className="mt-8 p-6 rounded-2xl bg-white border border-slate-200 backdrop-blur-md shadow-2xl">
              <div className="flex items-center gap-3 mb-3 text-emerald-600">
                <Code2 className="w-5 h-5" />
                <h3 className="font-semibold text-lg">Objetivo del Reto</h3>
              </div>
              <p className="text-base text-slate-600 leading-relaxed">
                Construir una solución que reciba facturas y calcule automáticamente las retenciones aplicables, justificando el resultado considerando conceptos, impuestos y la normativa colombiana actual.
              </p>
            </div>
          </div>

          <div className="mt-10 space-y-6">
            <div className="flex items-center gap-4 text-slate-600">
              <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center backdrop-blur-sm shadow-sm">
                <Receipt className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="font-medium text-sm">Validación automatizada de facturas</p>
            </div>
          </div>
        </div>

        <div className={`relative z-10 text-sm text-slate-400 mt-4 font-medium transition-all duration-1000 delay-300 transform ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          Desarrollado para la evaluación de Cifrato • {new Date().getFullYear()}
        </div>
      </div>

      {/* Right Column: Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10">

        <div className={`w-full max-w-[420px] relative z-10 transition-all duration-1000 delay-150 transform ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
          <div className="lg:hidden flex flex-col items-center justify-center gap-3 mb-10">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-slate-900 tracking-widest uppercase">
                Prueba Técnica Cifrato
              </span>
            </div>
          </div>

          <Card className="bg-white/90 backdrop-blur-xl border-slate-200 shadow-2xl relative overflow-hidden ring-1 ring-slate-900/5">
            {/* Pequeño acento visual en el top del card */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500"></div>

            <CardHeader className="space-y-2 pb-6 pt-8">
              <CardTitle className="text-2xl text-slate-900 font-bold tracking-tight text-center">Acceso de Evaluación</CardTitle>
              <CardDescription className="text-slate-500 text-base">
                Ingresa tus credenciales para revisar la plataforma de retenciones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {errorMessage && (
                <div className={`flex items-start gap-3 p-4 mb-5 rounded-lg bg-rose-50 border border-rose-200 text-sm shadow-sm transition-all duration-300 ${isDismissing ? 'opacity-0 -translate-y-2' : 'animate-in fade-in slide-in-from-top-2'}`}>
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                  <div className="flex-1">
                    <p className="font-semibold text-rose-800">Error al iniciar sesión</p>
                    <p className="mt-0.5 text-rose-600">{errorMessage}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDismissing(true);
                      setTimeout(() => {
                        setErrorMessage('');
                        setIsDismissing(false);
                      }, 300);
                    }}
                    className="shrink-0 text-rose-400 hover:text-rose-600 transition-colors cursor-pointer p-1 -m-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <form id="login-form" onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-600 font-medium">Correo electrónico</Label>
                  <div className="relative group">
                    <Input
                      id="email"
                      type="email"
                      placeholder="evaluador@cifrato.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                      className="bg-slate-50/50 border-slate-200 text-slate-900 placeholder:text-zinc-600 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 transition-all h-12 px-4 shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-slate-600 font-medium">Contraseña</Label>
                  </div>
                  <div className="relative group">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="bg-slate-50/50 border-slate-200 text-slate-900 placeholder:text-zinc-600 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 transition-all h-12 px-4 pr-12 shadow-sm"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-1 top-1 bottom-1 px-3 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </form>
            </CardContent>
            <CardFooter className="pt-2 pb-8 border-none bg-transparent">
              <Button
                type="submit"
                form="login-form"
                disabled={isSubmitting || !email || !password}
                className="cursor-pointer w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:shadow-none group"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin mr-2" />
                    Iniciando entorno...
                  </>
                ) : (
                  <>
                    Entrar al Demo
                    <ArrowRight size={18} className="ml-2 sgroup-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}