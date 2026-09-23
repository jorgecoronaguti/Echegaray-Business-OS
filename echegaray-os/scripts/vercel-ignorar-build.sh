#!/usr/bin/env bash
# ¿ESTE COMMIT MERECE UN DESPLIEGUE?
#
# Vercel guarda el bundle de funciones de CADA despliegue y el plan gratuito tiene 10 GB de Function
# Storage. El 08/09 entraron 101 commits a `main` y muchos no tocaban una sola línea que llegue al
# navegador: capturas de QA, specs de Playwright, documentación, migraciones. Cada uno de esos
# despliegues ocupó el mismo espacio que uno real.
#
# CONTRATO DE VERCEL (Ignored Build Step): salir 0 = SALTAR el build · salir 1 = CONSTRUIR.
# Es al revés de lo que uno espera, y por eso está escrito acá arriba.
#
# ═══ POR QUÉ LISTA LO QUE NO IMPORTA Y NO LO QUE SÍ ═══
#
# La otra forma —enumerar `src/ public/ package.json …` y saltar si el diff no los toca— falla en
# silencio y hacia el lado peligroso: el día que aparezca un `middleware.ts`, un `instrumentation.ts`
# o una carpeta nueva, no va a estar en la lista, el cambio real no se va a desplegar y nadie se va a
# enterar. Acá una ruta desconocida SIEMPRE construye. El peor caso es un despliegue de más, que es
# exactamente lo que ya pasa hoy.
#
# ═══ EL DIRECTORIO RAÍZ ═══
#
# El proyecto de Vercel (`echegaray-business-os`, .vercel/repo.json) tiene Root Directory
# `echegaray-os`, así que este comando corre con el cwd ahí. Igual el script se planta solo en el
# directorio de la app, para que corra igual a mano desde cualquier lado. Todo lo que quede FUERA de
# `echegaray-os/` (el `docs/` y el `.claude/` de la raíz del repo) ya no se ve desde acá, y eso está
# bien: no llega al build.
#
# ═══ QUÉ NO SE EXCLUYE, AUNQUE PAREZCA ═══
#
# `orquestador/` NO está en la lista. Se ve como el backend del OS y suena a que no toca la web, pero
# 23 archivos de `src/` importan `../../../../orquestador/lib/**` y `orquestador/comunicacion/**`, y
# `orquestador/lib` a su vez importa `../engines/`, `../handlers/` y `../../scripts/`. Un cambio ahí
# SÍ cambia el bundle. Saltarlo sería publicar código viejo.
set -uo pipefail

cd "$(dirname "$(readlink -f "$0")")/.." || exit 1

# Sin commit padre (primer despliegue, o clon superficial de profundidad 1) no hay diff que mirar:
# se construye. Nunca se salta por no poder averiguar.
git rev-parse --verify --quiet HEAD^ >/dev/null 2>&1 || { echo "sin HEAD^: se construye"; exit 1; }

# ═══ LA BASE DEL DIFF ES EL ÚLTIMO DESPLIEGUE, NO EL COMMIT ANTERIOR (23/09/2026) ═══
#
# Medido: entraron siete commits juntos a `main` —cinco con cambios de `src/`— y el último era un
# documento. Vercel comparó HEAD^..HEAD, vio sólo el `.md`, y CANCELÓ el build: la app quedó con código
# viejo mientras `origin/main` y la VM ya tenían el nuevo. Un push de varios commits es lo normal acá.
# Vercel expone `VERCEL_GIT_PREVIOUS_SHA`: el commit del último despliegue exitoso de esta rama. Ésa es
# la base correcta; si no está (primer despliegue) o no existe en el clon, se cae a HEAD^ como antes.
BASE="HEAD^"
if [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ] && git rev-parse --verify --quiet "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" >/dev/null 2>&1; then
  BASE="$VERCEL_GIT_PREVIOUS_SHA"
  echo "base del diff: último despliegue ${BASE:0:8}"
else
  echo "base del diff: HEAD^ (sin VERCEL_GIT_PREVIOUS_SHA utilizable)"
fi

# `--quiet` sale 0 cuando NO hay diferencias. Los `:(exclude)` se restan de `.`, así que "no hay
# diferencias" significa: todo lo que cambió cae en lo que no llega al navegador.
if git diff --quiet "$BASE" HEAD -- . \
  ':(exclude)tests' \
  ':(exclude)qa-shots' \
  ':(exclude)test-results' \
  ':(exclude)QA_OUT' \
  ':(exclude)capturas' \
  ':(exclude).qa-reports' \
  ':(exclude)docs' \
  ':(exclude).claude' \
  ':(exclude)supabase' \
  ':(exclude)*.md' \
  ':(exclude)*.test.ts' \
  ':(exclude)*.test.tsx' \
  ':(exclude)*.test.mjs' \
  ':(exclude)*.test.js' \
  ':(exclude)*.spec.ts' \
  ':(exclude)*.log' \
  ':(exclude)playwright.config.ts' \
  ':(exclude)eslint.config.mjs'
then
  echo "sin cambios que lleguen al navegador: se salta el build"
  exit 0
fi

echo "hay cambios que llegan al navegador: se construye"
exit 1
