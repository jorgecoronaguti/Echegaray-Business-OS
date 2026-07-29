# Guía móvil y onboarding — Mattermost Echegaray (PR-2)

Cómo instalar, conectar y usar el chat de la empresa (**Mattermost**) en el celular, y cómo dar de alta
a una persona nueva. Pensada para todo el equipo, **incluido el personal de obra**.

- **Servidor de la empresa:** `https://chat.ecsas.com.ar`
- **App:** la **oficial de Mattermost** (Google Play / App Store). No hay app propia de Echegaray.
- **Push (avisos con la app cerrada):** hoy con **TPNS**, un servicio **de prueba, sin garantía**.
  El detalle técnico vive en `infra/mattermost/bootstrap/PUSH-MOVIL.md` — acá no se duplica.

> Este documento es **solo documentación**. No cambia configuración ni toca producción.

---

## Índice

1. [Antes de empezar (lo que cada persona necesita)](#1-antes-de-empezar)
2. [Instalar y conectar en Android](#2-android)
3. [Instalar y conectar en iPhone](#3-iphone)
4. [Notificaciones push: cómo funcionan hoy y sus límites](#4-notificaciones-push)
5. [Onboarding de empleados](#5-onboarding-de-empleados)
   - 5.1 [Instructivo de una página (imprimible / WhatsApp)](#51-instructivo-de-una-pagina)
   - 5.2 [Política de contraseñas](#52-politica-de-contrasenas)
   - 5.3 [Qué canales verá cada rol](#53-canales-por-rol)
   - 5.4 [Buenas prácticas mínimas](#54-buenas-practicas-minimas)
   - 5.5 [Checklist para dar de alta a una persona nueva](#55-checklist-de-alta)
6. [Problemas frecuentes](#6-problemas-frecuentes)

---

## 1. Antes de empezar

Cada persona necesita:

- Un **celular** Android o iPhone con conexión a internet (datos o WiFi).
- Su **usuario y contraseña** de Mattermost. Los crea/entrega quien administra el sistema (ver
  [checklist de alta](#55-checklist-de-alta)). **Nadie se registra solo.**
- El nombre del servidor a mano: **`chat.ecsas.com.ar`**.

No hace falta configurar nada raro ni saber de tecnología. Son 5 minutos.

---

## 2. Android

**App oficial:** *Mattermost* (autor: Mattermost, Inc.) en **Google Play**.

1. Abrir **Play Store**.
2. Buscar **Mattermost** e instalar (el ícono es azul, cuadrado con una forma tipo "]").
3. Abrir la app. En la primera pantalla pide **la dirección del servidor**.
4. Escribir exactamente: **`https://chat.ecsas.com.ar`** y tocar **Conectar / Continuar**.
5. Ingresar **usuario** (o email) y **contraseña** entregados por la empresa. Tocar **Iniciar sesión**.
6. Si la app pide **permiso para enviar notificaciones**, tocar **Permitir**. (Sin esto no llegan
   los avisos con la app cerrada.)
7. Listo. Ya se ven los canales de la empresa (Obras, Administración, etc. según el rol).

> Si aparece "no se puede conectar", revisar que esté escrito con `https://` y sin espacios, y que el
> celular tenga internet. Ver [Problemas frecuentes](#6-problemas-frecuentes).

---

## 3. iPhone

**App oficial:** *Mattermost* (autor: Mattermost, Inc.) en la **App Store**.

1. Abrir **App Store**.
2. Buscar **Mattermost** e instalar.
3. Abrir la app. Pide **la dirección del servidor**.
4. Escribir exactamente: **`https://chat.ecsas.com.ar`** y tocar **Conectar / Continuar**.
5. Ingresar **usuario** (o email) y **contraseña**. Tocar **Iniciar sesión**.
6. iPhone va a preguntar si permite **notificaciones**: tocar **Permitir**. (Si por error se toca
   "No permitir", se corrige en *Ajustes → Mattermost → Notificaciones → Permitir notificaciones*.)
7. Listo.

> En iPhone las notificaciones son especialmente estrictas: si no se dio el permiso, **no llega ningún
> aviso** con la app cerrada, aunque todo lo demás funcione.

---

## 4. Notificaciones push

Las **notificaciones push** son los avisos que aparecen en el celular **cuando la app está cerrada o en
segundo plano** (por ejemplo, "Juan escribió en *Obras*"). Con la app abierta los mensajes llegan solos;
el push solo importa cuando la app **no** está abierta.

### Cómo funcionan hoy

- Usamos **TPNS** (*Test Push Notification Service*), el servicio de push **gratuito** de Mattermost.
- El aviso muestra **quién** escribió y **en qué canal**, pero **no el texto** del mensaje (privacidad).
- Para que funcione, cada persona debe **permitir las notificaciones** cuando la app lo pide
  (pasos 6 de Android / iPhone).

### Límites de TPNS — importante comunicarlos

TPNS es un servicio **de prueba**, no de producción. En criollo:

- **No garantiza la entrega.** Un aviso puede **llegar tarde o no llegar**, y no hay a quién reclamarle.
- **No tiene SLA** (ningún compromiso de disponibilidad). Es "mejor esfuerzo", gratis.
- Es un **recurso compartido** que Mattermost opera para pruebas; puede tener límites sin aviso.
- Solo funciona con la **app oficial** de las tiendas (la que instalamos).

**Qué significa para el trabajo:** el chat sirve muy bien para **coordinar**, pero **no hay que
apoyar en el push un aviso donde perderlo cueste plata o seguridad** (una alerta crítica de caja, de
obra o una aprobación urgente) **sin confirmarlo por otra vía** (llamada, WhatsApp). Si es urgente y
crítico, además del mensaje: llamar.

### Cuándo migramos a un push confiable (HPNS)

Cuando el chat pase de "prueba" a **canal operativo diario** y/o empecemos a mandar **avisos críticos**,
se migra a **HPNS** (el push **con garantía**, de plan pago de Mattermost). Es una decisión de negocio
(¿el costo se justifica por la criticidad?), técnicamente es cambiar una URL. Los disparadores concretos
(volumen, criticidad, notificaciones que llegan tarde) y el **procedimiento exacto de migración** están
en **`infra/mattermost/bootstrap/PUSH-MOVIL.md`** (secciones 3, 4 y 5). No se repiten acá.

---

## 5. Onboarding de empleados

### 5.1 Instructivo de una página

> Pensado para **imprimir** y pegar en la oficina/obra, o **mandar por WhatsApp** como imagen/PDF.
> Redactado para que lo siga cualquiera, sin vueltas.

```
┌─────────────────────────────────────────────────────────────────┐
│   CHAT DE ECHEGARAY — CÓMO ENTRAR DESDE EL CELULAR                │
│                                                                   │
│   1) Instalá la app "Mattermost" (azul) desde:                    │
│        • Android → Play Store                                     │
│        • iPhone  → App Store                                      │
│                                                                   │
│   2) Abrí la app. Cuando pida el SERVIDOR, escribí:               │
│                                                                   │
│            https://chat.ecsas.com.ar                              │
│                                                                   │
│   3) Poné tu USUARIO y CONTRASEÑA (te los da la empresa).         │
│                                                                   │
│   4) Cuando pregunte por NOTIFICACIONES, tocá "PERMITIR".         │
│                                                                   │
│   5) ¡Listo! Vas a ver tus canales (Obras, etc.).                 │
│                                                                   │
│   ───────────────────────────────────────────────────────────    │
│   REGLAS RÁPIDAS:                                                  │
│   • Tu contraseña NO se comparte con nadie.                        │
│   • En un celular que no es tuyo → CERRÁ SESIÓN al terminar.       │
│   • Un aviso puede tardar o no llegar. Si es URGENTE, llamá.       │
│                                                                   │
│   ¿Problemas para entrar?  Escribile a: __________________        │
│   (referente de sistemas / administración)                        │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Política de contraseñas

La configuración del servidor **exige** que toda contraseña tenga:

| Requisito | Valor |
|---|---|
| Largo mínimo | **10 caracteres** |
| Al menos una **minúscula** | sí (`a-z`) |
| Al menos una **mayúscula** | sí (`A-Z`) |
| Al menos un **número** | sí (`0-9`) |
| Símbolo | no obligatorio (pero permitido y recomendable) |

Reglas de uso:

- **Cada persona tiene su propio usuario.** No hay usuarios compartidos.
- La contraseña **no se comparte** con nadie, ni siquiera con Dirección o Administración.
- Al dar de alta, se entrega una **contraseña inicial** y se le pide a la persona que la **cambie**
  la primera vez (*Perfil → Seguridad → Cambiar contraseña*).
- Si alguien la olvida, se **resetea** desde la administración (ver checklist). No se "recupera" la
  vieja: se genera una nueva.
- Idea de contraseña fácil de recordar y válida: tres palabras + un número, por ejemplo
  `LadrilloVeranoSanjuan7` (cumple largo, mayúscula, minúscula y número).

### 5.3 Canales por rol

Al crear el equipo, Mattermost deja dos canales para **todos**:

- **Town Square** — anuncios de **toda la empresa** (nadie lo puede abandonar).
- **Off-Topic** — charla informal.

Además, los canales operativos declarados de Echegaray:

| Canal | Tipo | Para qué | Quién lo usa típicamente |
|---|---|---|---|
| **Dirección** | Privado | Estrategia, decisiones y temas confidenciales | Dueño + Dirección |
| **Obras** | Público | Coordinación de obras en ejecución | Jefes de obra + Operaciones + Dirección |
| **Administración** | Público | Comprobantes, pagos, cobranzas, impuestos, trámites | Administración + Dirección |
| **Compras** | Público | Pedidos de materiales, proveedores, subcontratos | Compras + Operaciones + Administración |

Cómo se traduce por rol (orientativo — el alta define la membresía real):

- **Dueño / Dirección:** todos los canales, incluido el privado **Dirección**.
- **Operaciones:** Town Square, **Obras**, **Compras** (y Administración si corresponde).
- **Administración:** Town Square, **Administración**, **Compras**.
- **Campo (jefes de obra):** Town Square y **Obras**. Se suma **Compras** si hace pedidos de material.
- **Campo (cuadrillas):** normalmente Town Square + **Obras**. Mantener **pocos canales** para no
  saturar a personal con baja alfabetización digital.

Notas:

- **Dirección es privado:** solo se ve si a la persona la **agregan explícitamente**. Los demás ni lo
  ven en la lista.
- Los canales **públicos** los puede encontrar y unirse cualquier miembro del equipo, pero al dar de
  alta se lo agrega directo a los que le corresponden, así no tiene que buscar nada.

### 5.4 Buenas prácticas mínimas

Cortas y para todos:

1. **No compartas tu contraseña.** Ni por WhatsApp, ni dictada, ni escrita en la obra.
2. **Un celular ajeno → cerrar sesión.** Si entraste desde un teléfono que no es tuyo, al terminar:
   *Menú → Configuración → Cerrar sesión*.
3. **Escribí en el canal que corresponde.** Un pedido de material va a **Compras**; algo de una obra
   va a **Obras**. Así no se pierde la información.
4. **Lo urgente y crítico, también por llamada.** El aviso puede tardar (ver [push](#4-notificaciones-push)).
5. **Cuidá lo que se manda.** Es el chat de la empresa: fotos de obra, comprobantes y coordinación, sí;
   cosas personales, en Off-Topic o afuera.
6. **Si perdés el celular,** avisá a administración para que **cierren tu sesión** desde el servidor.

### 5.5 Checklist de alta

Para quien administra el sistema, al incorporar a una persona nueva. (El "cómo" técnico —crear usuario,
equipo, canales— está en `infra/mattermost/bootstrap/`; esto es el checklist operativo.)

- [ ] **Crear el usuario** en Mattermost (email/usuario + contraseña inicial que cumpla la
      [política](#52-politica-de-contrasenas)).
- [ ] **Agregarlo al equipo** `Echegaray Construcciones`.
- [ ] **Sumarlo a los canales** de su rol (ver [tabla por rol](#53-canales-por-rol)).
      Recordar que **Dirección** es privado y se agrega a mano solo si corresponde.
- [ ] **Entregarle** usuario, contraseña inicial y el [instructivo de una página](#51-instructivo-de-una-pagina).
- [ ] Pedirle que **instale la app** y **entre** delante tuyo la primera vez (verificar que conecta a
      `chat.ecsas.com.ar` y ve sus canales).
- [ ] Confirmar que **permitió las notificaciones** en el celular.
- [ ] Pedirle que **cambie la contraseña** inicial por una propia.
- [ ] Repasar las [3 reglas rápidas](#54-buenas-practicas-minimas): no compartir, cerrar sesión en
      ajenos, urgente = también llamar.
- [ ] (Baja) Cuando alguien se va: **desactivar su usuario** en Mattermost y quitarlo de los canales.

---

## 6. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| "No se puede conectar al servidor" | Mal escrito o sin internet | Escribir `https://chat.ecsas.com.ar` sin espacios; probar con WiFi |
| Usuario o contraseña incorrectos | Contraseña mal tipeada o vencida | Reintentar; si sigue, pedir **reset** a administración |
| No llegan avisos con la app cerrada | No se dieron permisos de notificación | Android: *Ajustes → Apps → Mattermost → Notificaciones*. iPhone: *Ajustes → Mattermost → Notificaciones* |
| Los avisos llegan **tarde** o **a veces** | Es el límite de **TPNS** (sin garantía) | Normal por ahora; para lo urgente, llamar. Ver `PUSH-MOVIL.md` (disparador de migración a HPNS) |
| No veo el canal "Dirección" | Es **privado** y no fui agregado | Correcto: solo lo ve quien Dirección incluye |
| Entré desde un celular ajeno | Sesión abierta en otro equipo | *Menú → Configuración → Cerrar sesión* |

---

**Referencias internas:**
`infra/mattermost/bootstrap/PUSH-MOVIL.md` (push, TPNS, migración a HPNS) ·
`infra/mattermost/bootstrap/channels.txt` (canales declarados) ·
`infra/mattermost/bootstrap/README.md` (bootstrap de la instancia).
