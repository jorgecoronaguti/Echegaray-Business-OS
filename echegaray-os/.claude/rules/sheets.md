---
paths:
  - "orquestador/scripts/*pestana*.mjs"
  - "orquestador/scripts/*-rehacer*.mjs"
  - "orquestador/scripts/flujo-caja-*.mjs"
  - "orquestador/lib/google.mjs"
  - "orquestador/lib/congelador-sheets.mjs"
  - "orquestador/lib/sheet-*.mjs"
---

# Escribir en el Sheet real

Se carga sólo al tocar los archivos que escriben el Flujo de Fondos. Es el área más cara del repo:
**seis pérdidas documentadas del trabajo del dueño**, todas por reglas que existían escritas.

## Antes de tocar nada

**El freno de mano manda.** Si hay marca de congelamiento (`congelador-sheets.mjs`), ningún timer,
generador, agente ni script escribe Sheets hasta que el dueño lo levante. Ninguna bandera de
comportamiento lo sortea, y no se pide excepción.

La única puerta (03/08/2026) es una **persona identificada que confirma en el chat**: `frenar(...,
{ confirmacion: { actor, motivo } })`, y sólo desde `batchUpdateValues`. Hacen falta las dos piezas
—actor con nombre y motivo de ≥8 caracteres— y cada levantamiento se loguea. Un timer no tiene actor:
por eso la distinción se sostiene sola. **La marca no se borra nunca.**

**Lo que el dueño editó o borró a mano es verdad definitiva.** No se revierte ni se "mejora". Si un
generador necesita esa celda, se adapta el generador. Los candados de pestaña
(`sheet_pestanas_bloqueadas`) valen también para el formato, no sólo para el contenido.

## Las cuatro que rompieron cosas de verdad

1. **Nunca correr un generador del Sheet real para probar que anda.** Ya borró trabajo del dueño
   tres veces. La validación se hace en frío o sobre la copia. Un worktree es todavía peor: sin la
   base, la guarda falla cerrada y borra la pestaña entera.

2. **Fusionar, jamás `clearValues`.** Rehacer una pestaña que tiene datos los destruye. Se lee
   entera primero, se escribe el bloque propio, y se preserva lo ajeno mapeando **por encabezado**,
   no por posición: donde el generador reordena, preservar por fila física mezcla los datos.

3. **Las fórmulas van en locale es-AR**: separador `;`, no coma. La coma es el decimal. Y nunca se
   escribe el derrame de una `ARRAYFORMULA` — sólo su ancla.

4. **Anclar al texto, no a la posición.** Una fila fija da tres totales distintos según el día.
   Los rangos con nombre se reapuntan solos cuando alguien inserta filas; verificar que sigan
   apuntando a datos, no a celdas vacías.

## Verificación

La escritura no se da por buena porque la API devolvió 200. Se mira el resultado:
`node orquestador/scripts/exportar-pestana-pdf.mjs` o `ver-pestana.mjs`, y se busca `#ERROR!`,
`#NAME?` y celdas en cero que antes tenían dato. Un log que dice "sin errores" sobre un rango vacío
no verificó nada.
