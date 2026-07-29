# BACKUP — Qué respaldar y cómo

Estrategia de respaldo del stack de Mattermost. El script real ya existe:
**`../backup/backup.sh`**. Este documento explica **qué cubre, qué NO cubre (gap importante),
cómo completar el respaldo, con qué frecuencia, dónde guardarlo y cómo verificarlo**.

Sacar un backup es **operación rutinaria** (read-only sobre los datos: `pg_dump` y `tar` de sólo
lectura no mutan nada). Restaurar es **⚠️ Nivel E** y vive en `RESTORE.md`.

---

## 1. Qué hay que respaldar (mapa completo)

| Volumen | Contenido | ¿Crítico? | ¿Lo cubre `backup.sh` hoy? |
|---|---|---|---|
| `echegaray-mm-db-data` | **Base PostgreSQL** (usuarios, equipos, canales, mensajes, metadatos) | **Sí, máximo** | ✅ vía `pg_dump` |
| `echegaray-mm-config` | Config de Mattermost (`config.json`) | Sí | ✅ vía `tar` |
| `echegaray-mm-data` | **Archivos subidos** (adjuntos, imágenes, avatares) | Sí (mientras no estén en Drive) | ❌ **NO** (ver §4, gap) |
| `echegaray-mm-caddy-data` | **Certificados TLS + estado/cuenta ACME** | Medio (Caddy los re-emite) | ❌ NO |
| `echegaray-mm-plugins` / `-client-plugins` | Plugins instalados | Bajo | ❌ NO |
| `echegaray-mm-bleve` | Índice de búsqueda | Bajo (**se reconstruye**) | ❌ NO |
| `echegaray-mm-logs` | Logs | Nulo (no respaldar) | ❌ NO |
| `.env` (archivo, no volumen) | Secretos: `MM_DB_PASSWORD`, dominio, etc. | **Sí** | ❌ NO (ver §5) |

**Prioridad de recuperación:** `db-data` >> `config` ≈ `mm-data` > `.env` >> `caddy-data` > resto.
Con la base, la config, los archivos y el `.env` se reconstruye el servicio completo. `bleve`
(búsqueda) y los certs de Caddy se regeneran solos.

---

## 2. Backup rutinario con el script existente

`../backup/backup.sh` hace, en una corrida:

1. **Dump lógico de PostgreSQL** — `docker exec echegaray-mm-db pg_dump … --clean --if-exists`,
   comprimido → `mm-db-<STAMP>.sql.gz`.
2. **Config de Mattermost** — `tar czf` del volumen `echegaray-mm-config` → `mm-config-<STAMP>.tar.gz`.
3. **Rotación** — borra backups `mm-*` más viejos que `RETENTION_DAYS` (default **14**).

```bash
cd app/infra/mattermost/backup
./backup.sh                          # escribe en ./dumps/ (gitignoreado)
BACKUP_DIR=/mnt/backups ./backup.sh  # destino alternativo
RETENTION_DAYS=30 ./backup.sh        # cambiar retención
```

Lee las credenciales de la base desde `../.env` (falla claro si no existe). Salida esperada:
`mm-db-<STAMP>.sql.gz` y `mm-config-<STAMP>.tar.gz` en el destino.

---

## 3. Completar lo que `backup.sh` no cubre (mismos comandos, otros volúmenes)

Mientras los adjuntos NO estén en Google Drive (PR-6 pendiente), **`echegaray-mm-data` hay que
respaldarlo aparte**. Mismo patrón que usa el script (contenedor alpine efímero, `tar` read-only):

```bash
cd app/infra/mattermost/backup
STAMP="$(date +%Y%m%d-%H%M%S)"

# 3a. Archivos subidos (adjuntos) — el gap principal.
docker run --rm -v echegaray-mm-data:/src:ro -v "$PWD/dumps":/dst alpine \
  tar czf "/dst/mm-data-$STAMP.tar.gz" -C /src .

# 3b. (Opcional) Certificados/estado ACME de Caddy — evita re-emitir tras un restore total.
docker run --rm -v echegaray-mm-caddy-data:/src:ro -v "$PWD/dumps":/dst alpine \
  tar czf "/dst/caddy-data-$STAMP.tar.gz" -C /src .
```

> `mm-bleve`, `mm-logs` y los plugins **no** se respaldan a propósito: el índice se reconstruye,
> los logs no valen y los plugins se reinstalan. Ver `RESTORE.md`.

### Backup en frío vs. en caliente

- `pg_dump` es **consistente en caliente** (snapshot transaccional): la base puede seguir en uso.
- El `tar` de `mm-data`/`mm-config` es "en caliente": suficiente para estos volúmenes (config y
  adjuntos cambian poco). Para un backup **perfectamente** consistente de archivos, hacerlo en una
  ventana con MM detenido (`docker compose stop mattermost`; respaldar; `docker compose up -d`).
  Para la rutina diaria no hace falta.

---

## 4. GAP detectado — dejar registrado

**`backup.sh` NO respalda `echegaray-mm-data` (los archivos subidos) por diseño de PR-1**: su
comentario asume que en la arquitectura objetivo los adjuntos vivirán en Google Drive (PR-6) y
`mm-data` sería sólo buffer. **Hoy PR-6 no está**, así que los adjuntos viven sólo en `mm-data`.

Consecuencia: un backup hecho **sólo** con `backup.sh` **pierde los archivos subidos** ante un
desastre. Hasta que exista PR-6, la rutina de backup **debe incluir el §3a**. Recomendación:
agregar el `tar` de `mm-data` al propio `backup.sh` o a un wrapper, para no depender de recordar
el paso manual. (Tareas pendientes de PR-9: programación automática + off-site + incluir `mm-data`.)

---

## 5. El `.env` (secretos) — respaldar aparte, con cuidado

`.env` no es un volumen y `backup.sh` no lo toca. Contiene `MM_DB_PASSWORD` (necesaria para
restaurar la base). Guardar una copia **cifrada y fuera del repo** (gestor de secretos / bóveda del
dueño), no junto a los dumps en claro. Sin la password de la base, el `RESTORE.md` de la base no
corre.

---

## 6. Frecuencia sugerida

| Qué | Frecuencia | Cómo |
|---|---|---|
| Base + config (`backup.sh`) | **Diaria** | `cd backup && ./backup.sh` |
| Archivos `mm-data` (§3a) | **Diaria** (hasta PR-6) | comando §3a |
| Caddy certs (§3b) | Al activar/cambiar exposición | comando §3b |
| `.env` (§5) | Cada vez que cambie un secreto | copia cifrada manual |
| Retención local | 14 días (default) | `RETENTION_DAYS` |
| **Off-site** (copiar dumps a otra máquina/nube) | **Diaria** — PENDIENTE PR-9 | ver §7 |

**RPO objetivo con esta rutina:** hasta ~24 h de pérdida máxima (último backup diario). Para bajarlo,
aumentar frecuencia o activar WAL/replicación (fuera de alcance de PR-1/PR-2).

---

## 7. Dónde guardar (off-site)

Los dumps en `backup/dumps/` están **en la misma VM**: si se pierde la VM, se pierden con ella.
Un backup sólo cuenta como respaldo cuando existe **fuera** de la VM. Ejemplo mínimo (copiar a otra
máquina por SSH):

```bash
# Desde una máquina de confianza (no la VM), tirar los dumps hacia afuera:
rsync -avz --remove-source-files \
  usuario@64.176.22.159:app/infra/mattermost/backup/dumps/ /ruta/segura/mm-backups/
```

Programar esto (cron/systemd timer) y el rotado off-site es **PR-9** (todavía no está). Registrarlo
como pendiente.

---

## 8. Verificar que el backup sirve (no confiar a ciegas)

Un backup no verificado no es un backup. Chequeos rápidos, todos read-only:

```bash
cd app/infra/mattermost/backup/dumps

# 8a. El dump de la base no está truncado y descomprime bien:
gunzip -t mm-db-<STAMP>.sql.gz && echo "gzip OK"
# Debe contener DDL/DML de Mattermost:
gunzip -c mm-db-<STAMP>.sql.gz | grep -m1 -i 'CREATE TABLE' && echo "contiene esquema"

# 8b. El tar de config lista el config.json:
tar tzf mm-config-<STAMP>.tar.gz | grep -i 'config.json'

# 8c. El tar de archivos no está vacío:
tar tzf mm-data-<STAMP>.tar.gz | head
```

**Verificación fuerte (recomendada periódicamente):** hacer un *restore de prueba* en un stack
descartable y confirmar que Mattermost levanta y muestra los datos — el procedimiento está en
`RESTORE.md` §"Ensayo de restore". **Nunca** ensayar restaurando sobre el volumen productivo.
