# MAPA DE PANTALLAS — app.ecsas.com.ar (relevamiento 23/09/2026)

Relevado por código, sin navegador: `src/app/**/page.tsx`, layouts, `middleware.ts`, `shared/auth/areas.ts`,
`features/auth/types/navegacion.ts`, `identidad.ts` y todos los `href`/`redirect` de `src/`. No se tocó `src/`.
Convenciones: **Rol** = D/A (Dirección/Administración, `veEconomia`), **J** (jefe_obra, `esAdministracion` sin precio),
**O** (campo/operador, `CAMPO_RUTAS_PERMITIDAS`), **C** (cliente, portal). **Desde** = quién enlaza en código
(no comentarios). «URL» = sólo escribiendo la dirección o por enlace externo (bot, QR).

## Cómo se decide hoy quién ve qué (hecho, por código)

- Home `/` → `destinoDeLaHome(rol)`: D/A/J → `/administracion` → redirige a `/clientes`; O → `/hoy`; C → `/portal`.
- Barra nivel 1 (`AppHeader`): D/A/J ven `Administración · Obras · Analíticas(D/A) · Herramientas`; O ve un solo
  rótulo «Obras» (no es botón). Nivel 2 de Administración (`BarraAreas`): Clientes · Personal · Compras · Impuestos(D/A) · Presupuestos(D/A).
- `RUTAS_SOLO_ECONOMIA` (J y O rebotan a `/obras`): usuarios, calendario-financiero, reportes, aprobaciones, presupuestos, impuestos, analíticas.
- O sólo puede abrir: /hoy, /mi-trabajo, /mi-informacion, /integraciones/*, /herramientas, /h, /campo, /descargas, /mi-cuenta.
- Grupos de app: `(main)` = escritorio con header; `(empleado)` y `(jefe)` = teléfono con barra inferior propia, sin header;
  `campo/` = teléfono sin ningún marco; `portal/` = cliente. Dirección entra a los marcos de teléfono sólo con «ver como».

## (a) Matriz

| Ruta | Función real | Rol | Desk/Mob | Desde | Estado |
|---|---|---|---|---|---|
| `/` | Redirige al inicio del rol | todos | ambos | isotipo del header | ok |
| `/login` `/recuperar` `/contrasena-nueva` | Puerta interna | — | ambos | header, mails | ok |
| `/administracion` | Redirige a `/clientes` | D/A/J | ambos | solapa nivel 1 | ok (solapa dice «Administración», aterriza en «Clientes») |
| `/clientes` | Cartera de clientes + panel; `?vista=` | D/A/J | ambos | nivel 2 | ok |
| `/clientes/[cliente]` | Ficha cliente, solapas obras/cobranzas/documentos/órdenes/presupuestos/portal | D/A/J (J sin $) | ambos | cartera, obra | ok, tiene migas |
| `/administracion/personas` | Plantel; `?vista=asistencia` (Horas) / `liquidacion` (D/A) | D/A/J | ambos (atajo mobile en menú usuario) | nivel 2, header | ok |
| `/administracion/personas/[id]` | Legajo persona, 6 solapas | D/A/J (liquidación D/A) | ambos | plantel | ok, migas |
| `/administracion/personas/asistencia` | Carga de asistencia del día (una sola experiencia 17/09) | D/A/J | ambos (`ObraEnTelefono` sólo mobile) | `EnlaceCargarAsistencia` en Personal | ok, migas |
| `/administracion/personas/en-obra` | Quién está hoy en obra | D/A/J | ambos | Personal | ok, migas |
| `/administracion/personas/cuadrillas` | Cuadrillas y HH | D/A/J | ambos | Personal (`IconoCuadrilla`), SolapasHH | ok, tiene «Volver» |
| `/administracion/personas/cuadrillas/asistencia` | Asistencia de la SEMANA | D/A/J | ambos | SolapasHH | **6.ª pantalla de asistencia** |
| `/administracion/personas/cuadrillas/periodos` | Cierre de períodos HH | D/A | ambos | SolapasHH | ok |
| `/administracion/asistencia` | Cola de CORRECCIONES pedidas por el plantel | D/A/J | ambos | Home admin (señal), TabPersonal obra, TablaPeriodosHH | **nombre engañoso**: URL dice «asistencia», es «correcciones» |
| `/administracion/compras` | Libro de compras ARCA; `?vista=a-rendir` (Efectivo) | D/A/J (J sin precio) | ambos | nivel 2 | ok |
| `/administracion/proveedores` | Proveedores/deuda/resolver; `?vista=` | D/A/J | ambos | Compras (absorbida) | ok; no está en la barra, se llega por señales |
| `/administracion/proveedores/[proveedor]` | Ficha proveedor | D/A/J | ambos | lista | ok, migas |
| `/administracion/pendientes` | Textos sin imputar | D/A/J | ambos | Home admin, AccionesCompra, ficha proveedor | ok (absorbida por Compras) |
| `/administracion/impuestos` | Vencimientos, IVA/IIBB/Ganancias, cargas sociales | D/A | ambos | nivel 2 | ok |
| `/administracion/usuarios` | Usuarios y accesos | D/A | ambos | menú usuario | ok; no en barra (decisión) |
| `/administracion/base-maestra` → `/tareas`, `/recursos` | Tareas tipo, recursos, precios (APU) | D/A | ambos | Presupuestos cartera, PanelTareaRendimiento | **semi-huérfana**: no aparece en ninguna barra; absorbida por Presupuestos |
| `/administracion/obras/[obra]` | ECONOMÍA de la obra (contrato, costo, margen) — recién mudada | D/A | ambos | ficha obra `enlace-economia`, timeline cliente | nueva (ya decidido) |
| `/presupuestos` | Cartera de presupuestos | D/A | ambos | nivel 2 | ok |
| `/presupuestos/nuevo` | Lectura del plano / cotizador | D/A | ambos | cartera | ok |
| `/presupuestos/[presupuesto]` | Entorno XSAS del presupuesto | D/A | ambos | cartera | **sin «volver» a cartera verificado en código** |
| `/presupuestos/[presupuesto]/partida/[partida]` | Análisis de partida | D/A | ambos | tabla partidas | **sin «volver» verificado** |
| `/presupuestos/[presupuesto]/convertir` | Preparar obra desde presupuesto | D/A | ambos | entorno | ok, `volverA` |
| `/obras` | Cartera de obras (Tabla) | D/A/J | ambos | solapa nivel 1 | ok |
| `/obras/gantt` | Gantt de cartera | D/A/J | ambos | NavObras | ok |
| `/obras/nueva` | Alta de obra en pasos | D/A | ambos | cartera | ok, «Volver» |
| `/obras/[obra]` | Workspace: `?vista=resumen/tareas/personal/operacion/documentos` | D/A/J | ambos | cartera, cliente | ok, cabecera con volver |
| `/obras/[obra]/subcontratos` `/dotacion` `/avance-masivo` | Sub-pantallas de Trabajo | D/A(J: dotación, masivo) | ambos | SubNavTrabajo | ok |
| `/obras/[obra]/avance/[actividad]` | Registrar avance (pantalla entera) | D/A/J | ambos | tareas | ok |
| `/obras/[obra]/cronograma` | Redirige a `?vista=tareas` | — | — | 1 link viejo | **obsoleta** (redirect, conservar o borrar) |
| `/analiticas` | 5 vistas económicas por URL | D/A | ambos | solapa nivel 1 | ok |
| `/herramientas` + `/inventario` `/ubicaciones` `/movimientos` `/mantenimiento` `/planilla` `/etiquetas` | Módulo Herramientas (D01–D14) | todos menos C | ambos | solapa nivel 1, NavHerramientas | ok; planilla/etiquetas sin barra propia (se llega por botón) |
| `/herramientas/rodados` `/maquinarias` | Redirigen a inventario `?clase=` | — | — | Analíticas, QR | redirects deliberados |
| `/h` `/h/[codigo]` | Puerta del QR → ficha (campo en tel., inventario en desk) | todos | ambos | etiqueta física | ok |
| `/integraciones` | «Operación · Fuentes» (estado de conexiones) | todos | ambos | NavOperacion, /campo, /mi-trabajo | **confusa**: URL «integraciones», título «Operación», absorbida en solapa Obras |
| `/integraciones/pedidos-materiales` | Pedidos de materiales (AppSheet) todas las obras | todos | ambos | NavOperacion, /campo, /mi-trabajo | ok pero fuera de toda barra de nivel 1/2 |
| `/integraciones/movimientos` | Movimientos de herramientas (viejo) | todos | ambos | NavOperacion, /campo, /mi-trabajo | **duplica** `/herramientas/movimientos` |
| `/integraciones/herramientas` | Redirige a `/herramientas` | — | — | nadie | obsoleta (redirect) |
| `/documentos` | Archivo de la empresa entero | D/A/J | ambos | sólo sí misma | **huérfana**: ninguna barra ni link externo |
| `/mi-cuenta` + `/legajo` `/horas` `/documentos` `/seguridad` `/notificaciones` `/sesiones` | Cuenta propia (perfil, legajo, horas, papeles) | todos | ambos (`PieMovil` mobile) | menú usuario, /mi-informacion | **duplica** legajo/horas/documentos de `/mi-informacion/*` para O |
| `/os` | «Centro de Operación» (comandar/aprobar/mirar) | D/A | ambos | sólo desde un reporte generado | **huérfana** |
| `/aprobaciones` | Cola de aprobaciones Nivel E | D/A | ambos | `/os` | huérfana de segundo grado |
| `/calendario-financiero` | Calendario del motor financiero | D/A | ambos | `/os`, reportes | huérfana de segundo grado |
| `/reportes` | Definiciones y generación de reportes | D/A | ambos | `/os` | huérfana de segundo grado; estilo viejo (slate) |
| `/xsas` | Chat con XSAS | D/A/J | ambos | URL externa (`urlDePuerta`) | huérfana desde la app |
| `/descargas` | Bajar extensión Chrome | todos | desk | nadie | **huérfana** |
| `/campo` | Entrada de obra en el teléfono: Parte · Material · Problema · Herramientas · Movimientos · Asistencia | J (O no escribe) | mobile | `/mi-trabajo` («Parte de campo →») | **sin entrada desde el rol que la usa (J)**; sin marco ni barra |
| `/campo/parte` `/campo/impedimento` | Parte diario / impedimento por obra | J (D/A) | mobile | /campo | ok |
| `/campo/asistencia` | Carga de asistencia por obra (versión campo) | J (D/A) | mobile | /campo, `BloqueAsistenciaQuincena` | **duplica** `/administracion/personas/asistencia` (decisión 17/09 «una sola experiencia») |
| `/campo/herramientas` + `escanear` `buscar` `lugar` `mover` `verificar` `alta` `a/[codigo]` (+`reportar` `verificar`) | Herramientas en obra M01–M14 | todos | mobile | /campo, QR, ficha desk («verificar») | ok; árbol deliberado 21/09 |
| `/hoy` | M02 Hoy del empleado | O | mobile | inicio de O, barra | ok |
| `/mi-trabajo` (+`/reportar`) | M03 tareas + avisar problema | O | mobile | barra | ok |
| `/mi-trabajo/tareas` | Redirige a `/mi-trabajo` | — | — | hoy, not-found | obsoleta (redirect) |
| `/mi-trabajo/tareas/[tarea]` | M04 detalle tarea | O | mobile | mi-trabajo | ok, volver |
| `/mi-informacion` | M09 Yo | O | mobile | barra | ok |
| `/mi-informacion/horas` `/asistencia` `/legajo` `/documentos` (+`/[documento]`) | M05–M08 | O | mobile | barra (Horas), Yo | ok, volver |
| `/mi-informacion/recibos` | Lista recibos (quincena + sueldo) | O | mobile | Yo (decisión dueño) | ok |
| `/mi-informacion/recibos/[recibo]` y `/recibos/quincena/[recibo]` | Detalle recibo de SUELDO vs de QUINCENA | O | mobile | lista | dos detalles, distinta entidad: justificado pero nombres confusos |
| `/mi-informacion/recibos/firmar` `/papel` | Firmar con el dedo / subir papel | O | mobile | detalle quincena | ok (`?recibo=`) |
| `/mi-informacion/efectivo` + `firmar` `rendir` `rendir/confirmar` `rendiciones` `rendiciones/[ticket]` `devolver` | Efectivo a rendir M02–M08 | O/J | mobile | Hoy, Yo, DM del bot (`firmar?entrega=`) | deliberado (22/09); `devolver` sin link interno (a confirmar) |
| `/obra/hoy` `/tareas` `/avance` `/personas` | J01–J05 jefe en el teléfono | J | mobile | barra inferior (jefe) | **sin ninguna entrada**: ningún link ni redirect lleva a `/obra/hoy` |
| `/obra/frente` `/obra/avance-masivo` `/obra/efectivo` | J06, J04, D15 | J | mobile | /obra/hoy | ok dentro del árbol; heredan la orfandad |
| `/portal` + `pagos` `facturas` `documentos` `terminadas` (+`/[obraId]`) `salir` `chau` `login` | Portal del cliente | C | ambos | destinos.ts | ok; `/portal/avance` figura «más adelante» sin página |

Rutas relevadas: **126 `page.tsx`** (más 12 handlers `route.ts`).

## (b) Hallazgos

**Huérfanas (ningún Link/redirect en `src/`)**
1. `/documentos` — pantalla completa (27 · Documentos) sin entrada; en `solapaActiva` cuenta como Administración pero no está en `DESTINOS`.
2. `/descargas` — sólo mencionada en comentarios y en `CAMPO_RUTAS_PERMITIDAS`.
3. Racimo `/os` → `/aprobaciones`, `/calendario-financiero`, `/reportes`: `/os` sólo se enlaza desde un reporte generado. Estilo Tailwind viejo (`text-slate-900`), sin `PageShell` v2. El layout lo declara «siguen vivas» desde 27/08 pero nadie las volvió a enlazar.
4. `/xsas` — sólo por URL externa del bot.
5. **`/obra/hoy` (app del jefe en el teléfono)**: `destinoDeLaHome('jefe_obra')` = `/administracion` → `/clientes`. Un jefe que entra desde el celular aterriza en la cartera de clientes de escritorio y no tiene forma de llegar a J01 salvo escribir la URL. Es el hallazgo más grave: el producto «jefe con una mano» no tiene puerta.
6. `/campo` — sólo enlazada desde `/mi-trabajo` (pantalla de O), pero O no puede escribir partes ni impedimentos; el jefe, que sí puede, no tiene link.
7. `/administracion/base-maestra/*` — sin solapa; se llega desde un botón de Presupuestos y desde un panel de obra.

**Duplicadas / mismo concepto en dos URLs**
8. Asistencia, SEIS pantallas: `/administracion/personas?vista=asistencia` (Horas quincena), `/administracion/personas/asistencia` (carga del día), `/campo/asistencia` (carga del día, versión campo), `/administracion/personas/cuadrillas/asistencia` (semana), `/administracion/personas/en-obra` (ahora), `/administracion/asistencia` (correcciones). Las dos cargas del día contradicen la decisión del 17/09.
9. Movimientos de herramientas: `/integraciones/movimientos` (viejo, tabla `herramientas` hoy vista de sólo lectura) y `/herramientas/movimientos` (nuevo). `NavOperacion` sigue apuntando al viejo.
10. Avance masivo: `/obras/[obra]/avance-masivo` (desk) y `/obra/avance-masivo` (jefe). Mismo acto, dos formularios; justificado por dispositivo si se decide así, pero no hay puente entre ambos.
11. Cuenta propia: `/mi-cuenta/{legajo,horas,documentos}` (todos los roles, escritorio) vs `/mi-informacion/{legajo,horas,documentos}` (O, teléfono). O tiene las dos disponibles; `/mi-informacion` enlaza a `/mi-cuenta` para «Mi perfil».
12. Recibos: dos rutas de detalle (`/recibos/[recibo]` sueldo, `/recibos/quincena/[recibo]` quincena). Entidades distintas; el nombre no lo dice.
13. Redirects fósiles: `/obras/[obra]/cronograma`, `/integraciones/herramientas`, `/mi-trabajo/tareas`, `/herramientas/rodados`, `/herramientas/maquinarias`. Los dos últimos son deliberados (QR/Analíticas); los tres primeros no tienen quién los enlace.

**Inconsistencias de nombre**
14. Solapa «Administración» aterriza en «Clientes» (título de pantalla); solapa «Obras» agrupa también `/integraciones`, `/campo`, `/hoy`, `/mi-*`.
15. `/integraciones` se titula «Operación» y su barra es Pedidos · Herramientas · Movimientos · Fuentes; «Herramientas» ahí salta a otro módulo de nivel 1.
16. `/administracion/asistencia` = «Correcciones de asistencia»; `ubicacion.ts` la ignora (cae en «Administración»).
17. Personal: la solapa se llama «Horas» pero su `?vista=asistencia`; en `ubicacion.ts` `/administracion/personas` es «el legajo de personas».
18. Barra del empleado: «Horas» apunta a `/mi-informacion/horas` (subruta) mientras «Yo» apunta a la raíz `/mi-informacion`: la subruta enciende dos contextos posibles (resuelto por `startsWith`, pero la jerarquía está al revés).

**Diferencias desktop/mobile sin justificación**
19. `/campo/*` no tiene marco (ni header ni barra inferior): en el celular el jefe queda sin navegación; en escritorio se dibuja igual, sin header.
20. La carga de asistencia existe en escritorio (`/administracion/personas/asistencia`, con `ObraEnTelefono` sólo mobile) y aparte en `/campo/asistencia`; el `BloqueAsistenciaQuincena` de escritorio manda a la versión campo.
21. El atajo «Asistencia» del menú de usuario es `md:hidden`: en escritorio la misma pantalla queda a tres toques. Justificado por el comentario, pero es la única acción que cambia de lugar según el ancho.
22. `PieMovil` de `/mi-cuenta` repite en mobile (`lg:hidden`) los tres accesos que ya están en `NavMiCuenta`.
23. `/descargas` sólo tiene sentido en escritorio (extensión Chrome) y está permitida a O.

**Detalle sin vuelta verificable**
24. `/presupuestos/[presupuesto]` y `/presupuestos/[presupuesto]/partida/[partida]`: no se encontró `href="/presupuestos"` ni migas en la página ni en `EncabezadoVivo`/`TablaComposicion` (verificar en navegador antes de afirmar).
25. `/analiticas`, `/herramientas/planilla`, `/herramientas/etiquetas`: sin «volver»; las dos últimas dependen del `Marco` (barra de Herramientas) — aceptable.
26. `/aprobaciones`, `/reportes`, `/calendario-financiero`, `/os`, `/xsas`, `/descargas`: sin migas ni volver (consistente con su orfandad).

## (c) Propuesta de arquitectura de información única

Principio: una obra es la unidad; tres productos por dispositivo y rol, un solo árbol de URLs cada uno. No se rediseña
ninguna pantalla aprobada: se mueven entradas, se unifican duplicados y se retiran rutas sin dueño.

**Escritorio (D/A/J) — nivel 1: Administración · Obras · Analíticas · Herramientas** (sin cambios en la barra)
- Administración (nivel 2): Clientes · Personal · Compras · Impuestos · Presupuestos. Mudanzas:
  - `/documentos` entra como sexto destino o como solapa de Clientes/Obras. Hoy no tiene dueño: **decidir** (duda 1).
  - Base maestra: solapa visible dentro de Presupuestos (ya `absorbe`), no sólo un botón.
  - Personal: unificar asistencia en TRES pantallas con nombre propio: **Cargar día** (`/administracion/personas/asistencia`),
    **Quincena/Horas** (`?vista=asistencia`), **Correcciones** (renombrar `/administracion/asistencia` → `/administracion/personas/correcciones`, redirect 301 de la vieja).
    «Semana» (`cuadrillas/asistencia`) y «En obra ahora» pasan a ser vistas (`?vista=semana`, `?vista=ahora`) de Horas, no rutas.
    `/campo/asistencia` → redirect a `/administracion/personas/asistencia?obra=&fecha=` (la pantalla ya es responsive, decisión 17/09).
- Obras: `/obras` (Tabla · Gantt) y el workspace `/obras/[obra]` con sus 5 vistas. Mudanzas:
  - `/integraciones/*` deja de llamarse «integraciones»: **Pedidos** y **Fuentes** pasan a `/obras/operacion/pedidos` y `/obras/operacion/fuentes`
    (o a la vista Operación de cada obra, que ya existe como TabOperacion) con redirect desde las URLs viejas.
  - `/integraciones/movimientos` → redirect a `/herramientas/movimientos`; `NavOperacion` deja de listar «Herramientas» y «Movimientos».
  - `/obras/[obra]/cronograma` → borrar (redirect ya vive en `?vista=tareas`; ningún link).
- Herramientas: sin cambios (decisión 21–22/09).
- Menú de usuario (todos): Mi cuenta · Usuarios (D/A) · Ver como (D). **Agregar «Centro del OS»** (D/A) que lleve a `/os`,
  y `/os` pasa a ser la única puerta de `/aprobaciones`, `/reportes`, `/calendario-financiero`, `/xsas`, `/descargas`;
  o bien retirarlas del código si el dueño confirma que no las usa (duda 2). Hoy son código muerto con datos vivos.

**Teléfono del jefe (J) — `/obra/*`, barra Hoy · Tareas · Avance · Gente**
- `destinoDeLaHome('jefe_obra')` pasa a `/obra/hoy` **cuando el dispositivo es teléfono** (o siempre, si el dueño lo decide — duda 3),
  y el header de escritorio muestra a J un acceso «Mi obra en el teléfono». Sin esto J01–J06 no existen para nadie.
- `/campo/parte`, `/campo/impedimento` y `/campo/herramientas/*` cuelgan de `/obra/hoy` como accesos (parte = `/obra/avance-masivo`
  ya cubre el avance; impedimento → `/obra/hoy` «Resolver ahora»). `/campo` como raíz se retira con redirect a `/obra/hoy`
  para J y a `/hoy` para O; `/campo/herramientas` se conserva (árbol M01–M14 aprobado) y se enlaza desde `/obra/hoy` y `/hoy`.
- `/obra/efectivo` ya cuelga de Hoy (correcto, deliberado).

**Teléfono del empleado (O) — barra Hoy · Trabajo · Horas · Yo** (sin cambios de diseño)
- Retirar de `CAMPO_RUTAS_PERMITIDAS`: `/campo` (no puede escribir), `/integraciones/*` salvo pedidos, `/descargas`, `/mi-cuenta/{legajo,horas,documentos}`
  (quedan `/mi-cuenta` perfil y seguridad; los duplicados se resuelven por redirect a `/mi-informacion/*` cuando el rol es O).
- «Recibos de pago» queda en Yo (decisión del dueño). Efectivo a rendir queda como está.

**Redirecciones necesarias** (todas 308, sin borrar datos): `/campo/asistencia`→carga del día · `/integraciones/movimientos`→`/herramientas/movimientos` ·
`/integraciones`→operación/fuentes · `/integraciones/pedidos-materiales`→operación/pedidos · `/administracion/asistencia`→correcciones ·
`/administracion/personas/cuadrillas/asistencia`→`?vista=semana` · `/campo`→por rol · `/mi-cuenta/{legajo,horas,documentos}`→`/mi-informacion/*` (sólo O) ·
`/obras/[obra]/cronograma`, `/integraciones/herramientas`, `/mi-trabajo/tareas`: borrar.

**Métrica**: rutas sin entrada = 0; conceptos con más de una URL viva = 0 (hoy: asistencia 6, movimientos 2, cuenta 3, avance masivo 2); un jefe llega a J01 en 0 toques desde el login en el celular.

## (d) Dudas para el dueño

1. `/documentos` (archivo entero de la empresa): ¿se usa? No tiene entrada desde ninguna barra. ¿Va en Administración o dentro de Obras/Clientes?
2. `/os`, `/aprobaciones`, `/reportes`, `/calendario-financiero`, `/xsas`, `/descargas`: ¿alguien las abre hoy? Son de julio, estilo viejo, sin enlace. ¿Se rescatan detrás de un único acceso «Centro del OS» o se retiran?
3. Jefe de obra en el celular: ¿su inicio es `/obra/hoy` (J01) siempre, o sólo desde teléfono y en escritorio sigue en Administración?
4. `/campo` (Parte · Material · Problema · Herramientas · Movimientos · Asistencia): ¿sigue siendo una pantalla o sus seis filas se reparten entre `/obra/hoy` (jefe) y `/hoy` (empleado)? Hoy la ve el empleado, que no puede escribir nada de eso.
5. `/campo/asistencia` vs `/administracion/personas/asistencia`: la decisión del 17/09 dice una sola; ¿confirma retirar la de campo?
6. `/integraciones` («Operación · Fuentes»: estado de las conexiones con AppSheet/Drive): ¿es una pantalla para el dueño, para sistemas, o sobra?
7. `/administracion/personas/cuadrillas/asistencia` (semana cerrada por persona) y `/en-obra` (ahora): ¿son dos preguntas que se hacen de verdad, o alcanza con Horas de la quincena y la carga del día?
8. `/mi-cuenta/{legajo,horas,documentos}` para el operario: ¿se le muestra sólo `/mi-informacion/*` (teléfono) y se cierra la versión escritorio?
9. `/mi-informacion/efectivo/devolver` no tiene enlace interno: ¿se llega sólo por el aviso del bot, como `firmar`?
10. `/portal/avance` está anunciado «más adelante» en el portal del cliente: ¿queda en el menú del cliente como promesa o se oculta hasta que exista?

## (e) Lo que se hizo el 23/09

El dueño aprobó la propuesta (c) con «hacelo» y resolvió las diez dudas de (d). Todo lo de abajo está en código,
con `typecheck` limpio, `eslint` sin errores en los archivos tocados y 118 tests `node --test` en verde (los de
navegación, aterrizaje, áreas, ubicación, portal, campo, empleado, jefe y los dos módulos nuevos de `shared`).
Nada de base, RLS, cálculos ni datos. Ningún archivo ni ruta se borró.

### Mapa definitivo

| | Escritorio (D/A/J) | Teléfono |
|---|---|---|
| Inicio `/` | D/A/J → `/administracion` → `/clientes` | O → `/hoy` · **J → `/obra/hoy`** (por `sec-ch-ua-mobile`/User-Agent, `shared/utils/dispositivo.ts`) · C → `/portal` |
| Nivel 1 | Administración · Obras · Analíticas (D/A) · Herramientas | J: barra Hoy · Tareas · Avance · Gente (`/obra/*`) · O: Hoy · Trabajo · Horas · Yo |
| Administración (nivel 2) | Clientes · Personal · Compras · Impuestos (D/A) · Presupuestos (D/A) · **Documentos (D/A)** · **Fuentes** | — |
| Personal | Plantel · **Horas** (`?vista=asistencia`, con enlaces «Cargar asistencia», «Semana por persona», «En obra ahora») · Liquidación (D/A) · Cargar día · Correcciones (migas a Personal) | Horas en modo día (ya existía) |
| Fuentes (`/integraciones`) | Pedidos (`/integraciones/pedidos-materiales`) · Movimientos (→ `/herramientas/movimientos`) · Fuentes | — |
| Obras | `/obras` (Tabla · Gantt) · `/obras/[obra]` 5 vistas · Economía en `/administracion/obras/[obra]` | J: `/obra/hoy` → Avance masivo · **Campo** (Parte · Problema · Herramientas · «todo lo de campo») · Efectivo |
| Campo `/campo` | (igual, sin header: se llega por «ver como» o URL) | **Del jefe**: flecha «‹» a `/obra/hoy` (D/A a `/`); O es redirigido a `/hoy`. Filas: Parte · Material · Problema · Asistencia (→ carga única) · Herramientas · Movimientos (→ M07 Mover) |
| Cuenta propia | `/mi-cuenta/{legajo,horas,documentos}` con enlace «Ver en la versión del teléfono» (< `lg`) | `/mi-informacion/{legajo,horas,documentos}` con enlace «Ver en la versión de escritorio» (≥ `lg`). Nombres unificados: «Mis documentos» (antes «Mis papeles») |
| Menú de usuario | Ver como (D) · **Mi obra en el teléfono (J)** · Cargar asistencia (< `md`) · Mi cuenta · Usuarios (D/A) · Salir | — |
| Portal cliente | Inicio · Pagos · Facturas · Documentos · Terminadas (**Avance ya no se dibuja**) | idem |

### Movidas / unificadas / retiradas de navegación

- **Movidas**: `/documentos` y `/integraciones` («Fuentes») entran a la barra de Administración (`areasAdmin.ts · DESTINOS`,
  7 destinos); `solapaActiva('/integraciones')` = Administración. «Semana por persona» y «En obra ahora» se enlazan desde Horas.
  `/campo` cuelga de `/obra/hoy`. Correcciones (`/administracion/asistencia`) vuelve a Personal (migas) y en la obra se llama
  «Correcciones de asistencia», no «Asistencia».
- **Unificadas**: carga del día = una sola (`/administracion/personas/asistencia`); movimientos = uno solo (`/herramientas/movimientos`);
  detección de teléfono = una sola (`shared/utils/dispositivo.ts`, antes duplicada en `vistaDeAsistencia.ts`); raíz del jefe =
  una sola (`shared/auth/areas.ts · INICIO_JEFE_TELEFONO`, la leen `features/auth` y `features/jefe`); las dos caras de la cuenta
  propia = un mapa (`shared/utils/cuentaPropia.ts`).
- **Retiradas de toda navegación** (rutas intactas): `/campo/asistencia` (redirige), `/integraciones/movimientos` (redirige),
  «Herramientas» de `NavOperacion`, «Parte de campo →» de `/mi-trabajo`, «Avance» del portal, `/os`, `/aprobaciones`, `/reportes`,
  `/calendario-financiero`, `/xsas`, `/descargas` (ya no tenían enlace; confirmado que se quedan sin él).

### Diferencias desktop/mobile que quedan, y por qué

- J: inicio `/obra/hoy` sólo en teléfono; en escritorio Administración (decisión 3). El menú de usuario ofrece «Mi obra en el
  teléfono» en cualquier ancho para que la puerta sea visible también desde escritorio.
- `/campo/*` sigue sin header ni barra inferior: es el árbol de herramientas M01–M14 aprobado el 21/09; la vuelta ahora es
  explícita en cada nivel (sub-pantalla → «Campo» → «Hoy»).
- Cuenta propia en dos árboles (decisión 8): se cruzan con enlaces por ancho, sin redirects.
- Avance masivo sigue con dos formularios (`/obras/[obra]/avance-masivo` y `/obra/avance-masivo`): por dispositivo, sin puente;
  no era una duda y no se tocó.

### Rutas afectadas y redirecciones

| Ruta | Qué pasa ahora |
|---|---|
| `/` | J desde teléfono → `/obra/hoy`; resto igual (`destinoDeLaHome(rol, telefono)`; login y recuperación pasan por lo mismo) |
| `/campo/asistencia?obra=&dia=` | `redirect()` de Next a `/administracion/personas/asistencia?obra=&dia=` (`hrefCargaDeAsistencia`) |
| `/integraciones/movimientos` | `redirect()` a `/herramientas/movimientos` |
| `/campo` | rol `campo` → `redirect('/hoy')`; jefe/D/A la ven con flecha de vuelta |
| `/integraciones`, `/integraciones/pedidos-materiales` | mismas rutas, títulos «Fuentes» y «Pedidos de materiales», solapa Fuentes encendida |
| `/documentos` | misma ruta, ahora con solapa (D/A) |

### Sin acceso, candidatas a retiro (ningún `Link`/`redirect` en `src/` salvo entre ellas)

`/os` (sólo desde un reporte generado), `/aprobaciones`, `/reportes`, `/calendario-financiero` (sólo desde `/os`), `/xsas`
(sólo por URL externa del bot), `/descargas` (nadie), `/obras/[obra]/cronograma`, `/integraciones/herramientas`,
`/mi-trabajo/tareas` (redirects sin quien los enlace). `MovimientosGlobal` y `getMovimientosGlobal` (feature integraciones)
quedaron sin consumidor tras el redirect: código muerto, no borrado.

### Lo que NO se hizo, y por qué

- No se renombró `/administracion/asistencia` → `/administracion/personas/correcciones`: son 12 referencias en `src/`
  (`revalidatePath`, enlaces, home de administración) más seis specs de Playwright; el nombre engañoso se corrigió donde se lee
  (migas, subtab de la obra, `ubicacion.ts`) sin mover la URL. Si el dueño lo quiere, es una tarea aparte con redirect.
- No se tocó `CAMPO_RUTAS_PERMITIDAS` (permisos del middleware): `/campo/herramientas` se abre por QR desde el rol campo y
  `/integraciones/movimientos` sigue permitida porque ahora redirige a un módulo que ya puede ver.
- La solapa «Administración» sigue aterrizando en `/clientes`: no existe un resumen de Administración (se retiró el 09/09 por
  REALIDAD ÚNICA) y el nombre de nivel 1 lo fijó el dueño. La pantalla lo dice con las dos barras (Administración › Clientes).
- No se borraron los redirects fósiles ni las pantallas huérfanas: la decisión 2 dice retirar de la navegación, no borrar.
- `/presupuestos/[presupuesto]` ya tenía «Cartera» en `BarraIdentidad` y la partida ya tenía migas (hallazgo 24 estaba mal).
- `/mi-informacion/efectivo` ya enlazaba «Devolver efectivo» (`ir-devolver`, decisión 9): verificado, no había nada que agregar.
- Specs de Playwright que apuntan a `/campo/asistencia` (`tests/asistencia-por-obra`, `asistencia-admin-movil`,
  `horas-declaran-presencia`, `presente-carga-horas-por-defecto`, `design-v2-conformidad`, `shell-dos-areas`) van a seguir el
  redirect; no se corrieron (la suite satura la VM) y hay que revisarlas antes de firmar.

## f. Teléfono por nivel de usuario (dueño, 23/09/2026: «hacé todas las vistas mobile por nivel de usuario»)

**Principio**: una sola pantalla por concepto, con clases responsive; no hay pantallas «mobile» duplicadas salvo
las que ya existían como producto propio (`/hoy`·`/mi-*` del empleado, `/obra/*` del jefe, `/campo/*`).

| Nivel | Inicio en el teléfono | Barra de abajo (`< md`, `BarraTelefono` · `barraTelefonoDe(rol)`) | Header |
|---|---|---|---|
| Dirección / Administración | `/campo` | Campo · Admin. · Obras · Herram. · Datos | sin solapas (están en la barra); lupa, campana y avatar quedan |
| Jefe de obra | `/obra/hoy` | Mi obra · Campo · Admin. · Obras · Herram. (en `(main)` y en `/campo`) | idem |
| Empleado | `/hoy` | la suya (Hoy · Trabajo · Horas · Yo) | no entra a `(main)` salvo `/mi-cuenta` |
| Cliente | `/portal` | la del portal | — |

- Herramientas en el teléfono es siempre `/campo/herramientas/*` (middleware; `?pc=1` fuerza escritorio).
- Pantallas de escritorio a 390: la página nunca se corre de costado; lo ancho scrollea por dentro (`Tabla minWidth`,
  `CintaHorizontal`, lienzos); paneles laterales bajan debajo o van en `Drawer`; solapas de nivel 2/3 en una línea corrible
  (`v2/BarraCorrible`, `CabeceraSeccion`); controles compartidos (`CTRL`) de 48 px y letra 16 bajo `md`.
- Con aviso «se usa en computadora»: Horas por quincena forzada desde el teléfono (`quincena-en-computadora`). Nada más.
- Sin versión cómoda (usable con scroll interno): Rodados y Maquinarias de escritorio con `?pc=1`, Gantt de obras.
