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

**Y desde el 03/09 la unidad es LA CELDA, no la pestaña.** Orden del dueño: *"el sheet flujo de fondos
es un documento vivo autónomo y automático; lo único que requiero siempre es que mis ediciones en el
archivo sean las que manden y siempre se respeten"*, donde edición es *"todo lo que escribo, borro,
modifico, agrego, saco, edito de diseño, cambio de lugar, copio y pego"*. Las pestañas se siguen
regenerando solas cada dos horas **y** la celda que él tocó no se toca. Bloquear la pestaña entera
—candado, auto-candado, firma— cumple la segunda mitad rompiendo la primera, y por eso el
auto-candado sigue apagado (`ORQ_AUTOCANDADO`): **no se vuelve a encender.**

Lo hace el portón, no cada generador (`lib/guarda-por-celda.mjs`, que orquesta `propiedad-celda.mjs`
para valores, `propiedad-updatecells.mjs` para el batch, `propiedad-estructura.mjs` para borrar/mover
tramos y `huella-formato.mjs` para el diseño). La regla de propiedad es una sola y vive en
`huella-celda.mjs`: **si no puedo probar con mi huella que la celda es mía, es tuya.** Sin base no se
escribe sobre ninguna celda con contenido; sin poder releer el destino, no se escribe nada.

Cada celda respetada se dice en el log (`✋ N celda(s) tuya(s) respetada(s) en <pestaña>: …`), se junta
al cierre del pipeline y queda en `sheet_reconciliacion_celda` (accion='respetada'). Si una pestaña
respeta decenas de celdas de golpe, lo más probable es que le falte huella, no que él haya editado
cuarenta celdas: se mira con `scripts/sheet-huellas-sembrar.mjs --dry`. **Un script del OS no deshace
una edición suya**: `columnas-calculadas.mjs` dejó de devolver la fórmula a las celdas pegadas y ahora
sólo informa (corre con scopes de sólo lectura, así el "no escribe" es del token y no de un `if`).

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

**Después de cada corrida: `node orquestador/scripts/sheet-diff-snapshot.mjs`.** Compara la foto que
el pipeline saca antes de tocar nada (`orq.sheet_snapshots`) contra la hoja viva y clasifica cada
diferencia en borradas / fórmula→valor / valor→fórmula / fórmula≠ / valor≠ / nuevas. Las tres primeras
no deberían aparecer nunca. Es la evidencia del EFECTO; el "14/14 pestañas rehechas" es la del intento.
