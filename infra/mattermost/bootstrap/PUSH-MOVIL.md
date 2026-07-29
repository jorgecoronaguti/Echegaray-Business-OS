# Push móvil de Mattermost — TPNS ahora, HPNS después (PR-2)

Este documento explica cómo llegan las **notificaciones push** a los celulares del equipo de Echegaray,
qué servicio usamos hoy (**TPNS**, gratis), sus **límites reales**, y el **procedimiento exacto** para
migrar a **HPNS** cuando el uso lo justifique.

> Todo lo de acá es **declarativo**: la única palanca es `EmailSettings.PushNotificationServer` en
> `config.patch.json`. No hay pasos manuales ocultos ni infra extra que desplegar.

---

## 1. Cómo reciben push Android y iPhone

La app **oficial de Mattermost** (Google Play / App Store) recibe avisos con la app cerrada así:

```
App oficial (celular)                    Instancia Echegaray                 Push proxy
─────────────────────                    ───────────────────                 ──────────
1. Se conecta a SiteURL público   ───►   chat.ecsas.com.ar (HTTPS)
   (dominio + reverse proxy Caddy,       [otro tramo del PR-2]
    NO lo toca este bootstrap)

2. Registra su device-token       ───►   Mattermost server
   (FCM en Android / APNs en iOS)

3. Llega un mensaje nuevo          ───►   Mattermost server  ───►  push proxy (TPNS)
                                                                    │
4. El push proxy reenvía a         ◄───────────────────────────────┘
   Google FCM / Apple APNs  ──►  aparece la notificación en el celular
```

Dos condiciones **independientes**, ambas necesarias:

1. **Conexión** — la app apunta al **`SiteURL` público** por HTTPS con certificado válido
   (`chat.ecsas.com.ar` + reverse proxy Caddy). Lo provee **otro tramo del PR-2**; este bootstrap no lo toca.
   Sin esto la app ni siquiera entra.
2. **Push con la app cerrada** — requiere un **push proxy** (TPNS o HPNS). Es lo que configura este
   bootstrap vía `PushNotificationServer`.

> **Por qué hace falta un proxy y no basta el server propio:** Apple (APNs) y Google (FCM) solo aceptan
> notificaciones firmadas con las **claves de las apps**. Las apps **oficiales** de las tiendas están
> firmadas con las claves de **Mattermost**, no con las nuestras. Por eso el push de las apps oficiales
> **tiene que** pasar por el proxy de Mattermost (TPNS gratis o HPNS pago). La única forma de usar
> claves propias sería **compilar apps móviles propias** y autohospedar el proxy — mucho más trabajo,
> descartado por ahora.

Con la app en **primer plano** el push es irrelevante: los mensajes llegan por la conexión websocket
normal. El proxy solo importa para avisar con la **app cerrada o en segundo plano**.

---

## 2. Qué es TPNS y qué configura este bootstrap

**TPNS = Test Push Notification Service.** Es el servicio de push **de prueba** que Mattermost opera
**gratis** para instalaciones self-hosted no comerciales (como Team Edition).

Config aplicada en `config.patch.json` (verificada contra el código fuente de Mattermost, ver §6):

| Clave (`config.json`) | Valor | Significado |
|---|---|---|
| `EmailSettings.SendPushNotifications` | `true` | Activa el envío de push. |
| `EmailSettings.PushNotificationServer` | `https://push-test.mattermost.com` | URL oficial del **TPNS**. |
| `EmailSettings.PushNotificationContents` | `generic` | La notificación muestra **quién** y **en qué canal**, **no** el texto del mensaje. |

### Por qué `PushNotificationContents = generic` (y no `full` ni `id_loaded`)

Los cuatro valores válidos que define el server (`server/public/model/config.go`) son:

| Valor | Qué viaja por el push proxy | Qué ve el dueño en el celular |
|---|---|---|
| `generic_no_channel` | Solo "tenés un mensaje nuevo" | Ni remitente ni canal. Demasiado ciego. |
| **`generic`** ← elegido | Remitente + canal, **sin** texto | "Juan escribió en `obras`". Útil y privado. |
| `full` | **Texto completo** del mensaje | El mensaje entero. Filtra contenido al proxy. |
| `id_loaded` | Solo un ID; el celular después pide el contenido al server autenticado | Puede mostrar el texto completo en el celular, pero el proxy no ve nada. |

**Elegimos `generic`** porque cumple exactamente el criterio pedido: **mostrar quién/dónde sin filtrar
el texto del mensaje**. Con `generic`, el texto del mensaje **nunca sale** hacia el servicio de push de
Mattermost (importante porque TPNS es un servicio de prueba de un tercero). `full` filtraría el
contenido. `id_loaded` es aún más privado de cara al proxy, pero es más frágil sobre TPNS (obliga a un
segundo request autenticado del celular al server, agrega latencia y falla si la sesión no está viva) y,
en el celular, igual puede mostrar el texto completo — no es lo pedido. `generic` es el equilibrio
correcto entre utilidad y privacidad para arrancar.

---

## 3. Límites reales de TPNS (por qué es "inicial", no definitivo)

Según la documentación oficial de Mattermost (ver §6), TPNS:

- **No está recomendado para producción.** Es un servicio de **prueba/validación**.
- **No ofrece SLA** de nivel producción — sin garantía de entrega ni de disponibilidad. Un push puede
  demorarse o no llegar y no hay soporte comprometido.
- **Solo funciona con las apps oficiales** de Mattermost (App Store / Google Play). No sirve para apps
  compiladas a medida.
- **No está disponible para Mattermost Cloud** (no aplica a nuestro caso: somos self-hosted).
- Es un **recurso compartido y gratuito** operado por Mattermost; está sujeto a los límites de capacidad
  que Mattermost decida, sin aviso ni compromiso hacia usuarios gratuitos.

**Traducción para Echegaray:** TPNS es perfecto para **arrancar hoy a costo cero** y que Dirección,
jefes de obra y administración empiecen a recibir avisos en el celular. **No** hay que apoyar sobre él
un proceso donde perder una notificación tenga consecuencia económica o de seguridad (ej. una alerta
crítica de obra o de caja) **sin un plan B**, porque no hay garantía de entrega.

---

## 4. Cuándo migrar a HPNS

**HPNS = Hosted Push Notification Service.** Es el push **soportado, con SLA**, que Mattermost ofrece
como parte de sus planes **pagos** (Professional / Enterprise / Cloud). Mismas apps oficiales, misma
config declarativa — cambia el endpoint y requiere **licencia paga**.

URLs oficiales de HPNS (por región):

| Región | URL |
|---|---|
| Global (balanceado) | `https://global.push.mattermost.com` |
| US | `https://us.push.mattermost.com` |
| EU | `https://eu.push.mattermost.com` |
| AP | `https://ap.push.mattermost.com` |

**Disparadores concretos para migrar** (cualquiera que se cumpla):

- **Volumen / adopción:** el equipo ya depende del push a diario y el chat es un canal operativo real,
  no una prueba.
- **Criticidad:** empezamos a mandar por Mattermost avisos donde **perder una notificación cuesta**
  (alertas de caja, seguridad en obra, aprobaciones urgentes). Ahí la falta de SLA de TPNS deja de ser
  aceptable.
- **Fricción observada:** notificaciones que llegan tarde, intermitentes o que no llegan — síntoma de
  estar apoyándose de más en un servicio de prueba.

Mientras TPNS alcance y el uso sea de coordinación no crítica, **no** hay que pagar HPNS. Migrar es una
decisión de **negocio** (¿el costo de la licencia se justifica por la criticidad del canal?), no técnica:
técnicamente es cambiar una URL.

---

## 5. Procedimiento exacto de migración TPNS → HPNS

Cuando el dueño decida migrar:

1. **Contratar el plan pago** de Mattermost que incluye HPNS (Professional o Enterprise) y **cargar la
   licencia** en la instancia (System Console → About → Edition and License, o vía `mmctl`).
   Sin licencia válida, HPNS **rechaza** las notificaciones.

2. **Editar `config.patch.json`** — cambiar únicamente el endpoint de push:

   ```diff
     "EmailSettings": {
       "SendPushNotifications": true,
   -   "PushNotificationServer": "https://push-test.mattermost.com",
   +   "PushNotificationServer": "https://global.push.mattermost.com",
       "PushNotificationContents": "generic"
     }
   ```

   (`global` es la opción balanceada; usar `us`/`eu`/`ap` solo si se quiere fijar región.)
   `SendPushNotifications` y `PushNotificationContents` **no cambian**.

3. **Re-aplicar la config** con el bootstrap idempotente (re-corre `mmctl config patch` con el nuevo
   valor):

   ```bash
   cd app/infra/mattermost/bootstrap
   ./bootstrap.sh
   ```

4. **Reiniciar el server de Mattermost** — los cambios de la sección Push Notification Server
   **requieren reinicio** para tomar efecto:

   ```bash
   docker compose restart echegaray-mm-app   # nombre del servicio según el compose de infra
   ```

5. **Verificar** desde System Console → Environment → Push Notification Server (el botón *Test
   Connection* / *Test Notification*), o mandando un mensaje a un usuario con la app cerrada. Debe llegar
   el push vía HPNS.

> Migrar es **reversible**: volver a TPNS es volver a poner `push-test.mattermost.com`, re-aplicar y
> reiniciar. La licencia paga queda igual (no se pierde por cambiar el endpoint).

---

## 6. Fuentes (verificado el 2026-07-29)

- **Enable push notifications — Mattermost documentation** (URL de TPNS, límites, puertos, HPNS por
  región, licenciamiento):
  <https://docs.mattermost.com/administration-guide/configure/push-notification-server-configuration-settings.html>
- **Código fuente del server — `config.go`** (constante del endpoint de prueba
  `https://push-test.mattermost.com` y valores válidos de `PushNotificationContents`:
  `generic_no_channel`, `generic`, `full`, `id_loaded`):
  <https://github.com/mattermost/mattermost/blob/master/server/public/model/config.go>
- **Set up push notifications — Mattermost developers** (rol del push proxy, apps oficiales vs. propias):
  <https://developers.mattermost.com/contribute/more-info/mobile/push-notifications/service/>

**Estado a la fecha de verificación:** TPNS sigue **operativo** y presente como constante del server en
la rama `master` (no está deprecado), pero se mantiene explícitamente como servicio **de prueba, sin SLA
y no recomendado para producción**. HPNS sigue siendo la vía soportada, atada a plan pago.
