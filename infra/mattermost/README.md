# Mattermost — Infraestructura (PR-1 + PR-2)

Plataforma oficial de comunicación interna del Echegaray Business OS, autohospedada en la VM.

> **Alcance de PR-1:** infraestructura local. **PR-2** agrega la **exposición pública estable**
> vía Cloudflare Tunnel saliente (`https://chat.ecsas.com.ar`), sin abrir puertos y sin mover la
> zona DNS. Sigue **sin** integración con Google Drive, Supabase ni el Work Fabric (PR-4 en adelante)
> y **sin** lógica de negocio.

## Topología de exposición (PR-2)

```
navegador ──HTTPS/WSS──▶ edge Cloudflare ──túnel saliente──▶ cloudflared (esta VM)
                                                          └──HTTP──▶ 127.0.0.1:8065 (Mattermost)
```

- **Mattermost sigue en loopback** (`127.0.0.1:8065`): no se abre ningún puerto entrante.
- **Cloudflare Tunnel saliente** (`cloudflared`, servicio systemd `restart=always`) publica
  `chat.ecsas.com.ar` con HTTPS + WebSocket terminados en el edge de Cloudflare.
- **La zona `ecsas.com.ar` se queda en DonWeb.** No se mueven nameservers ni MX/SPF/DKIM/DMARC:
  solo se agrega **un** CNAME `chat → <TUNNEL_UUID>.cfargotunnel.com` (TTL 3600).
- `MM_SERVICESETTINGS_SITEURL=https://chat.ecsas.com.ar` (parametrizado por `${MM_SITE_URL}`)
  para el origen del WebSocket, CSRF y los enlaces que genera Mattermost.

Activación reproducible y los 2 pasos que requieren al dueño (login de Cloudflare + CNAME en
DonWeb): **`cloudflared/README.md`**. Reversión al estado pre-PR2: **`ROLLBACK.md`**.
Verificación de puertos/firewall: **`ufw/README.md`**.

## Principios de arquitectura (no negociables)

- **Mattermost nunca contiene lógica de negocio.** Es la cara de conversación; el cerebro es el Business OS.
- **Base de datos aislada.** Mattermost usa su **propio** PostgreSQL (contenedor `echegaray-mm-db`, sin
  puerto publicado). La verdad estructurada del OS sigue en **Supabase Cloud** (remota) — este stack no la toca.
- **Google Drive** sigue siendo el repositorio documental oficial (integración en PR-6).
- **Exposición mínima.** Mattermost escucha sólo en `127.0.0.1:8065`. La exposición pública estable
  es el **Cloudflare Tunnel saliente** de PR-2 (ver *Topología de exposición* arriba y `cloudflared/`):
  publica `chat.ecsas.com.ar` **sin abrir puertos entrantes**.

## Componentes

| Servicio | Contenedor | Imagen | Puerto | Red |
|---|---|---|---|---|
| Mattermost TE | `echegaray-mm-app` | `mattermost/mattermost-team-edition:<tag>` | `127.0.0.1:8065` | `echegaray-mattermost-net` |
| PostgreSQL | `echegaray-mm-db` | `postgres:16-alpine` | (ninguno, interno) | `echegaray-mattermost-net` |

Volúmenes con nombre (persistentes, fuera del repo): `echegaray-mm-db-data`, `echegaray-mm-config`,
`echegaray-mm-data`, `echegaray-mm-logs`, `echegaray-mm-plugins`, `echegaray-mm-client-plugins`,
`echegaray-mm-bleve`.

Límites de recursos: Mattermost `1.5 CPU / 1536 MB`, PostgreSQL `1.0 CPU / 512 MB`. Reinicio automático
`unless-stopped`. Logs rotados (10 MB × 3).

## Puesta en marcha

```bash
cd app/infra/mattermost
cp .env.example .env
# editar .env: generar MM_DB_PASSWORD fuerte, p.ej.:
#   openssl rand -base64 32 | tr -d '/+=' | cut -c1-40
docker compose up -d
```

Verificar:

```bash
docker compose ps
curl -f http://127.0.0.1:8065/api/v4/system/ping    # -> {"status":"OK"}
docker stats --no-stream echegaray-mm-app echegaray-mm-db
```

Primera cuenta (system admin) se crea en el primer acceso web a `http://127.0.0.1:8065` (por túnel SSH
o desde la propia VM, ya que no está expuesto).

## Operación

```bash
docker compose logs -f mattermost      # logs de la app
docker compose restart mattermost      # reiniciar sólo la app
docker compose down                    # detener (conserva volúmenes/datos)
docker compose down -v                 # detener y BORRAR datos (destructivo)
```

## Backups

`backup/backup.sh` respalda la base (`pg_dump` comprimido) y la configuración. PR-1 deja el script
funcional para uso manual; la **programación automática** y el envío off-site son **PR-9**.

```bash
cd app/infra/mattermost/backup && ./backup.sh     # escribe en ./dumps/ (gitignoreado)
```

## Qué NO hace este stack todavía

- No integra Google Drive (PR-6) ni Supabase (PR-6) ni el Work Fabric (PR-4/5).
- No corre el Communication Service (ver `../../communication-service/`), que es el servicio
  desacoplado y event-driven que traducirá los canales hacia el OS en PRs posteriores.

## Seguridad (base de PR-1, reforzada en PR-2, se completa en PR-8)

- Postgres sin puerto publicado; sólo alcanzable por la red interna del compose.
- Mattermost atado a `127.0.0.1:8065`; **cero puertos entrantes** para exponerlo (túnel saliente).
- `no-new-privileges` en ambos contenedores.
- Registro de servidor cerrado (`ENABLEOPENSERVER=false`) y diagnóstico remoto apagado.
- Secretos sólo en `.env` (gitignoreado) y, para el túnel, el credentials-file `<UUID>.json`
  en `/etc/cloudflared/` (fuera del repo). Nunca en el compose ni en el repo.
- Verificación de firewall/puertos documentada en `ufw/README.md` (chequeos read-only + comandos UFW).
