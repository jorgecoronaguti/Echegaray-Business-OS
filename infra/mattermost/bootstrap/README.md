# Mattermost — Bootstrap declarativo (PR-2)

Deja la instancia de Mattermost **lista para usar** (incluido el móvil) de forma **reproducible y sin
pasos manuales ocultos**: administrador inicial, equipo, canales operativos y configuración server-side,
todo declarado en archivos y aplicado por un script **idempotente**.

> **Alcance de este directorio:** solo el bootstrap de la instancia. La exposición pública estable
> (dominio `chat.ecsas.com.ar`, túnel Cloudflare, `SiteURL`) y el `docker-compose.yml` son de otro
> tramo del PR-2 — este bootstrap **no los toca**.

## Cómo habla con Mattermost (sin credenciales)

La imagen oficial `mattermost-team-edition` es *distroless* (no trae shell). El binario `mmctl` vive
**dentro** del contenedor (`/mattermost/bin/mmctl`) y usa **local mode** (socket unix interno) —
el mismo mecanismo que el `healthcheck` del compose de PR-1. No hace falta usuario/token ni exponer
puertos: el bootstrap corre en el host e invoca `mmctl` vía `docker exec ... --local`.

Requiere que PR-1 ya haya dejado `MM_SERVICESETTINGS_ENABLELOCALMODE=true` (así es).

## Archivos

| Archivo | Qué es |
|---|---|
| `bootstrap.sh` | Script idempotente. Aplica config, crea admin, equipo, canales y membresías. |
| `config.patch.json` | Configuración server-side declarativa, aplicada con `mmctl config patch`. |
| `channels.txt` | Lista declarativa de canales (`name\|display-name\|visibility\|purpose`). |
| `PUSH-MOVIL.md` | Push móvil: cómo conectan Android/iPhone, qué es TPNS y sus límites, cuándo y cómo migrar a HPNS. |
| `.env.bootstrap.example` | Plantilla de variables (admin, equipo, rutas). Copiar a `.env.bootstrap`. |
| `.gitignore` | Evita commitear `.env.bootstrap` (contiene la contraseña del admin). |

## Cómo correrlo

```bash
cd app/infra/mattermost/bootstrap
cp .env.bootstrap.example .env.bootstrap
# Editar .env.bootstrap: email/usuario del admin y una CONTRASEÑA fuerte
#   (>= 10 chars, con minúscula, mayúscula y número — política del config.patch.json).
#   Generar una:  openssl rand -base64 24
./bootstrap.sh
```

El script valida que el contenedor esté corriendo y que `mmctl --local` responda antes de tocar nada.

## Idempotencia

Correrlo muchas veces es seguro y **no duplica nada**:

- **Config:** aplicar el mismo patch deja el server igual.
- **Admin / equipo / canales:** se **chequea existencia antes de crear** (`user search`, `team search`,
  `channel search`); si ya existen, se saltan.
- **Membresías y rol de admin:** volver a agregar a un miembro existente o re-promover a un admin es
  un no-op benigno.

## Qué configura (`config.patch.json`)

Todos los nombres de clave verificados contra el código fuente de Mattermost **v11.8.4**
(`server/public/model/config.go`).

| Área | Clave | Valor | Por qué |
|---|---|---|---|
| Branding | `TeamSettings.SiteName` | `Echegaray Construcciones` | Nombre del sitio en web/app. **No** es `SiteURL` (eso es del otro tramo). |
| Contraseñas | `PasswordSettings.MinimumLength` / `Lowercase` / `Uppercase` / `Number` / `Symbol` | `10` / `true` / `true` / `true` / `false` | Base de seguridad razonable; sin símbolo obligatorio para no trabar a la gente de campo. |
| Sesión | `ServiceSettings.SessionLengthMobileInHours` | `8760` (1 año) | El móvil no expulsa al obrero cada día. |
| Sesión | `ServiceSettings.SessionLengthWebInHours` / `SessionLengthSSOInHours` | `720` (30 días) | Sesión web cómoda. |
| Sesión | `ServiceSettings.ExtendSessionLengthWithActivity` | `true` | La sesión se renueva con el uso; no te echa en medio del trabajo. |
| Archivos | `FileSettings.EnableFileAttachments` | `true` | Fotos de obra, PDFs de planos y comprobantes. |
| Archivos | `FileSettings.MaxFileSize` | `104857600` (100 MB) | Suficiente para planos/fotos pesadas. |
| Push móvil | `EmailSettings.SendPushNotifications` | `true` | Ver más abajo. |
| Push móvil | `EmailSettings.PushNotificationServer` | `https://push-test.mattermost.com` | **TPNS** — servicio de push de prueba oficial, gratis, para Team Edition. Detalle y límites en `PUSH-MOVIL.md`. |
| Push móvil | `EmailSettings.PushNotificationContents` | `generic` | La notificación muestra quién/dónde, **no** el texto del mensaje (privacidad). |

> Mattermost **no** filtra adjuntos por extensión desde el server: los controles disponibles son
> `EnableFileAttachments` y `MaxFileSize`. No se inventó una lista de tipos que no existe.

## Móvil: cómo queda listo (y una decisión que necesita el dueño)

Para que la **app oficial de Mattermost** (App Store / Google Play) funcione hacen falta dos cosas:

1. **Conectarse** → la app apunta al `SiteURL` público por HTTPS con certificado válido. Eso lo provee
   el **otro tramo del PR-2** (`chat.ecsas.com.ar` + túnel Cloudflare). Este bootstrap no lo toca.
2. **Recibir push (avisos con la app cerrada)** → requiere un *push proxy*. Este bootstrap deja
   configurado el **TPNS** (`https://push-test.mattermost.com`), el servicio de push de **prueba**
   oficial de Mattermost, que es **gratis** y funciona con las apps oficiales de las tiendas.

> **Decisión tomada: TPNS como estado inicial (costo cero).** El acceso **soportado y con SLA** a push
> es el **HPNS** (`global.push.mattermost.com`), reservado a los planes **pagos** (Professional /
> Enterprise / Cloud). Esta instancia corre **Team Edition (gratis)**, así que arrancamos con **TPNS**:
> las apps **oficiales** de Android e iPhone reciben push sin compilar nada propio ni pagar licencia.
>
> **TPNS es un servicio de prueba, no de producción sostenida** (sin SLA, con límites). El detalle
> completo — qué es, límites reales, cuándo y cómo migrar a HPNS — está en **`PUSH-MOVIL.md`**.
>
> | Opción | Estado | Qué implica |
> |---|---|---|
> | **TPNS** (`push-test`) | **Elegida (actual)** | Gratis, apps oficiales, sin licencia. Servicio de prueba, sin SLA. |
> | **HPNS** (`global.push`) | Migración futura | Push soportado con SLA; requiere plan pago. Migración documentada en `PUSH-MOVIL.md`. |
> | Push proxy autohospedado | Descartada por ahora | Gratis, pero exige desplegar el proxy y **compilar apps propias** con sus claves. Más trabajo. |
>
> Sin push, la app **igual conecta y funciona en primer plano**; lo que TPNS habilita es el aviso con la
> app cerrada. Para migrar a HPNS se cambia `PushNotificationServer` en el patch y se re-corre el
> bootstrap (ver `PUSH-MOVIL.md`).

## Canales elegidos (y por qué mínimos)

Al crear el equipo, Mattermost ya crea **Town Square** (canal de toda la empresa, obligatorio) y
**Off-Topic**. Por eso **no** creamos un canal "general" (sería duplicar Town Square). Solo los canales
operativos mínimos de una constructora chica:

| Canal | Visibilidad | Para qué |
|---|---|---|
| `direccion` | privado | Estrategia y temas confidenciales de los 2 de Dirección. |
| `obras` | público | Coordinación de obras en ejecución (jefes de obra + Dirección). |
| `administracion` | público | Comprobantes, pagos, cobranzas, impuestos, trámites. |
| `compras` | público | Pedidos de materiales, proveedores, subcontratos. |

Menos es más: se agregan canales cuando la operación lo pida, no antes. Para sumar/quitar canales,
editá `channels.txt` y re-corré el bootstrap (crea solo los que falten).

## Qué necesita el dueño

1. Correr el stack de infra (contenedor `echegaray-mm-app` healthy).
2. Copiar `.env.bootstrap.example` → `.env.bootstrap` y poner **email, usuario y una contraseña fuerte**
   del admin inicial.
3. Correr `./bootstrap.sh`.
4. **Push móvil ya resuelto con TPNS** (gratis, apps oficiales). Cuando el volumen/criticidad lo justifique, migrar a HPNS siguiendo `PUSH-MOVIL.md`.
5. Entrar por primera vez con ese admin desde la app oficial apuntando al dominio público.

## Verificación (sin tocar la instancia)

```bash
bash -n bootstrap.sh                 # sintaxis del script
python3 -m json.tool config.patch.json > /dev/null   # JSON válido
```
