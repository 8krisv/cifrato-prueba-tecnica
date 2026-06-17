#!/bin/bash

# ================================================================
#  Prueba Técnica Cifrato — Script de Deploy Local
#  Autor: José María Jaramillo
# ================================================================
#
#  Este script automatiza el despliegue local de la aplicación.
#  Realiza las siguientes tareas:
#    1. Verifica que todos los archivos .env existan y tengan
#       sus variables configuradas correctamente.
#    2. Instala dependencias y construye el frontend de React.
#    3. Construye y levanta los contenedores de Docker Compose.
#
#  Uso:
#    chmod +x deploy.sh
#    ./deploy.sh
#
# ================================================================

set -e

# --- Colores para output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- Funciones auxiliares ---
print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}${BOLD}  $1${NC}"
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "  ${GREEN}✔${NC} $1"
}

print_error() {
    echo -e "  ${RED}✖${NC} $1"
}

print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

# Verifica que un archivo .env exista y que todas sus variables
# requeridas tengan un valor asignado (no vacío).
# Argumentos:
#   $1 — Ruta al archivo .env
#   $2... — Lista de nombres de variables requeridas
check_env_file() {
    local env_file="$1"
    shift
    local required_vars=("$@")
    local has_errors=false

    if [ ! -f "$env_file" ]; then
        print_error "Archivo no encontrado: ${BOLD}$env_file${NC}"
        print_warning "Copia el archivo .env.example correspondiente y configura las variables."
        return 1
    fi

    print_success "Archivo encontrado: ${BOLD}$env_file${NC}"

    for var in "${required_vars[@]}"; do
        # Buscar la variable en el archivo (ignorar líneas comentadas)
        local value
        value=$(grep -E "^${var}=" "$env_file" 2>/dev/null | head -1 | cut -d '=' -f2-)

        if [ -z "$value" ] || [ "$value" = '""' ] || [ "$value" = "''" ]; then
            print_error "  Variable ${BOLD}${var}${NC} está vacía o no definida."
            has_errors=true
        else
            print_success "  ${var} ✓"
        fi
    done

    if [ "$has_errors" = true ]; then
        return 1
    fi
    return 0
}

# ================================================================
#  PASO 1: Verificación de variables de entorno
# ================================================================
print_header "PASO 1/3 — Verificando variables de entorno"

env_ok=true

echo ""
echo -e "${BOLD}  📦 React Frontend${NC}"
check_env_file "./react-frontend/.env" \
    "VITE_API_URL" \
    || env_ok=false

echo ""
echo -e "${BOLD}  🐘 PostgreSQL${NC}"
check_env_file "./postgres/.env" \
    "POSTGRES_USER" \
    "POSTGRES_PASSWORD" \
    "POSTGRES_DB" \
    || env_ok=false

echo ""
echo -e "${BOLD}  🔴 Redis${NC}"
check_env_file "./redis/.env" \
    "REDIS_PASSWORD" \
    || env_ok=false

echo ""
echo -e "${BOLD}  🐍 Backend (Flask)${NC}"
check_env_file "./backend/.env" \
    "FLASK_SECRET_KEY" \
    "POSTGRES_USER" \
    "POSTGRES_PASSWORD" \
    "POSTGRES_DB" \
    "POSTGRES_HOST" \
    "REDIS_HOST" \
    "REDIS_PASSWORD" \
    "OPENAI_API_KEY" \
    "ENV" \
    || env_ok=false

if [ "$env_ok" = false ]; then
    echo ""
    print_error "Una o más variables de entorno faltan o están vacías."
    print_error "Corrige los archivos .env antes de continuar."
    exit 1
fi

echo ""
print_success "Todas las variables de entorno están configuradas correctamente."

# ================================================================
#  PASO 2: Construcción del Frontend
# ================================================================
print_header "PASO 2/3 — Construyendo el frontend de React"

echo ""
echo -e "  Instalando dependencias (npm install)..."
(cd react-frontend && npm install --silent)
print_success "Dependencias instaladas."

echo ""
echo -e "  Ejecutando build de producción (npm run build)..."
(cd react-frontend && npm run build)
print_success "Frontend construido exitosamente en ${BOLD}react-frontend/dist/${NC}"

# ================================================================
#  PASO 3: Docker Compose — Build & Up
# ================================================================
print_header "PASO 3/3 — Construyendo y levantando contenedores Docker"

echo ""
echo -e "  Construyendo imágenes de Docker..."
docker compose -f docker-compose.yml build
print_success "Imágenes construidas."

echo ""
echo -e "  Levantando servicios en segundo plano..."
docker compose -f docker-compose.yml up -d
print_success "Todos los contenedores están corriendo."

# ================================================================
#  Resumen Final
# ================================================================
print_header "✅ Deploy completado exitosamente"

echo ""
echo -e "  ${BOLD}Frontend:${NC}  http://localhost:1337"
echo -e "  ${BOLD}API:${NC}       http://localhost:1337/api"
echo -e "  ${BOLD}Backend:${NC}   http://localhost:8000 (directo)"
echo ""
echo -e "  Para ver los logs:   ${CYAN}docker compose -f docker-compose.yml logs -f${NC}"
echo -e "  Para detener todo:   ${CYAN}docker compose -f docker-compose.yml down${NC}"
echo ""
