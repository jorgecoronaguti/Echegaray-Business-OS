---
name: appsheet-desarrollo
description: "Criterio y capacidad para desarrollar, modificar, auditar y gobernar las apps de AppSheet de Echegaray (empezando por 'Pedidos de Materiales' / Sheet de respaldo GESTION DE MATERIALES). Activar SIEMPRE antes de tocar una app de AppSheet o su Sheet de respaldo: agregar/renombrar columnas o tablas, cambiar tipos, vistas, acciones, slices, security filters, o sincronizar sus datos al OS. AppSheet se configura sobre un Google Sheet: un cambio 'inocente' en el Sheet (renombrar un encabezado, reordenar columnas, cambiar el locale) puede romper expresiones, vistas y la app entera. Nunca improvisar sobre el Sheet de respaldo como si fuera una planilla suelta."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "No aplica (dominio técnico). El QUÉ dato/decisión lo deciden las skills de dominio (compras-abastecimiento-subcontratacion, planificacion-produccion, direccion-obra); el CÓMO leer/escribir el Sheet lo comparte con google-sheets-business-systems; el CÓMO integrarlo al OS con integraciones-apis-sistemas-externos."
---

# Desarrollo y gobierno de AppSheet (Echegaray)

## Propósito

Tratar cada app de AppSheet de Echegaray como lo que es: una aplicación real de negocio construida sobre un Google Sheet, con lógica (expresiones), vistas, acciones y seguridad — no una planilla. Esta skill da el criterio para modificarla sin romperla, y la estrategia para que el OS **posea el dato** (espejo en Supabase) sin quitarle a la gente de campo la herramienta que ya usa.

El objetivo de negocio no es "digitalizar de nuevo" lo que ya funciona en AppSheet, sino: (1) que el dato de la app entre al OS y se cruce con obras/compras/costos; (2) mejorar la app donde reduzca trabajo o error; (3) evitar duplicar en el OS una captura que la app ya hace bien.

## Alcance

Cubre: el modelo de datos de AppSheet sobre Google Sheets (tablas=pestañas, columnas=encabezados, key, Ref, virtual columns, expresiones), qué cambios son seguros vs. rompen la app, el protocolo de auditoría antes de modificar, la estrategia de gobierno (espejo en Supabase sin duplicar la captura), y el contexto real de la app "Pedidos de Materiales" de Echegaray.

No cubre: qué dato de negocio hace falta o qué decisión soporta (skills de dominio: `compras-abastecimiento-subcontratacion`, `planificacion-produccion`, `equipos-flota-construccion`, `direccion-obra`); el criterio general de fórmulas/arquitectura de un Sheet (`google-sheets-business-systems`); ni el mecanismo genérico de integración una vez que el dato sale de Sheets (`integraciones-apis-sistemas-externos`).

## Modelo mental de AppSheet (lo que hay que entender antes de tocar nada)

1. **Data source = Google Sheet.** Cada *tabla* de AppSheet es una pestaña del Sheet. Cada *columna* de AppSheet corresponde (por nombre) a un encabezado de la fila 1 de esa pestaña. AppSheet referencia las columnas **por nombre de encabezado**, no por posición.
2. **La fila 1 es sagrada.** Renombrar un encabezado, borrarlo o cambiarle el texto rompe toda expresión, vista, acción y slice que lo mencione. **Agregar** una columna nueva al final es seguro (AppSheet la detecta con "Regenerate structure"); **renombrar/reordenar/borrar** no lo es.
3. **Key column.** Cada tabla tiene una columna clave (ej. `ID_PEDIDO`, `ID_MOVIMIENTOS`). Debe ser única y estable. Nunca reusar ni reciclar claves; romper la unicidad corrompe referencias (`Ref`) entre tablas.
4. **Tipos de columna.** AppSheet infiere tipos (Text, Number, Date, Enum, Ref, etc.). Un `Ref` conecta tablas (ej. MOVIMIENTOS.ID_HERRAMIENTA → HERRAMIENTAS). Cambiar el tipo o el destino de un Ref cambia el comportamiento de formularios y vistas.
5. **Virtual columns + expressions.** Columnas calculadas que NO viven en el Sheet (se computan en AppSheet con lenguaje de expresiones: `[columna]`, `LOOKUP`, `SELECT`, `ANY`, `IF`). No aparecen al leer el Sheet — para verlas hay que mirar el editor de la app.
6. **Views, Actions, Slices, Security filters.** La UI (vistas), los botones (acciones), los subconjuntos de filas (slices) y la seguridad por usuario (security filters / `USEREMAIL()`). Un cambio de datos puede dejar una vista o slice apuntando a algo que ya no existe.
7. **Locale.** El Sheet de respaldo puede estar en un locale distinto al es_AR del resto del Drive (ej. GESTION DE MATERIALES está en **es_MX**). Afecta separador de fórmulas y formato de fecha/número al escribir en ese Sheet. Verificar el locale del archivo, no asumir.

## Protocolo obligatorio antes de modificar

1. **Leer la estructura real primero.** Título, locale, pestañas (tablas), fila de encabezados y una muestra de filas de cada tabla. No asumir el modelo por el nombre de la app.
2. **Mapear qué es clave, qué es Ref y qué es calculado.** Antes de tocar una columna, saber quién la referencia.
3. **Distinguir cambio seguro vs. riesgoso:**
   - Seguro: agregar una columna nueva **al final** de una pestaña; agregar filas; corregir un dato en una celda que no es clave ni Ref.
   - Riesgoso (requiere entender la app en el editor y confirmar con el dueño): renombrar/reordenar/borrar encabezados, cambiar la key, cambiar tipos/Refs, tocar security filters, cambiar el locale del Sheet.
4. **Nunca escribir en el Sheet de respaldo con fórmulas sin verificar el locale** (ver `google-sheets-business-systems` y la memoria `drive-locale-es-ar`; acá el locale puede ser es_MX).
5. **La app se edita en simultáneo por gente de campo.** Cualquier escritura corre riesgo de colisión y, peor, de romper la app para todos en vivo. Verificar historial de revisiones; preferir cambios en ventana de baja actividad; avisar al dueño antes de un cambio estructural.
6. **Cambios de estructura de la app (vistas, acciones, tipos, security) se hacen en el editor de AppSheet, no en el Sheet.** El OS hoy puede leer/escribir el Sheet de respaldo (datos); para cambiar la *definición* de la app hace falta el editor de AppSheet (acceso del dueño) — registrarlo como acción del dueño si no está disponible por API.

## Estrategia de gobierno (cómo el OS "toma" la app sin romperla)

- **El Sheet de respaldo sigue siendo la fuente de carga en campo.** No migrar la captura al OS si la app ya la hace bien (evitar duplicación — regla del CLAUDE.md).
- **El OS espeja el dato en Supabase** (`public.pedidos_materiales`, sync idempotente por clave) para consultarlo, cruzarlo y protegerlo con RLS. El espejo es de solo lectura respecto de la app: la verdad de captura vive en el Sheet.
- **Cruce de valor:** PEDIDO (qué se pidió) → COMPRA (qué se compró) → COSTO (qué costó) por obra. Requiere unificar el **maestro de obras**: la app usa nombres/códigos propios (`San Francisco`, `OB1`) que no coinciden con `public.obras`. Resolver ese match es prerequisito para el cruce; nunca inventar la correspondencia.
- **Mejora de la app:** proponer cambios que reduzcan trabajo/error (validaciones, enums, columnas de estado, fechas automáticas), evaluando primero si conviene hacerlos en la app o resolverlos en el OS.

## Contexto Echegaray — app "Pedidos de Materiales"

- App AppSheet: `PedidosdeMateriales-659097345`. Sheet de respaldo: **GESTION DE MATERIALES** (`1yKoO0gUZysWfamTLR38TWn_sfOMZDMeyqHSNSFCWCec`), locale es_MX.
- Tablas: `PEDIDOS` (ID_PEDIDO, OBRA, FECHA, MATERIAL, CANTIDAD, ESTADO) · `HERRAMIENTAS` · `MOVIMIENTOS` (ID_MOVIMIENTOS, ID_HERRAMIENTA→HERRAMIENTAS, DESTINO, FECHA, RESPONSABLE) · `OBRAS` (ID_OBRA, NOMBRE) · `Prestamo/Alquiler`.
- Dos dominios en una app: **pedidos de materiales** (compras/abastecimiento) y **movimiento/préstamo de herramientas** (equipos/flota). Al analizarla, activar la skill de dominio que corresponda.
- Espejo en el OS: `public.pedidos_materiales`, sync `orquestador/scripts/sync-pedidos-materiales.mjs`. Pendiente: unificar obras para el cruce pedido→compra→costo.

## Interacción con otras skills

- `google-sheets-business-systems`: comparte el criterio de leer/escribir el Sheet de respaldo (locale, fórmulas, no romper captura/cálculo). Esta skill agrega lo específico de que ese Sheet **es la base de una app**.
- `integraciones-apis-sistemas-externos`: decide el *cómo* técnico de conectar/sincronizar el dato al OS una vez validado.
- `compras-abastecimiento-subcontratacion` / `equipos-flota-construccion` / `planificacion-produccion` / `direccion-obra`: dueñas del *qué* dato y qué decisión — la app mezcla pedidos de materiales (compras) y movimiento de herramientas (equipos), así que activar la de dominio según la tabla que se toque.
- `arquitectura-integracion-finanzas-obras`: arbitra si el cruce pedido→compra→costo duplica un cálculo que ya vive en otro sistema.
- `orquestador-de-razonamiento-y-skills`: gobierna la activación y la clasificación A–E del aprendizaje.

## Límites de certeza

- Leer el Sheet de respaldo muestra **datos y encabezados**, NO la definición de la app (virtual columns, expresiones, vistas, acciones, security filters) — esa vive en el editor de AppSheet. Nunca afirmar "la app hace X" solo por mirar el Sheet: puede haber lógica oculta.
- El match app↔`public.obras` es aproximado por nombre; hoy no hay match (la app usa obras que no existen en el OS). No presentar una correspondencia inventada como hecho.
- Sin acceso al editor de AppSheet, los cambios estructurales de la app no son verificables por el OS: se proponen, no se afirman como hechos.

## Prohibido

- Renombrar, reordenar o borrar encabezados de una pestaña de respaldo sin entender qué expresiones/vistas los referencian y sin OK del dueño.
- Cambiar la columna clave, duplicar o reciclar claves, o alterar un Ref sin analizar las tablas que dependen de él.
- Escribir en el Sheet con fórmulas sin verificar el locale del archivo (puede ser es_MX, no es_AR).
- Migrar al OS una captura que la app ya hace bien solo para "tenerla en el OS" (duplicación prohibida por el CLAUDE.md).
- Inventar la correspondencia entre obras de la app y `public.obras`.
- Tocar la definición de la app o su captura en vivo durante horario de campo sin aviso y sin ventana de baja actividad.

## Política de riesgo y aprendizaje

- Cambios de datos internos/reversibles sobre el Sheet: Nivel D (autónomo, con verificación).
- Cambios estructurales de la app (definición en el editor), o que afecten la captura de campo en vivo: requieren confirmación del dueño (impacto operativo externo).
- Todo aprendizaje sobre la app (una columna que rompe algo, un Ref oculto, un security filter) se incorpora acá clasificado A–E (ver orquestador). Una observación aislada no se vuelve regla sin validación.
