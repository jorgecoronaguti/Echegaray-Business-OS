#!/usr/bin/env sh
# LA SUITE CORRE CON SU PROPIO /tmp.
#
# 20/09/2026: `/tmp` es tmpfs CON CUOTA POR USUARIO y se agotó. Ninguna sesión de Claude Code pudo
# correr un comando —exit 1 sin una letra de salida— porque el harness escribe la salida de cada
# comando en /tmp. Lo que la llenaba eran ~71.000 directorios de `mkdtemp` de las pruebas: cada
# archivo que arma su temporal y no lo borra deja uno por corrida, y la suite son 203 archivos.
#
# Arreglarlo prueba por prueba es pedirle a veinte archivos que se acuerden para siempre, y al
# próximo que se escriba también. Esto lo arregla en UN lugar: la suite corre con su propio TMPDIR.
# `os.tmpdir()` de Node lo respeta, así que todo lo que las pruebas creen cae adentro y se va con él,
# limpien o no. Si la suite muere de golpe (SIGKILL) el directorio queda huérfano y lo barre
# `higiene-tmp.mjs`, que conoce la familia `suite-`.
#
# Uso: scripts/suite-pruebas.sh [argumentos extra para node --test]

set -u
TMPDIR="$(mktemp -d /tmp/suite-XXXXXX)"
export TMPDIR
trap 'rm -rf "$TMPDIR"' EXIT INT TERM

node --test --test-concurrency="${ECOS_TEST_CONCURRENCIA:-2}" "$@" \
  'orquestador/**/*.test.mjs' '.claude/hooks/*.test.mjs' 'scripts/**/*.test.mjs' 'supabase/migrations/*.test.mjs' 'src/**/*.test.ts'
