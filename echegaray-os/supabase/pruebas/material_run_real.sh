#!/usr/bin/env bash
# Ensayo de 20260929T1500 sobre el snapshot del ESQUEMA REAL de producción, en un Postgres descartable
# con la imagen de Supabase (roles, auth.uid() y privilegios por defecto reales). No toca ninguna base viva.
# Uso, desde echegaray-os/:   bash supabase/pruebas/material_run_real.sh
# MIG=<archivo sin .sql> para ensayar otra versión de la migración (p. ej. una mutada).
# Regenerar el snapshot: ver el encabezado de material_00_esquema_real.sql (se lee del catálogo con SELECT).
set -euo pipefail
N=pg-material-real
docker rm -f $N >/dev/null 2>&1 || true
docker run -d --name $N -e POSTGRES_PASSWORD=x supabase/postgres:17.6.1.165 >/dev/null
trap 'docker rm -f $N >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 60); do docker exec $N pg_isready -U postgres -q && break; sleep 1; done
sleep 3
run() { docker cp "$1" $N:/tmp/x.sql; docker exec $N psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/x.sql; }
run supabase/pruebas/material_00_esquema_real.sql
run supabase/pruebas/material_01_real_datos.sql
run "supabase/migrations/${MIG:-20260929T1500_material_stock_por_lugar_y_remito}.sql"
# auth.uid() de Supabase lee el claim del JWT; los casos fijan `test.uid` para el andamio.
sed "s/'test.uid'/'request.jwt.claim.sub'/g" supabase/pruebas/material_02_casos.sql > "${TMPDIR:-/tmp}/material_02_real.sql"
run "${TMPDIR:-/tmp}/material_02_real.sql"
