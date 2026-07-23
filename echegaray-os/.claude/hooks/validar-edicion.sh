#!/usr/bin/env bash
# HOOK RÁPIDO — corre DESPUÉS de cada escritura, sobre EL archivo que se escribió.
#
# POR QUÉ ES TAN CHICO. Este hook se paga en CADA edición, así que su costo es lo primero que hay que
# defender. Medido en este repo: `node --check` de un .mjs son 47ms y un JSON.parse 50ms; en cambio
# eslint de UN solo archivo son 2.033ms, la suite 3.675ms y el typecheck 2.306ms. Cualquiera de esos
# tres multiplicado por cada Write/Edit de una sesión larga es media hora de espera acumulada por
# nada: los errores que detectan no cambian entre la edición 3 y la 30, y el hook de cierre los va a
# encontrar igual. Acá sólo entra lo que cuesta menos de 100ms.
#
# LO QUE NO HACE, A PROPÓSITO: no corre el build, no corre la suite, no corre Playwright, no corre el
# typecheck del proyecto, y NO MODIFICA CÓDIGO. Este repositorio no tiene política de formateo
# automático al guardar; un hook que reescribe lo que acabás de escribir es la forma más rápida de
# que nadie confíe en el editor.
#
# Entra por stdin el JSON del evento PostToolUse: de ahí sale `tool_input.file_path`.
# Sale 0 si está bien; 2 para bloquear con el motivo por stderr.

set -uo pipefail

# EL PATH SE SACA CON sed, NO ABRIENDO NODE. Arrancar un proceso de node sólo para leer un campo
# costaba 40ms de los 106ms que medía este hook — casi la mitad del presupuesto, y este hook se paga
# en CADA edición. `sed` lo hace en 2ms. La expresión toma el primer "file_path" del JSON, que es el
# de `tool_input`; si no aparece, el hook no tiene nada que verificar y sale.
archivo="$(sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"

# Sin archivo (o una herramienta que no escribe archivos) no hay nada que verificar.
[ -z "$archivo" ] && exit 0
[ -f "$archivo" ] || exit 0

case "$archivo" in
  # ── Sintaxis de JavaScript/ESM. Es el error más común y el más barato de encontrar: un paréntesis
  #    sin cerrar en un generador de pestañas no se ve hasta que alguien lo corre contra el Sheet.
  *.mjs|*.js|*.cjs)
    if ! salida="$(node --check "$archivo" 2>&1)"; then
      printf 'Sintaxis inválida en %s\n%s\n' "$archivo" "$salida" >&2
      exit 2
    fi
    ;;
  # ── JSON que no parsea. Un settings.json o un package.json roto deja de aplicarse EN SILENCIO:
  #    no hay error, simplemente se ignora la configuración y todo parece funcionar.
  *.json)
    if ! salida="$(node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$archivo" 2>&1)"; then
      printf 'JSON inválido en %s\n%s\n' "$archivo" "$salida" >&2
      exit 2
    fi
    ;;
  # ── TypeScript/TSX: NO se verifica acá. El typecheck es del proyecto entero (2,3s) y no existe un
  #    chequeo por archivo que sea fiel — `tsc` de un archivo suelto miente sobre los imports. Va al
  #    hook de cierre, que es donde corresponde.
  *) exit 0 ;;
esac

exit 0
