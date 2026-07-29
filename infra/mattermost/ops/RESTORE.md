# RESTORE — Restaurar Mattermost desde un backup

Cómo recuperar el stack desde los backups producidos por `../backup/backup.sh` + los del §3 de
`BACKUP.md`. **Restaurar es ⚠️ Nivel E**: sobreescribe datos reales de forma potencialmente
irreversible. **Requiere autorización explícita del dueño** y una ventana coordinada (habrá corte
de chat). Antes de tocar nada, **sacar un backup fresco del estado actual** (por si el restore hay
que abortarlo).

> **Regla de oro:** un restore sobre el volumen productivo es destructivo. Cuando la duda exista,
> restaurar primero en un **stack de ensayo descartable** (§"Ensayo de restore") y recién después,
> con evidencia, sobre producción.

---

## 0. Orden correcto de recuperación

El orden importa porque Mattermost valida el esquema de la base contra su versión de binario:

1. **Detener Mattermost** (que nadie escriba mientras se restaura).
2. **Restaurar la base** (`echegaray-mm-db-data`) desde el `pg_dump`.
3. **Restaurar la config** (`echegaray-mm-config`) — debe ser de una versión **compatible** con la
   base (misma `MM_IMAGE_TAG` o migración, ver `ACTUALIZACION.md`).
4. **Restaurar los archivos** (`echegaray-mm-data`) — adjuntos.
5. (Opcional) **Restaurar los certificados** de Caddy, o dejar que los re-emita solo.
6. **Levantar** y **validar**.

El **`bleve`** (índice de búsqueda) **no se restaura**: Mattermost lo reconstruye. Los **plugins** se
reinstalan si hacían falta. Los **logs** no se restauran.

---

## 1. Preparar la ventana

```bash
cd app/infra/mattermost

# 1a. Backup de seguridad del estado ACTUAL antes de sobreescribir (imprescindible).
cd backup && ./backup.sh && cd ..                 # base + config
STAMP="$(date +%Y%m%d-%H%M%S)"
docker run --rm -v echegaray-mm-data:/src:ro -v "$PWD/backup/dumps":/dst alpine \
  tar czf "/dst/mm-data-PRE-RESTORE-$STAMP.tar.gz" -C /src .   # archivos actuales

# 1b. Detener SÓLO la app (la base sigue arriba para recibir el restore).
docker compose stop mattermost
```

Confirmar la password de la base disponible (de `.env`, `MM_DB_PASSWORD`).

---

## 2. Restaurar la base PostgreSQL

El dump se hizo con `pg_dump --clean --if-exists`: al aplicarlo, **borra y recrea** los objetos, así
que no hace falta vaciar la base a mano. La base debe estar **corriendo** (`echegaray-mm-db` up).

```bash
cd app/infra/mattermost

# Cargar credenciales de la base:
set -a; source .env; set +a

# Restaurar (idempotente por el --clean --if-exists del dump):
gunzip -c backup/dumps/mm-db-<STAMP>.sql.gz \
  | docker exec -i -e PGPASSWORD="$MM_DB_PASSWORD" echegaray-mm-db \
      psql -U "$MM_DB_USER" -d "$MM_DB_NAME"
```

> Este es exactamente el comando de referencia documentado en la cabecera de `../backup/backup.sh`,
> completado con `PGPASSWORD` y el usuario/base del `.env`.

Verificar que cargó sin errores fatales (algún `NOTICE`/`already exists` es benigno). Chequeo rápido:

```bash
docker exec -e PGPASSWORD="$MM_DB_PASSWORD" echegaray-mm-db \
  psql -U "$MM_DB_USER" -d "$MM_DB_NAME" -c "\dt" | head       # deben listarse tablas de MM
```

### Alternativa: restaurar el volumen entero (recuperación física)

Si en vez de un `pg_dump` lógico tenés un `tar` del volumen `echegaray-mm-db-data` (backup físico),
restaurar **con la base detenida** para no corromper:

```bash
docker compose stop mattermost-db
docker run --rm -v echegaray-mm-db-data:/dst -v "$PWD/backup/dumps":/src alpine \
  sh -c 'rm -rf /dst/* && tar xzf /src/mm-db-data-<STAMP>.tar.gz -C /dst'
docker compose up -d mattermost-db      # esperar 'healthy'
```

El `pg_dump` lógico (§2 principal) es el camino recomendado: es el que produce `backup.sh` y es
portable entre versiones menores de Postgres.

---

## 3. Restaurar la config de Mattermost

```bash
cd app/infra/mattermost
# Reemplaza el contenido del volumen de config por el del backup.
docker run --rm -v echegaray-mm-config:/dst -v "$PWD/backup/dumps":/src alpine \
  sh -c 'rm -rf /dst/* && tar xzf /src/mm-config-<STAMP>.tar.gz -C /dst'
```

> La config debe corresponder a una versión **compatible** con la base restaurada. Si el backup es
> de una versión distinta de `MM_IMAGE_TAG`, ver `ACTUALIZACION.md` (compatibilidad de esquema).

---

## 4. Restaurar los archivos subidos (`mm-data`)

Sólo si tenés el `mm-data-<STAMP>.tar.gz` (ver `BACKUP.md` §3a — hasta PR-6 este backup es
imprescindible; sin él, se recupera todo menos los adjuntos).

```bash
cd app/infra/mattermost
docker run --rm -v echegaray-mm-data:/dst -v "$PWD/backup/dumps":/src alpine \
  sh -c 'rm -rf /dst/* && tar xzf /src/mm-data-<STAMP>.tar.gz -C /dst'
```

---

## 5. (Opcional) Restaurar certificados de Caddy

No es necesario: Caddy re-emite el certificado solo si 80/443 y el DNS están OK. Restaurarlo sólo
evita una re-emisión (y posibles rate limits) en un desastre total:

```bash
cd app/infra/mattermost
docker run --rm -v echegaray-mm-caddy-data:/dst -v "$PWD/backup/dumps":/src alpine \
  sh -c 'rm -rf /dst/* && tar xzf /src/caddy-data-<STAMP>.tar.gz -C /dst'
```

---

## 6. Levantar y validar

```bash
cd app/infra/mattermost
docker compose up -d                 # levanta db + mattermost + caddy en orden

# Esperar a que MM aplique migraciones y quede healthy:
docker compose ps
docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status   # Server/DB/Filestore OK

# Salud local y QA read-only:
curl -f http://127.0.0.1:8065/api/v4/system/ping        # {"status":"OK"}
bash qa/pruebas.sh                                       # exit 0 esperado
```

Validación funcional (además de los checks técnicos):

- Entrar por la web/app y confirmar que aparecen **equipos, canales y mensajes** esperados.
- Abrir un mensaje con **adjunto** y confirmar que el archivo se descarga (prueba de `mm-data`).
- La **búsqueda** puede tardar unos minutos hasta que `bleve` reindexe — es esperado.

Si algo quedó inconsistente, **abortar** restaurando el backup PRE-RESTORE del §1a por el mismo
procedimiento.

---

## Ensayo de restore (recomendado, sin tocar producción)

Para verificar backups o practicar el procedimiento, levantar un **stack de ensayo descartable**
con volúmenes distintos, restaurar ahí y confirmar que MM levanta. Nunca ensayar contra los
volúmenes productivos.

Camino más simple y seguro: copiar `app/infra/mattermost/` a otra ruta/host, cambiar `name:` del
proyecto en el compose (p. ej. `echegaray-mattermost-ensayo`) **y los nombres de los volúmenes** para
que no colisionen con los reales, levantar, y correr §2–§6 apuntando a esos volúmenes. Al terminar:

```bash
docker compose -p echegaray-mattermost-ensayo down -v   # DESTRUYE sólo los volúmenes del ENSAYO
```

Confirmar dos veces el `-p`/nombres antes de un `down -v`: ese flag borra volúmenes.

---

## Referencias

- Qué se respalda y cómo: `BACKUP.md` · script real `../backup/backup.sh`.
- Compatibilidad de versión base↔config: `ACTUALIZACION.md`.
- Recuperación ante pérdida total de la VM: `DR-CHECKLIST.md`.
- Reversión de la exposición pública (no es un restore de datos): `../ROLLBACK.md`.
