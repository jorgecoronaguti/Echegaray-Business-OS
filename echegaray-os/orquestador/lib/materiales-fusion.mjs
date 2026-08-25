// EL CUADRO 5 SE FUSIONA: LA PESTAÑA ES EL ORIGEN DESDE EL 24/08; `obras-datos.mjs` SÓLO SIEMBRA.
//
// ═══ EL DEFECTO QUE ARREGLA (24/08/2026) ═══
//
// El 24/08 el dueño entró al cuadro 5 de `OBRAS` y movió los 17 ítems al 01/10/2026 —colapsando de
// paso las cuotas de cuatro de ellos en una fecha única—. Desde ese día el libro de movimientos lee
// los materiales previstos DE AHÍ (`lib/materiales-previstos.mjs`), y no de las constantes.
//
// Pero el generador de la pestaña seguía escribiendo las constantes: `obras-pestana.mjs` regenera la
// grilla entera y `escribirPreservando(..., { respetar: false })` no protege una celda de número.
// CADA CORRIDA LE PISABA LA EDICIÓN — y el calendario de caja volvía a mostrar el pico de agosto que
// él ya dijo que no va a ocurrir. Por eso el timer `echegaray-flujo-caja` quedó detenido.
//
// ═══ POR QUÉ NO ALCANZABA CON LO QUE YA EXISTE ═══
//
// · `respetar-ediciones.mjs` protege RÓTULOS (texto), no importes ni fechas. La celda D es un número.
// · Escribir `''` en la D y la E haría que `fusionar` conserve lo que hay en la pestaña — pero por
//   POSICIÓN. El cuadro 5 se corre de fila en cuanto cambia cualquier cuadro de arriba, y entonces
//   "conservar" significa conservar el valor de OTRO ítem. Es el defecto de capas superpuestas que
//   este repo ya pagó. El emparejamiento tiene que ser por RÓTULO, no por número de fila.
//
// ═══ QUIÉN GANA EN CADA COLUMNA, Y POR QUÉ ═══
//
//   D Fecha estimada · E Previsto  → LA PESTAÑA. Son las dos celdas que el dueño edita, y su edición
//     manual es la verdad definitiva. Viajan CRUDAS: el serial vuelve como serial, el texto de
//     cuotas vuelve como texto. No se reinterpreta nada en el camino.
//   F Nota → LA PESTAÑA cuando dice algo. Una nota vacía NO se toma como "la borró": en UNA lectura
//     no se distingue de "nunca se escribió", y quien sí sabe distinguirlo es `respetar-ediciones`
//     con su confirmación a dos corridas. Decidirlo acá borraría un aviso de la primera.
//   B Familia → `obras-datos`. Es clasificación de la explosión de gastos, no una decisión de caja.
//     LÍMITE DECLARADO: si el dueño corrige la Familia en la pestaña, la corrida siguiente se la
//     pisa. Si el dueño corrige el PROVEEDOR, en cambio, el ítem deja de emparejar y se conserva
//     entero como ítem suyo (ver abajo) — lo que se pierde es que la semilla vuelve a entrar como
//     ítem nuevo, y el cuadro queda con los dos. Se arregla corrigiendo también `obras-datos.mjs`.
//
// ═══ CÓMO SE DISTINGUE UN ÍTEM NUEVO DE UNO QUE EL DUEÑO BORRÓ ═══
//
// Los dos se ven igual en una sola lectura: están en `obras-datos` y no están en la pestaña. La
// diferencia es la MEMORIA — qué escribí yo la corrida anterior:
//
//   · lo escribí y hoy no está      ⇒ lo borró él. NO SE RESUCITA. Se loguea.
//   · no lo escribí nunca            ⇒ es nuevo. Se siembra con los valores de `obras-datos`.
//   · no tengo memoria (`escritos` nulo, el registro no se pudo leer) ⇒ NO SE RESUCITA. La dirección
//     segura para equivocarse es la del dueño: un ítem nuevo que tarda una corrida en aparecer se
//     nota y se arregla solo; un egreso que él borró y vuelve solo cada día es el defecto de siempre.
//
// La memoria la guarda el llamador en `sheet_rotulos` con `MARCA_ESCRITO` (ver `clavesEscritas`).
//
// PURO. Recibe las obras y las filas crudas de la pestaña; devuelve las filas a escribir. Sin red.

import { itemsSemilla } from './obras-grilla.mjs'
import { itemsCrudosDeCuadro5 } from './materiales-previstos.mjs'
// UNA CELDA QUE EL DUEÑO DEJÓ VACÍA SE REESCRIBE CON EL CENTINELA, NUNCA CON `''`. Para `fusionar`,
// `''` significa "esta celda NO es mía: conservá lo que haya en la pestaña" — y eso es preservación
// por POSICIÓN, justo lo que este módulo existe para no hacer. VACIO dice lo otro: es mía y va vacía.
import { VACIO } from './preservar-anotaciones.mjs'

/**
 * EL PREFIJO CON EL QUE LA MEMORIA VIAJA EN `sheet_rotulos`.
 *
 * Se guarda en la misma tabla que las ediciones de rótulos —no hay tabla nueva ni migración— pero
 * bajo una marca que NINGUNA celda puede tener. Eso es lo que la vuelve inofensiva: `respetarEdiciones`
 * busca el texto de cada celda generada en ese registro, y una clave que empieza con esta marca nunca
 * va a ser el texto de una celda. Viaja de arriba del registro, no lo interpreta.
 */
export const MARCA_ESCRITO = 'cuadro5·escrito·'

/**
 * NÚCLEO PURO: LA CLAVE DE UN ÍTEM = rótulo + proveedor, normalizados.
 *
 * EL RÓTULO SOLO NO ALCANZA: en el archivo real hay TRES ítems «PLAYÓN DE AZUFRE — Materiales», uno
 * por proveedor (FEMENIA, Bedini, Alumetal). Con el rótulo como clave, los tres colapsarían en uno y
 * dos egresos de $1,6M desaparecerían de la pestaña sin que nada gritara.
 *
 * SE NORMALIZA LO QUE NO CAMBIA EL SIGNIFICADO Y NADA MÁS: mayúsculas, corridas de espacios (incluido
 * el espacio duro que mete el copiar-pegar) y la composición Unicode («Ó» compuesta y descompuesta se
 * ven idénticas). NO se sacan acentos ni signos: «Pintura» y «Pinturas» son ítems DISTINTOS, y
 * adivinar que son el mismo es exactamente lo que hace que un gasto aterrice en la obra equivocada.
 * Sin match exacto normalizado ⇒ es otro ítem.
 */
export const claveDeItem = (rotulo, proveedor) => {
  const n = (s) => String(s ?? '').normalize('NFC').replace(/[\s ]+/g, ' ').trim().toLocaleUpperCase('es-AR')
  return `${n(rotulo)}‖${n(proveedor)}`
}

/** Las claves de una lista de ítems, con la marca puesta: lo que el llamador persiste como memoria. */
export const clavesEscritas = (items = []) => items.map((i) => `${MARCA_ESCRITO}${claveDeItem(i.rotulo, i.proveedor)}`)

/** Las claves de la memoria leída del registro, sin la marca. `null` si no hay registro. */
export function clavesDeMemoria(rotulos = null) {
  if (!rotulos) return null
  const out = new Set()
  for (const r of rotulos) {
    const s = String(r ?? '')
    if (s.startsWith(MARCA_ESCRITO)) out.add(s.slice(MARCA_ESCRITO.length))
  }
  return out
}

/** La especie que le corresponde a la celda D según lo que la celda ES. Un número es una fecha. */
const especieDe = (fecha) => (typeof fecha === 'number' && Number.isFinite(fecha) ? 'fecha' : 'texto')

/** El ítem de la pestaña, con lo que la semilla le aporta. La D, la E y la Nota son suyas. */
const conservado = (tab, semilla) => ({
  rotulo: semilla ? semilla.rotulo : tab.rotulo,
  familia: semilla ? semilla.familia : tab.familia,
  proveedor: semilla ? semilla.proveedor : tab.proveedor,
  fecha: tab.fecha === '' ? VACIO : tab.fecha,
  especieFecha: especieDe(tab.fecha),
  previsto: tab.previsto === '' ? VACIO : tab.previsto,
  nota: tab.nota || (semilla ? semilla.nota : ''),
  origen: semilla ? 'pestaña' : 'pestaña-sola',
  fila: tab.fila,
})

/**
 * LA FUSIÓN: qué ítems escribe el generador en el cuadro 5.
 *
 * @param {object} ctx
 *   · `obras` las de `obras-datos.mjs` (la semilla)
 *   · `filas` la pestaña OBRAS entera, cruda (UNFORMATTED_VALUE). Sin cuadro 5 ⇒ siembra completa.
 *   · `escritos` `Set<string>` de claves que este generador escribió la corrida anterior, o `null`
 *     si no hay memoria. Es lo único que distingue un ítem nuevo de uno borrado por el dueño.
 * @returns {{items:Array, diagnostico:{primeraCorrida:boolean, conservados:number, sembrados:Array,
 *   omitidos:Array, soloPestana:Array, sinImporte:Array}}}
 */
export function fusionarCuadro5({ obras = [], filas = null, escritos = null } = {}) {
  const semilla = itemsSemilla(obras)
  const { hayCuadro, items: enPestana } = itemsCrudosDeCuadro5(filas ?? [])
  if (!hayCuadro) {
    return {
      items: semilla,
      diagnostico: { primeraCorrida: true, conservados: 0, sembrados: semilla.map((i) => i.rotulo), omitidos: [], soloPestana: [], sinImporte: [] },
    }
  }
  // La semilla indexada por clave. Es una COLA por clave y no un valor suelto: si dos ítems de
  // obras-datos comparten rótulo Y proveedor, cada fila de la pestaña consume uno — el segundo no
  // vuelve a emparejar con el primero ni queda como "nuevo" mientras haya pestaña que lo reclame.
  const porClave = new Map()
  for (const s of semilla) {
    const k = claveDeItem(s.rotulo, s.proveedor)
    if (!porClave.has(k)) porClave.set(k, [])
    porClave.get(k).push(s)
  }
  const items = []
  const soloPestana = []
  const sinImporte = []
  let conservados = 0
  // EL ORDEN ES EL DE LA PESTAÑA, no el de obras-datos: el dueño lee el cuadro que él dejó, y un
  // reordenamiento silencioso se ve igual que una fila que cambió de valor.
  for (const t of enPestana) {
    const cola = porClave.get(claveDeItem(t.rotulo, t.proveedor))
    const s = cola && cola.length ? cola.shift() : null
    if (s) conservados++
    else soloPestana.push({ fila: t.fila, rotulo: t.rotulo, proveedor: t.proveedor })
    if (!(typeof t.previsto === 'number' && Number.isFinite(t.previsto))) {
      sinImporte.push({ fila: t.fila, rotulo: t.rotulo, valor: t.previsto })
    }
    items.push(conservado(t, s))
  }
  // Lo que quedó en la semilla sin reclamar: nuevo si nunca lo escribí, borrado por el dueño si sí.
  const sembrados = []
  const omitidos = []
  for (const cola of porClave.values()) {
    for (const s of cola) {
      const k = claveDeItem(s.rotulo, s.proveedor)
      if (escritos && !escritos.has(k)) { sembrados.push(s.rotulo); items.push(s); continue }
      omitidos.push({ rotulo: s.rotulo, proveedor: s.proveedor, previsto: s.previsto, conMemoria: Boolean(escritos) })
    }
  }
  return { items, diagnostico: { primeraCorrida: false, conservados, sembrados, omitidos, soloPestana, sinImporte } }
}

/**
 * EL DIAGNÓSTICO EN LÍNEAS DE LOG. Lo que la fusión decidió tiene que quedar A LA VISTA de la corrida:
 * un ítem que no se escribió es plata que el plan dejó de mostrar, y eso no puede ser silencioso.
 */
export function lineasDeFusion(d) {
  if (!d) return []
  if (d.primeraCorrida) {
    return [`cuadro 5: la pestaña todavía no lo tiene — SIEMBRA COMPLETA de ${d.sembrados.length} ítem(s) desde obras-datos.mjs`]
  }
  const out = [`cuadro 5: ${d.conservados} ítem(s) con TU fecha y TU importe (la pestaña es el origen)`]
  for (const r of d.sembrados) out.push(`  ✚ ítem nuevo de obras-datos, se siembra: «${r}»`)
  for (const o of d.soloPestana) out.push(`  ✋ fila ${o.fila}: «${o.rotulo}» (${o.proveedor}) no está en obras-datos — es tuyo, se conserva entero`)
  for (const o of d.omitidos) {
    out.push(`  ⌫ NO resucito «${o.rotulo}» (${o.proveedor}, $${Math.round(Number(o.previsto) || 0).toLocaleString('es-AR')}): está en obras-datos y no en la pestaña`
      + `${o.conMemoria ? ' — lo escribí la corrida pasada, así que lo borraste vos' : ' — sin registro de la corrida anterior no puedo distinguirlo de un ítem nuevo, y no piso tu edición'}`)
  }
  for (const s of d.sinImporte) out.push(`  ⚠ fila ${s.fila}: «${s.rotulo}» tiene un Previsto que no es número (${JSON.stringify(s.valor)}): se reescribe tal cual y el libro lo va a omitir`)
  return out
}
