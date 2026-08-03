// EL MENSAJE DEL FAJO — lo que el dueño mira antes de apretar Confirmar. NÚCLEO PURO, CERO MODELO.
//
// ═══ EL PEDIDO, TEXTUAL (03/08) ═══
//
// "la ux de la respuesta es pesima y poco clara, necesito algo mas parecido a un cuadro con mas
// orden" — y, junto con eso: "q el mensaje de confirmacion mejore o q si ya esta cargado q me lo
// diga".
//
// Lo que había era ocho líneas de prosa corrida con sangrías de tres espacios. Mattermost NO respeta
// esas sangrías: las colapsa, y todo queda en un párrafo donde el total —el único número que el dueño
// busca primero, porque es el que está impreso grande en el papel— pesa lo mismo que una nota sobre
// el sync de ARCA. Mattermost SÍ renderiza tablas markdown; entonces el comprobante se muestra como
// tabla.
//
// ═══ LAS CUATRO REGLAS DE ESTE MENSAJE ═══
//
// 1. **El estado se lee de un vistazo, arriba de todo.** "ya está cargado" / "falta un dato" /
//    "listo para cargar" es la única decisión que el dueño tiene que tomar: va en la primera línea,
//    antes de cualquier importe. Lo que necesita decisión nunca va al final.
// 2. **Un bloque por comprobante**, con su título y su tabla. Nada de una lista numerada donde el
//    segundo comprobante se lee como una continuación del primero.
// 3. **El TOTAL destacado**, porque es el número que se verifica contra el papel.
// 4. **Las notas son notas**: ARCA, percepciones, correcciones de número. Van abajo, en itálica, y
//    NUNCA mezcladas con los importes que el dueño decide. La percepción adentro de la tabla hacía
//    dudar de si estaba sumada o no.
//
// ═══ TRES COSAS DISTINTAS QUE ANTES SE MEZCLABAN ═══
//
// · lo que **leyó del papel** — sin marca; es el caso normal.
// · lo que **dedujo del historial** de Compras — marcado `_(sugerido: …)_` con la evidencia contada.
//   Sin decir de dónde salió, el dueño no puede desconfiar cuando corresponde.
// · lo que **está preguntando** — bloque `❓` propio, después de la tabla.

import { estaCompleto, preguntasDe, etiquetaComprobante, botonesFajo } from './fajo.mjs'

export const money = (n) => (n == null
  ? '—'
  : `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

const redondear = (n) => (n == null ? null : Math.round((n + Number.EPSILON) * 100) / 100)

/** El estado de UN comprobante, en orden de gravedad. Es lo que decide el titular y el ícono. */
export const ESTADO_ITEM = Object.freeze({
  CARGADO: 'cargado',     // ya está en Compras: no se vuelve a cargar
  DUPLICADO: 'duplicado', // puede que ya esté: hay que contestarlo antes que nada
  FALTA: 'falta',         // falta un dato para poder cargarlo
  LISTO: 'listo',
})

export function estadoDeItem(item = {}) {
  if (item.yaCargado || item.duplicadoResuelto === 'mismo') return ESTADO_ITEM.CARGADO
  if (item.posibleDuplicado && !item.duplicadoResuelto) return ESTADO_ITEM.DUPLICADO
  return estaCompleto(item) ? ESTADO_ITEM.LISTO : ESTADO_ITEM.FALTA
}

/**
 * La primera línea: qué pasa con este fajo, sin leer una sola tabla.
 *
 * El orden de gravedad no es estético: un duplicado sin contestar bloquea el Confirmar, y un
 * comprobante ya cargado es la respuesta a la pregunta que el dueño vino a hacer ("¿ya lo cargué?").
 */
export function titular(items = []) {
  const est = items.map(estadoDeItem)
  const n = (e) => est.filter((x) => x === e).length
  const dup = n(ESTADO_ITEM.DUPLICADO)
  const car = n(ESTADO_ITEM.CARGADO)
  const fal = n(ESTADO_ITEM.FALTA)
  const lis = n(ESTADO_ITEM.LISTO)
  const uno = items.length === 1

  if (dup) return `⚠️ **${uno ? 'Puede que ya esté cargado.' : `${dup} puede${dup > 1 ? 'n' : ''} estar cargado${dup > 1 ? 's' : ''}.`}** Decidilo antes de que cargue nada.`
  if (car && !lis && !fal) {
    const fila = filaDeCargado(items)
    return `⚠️ **Ya está${car > 1 ? 'n' : ''} cargado${car > 1 ? 's' : ''}${fila ? ` — Compras fila ${fila}` : ''}.** No hay nada para cargar.`
  }
  if (fal && !lis) return `❓ **${uno ? 'Me falta un dato' : `Me faltan datos en ${fal}`}** para poder cargar${uno ? 'lo' : ''}.`
  const partes = [`✅ **${lis} listo${lis > 1 ? 's' : ''} para cargar**`]
  if (fal) partes.push(`${fal} con un dato pendiente`)
  if (car) partes.push(`${car} ya cargado${car > 1 ? 's' : ''}`)
  return `${partes.join(' · ')}.`
}

function filaDeCargado(items) {
  const c = items.find((it) => it.yaCargado?.fila)
  return c?.yaCargado?.fila ?? null
}

/**
 * La tabla de UN comprobante. Dos columnas: rótulo y valor, que es lo que Mattermost renderiza sin
 * romperse en el celular. El total va en negrita en la última fila.
 */
export function tablaComprobante(item = {}) {
  const c = item.comprobante ?? {}
  const f = []
  f.push(['Comprobante', etiquetaComprobante(c)])
  f.push(['Fecha', c.fecha ?? '_falta_'])
  f.push(['Obra', valorObra(c, item)])
  if (c.detalleObra || item.aprendido?.detalle) f.push(['Detalle', conOrigen(c.detalleObra ?? '_falta_', origenDetalle(c, item))])
  if (c.unidad) f.push(['Unidad', conOrigen(c.unidad, item.aprendido?.unidad ? sugeridoTexto(item.aprendido.unidad) : null)])
  if (c.concepto) f.push(['Concepto', c.concepto])
  const importe = c.total != null ? redondear(c.total - (c.iva ?? 0)) : null
  f.push(['Importe a Compras', money(importe)])
  f.push(['IVA', c.iva != null ? money(c.iva) : '_sin IVA discriminado_'])
  f.push(['**Total**', `**${c.total != null ? money(c.total) : '_ilegible_'}**`])
  return ['| | |', '|---|---|', ...f.map(([k, v]) => `| ${k} | ${v} |`)].join('\n')
}

function valorObra(c, item) {
  if (!c.obra) return '_falta — ¿a qué obra va?_'
  return conOrigen(c.obra, origenObra(c, item))
}

/** De dónde salió la obra. Es el dato con más consecuencias de la fila: nunca se muestra pelado. */
function origenObra(c, item) {
  if (c.obraVia === 'mensaje') return 'de lo que escribiste'
  if (c.obraVia === 'historial') return sugeridoTexto(item.aprendido?.obra)
  return 'escrito a mano'
}

function origenDetalle(c, item) {
  if (c.detalleVia === 'historial') return sugeridoTexto(item.aprendido?.detalle)
  return c.detalleObra ? 'escrito a mano' : null
}

/** "sugerido: 8 de 9 cargas de este proveedor en MESSINA" — la evidencia, contada, no un "confío". */
export function sugeridoTexto(ap) {
  if (!ap) return 'sugerido'
  const n = ap.n ?? 0
  const cuantas = Math.round((ap.share ?? 0) * n)
  const donde = ap.obra ? ` en ${ap.obra}` : ''
  if (!n) return 'sugerido'
  return `sugerido: ${cuantas} de ${n} carga${n > 1 ? 's' : ''} de este proveedor${donde}`
}

const conOrigen = (valor, origen) => (origen ? `${valor} _(${origen})_` : String(valor))

/**
 * Las notas al pie de un comprobante. Informan, no deciden: van abajo, en itálica y con ℹ.
 * La de ARCA dice explícitamente lo que el bot había dado a entender mal: no estar en ARCA no
 * significa que no esté cargado.
 */
export function notasDe(item = {}) {
  const c = item.comprobante ?? {}
  const l = []
  if (c.otrosTributos) l.push(`percepciones / otros tributos ${money(c.otrosTributos)} — ya están dentro del Importe, no son IVA`)
  if (c.numeroLeidoMal) l.push(`había leído **${c.numeroLeidoMal}**; según ARCA el número es **${c.numero}**`)
  if (item.arca?.importesCorregidos) {
    const v = item.arca.importesCorregidos
    l.push(`los importes que leí no cerraban (total ${money(v.total)} · IVA ${money(v.iva)}): puse los de ARCA`)
  }
  const arca = lineaArca(item.arca)
  if (arca) l.push(arca)
  if (item.comprasNoRevisadas) l.push('**no pude leer la pestaña Compras**, así que no puedo asegurarte que no esté ya cargado')
  return l
}

function lineaArca(arca) {
  if (!arca) return null
  if (arca.estado === 'coincide') {
    const quien = arca.emisorNombre ? ` (${arca.emisorNombre})` : ''
    return `figura en ARCA${quien}${arca.cae ? ` · CAE ${arca.cae}` : ''}`
  }
  // NO ESTAR EN ARCA NO ES UN HALLAZGO SOBRE EL DUPLICADO. Un tique de estación de servicio puede no
  // estar en el Libro IVA; el bot lo dijo y siguió como si con eso hubiera verificado algo.
  if (arca.estado === 'sin_registro') return 'no figura en ARCA — puede ser un tique no electrónico o el sync atrasado; no dice nada sobre si ya lo cargaste'
  return 'no pude verificarlo contra ARCA'
}

/** El aviso de duplicado de UN comprobante, con su fila. Va pegado a la tabla, no al final. */
export function avisoDuplicado(item = {}) {
  if (item.yaCargado) {
    const y = item.yaCargado
    const donde = y.fuente === 'Compras' || y.hoja === 'Compras' ? ' de Compras' : ''
    const como = detalleDeCoincidencia(y.via)
    return `⚠️ **Ya está cargado** — fila ${y.fila ?? '?'}${donde}${como}. No lo vuelvo a cargar.`
  }
  if (item.duplicadoResuelto === 'mismo') return '⚠️ Marcado como ya cargado — no lo cargo.'
  if (item.posibleDuplicado && !item.duplicadoResuelto) {
    const d = item.posibleDuplicado
    return `⚠️ **Puede que ya esté cargado** — fila ${d.fila ?? '?'} de Compras: ${d.numero ?? 's/n'} · ${d.fecha ?? 's/f'} · ${money(d.total)}${d.obra ? ` · ${d.obra}` : ''}. **¿Es el mismo?**`
  }
  if (item.duplicadoResuelto === 'otro') return 'Marcado como comprobante distinto — se carga igual.'
  return null
}

/** Por qué se afirma que es ése. Sin la razón, el aviso no se puede desmentir. */
function detalleDeCoincidencia(via) {
  if (['tipo+numero', 'proveedor+numero', 'cuit+numero', 'numero+total'].includes(via)) return ', mismo número y mismo total'
  return ''
}

/**
 * El mensaje entero. Un bloque por comprobante; el estado, arriba de todo.
 */
export function resumenFajo(fajo = {}) {
  const items = fajo.items ?? []
  const l = [titular(items)]
  let hayAprendido = false
  items.forEach((it, i) => {
    const c = it.comprobante ?? {}
    l.push('')
    l.push(`### ${items.length > 1 ? `${i + 1}. ` : ''}${c.proveedor ?? '(proveedor ilegible)'}`)
    l.push(tablaComprobante(it))
    if (c.esNotaCredito) l.push('', '⚠️ **Nota de crédito: entra en negativo.**')
    const dup = avisoDuplicado(it)
    if (dup) l.push('', dup)
    const preguntas = preguntasDe(it).filter((p) => !/ya esté cargado/.test(p))
    if (preguntas.length) {
      l.push('')
      for (const p of preguntas) l.push(`❓ ${p}`)
    }
    const notas = notasDe(it)
    if (notas.length) {
      l.push('')
      for (const n of notas) l.push(`_ℹ ${n}_`)
    }
    if (it.aprendido && Object.keys(it.aprendido).length) hayAprendido = true
  })

  l.push('')
  if (hayAprendido) l.push('_Lo que no dice "sugerido" lo leí del comprobante._')
  const cargables = items.filter(estaCompleto).length
  const pendientes = items.some((it) => [ESTADO_ITEM.FALTA, ESTADO_ITEM.DUPLICADO].includes(estadoDeItem(it)))
  if (cargables) l.push(`Si está bien, apretá **Confirmar** y lo escribo en Compras (${cargables} fila${cargables > 1 ? 's' : ''}).`)
  else if (pendientes) l.push('**No hay nada que cargar todavía.** Contestame lo que falta y lo cargo.')
  else l.push('**No hay nada que cargar:** ya estaba en Compras.')
  return l.join('\n')
}

/** El mensaje completo (texto + botones) tal como sale al canal. */
export function mensajeFajo(fajo, { url } = {}) {
  return { texto: resumenFajo(fajo), attachments: botonesFajo(fajo, { url }) }
}
