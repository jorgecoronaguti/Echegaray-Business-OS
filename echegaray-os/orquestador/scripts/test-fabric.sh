#!/usr/bin/env bash
# Suite reproducible del Work Fabric contra un Postgres EFÍMERO en docker (no toca
# prod ni el store durable). Valida: migraciones F0+F1, self-check, ciclo de vida,
# concurrencia (2 workers, sin doble ejecución) y recuperación de tarea abandonada.
#
# Uso:  bash orquestador/scripts/test-fabric.sh
# Salida: PASS/FAIL por bloque; exit 0 si todo pasó.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1   # -> echegaray-os
APP="$(pwd)"
CNT="orq-test-$$"; PORT=55444
FAILED=0
pass(){ echo "  ✅ $1"; }
fail(){ echo "  ❌ $1"; FAILED=1; }

cleanup(){ docker rm -f "$CNT" >/dev/null 2>&1; }
trap cleanup EXIT

echo "== levantando Postgres efímero ($CNT:$PORT) =="
docker run -d --name "$CNT" -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t -p 127.0.0.1:$PORT:5432 postgres:16-alpine >/dev/null
# esperar Postgres ESTABLE: el init de la imagen reinicia el server una vez, así
# que exigimos varias respuestas consecutivas a una query real antes de seguir.
ok=0
for i in $(seq 1 40); do
  if docker exec "$CNT" psql -U postgres -d t -tAc "select 1" >/dev/null 2>&1; then ok=$((ok+1)); else ok=0; fi
  [ "$ok" -ge 3 ] && break; sleep 0.5
done
docker exec "$CNT" psql -U postgres -d t -qc "create role authenticated nologin; create role service_role nologin;" >/dev/null 2>&1

export DATABASE_URL="postgres://postgres:t@127.0.0.1:$PORT/t" ORQ_DB_SSL=false ORQ_LOG_LEVEL=warn

echo "== migraciones =="
docker cp supabase/migrations/20260711120000_orq_fundacion_work_fabric.sql "$CNT":/f0.sql >/dev/null
docker cp supabase/migrations/20260711121000_orq_ledger.sql "$CNT":/f1.sql >/dev/null
docker exec "$CNT" psql -U postgres -d t -v ON_ERROR_STOP=1 -qf /f0.sql >/dev/null 2>&1 && pass "F0 aplica" || fail "F0"
docker exec "$CNT" psql -U postgres -d t -v ON_ERROR_STOP=1 -qf /f1.sql >/dev/null 2>&1 && pass "F1 aplica" || fail "F1"

echo "== self-check fundación =="
node orquestador/scripts/selfcheck-f0.mjs >/dev/null 2>&1 && pass "selfcheck-f0" || fail "selfcheck-f0"

echo "== ciclo de vida (enqueue -> succeeded) =="
node orquestador/scripts/enqueue.mjs '{"type":"noop","title":"lc","dedupe_key":"lc1"}' >/dev/null 2>&1
node orquestador/worker.mjs --once >/dev/null 2>&1
ST=$(docker exec "$CNT" psql -U postgres -d t -tAc "select state from orq.tasks where dedupe_key='lc1'")
[ "$ST" = "succeeded" ] && pass "ciclo -> succeeded" || fail "ciclo (estado=$ST)"

echo "== concurrencia (2 workers, sin doble ejecución) =="
for i in 1 2 3 4 5 6; do node orquestador/scripts/enqueue.mjs "{\"type\":\"noop\",\"title\":\"c$i\",\"dedupe_key\":\"c$i\",\"inputs\":{\"work_ms\":60}}" >/dev/null 2>&1; done
( ORQ_WORKER_ID=A node orquestador/worker.mjs --once >/dev/null 2>&1 ) &
( ORQ_WORKER_ID=B node orquestador/worker.mjs --once >/dev/null 2>&1 ) &
wait
DUP=$(docker exec "$CNT" psql -U postgres -d t -tAc "select count(*) from (select task_id from orq.task_attempts group by task_id having count(*)>1) x")
OK=$(docker exec "$CNT" psql -U postgres -d t -tAc "select count(*) from orq.tasks where dedupe_key like 'c_' and state='succeeded'")
{ [ "$DUP" = "0" ] && [ "$OK" = "6" ]; } && pass "6/6 succeeded, 0 con doble intento" || fail "concurrencia (dup=$DUP ok=$OK)"

echo "== recuperación de tarea abandonada (lease vencido -> reap) =="
node orquestador/scripts/enqueue.mjs '{"type":"noop","title":"ab","dedupe_key":"ab1"}' >/dev/null 2>&1
docker exec "$CNT" psql -U postgres -d t -qc "select orq.claim_task('ghost',900)" >/dev/null
docker exec "$CNT" psql -U postgres -d t -qc "update orq.tasks set lease_expires_at=now()-interval '1 min' where dedupe_key='ab1'" >/dev/null
RS=$(docker exec "$CNT" psql -U postgres -d t -tAc "select (orq.reap_expired_leases()).state")
[ "$RS" = "retrying" ] && pass "reap recupera a retrying" || fail "reap (estado=$RS)"

echo ""
[ "$FAILED" = "0" ] && echo "== RESULTADO: TODO VERDE ✅ ==" || echo "== RESULTADO: HAY FALLOS ❌ =="
exit $FAILED
