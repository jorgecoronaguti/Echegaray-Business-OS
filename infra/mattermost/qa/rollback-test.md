# Prueba de rollback — PR-2 (verificación segura)

Este documento **no** es el procedimiento de rollback: ese lo produce **WT1** (Cloudflare
Tunnel) en su `ROLLBACK.md`, en la raíz de la infra de Mattermost (ubicación real:
`infra/mattermost/ROLLBACK.md`). Acá está la parte de **VERIFICACIÓN**:
cómo confirmar, de forma segura y read-only, que el rollback deja el sistema en un estado
correcto y sin exposición residual.

## Qué queremos demostrar

El rollback de PR-2 = **quitar la exposición pública** (bajar el túnel) sin tocar los datos.
Tras el rollback debe cumplirse:

1. Mattermost sigue vivo, pero **sólo en `127.0.0.1:8065`** (como en PR-1).
2. **No quedó ningún puerto entrante abierto** hacia el exterior (ni 8065, ni 5432, ni el túnel).
3. `chat.ecsas.com.ar` deja de responder desde afuera (efecto esperado, no un fallo).
4. El **Business OS (`app.ecsas.com.ar`) no se ve afectado** en ningún momento.
5. Los **datos de Mattermost siguen intactos** (los volúmenes con nombre no se tocan).

> Principio: el rollback es **reversible y no destructivo**. Bajar el túnel **no** borra
> volúmenes, **no** corre `docker compose down -v`, **no** toca Supabase ni Drive.

## Regla de oro de la prueba

- La **verificación** es 100% read-only (los mismos comandos que `pruebas.sh`).
- La **única acción mutante** admitida es la que define el `ROLLBACK.md` de WT1 para bajar
  el túnel (p. ej. `sudo systemctl stop cloudflared`) — y es **reversible** (se vuelve a
  levantar con `start`). **Esa acción la ejecuta el dueño**, en una ventana coordinada.
- **Nunca** para la prueba: `docker compose down`, `down -v`, borrar volúmenes, `docker stop`
  de los contenedores de MM, ni tocar el firewall del proveedor.

---

## Paso 0 — Línea base ANTES de tocar nada (read-only)

Fotografía del estado sano para poder comparar después.

```bash
# Estado esperado hoy (pre-rollback, con túnel activo o no):
bash infra/mattermost/qa/pruebas.sh -v

# Superficie de escucha del host (guardar la salida):
ss -ltnp | grep -E '8065|5432' || echo 'ningun listener 8065/5432'

# ¿El túnel corre?
systemctl is-active cloudflared 2>/dev/null || echo 'cloudflared no-activo'

# OS de referencia (debe seguir igual antes y después):
curl -s -o /dev/null -w 'OS antes: %{http_code}\n' https://app.ecsas.com.ar/
```

Anotar: MM healthy, 8065 sólo en `127.0.0.1`, 5432 sin listener, OS con su código HTTP.

## Paso 1 — Ejecutar el rollback (acción del dueño, reversible)

Seguir el `ROLLBACK.md` de WT1. En esencia, **bajar el túnel** (no los contenedores):

```bash
sudo systemctl stop cloudflared      # el comando exacto lo fija el ROLLBACK.md de WT1
```

> Si WT1 documenta el túnel como contenedor en vez de systemd, usar su comando (p. ej.
> `docker stop <cloudflared-ctr>`). En cualquier caso: **sólo el túnel**, nunca MM/DB.

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
ss -ltn | grep 5432 || echo 'OK: Postgres sigue sin listener en el host'
# Esperado: sin resultado (la base nunca estuvo expuesta y sigue así)

systemctl is-active cloudflared 2>/dev/null || echo 'OK: tunel abajo'
# Esperado: 'inactive' / 'tunel abajo'

curl -s -o /dev/null -w 'chat publico: %{http_code}\n' --max-time 10 https://chat.ecsas.com.ar/api/v4/system/ping
# Esperado: 000  (ya no responde desde afuera == rollback efectivo, NO es un fallo)
```

### 2.3 El OS no se vio afectado

```bash
curl -s -o /dev/null -w 'OS despues: %{http_code}\n' https://app.ecsas.com.ar/
# Esperado: MISMO código que en el Paso 0. El OS es independiente del túnel/MM.
```

### 2.4 Los datos siguen intactos

```bash
docker volume ls | grep -E 'echegaray-mm-(db-data|data|config)'
# Esperado: los volúmenes con nombre siguen existiendo (no se borró nada).

docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status
# Esperado: Server/Database/Filestore = OK (la app y su base siguen sanas).
```

### 2.5 Corrida completa del script tras el rollback

```bash
bash infra/mattermost/qa/pruebas.sh
```

Lectura correcta post-rollback:
- **§1, §2, §3, §4, §5** en `[ OK ]` — MM local sano, aislado, OS intacto.
- **§6** en `[PEND]` — el túnel está abajo a propósito; el script lo reporta PENDIENTE,
  **no FAIL**, y termina con **exit 0**. Ese es exactamente el estado esperado del rollback.

> Si tras el rollback el script diera **FAIL** en §1/§2/§5, el rollback rompió algo que no
> debía (bajó MM, expuso un puerto, o afectó al OS): revisar el `ROLLBACK.md` de WT1.

## Paso 3 — Restaurar (volver a publicar) y confirmar

El rollback es reversible: volver a levantar el túnel y confirmar que se re-publica.

```bash
sudo systemctl start cloudflared        # comando exacto según ROLLBACK.md de WT1
sleep 5
bash infra/mattermost/qa/pruebas.sh     # §6 vuelve a OK cuando el túnel republica
```

---

## Criterio de "rollback probado" (para el checklist, ítem J)

- [ ] MM quedó sólo en `127.0.0.1:8065` tras bajar el túnel (2.1).
- [ ] Ningún puerto entrante abierto: 5432 sin listener, túnel inactivo, `chat` público → 000 (2.2).
- [ ] OS con el mismo código HTTP antes y después (2.3).
- [ ] Volúmenes y `mmctl status` intactos (2.4).
- [ ] `pruebas.sh` post-rollback = todo OK + §6 PENDIENTE + exit 0 (2.5).
- [ ] Republicación exitosa tras `start` (Paso 3).
