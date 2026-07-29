# ROLLBACK — Exposición pública de Mattermost (PR-2, Path B: Caddy)

Revierte la exposición pública y deja el sistema **exactamente en el estado PRE-PR2**:
Mattermost accesible **solo** en `127.0.0.1:8065`, sin reverse proxy, sin A record público,
sin puertos 80/443 respondiendo. Los datos de Mattermost (base y config) **no se tocan** en
ningún paso — y tampoco los certificados de Caddy (quedan en su volumen por si se reactiva).

El orden importa: primero se baja Caddy (deja de publicar), luego se limpia el DNS. Cada paso
es independiente y seguro de repetir (idempotente).

## 1. Parar y quitar el contenedor de Caddy

```bash
cd app/infra/mattermost
docker compose stop caddy
docker compose rm -f caddy
docker compose ps caddy        # no debe listar el contenedor
```

Desde este momento `https://chat.ecsas.com.ar` deja de responder: ya no hay nada escuchando
en 80/443 en la VM. Mattermost sigue vivo, intacto, solo en loopback.

> Alternativa equivalente sin quitar el contenedor: `docker compose stop caddy` solo. Quitarlo
> (`rm -f`) además libera 80/443 y deja el estado más limpio. Los volúmenes `caddy_data` /
> `caddy_config` (certificados) **no** se borran: reactivar es solo `docker compose up -d caddy`.

## 2. Borrar el A record en DonWeb (PASO DEL DUEÑO — DNS)

En el panel de DonWeb (DNS de `ecsas.com.ar`), **eliminar** el registro:

| Tipo | Nombre | Valor           |
|------|--------|-----------------|
| A    | `chat` | `64.176.22.159` |

`chat.ecsas.com.ar` vuelve a no resolver nada. **No** se toca nada más de la zona
(NS / MX / SPF / DKIM / DMARC / Google Workspace quedan intactos).

## 3. (Opcional) Cerrar 80/443 en el firewall

Si en la activación se abrieron 80/443 entrantes en el firewall de Vultr (y/o UFW), y ya no se
quiere exposición pública, volver a cerrarlos. Con Caddy abajo esto es opcional (no hay nada
escuchando), pero deja la superficie mínima. Ver `ufw/README.md`. Ejemplo UFW:

```bash
sudo ufw delete allow 80/tcp
sudo ufw delete allow 443/tcp
```

Y en el panel de Vultr, quitar las reglas de firewall de 80/443 si se habían agregado.

## 4. Verificar el estado PRE-PR2

```bash
# Mattermost sigue vivo SOLO en loopback (esto NUNCA cambió):
curl -f http://127.0.0.1:8065/api/v4/system/ping     # {"status":"OK"}

# El hostname público ya no responde:
curl -I --max-time 8 https://chat.ecsas.com.ar/api/v4/system/ping  # falla / no resuelve
dig +short chat.ecsas.com.ar                          # (vacío tras quitar el A record)

# No queda nada escuchando en 80/443 en el host:
ss -tlnH | grep -E ':80 |:443 ' || echo "OK: 80/443 sin listener"

# No queda contenedor de Caddy:
docker compose ps caddy                               # sin filas
```

## Nota sobre el compose

`docker-compose.yml` deja `MM_SERVICESETTINGS_SITEURL` con default público
(`https://chat.ecsas.com.ar`) pero **parametrizado** por `${MM_SITE_URL}`. Para volver el
SiteURL a local tras el rollback, setear en `.env`:

```bash
MM_SITE_URL=http://localhost:8065
```

y `docker compose up -d mattermost` para aplicarlo. No es necesario para que MM funcione en
loopback, pero evita que MM genere enlaces al hostname público que ya no responde.

## Reactivar (deshacer el rollback)

Reactivar es trivial y no destructivo: volver a poner el A record (paso 2 inverso) y
`docker compose up -d caddy`. Como los certificados persisten en `caddy_data`, no hay que
re-emitir nada si el certificado sigue vigente; si venció, Caddy lo renueva solo al arrancar.
