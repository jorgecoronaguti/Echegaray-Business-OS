#!/usr/bin/env bash
# Ensayo de 20260929T1500 en un Postgres descartable (Docker). No toca ninguna base real.
# Uso, desde echegaray-os/:   bash supabase/pruebas/material_run.sh
# MIG=<archivo sin .sql> para ensayar otra versión de la migración (p. ej. una mutada).
set -euo pipefail
docker rm -f pg-material >/dev/null 2>&1 || true
docker run -d --name pg-material -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
trap 'docker rm -f pg-material >/dev/null 2>&1 || true' EXIT
sleep 7
run() { docker cp "$1" pg-material:/tmp/x.sql; docker exec pg-material psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/x.sql; }
run supabase/pruebas/activo_mover_00_andamio.sql
for f in 20260921T2100_herramientas_activos 20260922T0900_activo_codigo_por_prefijo \
         20260922T1000_activo_categoria_y_cantidad 20260922T1300_activo_existencia_por_lugar; do
  run "supabase/migrations/$f.sql"
done
run supabase/pruebas/material_01_andamio.sql
run "supabase/migrations/${MIG:-20260929T1500_material_stock_por_lugar_y_remito}.sql"
run supabase/pruebas/material_02_casos.sql
run supabase/migrations/20260930T1500_material_ingreso_sin_pedido.sql
run supabase/pruebas/material_03_ingreso.sql
