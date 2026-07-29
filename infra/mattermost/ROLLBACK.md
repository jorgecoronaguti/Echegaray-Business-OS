# ROLLBACK — Exposición pública de Mattermost (PR-2)

Revierte la exposición pública y deja el sistema **exactamente en el estado PRE-PR2**:
Mattermost accesible **solo** en `127.0.0.1:8065`, sin túnel, sin CNAME, sin servicio systemd.
Los datos de Mattermost (base y config) **no se tocan** en ningún paso.

El orden importa: primero se corta el túnel (deja de publicar), luego se limpia el DNS,
luego se retira el servicio. Cada paso es independiente y seguro de repetir (idempotente).

## 1. Parar y deshabilitar el servicio del túnel

```bash
sudo systemctl disable --now cloudflared
sudo systemctl status cloudflared --no-pager      # inactive (dead)
```

Desde este momento `https://chat.ecsas.com.ar` deja de responder por el túnel.

## 2. Borrar el CNAME en DonWeb (PASO DEL DUEÑO — DNS)

En el panel de DonWeb (DNS de `ecsas.com.ar`), **eliminar** el registro:

| Tipo  | Nombre | Valor                            |
|-------|--------|----------------------------------|
| CNAME | `chat` | `<TUNNEL_UUID>.cfargotunnel.com` |

`chat.ecsas.com.ar` vuelve a no resolver nada. **No** se toca nada más de la zona.

## 3. Retirar la unidad systemd y la config del sistema

```bash
sudo rm -f /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
sudo rm -rf /etc/cloudflared          # config.yml + credentials-file <UUID>.json
# Opcional: quitar el binario copiado al sistema (el de /home/jorge/bin/cloudflared queda).
sudo rm -f /usr/local/bin/cloudflared
```

## 4. (Opcional) Borrar el túnel en Cloudflare

Solo si se quiere eliminar el túnel del lado de Cloudflare (no solo dejar de correrlo):

```bash
cloudflared tunnel cleanup echegaray-mm     # cierra conexiones colgadas
cloudflared tunnel delete echegaray-mm      # requiere que no queden conexiones activas
```

> Si se piensa reactivar pronto, **saltear** este paso: reactivar es solo volver a instalar
> el servicio (ver `cloudflared/README.md`, pasos 3-4) sin recrear el túnel.

## 5. Verificar el estado PRE-PR2

```bash
# Mattermost sigue vivo SOLO en loopback (esto NUNCA cambió):
curl -f http://127.0.0.1:8065/api/v4/system/ping     # {"status":"OK"}

# El hostname público ya no responde:
curl -I https://chat.ecsas.com.ar/api/v4/system/ping  # falla / no resuelve
dig +short chat.ecsas.com.ar                          # (vacío)

# No queda servicio del túnel:
systemctl status cloudflared --no-pager 2>&1 | head -1   # Unit cloudflared.service could not be found.
```

## Nota sobre el compose

`docker-compose.yml` deja `MM_SERVICESETTINGS_SITEURL` con default público
(`https://chat.ecsas.com.ar`) pero **parametrizado** por `${MM_SITE_URL}`. Para volver el
SiteURL a local tras el rollback, setear en `.env`:

```bash
MM_SITE_URL=http://localhost:8065
```

y `docker compose up -d` para aplicarlo. No es necesario para que MM funcione en loopback,
pero evita que MM genere enlaces al hostname público que ya no responde.
