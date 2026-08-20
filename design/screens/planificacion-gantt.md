# Obra → Planificación → Gantt

**Ruta conceptual:** `/obras/<obra>?vista=cronograma&sub=gantt&act=<actividad>`
**Entidad principal:** Obra (eje relacional) → Rubro → Actividad → Tarea.
**Objetivo:** entender el plan, ver el tiempo, detectar lo que requiere atención y registrar/editar sin salir del Gantt.
**Referencia visual:** `Gestión de Obra - Planificación.dc.html` (proyecto de diseño).

## Layout (1440 de referencia)
1. Header global (48).
2. Entity header: `← Obras`, h1 obra, campos rotulados Cliente/Etapa/Inicio/Fin plan.
3. Tabs nivel 2: Resumen · **Planificación** · Ejecución · Personal · Operación · Economía · Documentos.
4. Barra de vista (48): `Gantt · Lista · Tablero · Próximos` a la izquierda; a la derecha `Detalle ‹` (si el panel está cerrado), `Filtros`, `+ Nuevo rubro` y la primaria `+ Nueva actividad`.
5. Workspace: **tabla ↔ divisor A ↔ Gantt** | **divisor B** | **panel de actividad** (~67% / 33% por defecto, no fijo).
6. Status bar inferior (56), sticky.

## Tabla de actividades
Columnas por defecto y nada más: **Actividad · Estado · Inicio · Fin · %**. Agrupada por RUBRO colapsable (contador discreto). Fila seleccionada: fondo `#FAFAF8` + regla amarilla 2px. Estado = punto + palabra. Fechas y % en mono. Sin avance: `—` en `faint`, nunca 0%.

## Gantt
Comparte EXACTAMENTE las filas de la tabla (misma altura y offset; los 8px de separación de rubro se acumulan en el cálculo de posición). Escala de días con cabecera mes + día + carril de hitos (72px). Muestra, sólo si existe: barra de plan, relleno de avance, baseline punteada, HOY, hitos, dependencias, impedimentos. Ventana derivada de los datos con margen; scroll horizontal, scroll vertical sincronizado con la tabla.

## Panel de actividad (33%, no modal)
- Cabecera: nombre 16/600 · estado · ✕ (contrae). Segunda línea: rubro · responsable (o "sin asignar").
- **Plan vs Real** enfrentados en dos columnas alineadas, separadas por hairline vertical: Plan (Unidad, Cantidad, Inicio, Fin, HH) | Real (Ejecutado, Avance + barra 3px, HH reales, Productividad). Debajo: desvío ("+21 HH sobre lo previsto a la fecha"), en `neg` sólo si es problema.
- **Secciones plegables** (cerradas por defecto, contador a la derecha): Personal · Equipos · Ejecución (abierta por defecto: Fecha | Cantidad | HH | Personal | Comentario + "Ver historial →") · Impedimentos (muestra el vencimiento en la fila cerrada si es crítico) · Tareas · Dependencias · Notas · Documentos.
- Footer: "Actualizado hoy HH:MM" · `Registrar avance` · primaria `Editar actividad`.

## Resize
- **Divisor A (tabla ↔ Gantt):** drag libre, mínimo 300px, máximo 760px.
- **Divisor B (planificación ↔ panel):** drag libre, mínimo 340px, máximo 760px, colapso total con ✕ y reapertura con `Detalle ‹`; con el panel cerrado el Gantt toma todo el ancho.
- Handle 9px invisible en reposo, amarillo 2px en hover/drag, `cursor: col-resize`, feedback durante el arrastre. Preferencia persistida por usuario.

## Status bar
Avance físico · HH consumidas · Desvío HH · Actividades · Impedimentos · Próximas 2 semanas. Una franja, sin cards ni gráficos.

## Estados
- **Vacío:** sin actividades → "Todavía no hay ninguna actividad" + `+ Nueva actividad`; sin selección → el panel no se dibuja y el Gantt ocupa todo.
- **Loading:** esqueleto de header + filas; barra indeterminada.
- **Error:** mensaje de la fuente en `neg`; nunca una tabla vacía.
- **NULL:** "sin cargar / sin asignar / sin plan / sin línea base / sin registrar".

## Permisos
Nivel Obras ve y registra; el monto contratado y todo lo comercial no se dibuja (lo enmascara Postgres). Sellar línea base y acciones masivas: Administración.

## Responsive
Tablet: panel como drawer, tabla a 3 columnas. Mobile: sin Gantt de barras → "Próximos" (lista por fecha) + ficha de actividad a pantalla completa; registrar avance es la acción fija inferior.

## Progressive disclosure
Primario: tabla + Gantt + Plan vs Real. Secundario: contadores de las secciones. Terciario: contenido de cada sección, tareas, dependencias, documentos.
