# Mattermost — Infraestructura (PR-1 + PR-2)

Plataforma oficial de comunicación interna del Echegaray Business OS, autohospedada en la VM.

> **Alcance de PR-1:** infraestructura local. **PR-2 (Path B)** agrega la **exposición pública
> estable** vía **reverse proxy Caddy** (`https://chat.ecsas.com.ar`), con un A record en DonWeb
> apuntando a la IP pública de la VM. Sigue **sin** integración con Google Drive, Supabase ni el
> Work Fabric (PR-4 en adelante) y **sin** lógica de negocio.

## Topología de exposición (PR-2, Path B)

```
navegador ──HTTPS/WSS (443)──▶ echegaray-mm-caddy ──HTTP (red interna)──▶ mattermost:8065
                                (TLS + ACME auto)                          (loopback + interna)
```

- **Caddy** (`echegaray-mm-caddy`, servicio del mismo compose) es el **único** que mira a
  Internet: publica **80/443**, termina TLS con **ACME automático** y proxya a `mattermost:8065`
  por la red interna. HTTP→HTTPS y WebSocket los maneja Caddy de forma transparente.
- **Mattermost sigue en loopback** (`127.0.0.1:8065`), solo para health/mmctl locales: **no** se
  expone directo a Internet.
- **La zona `ecsas.com.ar` se queda en DonWeb.** No se mueven nameservers ni MX/SPF/DKIM/DMARC ni
  Google Workspace: solo se agrega **un** A record `chat → 64.176.22.159` (TTL 3600).
- Se deben **habilitar 80/443 entrantes** en el firewall de Vultr (y en UFW si aplica). Caddy los
  necesita: 80 para el desafío ACME HTTP-01 + redirect, 443 para HTTPS (y TLS-ALPN-01 alternativo).
- `MM_SERVICESETTINGS_SITEURL=https://chat.ecsas.com.ar` (parametrizado por `${MM_SITE_URL}`)
  para el origen del WebSocket, CSRF y los enlaces que genera Mattermost.

Arranque/parada del proxy, prerrequisitos y verificación: **`caddy/README.md`**. Reversión al
estado pre-PR2: **`ROLLBACK.md`**. Verificación de puertos/firewall: **`ufw/README.md`**.

## Principios de arquitectura (no negociables)

- **Mattermost nunca contiene lógica de negocio.** Es la cara de conversación; el cerebro es el Business OS.
- **Base de datos aislada.** Mattermost usa su **propio** PostgreSQL (contenedor `echegaray-mm-db`, sin
  puerto publicado). La verdad estructurada del OS sigue en **Supabase Cloud** (remota) — este stack no la toca.
- **Google Drive** sigue siendo el repositorio documental oficial (integración en PR-6).
- **Exposición mínima.** Mattermost escucha sólo en `127.0.0.1:8065`. La exposición pública estable
  la da el **reverse proxy Caddy** de PR-2 (ver *Topología de exposición* arriba y `caddy/`):
  Caddy es el único con puertos entrantes (80/443) y sirve `chat.ecsas.com.ar` con HTTPS automático.

## Componentes

| Servicio | Contenedor | Imagen | Puerto | Red |
|---|---|---|---|---|
| Caddy (reverse proxy) | `echegaray-mm-caddy` | `caddy:2-alpine` | `80`, `443` (público) | `echegaray-mattermost-net` |
| Mattermost TE | `echegaray-mm-app` | `mattermost/mattermost-team-edition:<tag>` | `127.0.0.1:8065` (loopback) | `echegaray-mattermost-net` |
| PostgreSQL | `echegaray-mm-db` | `postgres:16-alpine` | (ninguno, interno) | `echegaray-mattermost-net` |

Volúmenes con nombre (persistentes, fuera del repo): `echegaray-mm-db-data`, `echegaray-mm-config`,
`echegaray-mm-data`, `echegaray-mm-logs`, `echegaray-mm-plugins`, `echegaray-mm-client-plugins`,
`echegaray-mm-bleve`, y para Caddy `echegaray-mm-caddy-data` (certs/ACME — crítico para la
renovación automática) y `echegaray-mm-caddy-config`.

Límites de recursos: Mattermost `1.5 CPU / 1536 MB`, PostgreSQL `1.0 CPU / 512 MB`, Caddy
`0.5 CPU / 256 MB`. Reinicio automático `unless-stopped`. Logs rotados (10 MB × 3).

## Puesta en marcha

```bash
cd app/infra/mattermost
cp .env.example .env
# editar .env: generar MM_DB_PASSWORD fuerte, p.ej.:
#   openssl rand -base64 32 | tr -d '/+=' | cut -c1-40
# y setear ACME_EMAIL (correo real para avisos de certificado) + confirmar CHAT_DOMAIN.
docker compose up -d          # levanta db + mattermost + caddy (caddy espera a MM healthy)
```

Verificar:

```bash
docker compose ps
curl -f http://127.0.0.1:8065/api/v4/system/ping    # -> {"status":"OK"} (origen loopback)
docker stats --no-stream echegaray-mm-caddy echegaray-mm-app echegaray-mm-db
```

Primera cuenta (system admin) se crea en el primer acceso web. Antes de que el A record esté
propagado y 80/443 abiertos, se accede a `http://127.0.0.1:8065` (por túnel SSH o desde la VM).
La exposición pública en `https://chat.ecsas.com.ar` la sirve Caddy — ver `caddy/README.md` para
prerrequisitos (A record + puertos) y verificación.

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
- Mattermost atado a `127.0.0.1:8065`; **no** se expone directo — el único borde público es Caddy.
- `no-new-privileges` en los tres contenedores (Caddy, Mattermost, Postgres).
- TLS terminado en Caddy con certificado ACME automático y **renovación automática** (certs en el
  volumen `echegaray-mm-caddy-data`, fuera del repo).
- Registro de servidor cerrado (`ENABLEOPENSERVER=false`) y diagnóstico remoto apagado.
- Secretos sólo en `.env` (gitignoreado). `ACME_EMAIL` y `CHAT_DOMAIN` no son secretos, pero se
  parametrizan por entorno. No hay credenciales de túnel: el certificado lo gestiona Caddy solo.
- Verificación de firewall/puertos documentada en `ufw/README.md` (80/443 entrantes para Caddy;
  8065 nunca al exterior).
