# Asignar personal a una obra — diagnóstico y una sola forma

**08/09/2026.** El dueño, textual: *«la asignación de personal en cada obra es imposible, realmente
es una experiencia que no tiene forma de ser entendida, necesito algo mucho más sencillo; por el
momento que sea desde planilla asistencia con un dropdown de obra actual, pero tenés que revisar
por toda la plataforma esta experiencia»*.

Este documento es el diagnóstico. **No es un plan aprobado**: el hito 1 (el desplegable) ya está
implementado porque el dueño lo pidió explícito; los hitos 2 y 3 los decide él con esto a la vista.

---

## 1 · Qué pregunta contesta de verdad esta pantalla

Una sola: **¿dónde trabaja hoy esta persona?** De esa respuesta cuelga a qué obra se le imputa el
costo de mano de obra, quién aparece en la asistencia del jefe y quién suma en el plan contra real.

Todo lo demás que hoy se pregunta al asignar —rol, cuadrilla, actividad, desde, hasta, notas— no
cambia esa respuesta. Son atributos de la asignación, no la asignación.

---

## 2 · Inventario: los seis lugares donde hoy se toca la asignación

Medido sobre el código del 08/09/2026. La tabla es siempre la misma: `obra_asignacion`. Capturas en
`qa-shots/ux-asignacion-*.png` (1440 y 390, con ADMIN).

| # | Dónde | Archivo | Qué pide | Pasos | Vocabulario | Por qué se vuelve incomprensible |
|---|---|---|---|---|---|---|
| 1 | Obra → solapa **Personal** | `src/features/obras/components/TabPersonal.tsx` (`FormAsignar`) · `services/actionsPersonal.ts` | persona · **rol** · **cuadrilla** · **desde** · **actividad** · **notas** | obra → solapa Personal → **+ Asignar persona** → 6 campos → Asignar | asignación · integrante/responsable · cuadrilla · actividad · desde/hasta · **cerrar** · **quitar** · **reabrir** | Seis campos para contestar una pregunta. Y en la tabla conviven **tres verbos distintos para sacar a alguien** (Cerrar, Quitar, Reabrir) cuya diferencia es real pero invisible: cerrar escribe `hasta`, quitar borra la fila. Elegir mal borra historia. |
| 2 | **Alta de obra** → equipo | `src/app/(main)/obras/nueva/page.tsx:204` | lo mismo que 1 | dentro del alta | idem | Es el MISMO formulario en otro contexto: quien aprendió a asignar en el alta no reconoce la solapa Personal, y al revés. |
| 3 | Persona → solapa **Asignaciones** | `src/features/administracion/components/BloquesFicha.tsx` · `services/asignacionActions.ts` | nada: sólo **Cerrar** | — | obra · actividad · cuadrilla · rol en la obra · desde/hasta | **Es de sólo lectura para asignar.** Desde la ficha de la persona —el lugar natural para preguntarse dónde trabaja— se la puede sacar de una obra pero NO ponerla en otra. Hay que irse a la obra destino. |
| 4 | **Cuadrillas** → mandar a una obra | `src/app/(main)/administracion/personas/cuadrillas/page.tsx:335` · `asignarCuadrillaAObra` | cuadrilla · obra · actividad · desde | 4 campos | cuadrilla · actividad · desde | Un cuarto eje: se asigna un GRUPO, y el resultado son N asignaciones individuales que después se editan una por una en la solapa Personal. La ida no se parece a la vuelta. |
| 5 | Asistencia → **panel de corrección** | `src/features/administracion/components/PanelCorreccionJornada.tsx:225` | casilla *«Asignarla también a esa obra, desde ese día»* | dentro de corregir un día | asignar «también» | La asignación es un **efecto colateral** de corregir horas. La casilla está bien puesta (no asigna sola), pero significa que el mismo hecho —dónde trabaja— se escribe desde una pantalla que se llama corrección de jornada. |
| 6 | Campo → **Personas de la obra** | `src/app/(jefe)/obra/personas/page.tsx` | nada | — | cuadrilla · fichados · sin cerrar la jornada | Sólo lee. El jefe ve quién está y no puede corregir a quien falta: tiene que pedirlo a Administración. |

**Alta de persona** (`FormularioPersona.tsx`): **no** pregunta la obra. Una persona nace sin obra y
no hay ningún lugar en el alta que lo resuelva — el paso siguiente no está en la pantalla.

### Lo que el inventario deja ver

1. **Cinco formas de escribir el mismo hecho**, con cuatro vocabularios y ningún camino compartido.
2. **La pregunta simple no tenía pantalla.** Ninguno de los seis lugares contestaba «mové a esta
   persona a esta obra» en un gesto: todos empiezan por elegir la obra, no la persona.
3. **Tres verbos de baja** (cerrar, quitar, reabrir) donde el usuario tiene un concepto: se fue.
4. **El vocabulario es de la tabla, no del oficio.** `rol`, `actividad_id`, `cuadrilla_id`, `desde`,
   `hasta` son columnas. El jefe dice «Fulano está en el salón».
5. Contra las reglas del dueño, medido sobre `qa-shots/ux-asignacion-obra-personal-1440.png`
   (08/09/2026): la solapa Personal tiene **tres niveles de navegación simultáneos** —área (Obras)
   + solapa de la obra (Personal) + sub-solapa (Hoy en obra · Dotación · Asistencia)—, **cinco KPIs
   en tarjetas** y **seis chips de filtro** encima de una tabla de dos personas; quién está asignado
   vive plegado abajo, en «Quién trabaja en esta obra». El dato que se busca —quién está en la
   obra— es lo único que hay que abrir. La ficha de la persona, a su vez, muestra **cinco columnas
   de atributos** de las que cuatro están casi siempre en `sin cuadrilla` / `toda la obra` /
   `integrante`.

---

## 3 · La propuesta: UNA forma de asignar

**La obra actual de una persona se cambia con un desplegable, donde esa persona ya está a la vista.**
Elegir otra obra cierra la asignación vigente (`hasta`) y abre la nueva (`desde = hoy`). Nada más.

Ya funciona en `/administracion/personas?vista=asistencia`
(`GrillaAsistenciaObra.tsx` → `services/obraActualActions.ts` → `services/planDeObraActual.ts`).

**Qué se pliega a «avanzado»** — no se borra, deja de ser el camino principal:

| Hoy | Después |
|---|---|
| rol (`responsable`/`integrante`) | el desplegable asigna `integrante`. El responsable de la obra ya se declara aparte, en **Titular** (`TitularObra.tsx`). |
| cuadrilla | se sigue armando en Cuadrillas, y mandar la cuadrilla a una obra queda como atajo del grupo. No es un campo del alta individual. |
| actividad | queda sólo en la solapa Personal de la obra, para quien reparte gente por frente. Es minoría: `actividad_id` está casi siempre en null. |
| desde / hasta a mano | los pone la acción: desde hoy, hasta ayer. La fecha a mano queda en la solapa Personal para corregir un error. |
| Cerrar · Quitar · Reabrir | en el camino principal, **«Sin obra»**. Quitar (borra la fila) queda sólo para la asignación cargada por error, en la solapa Personal, con su advertencia. |

**Lo que NO cambia**: `obra_asignacion` sigue siendo la única tabla, y las horas ya cargadas nunca
se mueven — cada `registros_hh` lleva su propia obra. Mover a alguien cambia de hoy en adelante.

---

## 4 · Plan en tres hitos

### Hito 1 — el desplegable (HECHO, 08/09/2026)
Sólo **Dirección y Administración** lo ven y lo pueden usar (`puedeCambiarObraActual`): el dueño lo
acotó el mismo día —*«sólo usuarios admin puedan hacer eso, y que jefe de obra pueda seguir con las
funciones normales de registrar asistencia»*—. La RLS de `obra_asignacion` NO alcanzaba: deja
escribir al jefe dentro de `ve_obra`, y `es_administracion()` lo incluye desde la migración
20260819T4900.
- `src/features/administracion/services/planDeObraActual.ts` — la decisión, sin base.
- `src/features/administracion/services/obraActualActions.ts` — la escritura, con `.select()`.
- `src/features/administracion/components/GrillaAsistenciaObra.tsx` — la columna «Obra actual».
- Tests: `planDeObraActual.test.ts` (8) · `tests/asistencia-por-obra.spec.ts` («08 · el desplegable
  muda la asignación»).

### Hito 2 — el mismo desplegable donde la persona ya está (sin implementar)
1. **Ficha de la persona → Asignaciones**: agregar arriba de la tabla el mismo control
   (`BloquesFicha.tsx` + la acción que ya existe). Hoy desde ahí no se puede mover a nadie.
2. **Campo → Personas de la obra**: NO se agrega el desplegable — el dueño lo dejó fuera el 08/09.
   Lo que sí falta resolver es cómo pide el jefe un cambio de obra sin llamar por teléfono.
3. **Alta de persona**: una línea «Obra actual» opcional en `FormularioPersona.tsx`, con el mismo
   control. Una persona nueva sin obra no aparece en ninguna asistencia.
- Se extrae el desplegable a `src/shared/components/…/ObraActual.tsx` para que sea **un** componente
  y no cuatro copias.

### Hito 3 — retirar el camino viejo del frente (sin implementar, decide el dueño)
1. `FormAsignar` de la solapa Personal se pliega detrás de «Asignar con detalle (frente, cuadrilla,
   fechas)»: la solapa arranca con la tabla y el desplegable.
2. **Cerrar/Quitar/Reabrir** dejan de ser tres botones en la fila: queda «Sacar de la obra» y
   *Quitar* pasa a la fila expandida, con el texto que dice que borra la fila.
3. `/obras/nueva` reusa el mismo control en vez de repetir el formulario de seis campos.

**Riesgo del hito 3**: la solapa Personal es la única pantalla que asigna por **actividad**, y el
cronograma consume `obra_asignacion.actividad_id`. Plegarla no puede esconderla.

---

## 5 · Lo que este diagnóstico NO probó

- No se midió cuántas asignaciones reales usan `cuadrilla_id`, `actividad_id` o `rol =
  responsable`. La afirmación «casi siempre null» sale de los comentarios del propio código
  (`jornadaPorObraService.ts`: 20 «integrante» y 1 «responsable» al 07/09), no de una consulta
  hecha para este documento. **Antes del hito 3 hay que contarlo.**
- No se observó a nadie usando las pantallas. El diagnóstico es del código, las capturas y la frase
  del dueño.
- Las capturas del inventario son con ADMIN. Del **jefe de obra** sólo se verificó, con navegador y
  su propia identidad, que NO ve el desplegable y que sigue editando la quincena
  (`qa-shots/asignacion-jefe-sin-dropdown-1440.png`); el resto de sus pantallas se leyó en el código.
- **EN 390px EL DESPLEGABLE NO SE PUEDE LEER.** Medido en `qa-shots/asignacion-390.png`: la columna
  «Obra actual» queda en ~40px y el control muestra `PIS…`, `IN…`, `QU…`. Se puede tocar y abre la
  lista del sistema (que sí es legible), pero **no se ve dónde está la persona**, que es la mitad de
  lo que el control tiene que contestar. Queda pendiente y no se arregló acá: en el teléfono esta
  pantalla normalmente cae al modo día (`services/vistaDeAsistencia.ts`) —la captura salió con la
  grilla porque Playwright manda un user-agent de escritorio—, así que la decisión real es si el
  desplegable va en el modo día, y eso es diseño, no un ancho de columna.
