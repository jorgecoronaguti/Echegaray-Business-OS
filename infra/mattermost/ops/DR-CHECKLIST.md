# DR-CHECKLIST — Recuperación ante desastre (pérdida total de la VM)

Procedimiento para **reconstruir Mattermost desde cero** ante la pérdida completa de la VM (borrado,
fallo de hardware del proveedor, VM irrecuperable). Reconstruir el servicio es **⚠️ Nivel E**
(implica DNS, firewall, publicación y restore de datos): lo ejecuta el dueño en una ventana
coordinada.

La premisa de todo esto: **el código y la configuración declarativa viven en el repo; los datos
viven en los backups off-site.** Si ambos existen, el servicio se reconstruye.

---

## Objetivos de recuperación (estimados)

| Métrica | Valor estimado | De qué depende |
|---|---|---|
| **RTO** (tiempo hasta volver a estar operativo) | **~1–3 h** | Provisionar VM + instalar Docker + restore + propagación DNS/ACME |
| **RPO** (pérdida máxima de datos) | **hasta ~24 h** | Frecuencia del backup off-site (diario → hasta 1 día). Ver `BACKUP.md` §6 |

> El RPO real es tan bueno como el **último backup off-site disponible**. Si los backups sólo están
> en la VM perdida, el RPO es infinito (se perdió todo). Por eso `BACKUP.md` §7 (off-site) es
> crítico y hoy está PENDIENTE de automatizar (PR-9).

---

## Precondiciones — qué se necesita para reconstruir

Confirmar que se tiene acceso a **todo** esto antes de empezar (si falta algo, resolverlo primero):

- [ ] **El repo** con `app/infra/mattermost/` (compose + `caddy/Caddyfile` + `bootstrap/` + `ops/`).
- [ ] **Backups off-site** recientes: `mm-db-<STAMP>.sql.gz`, `mm-config-<STAMP>.tar.gz`,
      `mm-data-<STAMP>.tar.gz` (adjuntos — ver gap de `BACKUP.md` §4). Opcional: `caddy-data-…`.
- [ ] **El `.env`** (o al menos `MM_DB_USER`, `MM_DB_NAME`, `MM_DB_PASSWORD` originales) — guardado
      cifrado fuera de la VM (`BACKUP.md` §5). **Sin la password de la base, el restore no corre.**
- [ ] **Acceso al panel de Vultr** (crear VM, firewall) y a **DonWeb** (DNS de `ecsas.com.ar`).
- [ ] `.env.bootstrap` o los valores de admin/equipo (si hace falta re-bootstrapear).

---

## Pasos de reconstrucción

### 1. Provisionar una VM nueva

- [ ] Crear VM en **Vultr** (equivalente a la anterior en CPU/RAM/disco). Anotar la **nueva IP
      pública** (puede diferir de `64.176.22.159`).
- [ ] Instalar **Docker Engine + Docker Compose plugin**.
- [ ] Endurecer SSH (clave, no password). No abrir 8065 ni 5432 nunca.

### 2. Traer el repo y la config

```bash
git clone <repo> && cd <repo>/app/infra/mattermost
cp .env.example .env
# Restaurar/recrear .env con los valores ORIGINALES (misma MM_DB_USER/NAME/PASSWORD que el backup),
# y ajustar si cambió el dominio. Ver .env.example y ACTIVACION-NIVEL-E.md §4.
nano .env
```

- [ ] `MM_DB_USER` / `MM_DB_NAME` / `MM_DB_PASSWORD` **idénticos a los del backup** (si no, el dump
      no matchea el rol/owner).
- [ ] `MM_IMAGE_TAG` = **la misma versión** que produjo el backup (no aprovechar el desastre para
      actualizar; primero recuperar, después `ACTUALIZACION.md`).
- [ ] `CHAT_DOMAIN` / `MM_SITE_URL` = el hostname público de siempre (`chat.ecsas.com.ar`).

### 3. Levantar sólo la base y restaurar datos (antes de publicar)

```bash
cd app/infra/mattermost

# 3a. Levantar únicamente Postgres:
docker compose up -d mattermost-db          # esperar 'healthy'
docker compose ps mattermost-db

# 3b. Copiar los backups off-site a ./backup/dumps/ y restaurar la base:
set -a; source .env; set +a
gunzip -c backup/dumps/mm-db-<STAMP>.sql.gz \
  | docker exec -i -e PGPASSWORD="$MM_DB_PASSWORD" echegaray-mm-db psql -U "$MM_DB_USER" -d "$MM_DB_NAME"

# 3c. Restaurar config y archivos (procedimiento completo en RESTORE.md §3 y §4):
docker run --rm -v echegaray-mm-config:/dst -v "$PWD/backup/dumps":/src alpine \
  sh -c 'rm -rf /dst/* && tar xzf /src/mm-config-<STAMP>.tar.gz -C /dst'
docker run --rm -v echegaray-mm-data:/dst -v "$PWD/backup/dumps":/src alpine \
  sh -c 'rm -rf /dst/* && tar xzf /src/mm-data-<STAMP>.tar.gz -C /dst'
```

### 4. Levantar Mattermost (todavía sin exponer)

```bash
docker compose up -d mattermost             # aplica migraciones si el binario es > backup
docker compose ps mattermost
docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status   # Server/DB/Filestore OK
curl -f http://127.0.0.1:8065/api/v4/system/ping                            # {"status":"OK"}
```

- [ ] Confirmar por túnel SSH a `http://127.0.0.1:8065` que aparecen equipos/canales/mensajes.
- [ ] Si la base estaba vacía o corrupta y **no** hay backup útil: re-bootstrapear desde cero
      (`cd bootstrap && ./bootstrap.sh`) — se pierden los mensajes históricos (RPO = total).

### 5. Reapuntar el DNS a la VM nueva (⚠️ Nivel E — DonWeb)

- [ ] En **DonWeb**, editar el A record `chat` → **nueva IP** de la VM (si cambió). No tocar
      MX/SPF/DKIM/DMARC ni Google Workspace. Ver `../ACTIVACION-NIVEL-E.md` §2.
- [ ] Esperar propagación: `dig +short chat.ecsas.com.ar` → nueva IP.

### 6. Reabrir firewall y publicar (⚠️ Nivel E — Vultr + Caddy)

- [ ] En **Vultr**, abrir **80/443** entrantes en el firewall de la VM nueva (SSH 22 según política).
      Ver `../ACTIVACION-NIVEL-E.md` §1 y `../ufw/README.md`.
- [ ] Levantar Caddy:

```bash
docker compose up -d caddy
docker compose logs -f caddy                 # esperar "certificate obtained successfully"
```

Caddy re-emite el certificado solo (o reusa el `caddy-data` restaurado si lo tenías). Con DNS ya
apuntando a la VM nueva y 80/443 abiertos, la emisión ACME funciona.

### 7. Validación final

```bash
cd app/infra/mattermost
docker compose ps                                        # los 3 servicios Up (healthy)
curl -I https://chat.ecsas.com.ar/api/v4/system/ping     # HTTP/2 200
bash qa/pruebas.sh                                        # exit 0, §6 en OK (salvo app móvil manual)
```

- [ ] Login web con una cuenta real → canales y mensajes históricos presentes.
- [ ] Descargar un adjunto (valida `mm-data`).
- [ ] App móvil (Android/iPhone): conectar a `https://chat.ecsas.com.ar`, mensaje en vivo + push
      (validación manual del dueño — `../ACTIVACION-NIVEL-E.md` §9/§10).
- [ ] La búsqueda puede tardar en reindexar (`bleve` se reconstruye) — esperado.

---

## Qué NO se recupera (y por qué está bien)

- **`bleve`** (índice de búsqueda): se reconstruye solo. No respaldar ni restaurar.
- **`logs`**: no tienen valor de recuperación.
- **Certificados de Caddy**: si no se restauraron, se re-emiten solos (necesitan DNS + 80/443).
- **El Business OS** (`app.ecsas.com.ar`, Vercel): **independiente** de esta VM — no se ve afectado
  por el desastre y no forma parte de esta recuperación.

---

## Debilidades conocidas del plan (registrar / mejorar)

1. **`mm-data` (adjuntos) no está en `backup.sh`** — si el backup off-site no incluyó el `tar` del
   §3a de `BACKUP.md`, la DR **recupera todo menos los archivos subidos**. Cerrar con PR-6 (Drive) o
   incorporando `mm-data` al backup rutinario. **Gap real hoy.**
2. **Off-site no automatizado (PR-9)** — si los backups vivían sólo en la VM perdida, el RPO es
   total. Automatizar la copia off-site es la mejora de mayor impacto para este plan.
3. **`.env` fuera de la VM** — si la password de la base no está guardada aparte, el restore de la
   base se complica. Mantener copia cifrada (`BACKUP.md` §5).

---

## Referencias

- Backup (qué/cómo/dónde): `BACKUP.md` · script `../backup/backup.sh`.
- Restore detallado (base/config/archivos): `RESTORE.md`.
- Activación pública paso a paso (DNS/firewall/Caddy/bootstrap): `../ACTIVACION-NIVEL-E.md`.
- Reversión de la exposición pública: `../ROLLBACK.md`.
- Operación diaria y estado: `RUNBOOK.md` · QA `../qa/pruebas.sh`.
