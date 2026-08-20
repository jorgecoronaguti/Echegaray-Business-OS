# Obras (cartera y workspace de obra)

Referencia visual: `Echegaray OS - Obras.dc.html` (secciones 1a–1i).

## 1a · Cartera — `/obras`
Objetivo: encontrar y abrir una obra. Columnas: **Obra | Cliente | Etapa | Avance | Plazo | Contratado | Costo real**. Obra y Cliente son enlaces distintos (obra → workspace, cliente → ficha CRM); sin ficha, el cliente es texto sin enlace. Todas las columnas ordenan (estado en la URL). Filtros por etapa + búsqueda, con "N de M". Contratado sólo para quien ve economía. Plazo sin línea base: "fin dd/mm" + "sin línea base", nunca 0. Pie: archivadas fuera de la lista, con enlace para verlas. Primaria: `+ Nueva obra` (sólo Administración).

## 1h · Gantt de cartera — `/obras/gantt`
Un renglón por obra (agregado de sus actividades; no se recalcula acá). Izquierda: Obra + cliente, Etapa, Plazo. Derecha: barra por obra, baseline si está sellada, HOY.
**Semáforo (no es "se pasó la fecha"):** brecha = avance esperado − avance real. Crítico (rojo) si brecha > 25 pts o atraso estimado > 30 d; menor (ámbar) si > 10 pts o > 10 d; 100% = al día aunque haya cerrado tarde; sin fechas o sin avance = gris con motivo ("sin fechas de plan", "sin cronograma cargado"). El avance esperado es ESTIMACIÓN y se rotula como tal. Orden: arranque (default), atraso, avance, nombre. Esta pantalla no habla de plata.

## 1i · Alta de obra — `/obras/nueva`
Ocho pasos como pastillas con `›` (Información · Responsable · Fechas · Contrato · Drive · Equipo · Cronograma · Confirmar). Cada paso GUARDA; la obra existe desde el primer paso y se puede salir y volver. Nada se autocompleta: lo que no se tipea queda NULL.
Panel derecho: **Estado de preparación** — las 7 líneas canónicas (Cronograma, Línea base, Responsable, Personal, Contrato*, Drive, HH plan) con el faltante concreto ("0 de 344 actividades con línea base"). ✓ o `·`, flecha sólo donde hay trabajo. *Contrato no se dibuja para quien no ve economía. La misma lista aparece en el Resumen hasta que no falte nada.

## 1b · Resumen de obra — `?vista=resumen`
Plan vs real (Avance físico, Plazo, HH, Costo real) en una fila de métricas con barra fina · Impedimentos abiertos (tabla corta, vencimiento en `neg`) · Próximas 2 semanas · aside: ficha de la obra, último movimiento, editar, archivar. Ciclo de vida (Previo › Inicio › Desarrollo › Terminación › Cierre) en el header; sin etapa declarada no se resalta ninguna.

## 1c · Ejecución (parte diario) — `?vista=ejecucion`
Izquierda: formulario del parte (Actividad, Cantidad + unidad, HH, Cuadrilla con integrantes, Equipos, Comentario) con primaria `Registrar parte` y secundaria `Anotar impedimento`. Derecha: KPIs del día (partes hoy, HH del día, actividades tocadas, sin parte en `neg`) + tabla de partes (Fecha | Actividad | Cantidad | HH | Cuadrilla | Comentario), la de hoy resaltada. Actividad sin medición definida: acepta HH y comentario, la cantidad dice "sin medición" (no 0).
Mobile 390: mismo parte con campos de 48px y primaria fija abajo.

## 1e · Personal — `?vista=personal`
Titular en UNA línea: "12 personas · HH plan 12.400 · HH real 8.540 (312 registros) · 148 HH extras · +850 HH". Sin plan cargado dice "HH plan sin cargar" y el desvío no aparece.
Tablas: asignaciones (Persona | Rol/categoría | Cuadrilla | Actividad | HH | acción Cerrar/Quitar) · Plan contra real por actividad (Actividad | Avance | HH plan | HH real | Lectura) · Horas imputadas (Día | Persona | Actividad | Tipo | Horas). Registros históricos sin persona se muestran marcados: no se les inventa dueño. Altas por acción discreta, no por formulario permanente.

## 1f · Operación — `?vista=operacion&sub=…`
Cinco sublistas con contador: Pedidos · Compras · Herramientas · Movimientos · Impedimentos (este cuenta abiertos). Compras: Fecha | Proveedor | Concepto | Comprobante | Importe + fila de total = costo real declarado por la fuente, y si el detalle no cubre el total se dice "Se listan N de M comprobantes". Si la fuente externa falla, se dice; Impedimentos sigue funcionando porque es del OS.

## 1g · Documentos — `?vista=documentos`
Carpeta de Drive de la obra + `Vincular documento` + primaria `Abrir carpeta`. Tabla: Nombre | Tipo | Relación | Actividad | Fecha. Sin clasificar en `warn`; sin actividad en `faint`. Los archivos no se copian: se vinculan.
