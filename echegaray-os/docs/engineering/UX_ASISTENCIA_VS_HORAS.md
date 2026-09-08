# UX · Asistencia vs. horas — cómo se distinguen en pantalla

**Decisión del 08/09/2026.** Pregunta del dueño: *«¿cómo vamos a distinguir por UX y diseño la
diferencia entre asistencia y horas?»*. Contexto que no se re-litiga: *«una cosa es asistir y otra la
carga de horas»*; el fichaje desde el celular (`asistencia_marca`) todavía no está en uso —4 marcas
de prueba en toda su historia— y las horas por día viven en `registros_hh`.

## 1 · La decisión en diez líneas

1. **Son dos hechos con dos fuentes y nunca se suman ni se restan entre sí.** Fichaje =
   `asistencia_marca`. Horas = `registros_hh`. Ninguna pantalla deriva uno del otro.
2. **La presencia es un ESTADO; las horas son una CANTIDAD.** El estado se dice con símbolo + color
   semántico; la cantidad con un número monoespaciado en tinta, sin color de estado.
3. **Una sola celda de dos capas** (`CeldaDia`): arriba la presencia, abajo las horas. Misma anatomía
   en la grilla de quincena, en la ficha por día y en el celular.
4. **Presente sin horas y horas sin fichaje son dos verdades válidas.** Ninguna es una falta.
5. **«Sin registrar» nunca se lee como «ausente».** Ausencia es una «A» roja *declarada* en
   `registros_hh`; sin horas es un marco punteado neutro; sin marca es *nada*.
6. **Nunca «N de M fichados» contra el plantel.** Sin marcas → una línea neutra que dice por qué; con
   marcas → sólo las marcas. Nunca «no fichó».
7. **Los totales se escriben en su propia unidad:** «15 presentes · 1 ausente» (estado) vs. «534 h»
   (cantidad). Nunca en la misma frase.
8. **Dos entradas distintas en el celular:** «Fichar» (la persona, entrada/salida, un toque) y «Cargar
   horas» (el jefe, una obra, un día, las horas de cada uno).
9. **Rojo sólo para problemas, verde sólo para estado positivo.** Cargar tarde no es un problema de
   la persona: el marco «sin cargar» es neutro. El ● verde aparece sólo con una marca real.
10. **Tokens, nunca hex.** `text-pos`, `text-neg`, `text-muted`, `text-ink`, `border-line`,
    `font-mono`. Objetivos táctiles ≥ 44 px.
11. **NINGUNA PRESENCIA SE RESUELVE CON HORAS — el dueño, 08/09/2026, por tercera vez:** *«todas las
    pantallas en donde aparezca el concepto de fichado no tiene que resolverse con las hs; está mal:
    una cosa es asistencia o activo en el día y otra cosa son las cantidades de hs»*.
    La presencia sale SÓLO de (1) `asistencia_dia` —lo declaró el jefe: presente/ausente/licencia—,
    (2) `asistencia_marca` —fichaje real—, o (3) una fila de `registros_hh` con `tipo_hora` de
    `ausencia`/`licencia`, que es una **declaración**, no una cantidad. Sin ninguna de las tres:
    **«sin marcar»**, neutro. Nunca «presente» porque haya horas > 0, nunca «ausente» porque no las
    haya. Las horas son una cantidad aparte, monoespaciada, en tinta, sin color de estado, al lado
    o debajo del estado. Una persona puede tener 9 h y estar «sin marcar»; puede estar «presente» y
    tener 0 h cargadas. **Las dos cosas se ven, ninguna se deduce de la otra.**
    Vocabulario del estado: `presente · ausente · licencia · sin marcar`. Prohibido: «no fichó»,
    «sin fichar», «N de M fichados», «con horas» como estado.

## 2 · Lo que hacen los líderes (investigación 08/09/2026, WebSearch)

| # | Producto | Qué separa y cómo lo nombra | Qué se toma para el OS | Fuente |
|---|---|---|---|---|
| 1 | **Procore** | Tres herramientas distintas: *Timesheets* (horas por cuadrilla, entrada en obra, aprobación y firma), *My Time* (cada uno «enter your own personal time» / clock in-out en el celular) y *Daily Log Timecards* («reference of internal employees who were on-site»). | Quién estuvo (bitácora) y cuántas horas se imputan son módulos distintos con nombres distintos. | [FAQ: diferencias entre módulos de tiempo](https://support.procore.com/faq/what-are-the-differences-between-procores-time-modules) |
| 2 | **Procore** | En la configuración del timesheet, *«Total Hours»* y *«Start Time and Stop Time»* son dos **formatos de entrada** del mismo dato; el clock-in por geocerca sólo *«prompts»* la marca. | El número de horas y la hora de entrada/salida no compiten en la misma celda: el número es la cantidad; la marca es un evento. | [Configure Advanced Settings: Timesheets](https://support.procore.com/products/online/user-guide/project-level/timesheets/tutorials/configure-advanced-settings-project-level-timesheets) |
| 3 | **Raken** | *Time Clock*: «each clock event creates a time card entry automatically». *Supervisor time cards*: el capataz «selecting the crew, entering hours, cost code» para toda la cuadrilla en un paso — «the most common time card workflow for construction crews». Kiosk mode para quien no tiene celular. | La carga por el jefe («una obra, un día, las horas de cada uno») es el camino principal y **no depende** de que exista una marca. | [Raken Time Tracking Features](https://help.rakenapp.com/en/articles/14142319-raken-time-tracking-features) · [How to Use Raken Time Clock](https://help.rakenapp.com/en/articles/14232486-how-to-use-raken-time-clock) |
| 4 | **Connecteam** | Dos solapas: **Today** («see who's clocked in and to what job») y **Timesheets** («a summary of your employee's totals» para la liquidación). El rojo se reserva a *Conflicts* (horas superpuestas). | Presencia en vivo y horas del período son dos vistas; el rojo es para un problema real, no para un silencio. | [Starting Guide to the Time Clock](https://help.connecteam.com/en/articles/3310664-starting-guide-to-the-time-clock) |
| 5 | **Deputy** | Si alguien no ficha en un turno programado el timesheet dice *«Possible Absentee»* y, 15 min antes del fin del turno, *«Unsubmitted»* — nunca «Absent» automático. Estados: Upcoming · On shift · Absent · Late · Pending · Approved. Un «Unsubmitted» vacío se completa con *«Import scheduled details»* o se descarta. | **No fichar no es estar ausente**: la ausencia es una declaración de una persona, y el silencio tiene su propia palabra y su propia acción. | [Adding, editing and approving Timesheets](https://help.deputy.com/hc/en-au/articles/6997348381327-Adding-editing-and-approving-Timesheets) |
| 6 | **ClockShark** | *«Who's Working Now?»*: mapa en tiempo real de quién está en el trabajo; las timesheets se generan después desde las marcas. | «Quién está hoy» es una vista de estado con nombres; las horas son otra pantalla. | [Time and Attendance Software](https://www.clockshark.com/tour/time-attendance-software) |
| 7 | **Buildertrend** | El *Time Clock* ficha «by jobsite» con geocerca; el tiempo «is automatically applied to payroll and job costing». | La marca lleva la obra: una marca sin obra es una alerta de costo (ya implementado en *En obra ahora*: «Fichó sin obra en la marca»). | [Time Clock Overview](https://buildertrend.com/help-article/time-clock-overview/) |
| 8 | **busybusy** | El *cost code* se elige **al fichar**; la app acumula horas reales por código contra las estimadas. | El fichaje del futuro debe pedir la obra al marcar. Hasta entonces la obra la fija la carga de horas. | [Mobile Time Clock App](https://busybusy.com/mobile-time-clock-app/) |
| 9 | **Patrón de calendarios de asistencia** | Grilla personas × días con **código de estado** en cada celda (P/A/L; verde presente, rojo ausente, amarillo tarde) y totales de estados; las variantes con horas son otra plantilla («hours worked rather than just present/absent»). | La celda de estado y la celda de horas existen como dos plantillas en el mercado: acá se superponen en una celda de dos capas para no duplicar la grilla. | [Clockify · attendance tracker templates](https://clockify.me/employee-attendance-tracker-excel-templates) · [Time Doctor · attendance calendars](https://www.timedoctor.com/blog/employee-attendance-calendars/) |

Lo que ningún líder hace: derivar «ausente» de la falta de marca, ni mezclar el número de horas con
el color del estado.

## 3 · Vocabulario

| Capa | Palabra | Fuente | Cuándo |
|---|---|---|---|
| Presencia | **fichó** | `asistencia_marca.entrada` | hay marca real |
| Presencia | **presente** | `asistencia_dia.estado = 'presente'` (declarado por el jefe) | declarado, nunca inferido de horas |
| Presencia | **sin marcar** | ninguna de las tres fuentes dijo nada | neutro (`text-faint`); NO es ausencia ni «sin cargar» |
| Presencia | **ausente / A** | `registros_hh.tipo_hora = ausencia` | declarado, nunca inferido |
| Presencia | **licencia / L** | `registros_hh.tipo_hora = licencia` | declarado; el motivo va al `title` |
| Presencia | **sin marca** | ausencia de dato | no se escribe en la celda; en pantallas de fichaje es una línea neutra |
| Horas | **horas cargadas** · «8,0» | `registros_hh.horas` | siempre monoespaciado y en tinta |
| Horas | **sin cargar** | ausencia de dato en día hábil pasado | marco punteado neutro; nunca rojo |
| Horas | **—** | día no laborable sin horas | inerte |

Prohibidas: «no fichó», «sin fichar», «N de M fichados» contra el plantel, «ausente» sin registro
que lo declare, «con horas» como estado, «0» donde no hay dato.

**Una cantidad de horas nunca produce una fila de esta tabla.** `registros_hh` sólo habla de
presencia cuando su `tipo_hora` es una declaración (`ausencia`/`licencia`); sus horas trabajadas
son la otra capa y viven en la fila «Horas».

## 4 · La celda de dos capas — `src/shared/components/ds/CeldaDia.tsx`

```
   44 px
 ┌────────┐
 │   ●    │ ← PRESENCIA · 14 px · símbolo con color semántico
 │  8,0   │ ← HORAS · 28 px · font-mono tabular-nums text-ink
 └────────┘    marco: transparente · punteado neutro si «sin cargar»
```

| presencia ↓ / horas → | con horas | sin horas (hábil pasado) | no laborable | futuro |
|---|---|---|---|---|
| **fichó ●** (pos) | ● / 8,0 | ● / *marco punteado* — «presente sin horas» | ● / — | — |
| **ausente A** (neg) | A / 8,0 (jornada medida) | A / vacío | A / — | — |
| **licencia L** (neutro) | L / 8,0 | L / vacío | L / — | — |
| **sin marca** (nada) | *nada* / 8,0 — «horas sin fichaje» | *nada* / *marco punteado* | *nada* / — | vacío |

Qué se dibuja lo decide **`decidirCeldaDia`** (`celdaDia.ts`, función pura, 11 tests en
`celdaDia.test.ts`). El componente sólo pinta. La capa de horas **nunca** devuelve un tono `pos`/`neg`
— hay un test que lo afirma para todas las combinaciones.

En la grilla editable el `<input>` reemplaza la capa de horas (`children`); la de presencia y el marco
los sigue decidiendo la función. La «A» de ausencia ya no se escribe en el campo: la dice la capa de
arriba. Escribir un número encima sigue convirtiendo el día en presente, y «A» sigue marcando la
ausencia — la carga no cambió.

## 5 · Totales

| Qué | Cómo se escribe | Qué NO se escribe |
|---|---|---|
| Presencia del día | «15 presentes · 1 ausente · 2 licencia · 6 sin marcar» — estados contados, palabras | «15 de 18» contra el plantel, «N con horas» como si fuera presencia |
| Fichaje del día | «12 marcas de entrada · 10 salidas» o «Sin marcas de entrada/salida (el fichaje desde el celular todavía no está en uso)» | «12 de 18 fichados», «6 sin fichar» |
| Horas | «534,0 h cargadas · 6 personas sin horas» en monoespaciada; «—» cuando nadie cargó | «0 h», mezclarlas en la frase de la presencia |

Una frase, una unidad. Si hace falta decir las dos, son dos frases (`RotuloPanel` distinto).

## 6 · Las dos entradas en el celular

| | **Fichar** | **Cargar horas** |
|---|---|---|
| Quién | la persona | el jefe de obra / Administración |
| Qué | entrada / salida, un toque, obra en la marca | una obra, un día, las horas de cada uno |
| Escribe en | `asistencia_marca` | `registros_hh` |
| Control | botón de 52 px con reloj; estado «fichado 07:42» | casilla vacía por persona; «Poner 8,8 a los que faltan» |
| Vive en | (futuro) menú de la cuenta → «Fichar» | `/campo/asistencia` y `/administracion/personas?vista=asistencia` en 390 px |

Nunca el mismo botón ni la misma pantalla: un jefe que ficha por otro está falsificando una marca;
una persona que se carga horas está imputando costo a una obra.

## 7 · La ficha, por día

Franja de la quincena (`QuincenaDeAsistencia.tsx`): etiqueta del día arriba (`L 1`), debajo la
`CeldaDia`. La casilla ya no se pinta de verde por tener horas: el número es la cantidad y el ●
aparece sólo con marca. Leyenda de una línea: **●** fichó · **A** ausencia · **L** licencia · marco
punteado = sin horas cargadas (no es una falta) · `8,0` horas cargadas.

Cuando el fichaje esté en uso, el detalle del día (`title` hoy; panel lateral después) dice las dos
capas en una frase: «Fichó 07:42 → 17:10 · 8,0 h en PISOS INDUSTRIALES · 1,0 h en SALÓN COMERCIAL».

## 8 · Regla para pantallas sin fichaje en uso

Toda pantalla que lea `asistencia_marca`:

- **Sin una sola marca** → UNA línea neutra (`text-muted`) que explica por qué:
  *«Sin marcas de entrada/salida (el fichaje desde el celular todavía no está en uso)»*. Cero
  tarjetas, cero «no fichó», cero denominador.
- **Con marcas** → sólo las marcas: «12 marcas de entrada», «3 con marca de entrada», nunca «12 de
  18». Verde sólo en quien tiene la marca; los demás neutros, no grises-de-falta.

Aplicada el 08/09/2026 en `/administracion/personas/en-obra` (bloques separados), `/obra/personas`
(subtítulo y conteo por cuadrilla), `/obra/frente` (línea de la gente del frente) y
`/administracion/personas/cuadrillas` (columna de fichaje; se retiró la barra ámbar «N/M fichados»).

**Y la columna HOY del Plantel** (`/administracion/personas`, `TablaPersonas.tsx`), el mismo día por
una captura del dueño: decía «● sin fichar» en las diecisiete filas, en ámbar. Ahora dice la
asistencia del día con el vocabulario de la §3 —`9 h` · `A · motivo` · `L · motivo` · `sin cargar`—
reusando `clasificar()` de `asistenciaDelDia.ts`, y el ● de presencia sólo aparece con una marca
real (`hayMarcaDeHoy`). `HOY_LABEL`/`HOY_TONO` se retiraron de `pulsoDelPlantel.ts`.

## 9 · Qué quedó fuera (hito 2)

- Leer `asistencia_marca` en la grilla de quincena y en la ficha para prender el ● — hoy la capa de
  presencia sólo conoce lo declarado en `registros_hh`. Cuando exista la fuente, `entradaDe()` en
  cada pantalla recibe la marca y nada más cambia.
- El botón «Fichar» en el celular (Nivel D, escribe en `asistencia_marca`).
- El detalle del día en panel lateral (hoy `title`).
- Los chips «Fichados / Sin fichar» de `/obra/personas` siguen existiendo como filtro de la lista de
  marcas: no dicen «ausente» y sólo cuentan marcas, pero su nombre se revisa cuando el fichaje esté en
  uso.
