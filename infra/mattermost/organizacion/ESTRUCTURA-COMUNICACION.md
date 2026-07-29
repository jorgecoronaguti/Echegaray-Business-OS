# Estructura definitiva de comunicación — Mattermost (Echegaray Construcciones)

**Etapa:** Hardening + Integración de Mattermost · **WT-3 ORGANIZACIÓN**
**Naturaleza de este documento:** DISEÑO. No crea, borra ni modifica nada en la instancia real.
La creación de canales, roles y membresías la **autoriza y dispara el dueño** (o el bootstrap
declarativo, revisado). Este archivo es la especificación que se aplicará cuando se apruebe.

**Edición corriendo:** Mattermost **Team Edition (TE)**, gratis, < 250 usuarios.
Equipo: `echegaray` — "Echegaray Construcciones".
Estado actual (PR-2): canales `direccion` (privado), `obras`, `administracion`, `compras`
(públicos) + `Town Square` y `Off-Topic` (automáticos). Este diseño **reemplaza y amplía** ese
mínimo.

---

## 0. Verificación de capacidades — TE vs Enterprise (chequeado contra doc oficial)

Antes de diseñar hay que saber qué se puede hacer *de verdad* en Team Edition. Verificado contra
la documentación oficial de Mattermost (editions-and-offerings, learn-about-roles, advanced-permissions):

| Capacidad | ¿En Team Edition? | Nota |
|---|---|---|
| Equipos, canales **públicos y privados** | **Sí** | Base del diseño. |
| Roles **System Admin / Team Admin / Channel Admin / Member** | **Sí** | Alcanzan para gobernar una PYME. |
| **Guest** (invitado externo, acceso restringido a canales asignados) | **Sí (básico)** | La doc de ediciones lista "Guest access" en TE. Sirve para el contador externo; sin controles avanzados de guest (esos son Enterprise). |
| **Custom user groups** (grupos de usuarios manuales, para @mencionar) | **Sí (básico)** | Grupos manuales para menciones; **no** sincronizados con AD/LDAP. |
| Canal auto-unión para miembros nuevos (más allá de Town Square) | **Sí** | `TeamSettings.ExperimentalDefaultChannels` (config). Se usa para `novedades-os`. |
| **Categorías de sidebar** | **Sí, pero POR USUARIO** | Cada persona ordena su propio sidebar. **No existen "categorías de equipo" administrables** (eso es percepción errónea). No se puede imponer una taxonomía de sidebar central en ninguna edición vía config; se ordena por convención de nombres. |
| Restringir **quién puede POSTEAR** en un canal (ej. "anuncios" solo-lectura para todos menos Dirección) | **NO** | Requiere **Channel Moderation / Advanced Permissions** → Professional/Enterprise. En TE es solo convención. |
| Restringir **quién crea/renombra/borra canales** por rol | **NO** | El System Scheme de TE es fijo: **todo Member puede crear y gestionar canales** públicos y privados. Bloquearlo por rol requiere **permission schemes** → Professional/Enterprise. |
| **Grupos AD/LDAP** → auto-membresía de canales/equipos por grupo | **NO** | Enterprise (E20). |
| **Team Override Schemes** / permisos granulares por rol | **NO** | Professional/Enterprise. |
| **SSO / AD/LDAP** login | **NO** | Professional/Enterprise (además, SSO se está retirando de TE). |

**Consecuencia de diseño (importante):** en TE la gobernanza de canales es **por convención +
provisión declarativa**, no por permisos forzados. Con 6–8 personas esto es perfectamente
manejable. La membresía de canales privados se administra **a mano** (invitar uno por uno) o vía
`mmctl` en el bootstrap. Lo que *no* se puede es delegar en el server "que solo Dirección cree
canales" o "que anuncios sea solo-lectura": eso queda como acuerdo de equipo hasta que (si alguna
vez) se justifique pagar Enterprise.

Fuentes: [Editions and Offerings](https://docs.mattermost.com/product-overview/editions-and-offerings.html) ·
[Learn about roles](https://docs.mattermost.com/end-user-guide/collaborate/learn-about-roles.html) ·
[Advanced permissions](https://docs.mattermost.com/administration-guide/onboard/advanced-permissions.html)

---

## 1. Árbol completo de canales

### Roles/personas de referencia (constructora chica de San Juan)

| Código | Rol OS / persona | Cuántos | Rol Mattermost sugerido |
|---|---|---|---|
| **DIR** | Dirección (2 socios) | 2 | 1 **System Admin** + 1 **Team Admin** |
| **OPS** | Operaciones / Jefe de Obra | 2 | Member |
| **ADM** | Administración | 1 | Member |
| **CAMP** | Campo (capataz / obreros que usan la app) | variable | Member (o Guest si es muy acotado) |
| **EXT-CONT** | Estudio contable externo | 1 (externo) | **Guest** |

> En una empresa de este tamaño **una persona cubre varios roles** (Dirección también hace
> comercial y finanzas). La membresía se asigna por *función*, no por cargo formal — igual que el
> `CLAUDE.md` raíz ("No asumir un cargo formal específico que no haya sido definido").

### 1.a — Canales corporativos / transversales

| Slug | Display | Tipo | Propósito | Miembros |
|---|---|---|---|---|
| `town-square` *(auto)* | **Anuncios Echegaray** | público (obligatorio) | Anuncios oficiales de toda la empresa. Nadie lo puede abandonar. *En TE no se puede volver solo-lectura → convención: solo Dirección postea anuncios.* | **Todos** |
| `off-topic` *(auto)* | **Off-Topic** | público | Social, informal, no laboral. | **Todos** |
| `novedades-os` | **Novedades del OS** | público | Canal donde el **Business OS publica reportes automáticos**: briefing de caja, alertas de vencimientos, desvíos de obra, findings. Canal de auto-unión para todo miembro nuevo. Lo escribe el bot del OS (integración PR-3), la gente lo lee. | **Todos** |

### 1.b — Canales por área del Business OS

| Slug | Display | Tipo | Propósito | Miembros (por rol) |
|---|---|---|---|---|
| `direccion` | **Dirección** | **privado** | Estrategia, decisiones, Go/No-Go, temas confidenciales de los 2 socios. | DIR |
| `administracion-finanzas` | **Administración y Finanzas** | **privado** | Caja, pagos, cobranzas, tesorería, comprobantes, conciliaciones. Dato sensible → privado. | DIR, ADM |
| `compras` | **Compras** | público | Pedidos de materiales, cotizaciones a proveedores, subcontratos, seguimiento de entregas. | DIR, ADM, OPS |
| `obras` | **Obras** | público | Coordinación **transversal** de las obras en ejecución (lo que cruza varias obras o no amerita canal propio). Hub operativo. | DIR, OPS, ADM, CAMP |
| `personal` | **Personal** | **privado** | RRHH: altas/bajas UOCRA/IERIC, legajos, jornales, licencias, ART. Dato sensible de personas → privado. | DIR, ADM |
| `comercial` | **Comercial** | **privado** | Pipeline, oportunidades, cotizaciones a clientes, márgenes, relación comercial. Sensible por competencia → privado. | DIR, ADM |
| `contabilidad-legales` | **Contabilidad y Legales** | **privado** | Impuestos, F931, cierres, contratos, reclamos, garantías, documentación legal. Único canal donde entra el **contador externo** como Guest. | DIR, ADM, **EXT-CONT (guest)** |
| `calidad` | **Calidad** | público | No conformidades, ensayos, controles, pliegos de cliente (ej. SSMA de ARCOR). Involucra a campo → público. | DIR, OPS, CAMP |
| `gestion-general` | **Gestión General** | **privado** | Coordinación entre mandos: reuniones de gestión, acuerdos, seguimiento de acciones, backlog de la empresa. | DIR, OPS, ADM |

### 1.c — Canales por obra (dinámicos)

Un **canal por obra activa**. Toda la conversación de esa obra (avance, pedidos, fotos, incidencias,
adicionales) vive junta y trazable. **Ciclo de vida = ciclo de la obra**: se crea al arrancar, se
**archiva al cierre** (Mattermost archiva, no borra → queda el histórico para el Post Mortem).

| Slug (ejemplos reales activos) | Display | Tipo | Propósito | Miembros |
|---|---|---|---|---|
| `obra-la-estrella` | **Obra · La Estrella** | público* | Todo lo de esa obra: coordinación, fotos, pedidos, adicionales, incidencias. | DIR, OPS asignado, ADM, CAMP de la obra |
| `obra-san-francisco` | **Obra · San Francisco** | público* | idem | idem |
| `obra-messina` | **Obra · Messina** | público* | idem | idem |
| `obra-<slug>` *(plantilla)* | **Obra · \<Nombre\>** | público* | Plantilla para cada obra nueva (incluye las `LE-*`/Lebane activas). | DIR, OPS asignado, ADM, CAMP |

\* **Público por defecto** (cualquiera del equipo puede seguir una obra sin fricción de invitación).
Se hace **privado** solo si un cliente exige confidencialidad de esa obra puntual.

**Regla de escala:** el número de canales de obra crece y decrece con la operación real. No se
declaran "todas las obras posibles" — solo las **activas**. Al cierre se archivan. A largo plazo
esto lo gestiona el **OS** (ver §7), no una edición manual de `channels.txt`.

---

## 2. Convención de nombres

Consistencia > creatividad. Un slug se lee y se predice sin pensar.

| Regla | Detalle |
|---|---|
| **Idioma** | Español, igual que toda la empresa. |
| **Formato del slug** | minúsculas, sin acentos, sin espacios, palabras separadas por `-` (kebab-case). Es el identificador **estable** — no se cambia una vez creado. |
| **Área** | el slug **es** el nombre del área: `compras`, `personal`, `calidad`. Áreas compuestas → `administracion-finanzas`, `contabilidad-legales`. |
| **Obra** | prefijo obligatorio **`obra-`** + slug del nombre de la obra: `obra-la-estrella`. El prefijo agrupa visualmente todas las obras juntas en el sidebar (aunque la categoría sea por-usuario, el orden alfabético las junta). |
| **Bot / sistema** | sufijo/prefijo `-os` para lo que escribe el Business OS: `novedades-os`. |
| **Display name** | con acentos y formato humano. Obras con separador visual: `Obra · La Estrella`. |
| **Sub-tema de un área** (futuro, si hace falta) | `area-subtema`: ej. `compras-proveedores`, `obras-seguridad`. No abrir hasta que el volumen lo pida (ver §6). |
| **Archivado** | no se renombra al archivar; Mattermost lo marca como archivado y conserva el slug/histórico. |

**Anti-patrón explícito:** no crear `canal1`, `general2`, nombres de persona, ni duplicar Town
Square con un `general` (Town Square ya es el canal de toda la empresa — mismo criterio que ya fijó
PR-2).

---

## 3. Modelo de permisos factible en Team Edition

### 3.a — Roles y qué puede cada uno (todo esto SÍ existe en TE)

| Rol | Alcance | Qué puede | Quién en Echegaray |
|---|---|---|---|
| **System Admin** | Todo el servidor | Consola de sistema, config, crear/borrar equipos, gestionar usuarios y roles, todo canal. | 1 socio de Dirección (+ el OS opera con credenciales de admin para provisión). |
| **Team Admin** | El equipo `echegaray` | Gestionar canales del equipo, agregar/quitar miembros, renombrar/archivar canales del equipo. | El otro socio de Dirección. |
| **Channel Admin** | Un canal | Agregar/quitar miembros de *ese* canal, dar el rol de channel admin, renombrar/archivar (según config). Se usa para que el **JO sea admin de su `obra-*`** y gestione quién entra. | OPS en su obra; ADM en `administracion-finanzas`/`personal`. |
| **Member** | El equipo | Postear, unirse a canales **públicos**, crear canales (limitación TE, ver abajo), ser invitado a privados. | OPS, ADM, CAMP. |
| **Guest** | Solo canales asignados | Ve y postea **únicamente** en los canales a los que fue invitado; no ve el resto del equipo ni el directorio. | Contador externo → solo `contabilidad-legales`. |

### 3.b — Cómo se materializa el acceso (mecanismo real en TE)

- **Canal público** → visibilidad abierta: cualquier Member se une solo. Control = *nadie queda afuera por error*, pero *no hay barrera* (esperado para `obras`, `compras`, `calidad`, `novedades-os`, `obra-*`).
- **Canal privado** → invitación explícita. La membresía se administra **a mano** (o por `mmctl channel users add` en el bootstrap). Es la única barrera de confidencialidad real en TE, y alcanza: `direccion`, `administracion-finanzas`, `personal`, `comercial`, `contabilidad-legales`, `gestion-general`.
- **Guest** → se invita al canal privado puntual; queda encerrado ahí. Es como se protege que el contador externo vea *solo* lo contable-legal y nada más.
- **Custom user group** (manual) → crear grupos `@direccion`, `@obras`, `@administracion` para @mencionar a un área completa sin listar personas. Manual (no sincroniza con nada), pero útil.

### 3.c — Límites de TE que se cubren por convención (no por el server)

| Lo que NO impone TE | Regla de convención mientras sea TE |
|---|---|
| Anuncios solo-lectura | Solo Dirección postea en Town Square/`novedades-os`; el resto responde en el canal del tema. |
| "Solo Dirección crea canales" | Los canales se **provisionan desde el bootstrap declarativo / el OS**, no a mano. Acuerdo de equipo: no crear canales sueltos. |
| Membresía automática por rol | Se administra en el `channels.txt`/`mmctl` (repetible) y se revisa cuando entra/sale gente. |

Esto es suficiente y honesto para 6–8 personas. Si la empresa crece a decenas de usuarios con
rotación, ahí recién se evalúa Enterprise (§8) — no antes (principio de no sobre-construir).

---

## 4. Propuesta de `channels.txt` actualizado

> **Bloque de referencia — NO se edita el `channels.txt` real del release en esta rama.**
> Formato existente respetado: `name|display-name|visibility|purpose`. El bootstrap ya es
> idempotente: al aplicar esto, crea solo los canales que falten y **no toca** `direccion`,
> `obras`, `administracion`, `compras` ya existentes (aunque abajo se propone reclasificar dos —
> ver nota).

```text
# ─────────────────────────────────────────────────────────────────────────────
# Canales de Echegaray Construcciones — estructura definitiva (WT-3 ORGANIZACIÓN).
# Formato:  name|display-name|visibility|purpose
#   visibility -> public | private
# Town Square (anuncios) y Off-Topic los crea Mattermost solo: NO se declaran acá.
# ─────────────────────────────────────────────────────────────────────────────

# ── Transversal: lo que escribe el Business OS ──
novedades-os|Novedades del OS|public|Reportes automáticos del OS: briefing de caja, alertas y desvíos

# ── Áreas del Business OS ──
direccion|Dirección|private|Estrategia, decisiones y temas confidenciales de Dirección
administracion-finanzas|Administración y Finanzas|private|Caja, pagos, cobranzas, tesorería y comprobantes
compras|Compras|public|Pedidos de materiales, proveedores, subcontratos y entregas
obras|Obras|public|Coordinación transversal de las obras en ejecución
personal|Personal|private|RRHH: altas/bajas UOCRA/IERIC, legajos, jornales, ART
comercial|Comercial|private|Pipeline, cotizaciones a clientes, márgenes y relación comercial
contabilidad-legales|Contabilidad y Legales|private|Impuestos, cierres, contratos, reclamos y documentación legal
calidad|Calidad|public|No conformidades, ensayos, controles y pliegos de cliente
gestion-general|Gestión General|private|Reuniones de gestión, acuerdos, seguimiento de acciones y backlog

# ── Canales por obra activa (dinámicos; archivar al cierre) ──
obra-la-estrella|Obra · La Estrella|public|Coordinación, pedidos, fotos, adicionales e incidencias de la obra
obra-san-francisco|Obra · San Francisco|public|Coordinación, pedidos, fotos, adicionales e incidencias de la obra
obra-messina|Obra · Messina|public|Coordinación, pedidos, fotos, adicionales e incidencias de la obra
```

> **Nota sobre las obras `LE-*` (Lebane):** se agregan con el mismo patrón `obra-<slug>` cuando se
> confirmen los nombres reales; no se inventan aquí.
>
> **Nota sobre reclasificación (decisión del dueño):** PR-2 dejó `administracion` **público**. Este
> diseño lo reemplaza por `administracion-finanzas` **privado** por sensibilidad del dato (caja,
> pagos). Como el slug cambia, el bootstrap crearía el nuevo y **el viejo `administracion` quedaría
> conviviendo**: la migración correcta es **archivar** `administracion` a mano tras crear el nuevo
> (el bootstrap idempotente no borra canales, y está bien que no lo haga). Alternativa conservadora:
> mantener el slug `administracion` y solo cambiarlo a privado — pero cambiar visibilidad de un canal
> existente tampoco lo hace el bootstrap. **Esto lo decide y ejecuta el dueño**, no esta rama.

**Recomendación de despliegue (no crear los 12+ de golpe):** ver §6. `channels.txt` puede
contener el set completo, pero conviene **descomentar por fases** para no inundar a un equipo de 6
personas con 15 canales el día uno.

---

## 5. Membresía por canal — matriz de referencia

Leyenda: ● miembro · ○ opcional/según función · — no.
Público = cualquiera puede entrar; la ● marca *quién debería* estar por defecto.

| Canal | DIR | OPS | ADM | CAMP | EXT-CONT |
|---|:--:|:--:|:--:|:--:|:--:|
| Town Square / Off-Topic | ● | ● | ● | ● | — |
| `novedades-os` | ● | ● | ● | ● | — |
| `direccion` (priv) | ● | — | — | — | — |
| `administracion-finanzas` (priv) | ● | — | ● | — | — |
| `compras` (pub) | ● | ● | ● | ○ | — |
| `obras` (pub) | ● | ● | ● | ● | — |
| `personal` (priv) | ● | — | ● | — | — |
| `comercial` (priv) | ● | — | ○ | — | — |
| `contabilidad-legales` (priv) | ● | — | ● | — | ● |
| `calidad` (pub) | ● | ● | ○ | ● | — |
| `gestion-general` (priv) | ● | ● | ● | — | — |
| `obra-*` (pub) | ● | ●* | ● | ●* | — |

\* Solo el/los OPS y CAMP **asignados a esa obra**. El JO de la obra es **Channel Admin** de su
`obra-*`.

---

## 6. Rollout progresivo (recomendado — no crear todo el día uno)

Aplicar el `menos es más` que ya fijó PR-2 y el principio anti-dispersión del `CLAUDE.md`. La
estructura definitiva es la de arriba; el **orden de encendido** sugerido:

1. **Fase 1 — ya vivo (ajuste):** `direccion`, `obras`, `compras`, `administracion→administracion-finanzas`, `novedades-os`. (5)
2. **Fase 2 — cuando la integración PR-3 empuje contenido:** 1–3 `obra-*` de las obras activas + `gestion-general`. Aquí el canal por obra empieza a valer porque el OS ya postea pedidos/avance.
3. **Fase 3 — cuando el área tenga tráfico propio:** `personal`, `comercial`, `contabilidad-legales`, `calidad`.

Un canal vacío es peor que no tenerlo: entrena a la gente a ignorar Mattermost. Se abre un área
cuando hay **conversación real** que hoy ocurre en WhatsApp/teléfono y se quiere trazable.

---

## 7. Escala de los canales por obra (cómo no volverse inmanejable)

- **Provisión:** cuando una obra pasa a activa, el OS crea `obra-<slug>` (público), setea el JO como
  Channel Admin y agrega a los asignados. Conecta con el roadmap de **Control de Obras** (la obra como
  eje) y con `reportes-automaticos-y-comunicaciones` (el OS postea avance/pedidos ahí).
- **Cierre:** en el Post Mortem, el OS/dueño **archiva** el canal. El histórico queda para el
  aprendizaje de la próxima cotización (búsqueda sobre canales archivados).
- **Techo natural:** obras activas simultáneas de una constructora chica ≈ 3–6. No hay explosión de
  canales si se archiva al cerrar. El prefijo `obra-` los mantiene agrupados y buscables.
- **Anti-duplicación:** el nombre de la obra es el **mismo** que usa el OS internamente (obras
  activas canónicas), no un nombre nuevo inventado para el chat.

---

## 8. Qué queda para Enterprise (y por qué hoy NO se justifica)

| Necesidad | Requiere | ¿Duele hoy en Echegaray? |
|---|---|---|
| Membresía de canal **automática por grupo AD/LDAP** | Enterprise (E20) | No. Con 6–8 personas, invitar a mano una vez es trivial. |
| **Anuncios solo-lectura** (Town Square solo Dirección postea) | Channel Moderation / Advanced Permissions (Prof/Ent) | No. Convención de equipo alcanza. |
| **"Solo Dirección crea canales"** forzado por el server | Permission schemes (Prof/Ent) | No. Se provisiona por bootstrap/OS; nadie anda creando canales sueltos. |
| **Team Override Schemes** / permisos granulares por rol | Prof/Ent | No. Los 5 roles nativos de TE cubren la realidad. |
| **SSO / login con AD/LDAP** | Prof/Ent | No. Usuarios locales para un equipo chico; además SSO se retira de TE. |
| **Guest con controles avanzados** | Enterprise para el control fino | Parcial. El guest básico de TE alcanza para el contador externo. |

**Disparadores para reconsiderar Enterprise (no antes):** superar ~15–20 usuarios con rotación
frecuente, necesidad real de auditoría/compliance de permisos, o integrar el login con un
directorio corporativo. Mientras tanto, pagar Enterprise sería sobre-construir (regla del
`CLAUDE.md`: "no desarrollar sistemas demasiado complejos antes de validar el proceso").

---

## 9. Resumen de decisiones de diseño

1. **Privacidad por sensibilidad del dato, no todo público.** Finanzas, personal, comercial,
   contabilidad-legales y gestión → **privados**; obras, compras, calidad, novedades-os y los
   `obra-*` → **públicos**. En TE el canal privado es la única barrera real de confidencialidad, y
   alcanza.
2. **Un canal por obra activa con ciclo de vida** (`obra-<slug>`, archivar al cierre), gestionado
   por el OS, no por edición manual. Convención de nombres con prefijo `obra-` para agruparlos.
3. **Gobernanza por convención + provisión declarativa, no por permisos forzados** — porque TE no
   permite lo contrario y para 6–8 personas es innecesario. Rollout **progresivo** por fases para no
   inundar de canales vacíos a un equipo chico.

---

*Documento de diseño. La aplicación en la instancia real (crear/archivar canales, invitar
miembros, reclasificar `administracion`) la autoriza y ejecuta el dueño. Esta rama no hace push,
merge ni toca la instancia.*
