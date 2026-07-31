# Definition of Done — Módulo Asistencia

Fecha de cierre v1: **30/07/2026** · `asistencia-v1.0` · SHA `e7c72a7`
Fecha de cierre v2 (pantalla web): **30/07/2026** · `asistencia-v2.0` — **RETIRADA**
Fecha de cierre v3 (todo en Mattermost): **30/07/2026** · `asistencia-v3.0`

> **v2** reemplazó la conversación por una pantalla. Los 10 criterios de abajo siguen
> valiendo y se re-verificaron sobre la v2; lo específico de la pantalla está en §11.

Este documento demuestra objetivamente que el módulo está terminado. Cada criterio tiene
**evidencia ejecutada**, no una afirmación. Todo lo verificado abajo se comprobó contra el
sistema real, no contra mocks.

---

## 1. Funciona en producción — no en un entorno de prueba

| # | Criterio | Evidencia | ✔ |
|---|---|---|---|
| 1.1 | El bot está vivo y autenticado | `echegaray-comunicacion-ws.service` `active`, `NRestarts=0`, `hello` de autenticación en el journal | ✔ |
| 1.2 | El worker está vivo | `echegaray-comunicacion-worker.service` `active`, `NRestarts=0` | ✔ |
| 1.3 | La versión desplegada es la versión cerrada | `git rev-parse HEAD` en el worktree de despliegue = `e7c72a7` = `origin/main` | ✔ |
| 1.4 | El canal operativo existe y está atado | `#asistencia`, tipo `P`, `md5677yrtidztd7453rj6hxxmc`, binding `personas` `activo=true` en `comunicacion.canales_area` | ✔ |
| 1.5 | Ninguna tarea del módulo falló | `orq.tasks type like 'comunicacion%'` → **65 `succeeded`, 0 `failed`** | ✔ |

## 2. Lee la realidad — y responde con datos verdaderos

Diez consultas ejecutadas **desde el canal real**, respondidas **en el canal, en el hilo**:

| Consulta | Resultado |
|---|---|
| `asistencia de hoy` | 1 presente, 9 h |
| `asistencia de ayer` | 15 presentes, 1 ausente, 144 h |
| `quién trabajó ayer` | nómina real |
| `quién faltó ayer` | responde la ausencia, no abre el formulario |
| `asistencia de la obra Messinas` | cuadrilla de la obra |
| `asistencia de Quiroga Sebastian` | historial del trabajador |
| `horas extra del 17/01` | 39 h extra, desglosadas |
| `asistencia del 32/13` | `No entendí la fecha «32/13»` — no inventa |
| `asistencia de Perez Nadie` | lista los trabajadores reales — no inventa |
| `estado del sistema` | atendido por otro especialista (`gestion-general`) |

**Criterio de honestidad cumplido**: ante fecha imposible o persona inexistente el módulo dice
que no sabe, no fabrica un dato. ✔

## 3. Escribe en JORNALES — verificado celda por celda

Prueba controlada ejecutada **por el circuito productivo completo desde el canal**
(`asistencia` → `obra 1` → `1 presente` → `revisar` → `confirmar`), nunca por script aislado.

| Campo | Valor |
|---|---|
| Celda | `'Obreros 26'!R464` |
| Trabajador | Navarro Matias |
| Valor anterior | `null` (vacía) · fórmula `null` |
| Valor nuevo | `9` · 9 normales + 0 extra |
| Skill | `personal.registrar_asistencia` |
| Ejecutado por | `jorge` (identidad real de Mattermost) |
| `correlation_id` | `836bf225-1c7a-4923-925a-7e658aee8c37` |
| Celdas modificadas | **1** |

Relectura posterior desde Google Sheets del bloque completo: **exactamente 2 celdas escritas en
el día** (R464 de esta prueba y R477 de la anterior). Ninguna otra fila tocada, ninguna fórmula
alterada. ✔

## 4. Es auditable — con valor anterior y posterior

`comunicacion.v_asistencia_auditoria` devuelve, por cada escritura: celda, trabajador, estado,
`old_value`, `old_formula`, `old_normal_hours`, `old_extra_hours`, `new_value`, `new_formula`,
`new_normal_hours`, `new_extra_hours`, `new_total_hours`, identidad, fecha operativa, pestaña,
modo de permisos y `correlation_id`.

Se puede reconstruir **quién escribió qué celda, cuándo, y qué había antes**. ✔

Este criterio cubría lo que **sí** se escribió. Lo que la guarda rechaza se audita desde el
incremento descrito en §13, por el mismo ledger y la misma vista.

## 5. Es idempotente — repetir no duplica

Flujo repetido idéntico tras la escritura → respuesta `Sin cambio (quedan como están): 1` ·
`No hay nada para escribir`. Escrituras registradas: **siguen siendo 2**. Sin segunda escritura,
sin falso éxito. ✔

## 6. No deja decidir a la IA lo que no debe

| Decisión crítica | Verificación |
|---|---|
| Qué celda se escribe | Código (`jornales-asistencia.mjs`), con test |
| Qué fila corresponde al trabajador | Resolución estructural + test de rango desplazado |
| Qué columna corresponde a la fecha | `jornales-estructura.mjs` + test |
| Cuántas horas se guardan | `horas-extra.mjs` + tests de normalización |
| Cómo se conserva una fórmula | Fingerprint de celda + test de fórmula con error |
| Cómo se resuelve una colisión | Concurrencia optimista + test |
| Cómo se aplica la idempotencia | Clave estable de un solo uso + test |

El modelo interviene **sólo** para elegir especialista dentro de una lista cerrada, y si no hay
motor disponible **no adivina**: responde el catálogo. ✔

## 7. No es un caso privilegiado — la arquitectura es general

| Criterio | Evidencia | ✔ |
|---|---|---|
| El Director no nombra ningún dominio | Test que **lee el código fuente** y falla si aparece una palabra de dominio o un `switch` | ✔ |
| El handler tampoco | Mismo guardián estructural | ✔ |
| El `channel_id` no está en el código | Test que falla ante un literal con forma de id de Mattermost en `director.mjs`, `handlers/comunicacion.mjs`, `especialistas/personal.mjs` | ✔ |
| Agregar Compras no toca el núcleo | Registro por descubrimiento de directorio + binding canal↔área en tabla | ✔ |
| Asistencia es un especialista más | `especialistas/personal.mjs`, área `personas`, agente `rrhh` | ✔ |

## 8. Está probado

| Suite | Resultado |
|---|---|
| Unitarios del módulo (comunicación + asistencia + jornales) | **334 tests · 314 pass · 0 fail · 20 skipped** |
| Los 20 skipped, con Postgres real efímero (`test-pr4.mjs`) | **20 pass · 0 fail** |
| ESLint sobre todo el módulo | **0 errores, 0 warnings** |
| `npm run typecheck` | **exit 0** |

Los 20 "skipped" no son deuda: son los tests de integración que requieren base y corren con su
runner dedicado, que se ejecutó y pasó completo.

## 9. Se puede apagar y volver atrás

| Nivel | Mecanismo | Costo |
|---|---|---|
| Apagar el módulo | `activo=false` en `comunicacion.canales_area` | Instantáneo, no toca nada más |
| Volver a esta versión | `git checkout asistencia-v1.0` + restart | Un minuto |
| Apagar la conversación | `systemctl --user stop …-ws` | Instantáneo |
| Revertir el esquema | 3 scripts en `orquestador/db/rollback/` | Ver límite conocido #4 |

Las tres migraciones son aditivas y cada una tiene rollback escrito. ✔

## 10. Está documentado y el código está limpio

| Criterio | Evidencia | ✔ |
|---|---|---|
| Documentación definitiva | [`MODULO-ASISTENCIA.md`](./MODULO-ASISTENCIA.md) — arquitectura, flujo, componentes, integraciones, despliegue, rollback, troubleshooting, límites, mantenimiento | ✔ |
| Runbook operativo | [`OPERACION-ASISTENCIA.md`](./OPERACION-ASISTENCIA.md) | ✔ |
| Sin `TODO`/`FIXME`/`HACK`/`WIP` | Grep sobre los 30 archivos del módulo: 0 marcadores (3 coincidencias son la palabra española "todo") | ✔ |
| Sin `console.log` de debug | Grep: 0 fuera de los scripts CLI, donde es su salida | ✔ |
| Sin `@ts-ignore` ni `eslint-disable` | Grep: 0 | ✔ |
| Sin código temporal huérfano | `demo-pr4.mjs`, `test-pr4.mjs` y `aplicar-esquema.mjs` son infraestructura de test con Postgres efímero, documentada | ✔ |

---

## Desviaciones aceptadas

No se ocultan. Están medidas y ninguna bloquea la operación de hoy.

1. **`asistencia-consultas.mjs` tiene 553 líneas**, por encima del límite de 500 del CLAUDE.md.
   Partirlo es un refactor con riesgo de comportamiento sobre un módulo recién validado en
   producción. Registrado, no forzado.
2. **9 límites conocidos** documentados en §14 de `MODULO-ASISTENCIA.md`. Los tres primeros
   (sesiones genéricas, permisos por capability, respuesta diferida) **bloquean al segundo
   especialista operativo**, no a éste.
3. **2 registros en el DLQ** (`Invalid RootId parameter`) provenientes del arnés de prueba usado
   durante la validación, no del flujo productivo. Documentados, no purgados.
4. **Miembros del canal pendientes**: hoy `@os` y `jorge`. Falta que el dueño defina qué jefes de
   obra y qué personas de administración se incorporan. No se inventaron identidades.

---

## Veredicto

Los 10 criterios se cumplen con evidencia ejecutada contra el sistema real: el módulo lee,
escribe, audita, es idempotente, es reversible, está probado, está documentado, y no delega en un
modelo ninguna decisión con efecto sobre la planilla.

**MÓDULO ASISTENCIA — CERRADO.**


---

## 11. v2 — la pantalla, verificada en producción

| # | Criterio | Evidencia | ✔ |
|---|---|---|---|
| 11.1 | La pantalla se sirve por HTTPS público | `GET https://chat.ecsas.com.ar/asistencia` → 200 con enlace válido, 401 sin él (nunca una página en blanco) | ✔ |
| 11.2 | Mattermost no se rompió al publicarla | `/api/v4/system/ping` → 200 después de recrear Caddy | ✔ |
| 11.3 | El enlace se emite por el circuito real | `@os asistencia` en el canal → enlace firmado publicado, de un solo uso, 10 min | ✔ |
| 11.4 | La pantalla lee JORNALES de verdad | 6 obras reales del día, cuadrilla con categorías (`OF M`, `OF`), jornada **calibrada en 9 h sobre 33 muestras** | ✔ |
| 11.5 | Precarga correcta | Todos presentes con la jornada; chip `Ya cargado: 9 h` en la celda que ya tenía valor | ✔ |
| 11.6 | El caso normal son 3 acciones | abrir → elegir obra → Registrar | ✔ |
| 11.7 | Nada superfluo a la vista | 0 selectores de motivo con todos presentes; aparecen al desmarcar | ✔ |
| 11.8 | El registro funciona de punta a punta | `POST /api/registrar` → 200, `correlation_id` emitido, **`a_escribir: 0` · `celdas: []`** | ✔ |
| 11.9 | La prueba no modificó la planilla | Se eligió a propósito una obra con todas las celdas ya cargadas: el plan dio `sin_cambio: 1` | ✔ |
| 11.10 | El jefe ve qué pasó | `No había nada para cambiar: la planilla ya decía lo mismo.` | ✔ |
| 11.11 | Sin errores de navegador | 0 mensajes de consola en todo el recorrido | ✔ |
| 11.12 | El flujo por chat no se rompió | `quién faltó ayer` → 15 presentes, 1 ausente, 144 h | ✔ |

### Lo que la v2 NO probó

**No se escribió ninguna celda nueva en JORNALES desde la pantalla.** La prueba se diseñó
para tener efecto cero: se eligió una obra donde todas las celdas ya tenían su valor, y el
plan lo confirmó antes de enviar (`a_escribir: 0`). Eso ejercita validación, resolución de
celda, permisos, idempotencia, auditoría y confirmación — todo menos el byte final.

La escritura real ya está probada desde la v1 (celda `'Obreros 26'!R464`, §3), y el camino
de escritura **no se modificó** en la v2: la pantalla llama exactamente a `registrarAsistencia`.
Aun así, la primera carga real desde la pantalla conviene mirarla con los ojos.

### Defectos encontrados mirando, no leyendo

Tres, ninguno visible para los tests estáticos:

1. **`hidden` perdía contra `display`**: los 48 campos condicionales aparecían abiertos.
2. **Se le ofrecía "trabajó en otra obra" a quien no trabajó**, y el núcleo siempre lo rechaza.
3. **El "Listo" se borraba solo**: se mostraba antes de recargar, y la recarga limpia la pantalla.

Los tres tienen ahora test de regresión que ataca la causa (verificado: fallan si se revierte el arreglo).


---

## 12. v3 — la carga vuelve a Mattermost

La pantalla web de la v2 fue una dirección equivocada y se eliminó por completo (2.042 líneas).
Se conservó el backend: lo que estaba en `asistencia-web/` no era todo pantalla — adentro vivía
la capa que resuelve permiso, jornada, validación, plan, escritura y auditoría. Vive en
`lib/asistencia-servicio/` y ahora la consume la UI de Mattermost.

| # | Criterio | Evidencia | ✔ |
|---|---|---|---|
| 12.1 | Todo ocurre dentro de Mattermost | `@os asistencia` publica un mensaje con 2 attachments: fecha (3 botones) y obra (desplegable + Cancelar) | ✔ |
| 12.2 | Mattermost alcanza el callback | `DoActionRequest` a `https://chat.ecsas.com.ar/asistencia/accion`; Caddy registra **200** | ✔ |
| 12.3 | Elegir la obra reescribe el mensaje | Respuesta `update` con la cuadrilla real: `MESSINAS · BASES DE TANQUE — jueves 30/07/2026`, jornada 9 h, 3 personas, resumen (2 presentes · 0 ausentes · 18 h · 1 sin cambio) | ✔ |
| 12.4 | Caso normal en 2 clicks | Elegir obra → Registrar | ✔ |
| 12.5 | La guarda corre primero | Un click desde un DM no abre sesión ni lee la planilla | ✔ |
| 12.6 | El canal no está en el código | Sale de `comunicacion.canales_area`; test que prohíbe ids literales | ✔ |
| 12.7 | Calendario completo | 16 feriados + 6 días no laborables en producción, cada uno con su fundamento | ✔ |
| 12.8 | El porqué es consultable | `asistencia_novedades` se escribe interceptando el evento `written` | ✔ |
| 12.9 | Sin rastros de la web | 0 referencias a la pantalla, los enlaces firmados o su tabla | ✔ |
| 12.10 | Tests | **1.460 pass · 0 fail** · typecheck 0 · ESLint 0 errores | ✔ |

### Cuatro defectos encontrados mirando producción, no leyendo código

1. **La jornada parcial nunca exigía motivo.** `validarNovedad` espera un número y recibía el
   objeto de jornada: 6 horas sobre 9 pasaban sin explicación. Lo grave es por qué era
   invisible: el doble de los tests leía `jornada.horas` mientras el real espera el número, así
   que el test quedaba en verde sobre un defecto vivo. **No alcanzó datos reales** (2 escrituras
   en producción, ambas de jornada completa).
2. **El desplegable de obras salía sin texto.** Se pasaban crudas del núcleo (`etiqueta`/
   `personas`) donde la UI espera `nombre`/`cantidad`. Mattermost lo avisa por log y dibuja una
   lista en blanco.
3. **La fecha de la sesión venía de Postgres como `Date`** y `validarFecha` la rechazaba: el
   jefe elegía la obra y le respondían "esa fecha no existe".
4. **Dos copias de `fechas.mjs` y `mapeo.mjs`** tras la fusión de frentes. Consolidadas en una
   sola fuente antes de integrar.

### La primera carga real sigue pendiente

**No se escribió ninguna celda en JORNALES en esta etapa.** El circuito está probado hasta el
paso previo a la escritura. La auditoría confirma que el OS escribió exactamente 2 celdas hoy,
ambas con valor 9, y ninguna en esta ronda.


---

## 13. Los rechazos también quedan auditados

Hasta acá se auditaba lo que el módulo escribía. Lo que la guarda **negaba** no dejaba rastro:
si el jefe de obra decía "no me deja cargar", la única forma de saber por qué era pedirle una
captura. Un intento sin permiso, o desde un canal que no corresponde, es exactamente el tipo de
hecho que Dirección tiene que poder mirar después, sin depender de la memoria de nadie.

El incremento **no agrega ninguna pieza**: usa el auditor que ya existía
(`asistencia-auditoria.mjs` → `crearAuditor` → `orq.emit_event`) para emitir
`personal.asistencia.denied`, y se lee por `comunicacion.v_asistencia_auditoria`, que ya toma
todos los eventos `personal.asistencia.%`. Sin tabla nueva, sin vista nueva, sin migración.

| # | Criterio | Cómo se verifica |
|---|---|---|
| 13.1 | Todo rechazo emite `personal.asistencia.denied` | Los once casos de §13.2 pasan por el auditor; los tests del módulo fallan si un camino de rechazo no emite |
| 13.2 | Están cubiertos los once casos | Sin permiso · canal que no es el oficial · mensaje privado o grupo · token del slash command ausente · token inválido · sin identidad · payload inválido · sesión inexistente · sesión vencida · sesión de otra persona · formulario (diálogo) inválido |
| 13.3 | El evento dice qué pasó, no sólo que pasó | `status='denied'`, `origen` (`slash_command`/`accion`/`dialogo`), `motivo` (la familia) y `error_code` (el detalle exacto: `sin_permiso`, `canal_no_es_el_oficial`, `token_invalido`, `sesion_vencida`…) |
| 13.4 | Se puede reconstruir quién y desde dónde | `mattermost_user_id` y `mattermost_username` cuando existan, `channel_id`, `team_id`, `correlation_id` y `request_id` cuando existan, más el timestamp |
| 13.5 | No se filtra nada sensible | Ni tokens, ni secretos, ni el payload completo, ni datos sensibles — la misma regla que ya regía la auditoría de escritura |
| 13.6 | El comportamiento no cambió | Los mensajes al usuario, los permisos y el flujo son los mismos: la única diferencia observable es que ahora el rechazo queda anotado |
| 13.7 | Se consulta sin herramienta nueva | `select * from comunicacion.v_asistencia_auditoria where status='denied' order by ocurrido_at desc` |

### Verificado en producción — 30/07/2026

**11 rechazos reales anotados en la vista**, provocados contra el endpoint público, el mismo
que llama Mattermost. Los códigos que quedaron registrados: `sin_permiso` (comando y acción),
`canal_no_es_el_oficial` (otro canal y mensaje directo), `token_invalido`, `sin_identidad`,
`sesion_inexistente` (acción y diálogo), `formulario_invalido` y `paso_desconocido`. El intento
del usuario autorizado no generó ningún rechazo, y ningún evento contiene un token: los dos
que la búsqueda de secretos marca son el literal `"motivo": "token"`, que es la familia del
rechazo, no un valor.

Tres casos quedan cubiertos por test y no por producción, porque exigen un estado que no se
puede fabricar sin ensuciar datos: `token_sin_configurar` (el servidor sin token, que apagaría
la carga para todos), `sesion_vencida` (hay que esperar el TTL) y `sesion_ajena` (haría falta
un segundo usuario autorizado). `payload_invalido` sólo aparece cuando el pedido llega con
identidad pero sin forma reconocible: en producción, un payload sin identidad muere antes, en
la puerta, y se anota como `sin_identidad` — que es el motivo verdadero.
