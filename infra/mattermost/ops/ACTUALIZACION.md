# ACTUALIZACIÓN — Subir la versión de Mattermost (y Caddy)

Cómo actualizar la versión de la imagen de Mattermost Team Edition y de Caddy de forma segura y
reversible. **Actualizar Mattermost es ⚠️ Nivel E**: corre **migraciones de esquema en la base**
que, una vez aplicadas, **no siempre se pueden revertir** hacia atrás. Requiere **backup previo
obligatorio**, **autorización explícita del dueño** y una **ventana coordinada** (habrá corte de
chat). Actualizar Caddy es de bajo riesgo (§4).

---

## 0. Reglas antes de tocar la versión

1. **Backup obligatorio** (base + config + archivos) inmediatamente antes — ver `BACKUP.md`.
2. **Un salto de versión por vez, hacia adelante.** Mattermost no soporta bajar de versión (el
   esquema migrado no es compatible con un binario más viejo). No saltear versiones mayores: seguir
   la ruta de upgrade oficial (no saltar varias majors de una).
3. **Pin exacto, nunca `latest`.** El compose usa `mattermost/mattermost-team-edition:${MM_IMAGE_TAG}`
   y `.env` fija el tag (hoy `MM_IMAGE_TAG=11.8.4`). Cambiar el número, no usar `latest`.
4. **Leer las release notes** de la versión destino: buscar cambios de esquema, deprecaciones y
   requisitos de versión mínima de Postgres.

---

## 1. Preparación

```bash
cd app/infra/mattermost

# 1a. Confirmar versión actual (imagen y servidor):
grep MM_IMAGE_TAG .env
docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status   # incluye Server Version

# 1b. Backup previo OBLIGATORIO (base + config + archivos). Ver BACKUP.md.
cd backup && ./backup.sh && cd ..
STAMP="$(date +%Y%m%d-%H%M%S)"
docker run --rm -v echegaray-mm-data:/src:ro -v "$PWD/backup/dumps":/dst alpine \
  tar czf "/dst/mm-data-PRE-UPGRADE-$STAMP.tar.gz" -C /src .

# 1c. Línea base sana antes de tocar nada:
bash qa/pruebas.sh          # debe dar exit 0
```

Anotar la versión actual (p. ej. `11.8.4`): es el valor de rollback del §3.

---

## 2. Actualizar Mattermost

```bash
cd app/infra/mattermost

# 2a. Cambiar el tag en .env a la versión destino (ejemplo ilustrativo, verificá la real):
#     editar .env -> MM_IMAGE_TAG=<nueva_version>
nano .env

# 2b. Descargar la nueva imagen SIN aplicarla todavía (permite abortar si el pull falla):
docker compose pull mattermost

# 2c. Recrear SÓLO el contenedor de Mattermost con la nueva imagen.
#     Al arrancar, MM detecta el esquema viejo y corre las migraciones automáticamente.
docker compose up -d mattermost

# 2d. Seguir las migraciones en vivo (buscar que terminen sin error):
docker compose logs -f mattermost
```

En los logs esperás ver el arranque aplicando migraciones y luego el server listo, **sin**
`error`/`fatal`. La base (`echegaray-mm-db`) y Caddy no se recrean en este paso.

### 2e. Verificar la actualización

```bash
docker compose ps mattermost                                             # Up (healthy)
docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status # Server/DB/Filestore OK + nueva versión
curl -f http://127.0.0.1:8065/api/v4/system/ping                         # {"status":"OK"}
bash qa/pruebas.sh                                                        # exit 0
```

Validación funcional: entrar por la web/app, confirmar login, canales, envío de mensaje y descarga
de un adjunto. Si el QA da FAIL o las migraciones fallaron, ir al §3.

---

## 3. Rollback de una actualización de Mattermost (⚠️ con matices)

**Importante:** si las migraciones de esquema ya corrieron, **volver el binario a la versión vieja
NO alcanza** — el binario viejo puede no arrancar contra el esquema nuevo. El rollback seguro de una
actualización con migraciones aplicadas es **restaurar la base desde el backup PRE-UPGRADE**:

```bash
cd app/infra/mattermost

# 3a. Volver el tag a la versión anterior en .env:
nano .env                       # MM_IMAGE_TAG=<version_anterior, ej 11.8.4>

# 3b. Restaurar la base y la config desde el backup PRE-UPGRADE (procedimiento completo en RESTORE.md):
docker compose stop mattermost
set -a; source .env; set +a
gunzip -c backup/dumps/mm-db-<STAMP_PRE_UPGRADE>.sql.gz \
  | docker exec -i -e PGPASSWORD="$MM_DB_PASSWORD" echegaray-mm-db psql -U "$MM_DB_USER" -d "$MM_DB_NAME"

# 3c. Levantar con la imagen anterior:
docker compose up -d mattermost
docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status
```

Por eso el backup del §1b es **innegociable**: es el único rollback confiable de una migración.

---

## 4. Actualizar Caddy (bajo riesgo)

Caddy no tiene esquema de base; actualizarlo es recrear el contenedor. Los certificados persisten en
`echegaray-mm-caddy-data`, así que **no se re-emiten** al actualizar.

```bash
cd app/infra/mattermost
# El compose fija caddy:2-alpine. Para traer la última 2.x de esa etiqueta:
docker compose pull caddy
docker compose up -d caddy
docker compose ps caddy                                   # Up (healthy)
curl -I https://chat.ecsas.com.ar/api/v4/system/ping      # HTTP/2 200 (si está publicado)
```

Rollback de Caddy: volver a la imagen previa (`docker compose up -d caddy` con la etiqueta anterior)
— trivial y no destructivo, los certs siguen en su volumen.

> Validar el Caddyfile sin levantar nada, si se editó la config:
> ```bash
> docker run --rm -v "$PWD/caddy/Caddyfile":/etc/caddy/Caddyfile:ro \
>   caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
> ```

---

## 5. Actualizar Postgres (mayor cuidado — poco frecuente)

Subir de **major** de Postgres (hoy `postgres:16-alpine`) **no** es sólo cambiar el tag: el formato
de datos on-disk entre majors no es compatible y requiere `pg_dump`/`pg_restore` (dump con la 16,
cargar en la 17). Cambios de **minor** dentro de la misma major (16.x) sí son directos:
`docker compose pull mattermost-db && docker compose up -d mattermost-db`. Un cambio de major se
planifica aparte, con backup y ensayo (ver `RESTORE.md` §"Ensayo de restore"). No hacerlo en la
misma ventana que un upgrade de Mattermost.

---

## 6. Notas de compatibilidad de esquema

- **Base ↔ config ↔ binario van juntos.** Un backup de config de una versión no es necesariamente
  válido para otra. Al restaurar (ver `RESTORE.md`), la config debe corresponder a una versión
  compatible con la base.
- **Postgres mínimo:** cada versión de Mattermost declara una versión mínima de Postgres soportada.
  Verificar en las release notes antes de subir MM que la `postgres:16` actual sigue soportada (o
  actualizar Postgres primero, §5).
- **Migraciones = una vía.** Tras aplicar migraciones, el único camino atrás es restaurar la base
  (§3). Planificar en consecuencia.

---

## Referencias

- Backup previo: `BACKUP.md` · script `../backup/backup.sh`.
- Restaurar (rollback real): `RESTORE.md`.
- Estado/QA: `RUNBOOK.md` · `../qa/pruebas.sh`.
- Exposición pública (Caddy) y su reversión: `../caddy/README.md` · `../ROLLBACK.md`.
