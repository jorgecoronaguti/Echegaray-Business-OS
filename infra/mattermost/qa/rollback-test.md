# Prueba de rollback — PR-2 · Path B / Caddy (verificación segura)

Este documento **no** es el procedimiento de rollback: ese vive en
**`infra/mattermost/ROLLBACK.md`** (en la raíz de la infra de Mattermost). Acá está la parte
de **VERIFICACIÓN**: cómo confirmar, de forma segura y read-only, que el rollback deja el
sistema en un estado correcto y sin exposición residual.

## Qué queremos demostrar

El rollback de PR-2 = **quitar la exposición pública** (parar Caddy + quitar el A record)
sin tocar los datos. Tras el rollback debe cumplirse:

1. Mattermost sigue vivo, pero **sólo en `127.0.0.1:8065`** (como en PR-1).
2. **No quedó ningún puerto entrante abierto** hacia el exterior: al parar Caddy, **80 y 443
   dejan de escuchar** en la VM; 8065 y 5432 nunca estuvieron expuestos.
3. `chat.ecsas.com.ar` deja de responder desde afuera (efecto esperado, no un fallo).
4. El **Business OS (`app.ecsas.com.ar`) no se ve afectado** en ningún momento.
5. Los **datos de Mattermost siguen intactos** (los volúmenes con nombre no se tocan), y el
   **certificado de Caddy queda persistido** en `caddy_data` para una eventual reactivación.

> Principio: el rollback es **reversible y no destructivo**. Parar Caddy **no** borra
> volúmenes, **no** corre `docker compose down -v`, **no** para MM/DB, **no** toca Supabase ni Drive.

## Regla de oro de la prueba

- La **verificación** es 100% read-only (los mismos comandos que `pruebas.sh`).
- La **única acción mutante** admitida es la que define `infra/mattermost/ROLLBACK.md` para
  bajar la exposición: parar y quitar **sólo el contenedor Caddy**
  (`docker compose stop caddy && docker compose rm -f caddy`) — y es **reversible**
  (se vuelve a levantar con `docker compose up -d caddy`). **Esa acción la ejecuta el dueño**,
  en una ventana coordinada.
- **Nunca** para la prueba: `docker compose down`, `down -v`, borrar volúmenes, `docker stop`
  de `echegaray-mm-app`/`echegaray-mm-db`, ni cerrar el firewall del proveedor a mitad de camino.

---

## Paso 0 — Línea base ANTES de tocar nada (read-only)

Fotografía del estado sano para poder comparar después.

```bash
# Estado esperado hoy (pre-rollback, con Caddy activo o no):
bash infra/mattermost/qa/pruebas.sh -v

# Superficie de escucha del host (guardar la salida):
ss -ltn | grep -E ':(80|443|8065|5432)$' || echo 'ningun listener 80/443/8065/5432'

# ¿Caddy corre?
docker inspect --format '{{.State.Status}}' echegaray-mm-caddy 2>/dev/null || echo 'caddy no-existe'

# OS de referencia (debe seguir igual antes y después):
curl -s -o /dev/null -w 'OS antes: %{http_code}\n' https://app.ecsas.com.ar/
```

Anotar: MM healthy, 8065 sólo en `127.0.0.1`, 5432 sin listener, 80/443 publicados por Caddy,
OS con su código HTTP.

## Paso 1 — Ejecutar el rollback (acción del dueño, reversible)

Seguir `infra/mattermost/ROLLBACK.md`. En esencia, **parar y quitar sólo Caddy** (no MM/DB):

```bash
cd app/infra/mattermost
docker compose stop caddy
docker compose rm -f caddy
```

Y (paso del dueño en DonWeb) **quitar el A record** `chat → 64.176.22.159`. Con Caddy abajo,
80/443 dejan de escuchar en la VM; sin A record, `chat.ecsas.com.ar` deja de resolver.

> El comando exacto lo fija `ROLLBACK.md`. En cualquier caso: **sólo Caddy**, nunca MM/DB.

## Paso 2 — Verificar el estado post-rollback (read-only)

### 2.1 MM queda sólo en loopback (sigue vivo local)

```bash
curl -s -o /dev/null -w 'MM loopback: %{http_code}\n' http://127.0.0.1:8065/api/v4/system/ping
# Esperado: 200  (Mattermost sigue corriendo para la red interna/VM)

ss -ltn | grep 8065
# Esperado: 127.0.0.1:8065  y NUNCA 0.0.0.0:8065
```

### 2.2 No quedó exposición pública ni puertos abiertos

```bash
ss -ltn | grep -E ':(80|443)$' || echo 'OK: 80/443 ya no escuchan (Caddy abajo)'
# Esperado: sin resultado (al quitar Caddy, dejan de escuchar 80 y 443)

ss -ltn | grep 5432 || echo 'OK: Postgres sigue sin listener en el host'
# Esperado: sin resultado (la base nunca estuvo expuesta y sigue así)

docker inspect echegaray-mm-caddy >/dev/null 2>&1 || echo 'OK: contenedor Caddy removido'
# Esperado: 'OK: contenedor Caddy removido'

curl -s -o /dev/null -w 'chat publico: %{http_code}\n' --max-time 10 https://chat.ecsas.com.ar/api/v4/system/ping
# Esperado: 000  (ya no responde desde afuera == rollback efectivo, NO es un fallo)
```

### 2.3 El OS no se vio afectado

```bash
curl -s -o /dev/null -w 'OS despues: %{http_code}\n' https://app.ecsas.com.ar/
# Esperado: MISMO código que en el Paso 0. El OS es independiente de Caddy/MM.
```

### 2.4 Los datos siguen intactos (y el cert de Caddy persiste)

```bash
docker volume ls | grep -E 'echegaray-mm-(db-data|data|config)|caddy_(data|config)'
# Esperado: los volúmenes con nombre siguen existiendo (no se borró nada).
# caddy_data conserva el cert/cuenta ACME -> reactivar no re-tramita el certificado.

docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status
# Esperado: Server/Database/Filestore = OK (la app y su base siguen sanas).
```

### 2.5 Corrida completa del script tras el rollback

```bash
bash infra/mattermost/qa/pruebas.sh
```

Lectura correcta post-rollback:
- **§1, §2, §3, §4, §5** en `[ OK ]` — MM local sano, aislado, OS intacto.
- **§6** en `[PEND]` — Caddy está abajo a propósito; el script lo reporta PENDIENTE
  (motivo: "Caddy no desplegado"), **no FAIL**, y termina con **exit 0**. Ese es exactamente
  el estado esperado del rollback.

> Si tras el rollback el script diera **FAIL** en §1/§2/§5, el rollback rompió algo que no
> debía (paró MM, expuso un puerto, o afectó al OS): revisar `infra/mattermost/ROLLBACK.md`.

## Paso 3 — Restaurar (volver a publicar) y confirmar

El rollback es reversible: volver a levantar Caddy (y re-crear el A record) y confirmar que
se re-publica.

```bash
cd app/infra/mattermost
docker compose up -d caddy      # comando exacto según ROLLBACK.md / ACTIVACION-NIVEL-E.md
sleep 10                        # dar tiempo a ACME si tuvo que re-emitir (normalmente reusa el cert)
bash infra/mattermost/qa/pruebas.sh     # §6 vuelve a OK cuando Caddy republica con HTTPS
```

---

## Criterio de "rollback probado" (para el checklist, ítem J)

- [ ] MM quedó sólo en `127.0.0.1:8065` tras parar Caddy (2.1).
- [ ] Ningún puerto entrante abierto: 80/443 ya no escuchan, 5432 sin listener, `chat` público → 000 (2.2).
- [ ] OS con el mismo código HTTP antes y después (2.3).
- [ ] Volúmenes (incl. `caddy_data`) y `mmctl status` intactos (2.4).
- [ ] `pruebas.sh` post-rollback = todo OK + §6 PENDIENTE + exit 0 (2.5).
- [ ] Republicación exitosa tras `docker compose up -d caddy` + re-crear A record (Paso 3).
