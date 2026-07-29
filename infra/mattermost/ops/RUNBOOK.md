# RUNBOOK — Operación diaria de Mattermost

Guía de operación rutinaria del stack de comunicación (Mattermost Team Edition + PostgreSQL
dedicado + Caddy) que corre en la VM. Todo lo de este documento es **operación rutinaria
(read-only o reversible sin efecto externo)**, salvo lo que esté marcado explícitamente como
**⚠️ Nivel E**.

- **Rutina** = ver estado, leer logs, reiniciar un contenedor que ya existe. No cambia la
  superficie pública, no toca datos, es reversible.
- **⚠️ Nivel E** = efecto externo real (abrir/cerrar puertos, DNS, publicar/despublicar el
  servicio, actualizar versión, restaurar datos). **Requiere autorización explícita del dueño**
  y sigue su propio instructivo (`../ACTIVACION-NIVEL-E.md`, `ACTUALIZACION.md`, `RESTORE.md`).

> **Regla de este worktree / de estos docs:** este RUNBOOK describe comandos para operar. No los
> ejecuta por su cuenta ningún agente sobre producción. La ejecución real la hace el dueño.

---

## 0. Dónde vive cada cosa

| Cosa | Ubicación real |
|---|---|
| Compose del stack | `app/infra/mattermost/docker-compose.yml` (proyecto Docker: `echegaray-mattermost`) |
| Config del stack (secretos) | `app/infra/mattermost/.env` (gitignoreado; plantilla en `.env.example`) |
| Config declarativa de Caddy | `app/infra/mattermost/caddy/Caddyfile` |
| Bootstrap idempotente (admin/equipo/canales) | `app/infra/mattermost/bootstrap/` |
| QA read-only del despliegue | `app/infra/mattermost/qa/pruebas.sh` |
| Backup (script real) | `app/infra/mattermost/backup/backup.sh` → escribe en `backup/dumps/` |
| Rollback de la exposición pública | `app/infra/mattermost/ROLLBACK.md` |
| Activación pública (Nivel E, 12 pasos) | `app/infra/mattermost/ACTIVACION-NIVEL-E.md` |

**Contenedores** (nombres fijos): `echegaray-mm-app` (Mattermost), `echegaray-mm-db` (Postgres),
`echegaray-mm-caddy` (reverse proxy).

**Volúmenes con nombre** (persistentes, fuera del repo — los datos NO viven en git):
`echegaray-mm-db-data` (base Postgres), `echegaray-mm-data` (archivos subidos), `echegaray-mm-config`
(config de MM), `echegaray-mm-logs`, `echegaray-mm-plugins`, `echegaray-mm-client-plugins`,
`echegaray-mm-bleve` (índice de búsqueda), `echegaray-mm-caddy-data` (certificados/estado ACME —
crítico), `echegaray-mm-caddy-config`.

**Red interna:** `echegaray-mattermost-net`. Postgres no publica puerto; Mattermost sólo en
`127.0.0.1:8065`; Caddy es el único público (`80`/`443`).

Todos los comandos asumen que estás parado en el directorio de la infra:

```bash
cd app/infra/mattermost      # ajustá a tu ruta real en la VM
```

---

## 1. Ver estado (rutina, read-only)

### 1a. Estado de contenedores

```bash
docker compose ps                 # los 3 servicios: State/Health (esperado: Up (healthy))
docker compose ps -a              # incluye contenedores detenidos
```

Esperado: `mattermost-db`, `mattermost` y `caddy` en `running` + `healthy`. Si Caddy no está
levantado todavía, es válido (la exposición pública es Nivel E, ver `../ACTIVACION-NIVEL-E.md`).

### 1b. Salud interna de Mattermost (mmctl local)

La imagen es distroless (no trae shell ni curl): `mmctl` vive dentro del contenedor y usa el
**local mode** (socket unix interno, sin credenciales ni puerto expuesto). Es el mismo mecanismo
del healthcheck del compose.

```bash
docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status
```

Esperado: `Server status: OK`, `Database Status: OK`, `Filestore Status: OK`.

### 1c. Ping HTTP en loopback

```bash
curl -f http://127.0.0.1:8065/api/v4/system/ping        # -> {"status":"OK"}
```

### 1d. QA completo del despliegue (la forma canónica de "¿está todo bien?")

```bash
bash qa/pruebas.sh            # -v para detalle
```

`pruebas.sh` es **read-only** (no muta nada: no levanta/reinicia contenedores, no toca puertos, no
saca certificados). Códigos: `exit 0` = todo lo que hoy debería andar, anda; `exit 1` = regresión
real. Los ítems de exposición pública que aún no se activaron se reportan **PENDIENTE**, no FAIL
(ver la tabla de estados esperados en `../ACTIVACION-NIVEL-E.md`).

### 1e. Certificado público (sólo si Caddy ya publica — rutina de chequeo)

```bash
docker exec echegaray-mm-caddy caddy version                       # binario responde
echo | openssl s_client -connect chat.ecsas.com.ar:443 \
  -servername chat.ecsas.com.ar 2>/dev/null | openssl x509 -noout -enddate   # fecha de vencimiento
```

Caddy renueva el certificado **solo**; no hay cron de renovación que operar. Si el vencimiento se
acerca (< ~30 días) y no renovó, revisar logs de Caddy (§2) y que 80/443 sigan abiertos.

---

## 2. Leer logs (rutina, read-only)

Logs rotados por Docker (json-file, 10 MB × 3 por contenedor).

```bash
docker compose logs -f mattermost           # app en vivo (Ctrl-C para salir)
docker compose logs --tail 200 mattermost   # últimas 200 líneas
docker compose logs --tail 200 mattermost-db
docker compose logs --tail 200 caddy        # emisión/renovación de certificado aparece acá
```

Filtrar errores reales (ignorando ruido benigno pre-bootstrap):

```bash
docker compose logs --tail 500 mattermost 2>&1 | grep -iE '"level":"(error|critical|fatal)"'
```

**Ruido benigno esperado** (no es incidente): `Failed to get system bot` / `List of admins is
empty` antes del bootstrap; `obtaining certificate` / `challenge failed` / `will retry` en Caddy
mientras ACME provisiona. Desaparecen tras bootstrap y tras emitir el cert.

---

## 3. Reiniciar de forma segura (rutina, reversible)

`restart: unless-stopped` está en los tres servicios: tras un reboot de la VM vuelven **solos**.
Reiniciar un contenedor **no borra datos** (los datos viven en los volúmenes con nombre). Ningún
`restart`/`stop`/`up` de esta sección abre o cierra puertos ni toca DNS.

### 3a. Reiniciar sólo Mattermost (la app)

```bash
docker compose restart mattermost
# verificar:
docker compose ps mattermost
docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status
```

### 3b. Reiniciar sólo Caddy (el reverse proxy)

Seguro y rutinario: Caddy **reusa** el certificado persistido en `echegaray-mm-caddy-data`, no
re-tramita ni pega contra los rate limits de Let's Encrypt.

```bash
docker compose restart caddy
docker compose ps caddy
curl -I https://chat.ecsas.com.ar/api/v4/system/ping     # HTTP/2 200 (si ya está publicado)
```

### 3c. Reiniciar Postgres

```bash
docker compose restart mattermost-db
docker compose ps mattermost-db     # esperar 'healthy' antes de asumir que MM reconectó
```

Mattermost reintenta la conexión solo; si quedó raro, `docker compose restart mattermost` después
de que la DB esté `healthy`.

### 3d. Reiniciar todo el stack (respetando dependencias)

```bash
docker compose up -d          # idempotente: sólo recrea lo que cambió; respeta el orden
```

> **Diferencia clave (no confundir):**
> - `docker compose stop` / `restart` → **rutina**, reversible, conserva todo.
> - `docker compose down` → detiene y elimina contenedores/red, **conserva volúmenes** (datos a salvo).
> - `docker compose down -v` → **⚠️ DESTRUCTIVO**: borra los volúmenes y por lo tanto **todos los
>   datos** (base, archivos, config, certificados). **Nunca** en operación rutinaria.

---

## 4. Parar / despublicar (distinguir rutina de Nivel E)

- **Bajar sólo Caddy** = quitar la exposición pública → **⚠️ Nivel E** (deja de responder
  `https://chat.ecsas.com.ar`). Instructivo y verificación en `../ROLLBACK.md`. No toca MM/DB ni
  datos.
- **Parar todo el stack** (mantenimiento coordinado) es reversible pero implica ventana sin chat:
  coordinar con el dueño.

```bash
# Despublicar (Nivel E — ver ../ROLLBACK.md):
docker compose stop caddy

# Re-publicar (Nivel E — Caddy reusa el cert persistido):
docker compose up -d caddy
```

---

## 5. Tareas administrativas de Mattermost (mmctl local — rutina)

Todo vía `docker exec … mmctl --local` (local mode, sin exponer nada). Alta de usuarios/canales
normalmente ya la cubre el bootstrap idempotente (`../bootstrap/`).

```bash
docker exec echegaray-mm-app /mattermost/bin/mmctl --local user list
docker exec echegaray-mm-app /mattermost/bin/mmctl --local team list
docker exec echegaray-mm-app /mattermost/bin/mmctl --local channel list <team>
```

Re-correr el bootstrap (idempotente, no duplica) tras cambiar canales:

```bash
cd bootstrap && ./bootstrap.sh
```

> Crear/desactivar usuarios reales, cambiar contraseñas o config server-side que afecte a las
> personas se coordina con el dueño (es cambio operativo, no sólo técnico).

---

## 6. Rutina sugerida

| Frecuencia | Acción | Comando |
|---|---|---|
| Diaria (o ante cualquier reporte) | Estado + QA | `docker compose ps` · `bash qa/pruebas.sh` |
| Diaria | Backup | `cd backup && ./backup.sh` (ver `BACKUP.md`) |
| Semanal | Revisar logs de error | `docker compose logs --tail 500 mattermost \| grep -iE 'error\|fatal'` |
| Semanal | Vencimiento del cert | ver §1e |
| Ante reboot de VM | Confirmar recuperación automática | `docker compose ps` (deben volver solos) |

Ver también: `BACKUP.md` (qué y cómo respaldar), `RESTORE.md` (recuperar), `ACTUALIZACION.md`
(subir versión — Nivel E), `DR-CHECKLIST.md` (desastre total).
