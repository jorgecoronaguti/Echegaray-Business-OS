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
//
// ═══ PREGUNTAR NO ES NO SABER (03/08, el tique de Barcelo sin anotación) ═══
//
// El bot contestó `Obra: falta — ¿a qué obra va?` y nada más. Pero abajo, la lib de imputación
// aprendida había devuelto TODO esto sobre Combustibles Barcelo: 126 cargas históricas, 7 obras
// distintas, San Francisco 41 · Administracion 39 · Taller 18, y la nota de por qué proponía Taller
// y no la más frecuente. El mensaje tiró la evidencia y dejó la pregunta pelada. El dueño: "sigue
// sin ser inteligente" — y tenía razón: **el sistema sabía y el mensaje no lo mostraba.**
//
// Preguntar la obra ESTÁ BIEN: Barcelo va a siete obras de verdad y adivinar imputa plata a la obra
// equivocada. Lo que está mal es preguntar como si no supiera nada. Entonces:
//
//   **UNA PREGUNTA SE HACE CON TODO LO QUE SE SABE ADELANTE.** Las opciones que la lib contó, con su
//   conteo, la que se sugiere marcada, y la nota de la lib cuando explica algo.
//
// Y como contestar tiene que ser un click y no escribir, las tres más frecuentes salen además como
// BOTONES (`botonesFajo` → acción `imputar`). El texto y los botones ofrecen exactamente lo mismo:
// los dos salen de `opcionesDe(...)`, para que no exista una opción que se lee y no se puede tocar.
//
// LO QUE NO CAMBIA: la unidad, el detalle y el rubro NO bloquean la carga —el cargador de Claude
// Code tampoco los exige— así que se ofrecen, no se preguntan. Y el rubro no se ofrece siquiera: es
// derivado de la imputación (`rubro-caja.mjs`, definición única), y se muestra como lo que es.

import { estaCompleto, preguntasDe, etiquetaComprobante, botonesFajo, PREGUNTA_OBRA, opcionesDe } from './fajo.mjs'

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
  if (c.obraVia === 'eleccion') return 'la elegiste vos'
  if (c.obraVia === 'historial') return sugeridoTexto(item.aprendido?.obra)
  return 'escrito a mano'
}

function origenDetalle(c, item) {
  if (c.detalleVia === 'eleccion') return 'lo elegiste vos'
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

// ── LA PREGUNTA CON LO QUE SE SABE ADELANTE ──────────────────────────────────

const plural = (n, sing, plur) => (n === 1 ? sing : plur)

/**
 * El bloque `❓` de la obra: la pregunta, las opciones que la lib contó y su nota.
 *
 * Cuando no hay historia no se inventa un "no sé": se dice POR QUÉ no se puede deducir. Un proveedor
 * nuevo y un proveedor que va a siete obras son dos situaciones distintas y el dueño decide distinto
 * en cada una.
 */
export function bloqueObra(item = {}) {
  const c = item.comprobante ?? {}
  const s = item.sugerencia?.obra ?? null
  const prov = c.proveedor ?? 'este proveedor'
  const ops = opcionesDe(s)
  if (!ops.length) {
    const sin = s?.evidencia === 'sin_historia' || !s
      ? ` No tengo ninguna carga anterior de **${prov}** en Compras para deducirla.`
      : ''
    return [`❓ **¿A qué obra va?**${sin}`]
  }
  const n = s.n ?? 0
  const distintos = s.distintos ?? ops.length
  const l = [`❓ **¿A qué obra va?** ${prov} fue a **${distintos} ${plural(distintos, 'obra distinta', 'obras distintas')}** en ${n} ${plural(n, 'carga', 'cargas')} de Compras, así que no la doy por hecha:`]
  // La viñeta es `•` y no `-` de markdown a propósito: es la que ya usa el resto de los mensajes del
  // bot (drive-buscar, recordatorios) y no depende de que Mattermost arranque una lista en la línea
  // siguiente a un párrafo. Una opción que no se lee es una opción que no existe.
  for (const o of ops) {
    const cuantas = o.n != null ? ` — ${o.n} de ${n}` : ''
    l.push(`• **${o.valor}**${cuantas}${o.valor === s.sugerido ? ' ← la que sugiero' : ''}`)
  }
  // La nota de la lib se muestra CUANDO EXPLICA ALGO. "obra elegida por coincidencia de concepto, no
  // por la más frecuente del proveedor" es exactamente lo que hace falta para confiar o desconfiar de
  // la sugerida; repetir "obra ambigua (7 distintas en 126)" sería decir dos veces lo de arriba.
  if (s.nota) l.push(`_ℹ ${s.nota}_`)
  return l
}

/**
 * Las dimensiones que NO bloquean: se OFRECEN, no se preguntan.
 *
 * El cargador de Claude Code escribe la fila con Unidad y Detalle vacías y las completa el dueño en
 * el Sheet; el bot no puede ser más exigente que él. Pero si acá se sabe qué puso antes, ofrecerlo
 * ahorra ese viaje — declarando que no hace falta para cargar.
 */
export function ofertasDe(item = {}) {
  const c = item.comprobante ?? {}
  const sug = item.sugerencia ?? {}
  const l = []
  if (!c.unidad) {
    const t = listaCorta(sug.unidad)
    if (t) l.push(`**Unidad de negocio** _(no la necesito para cargar)_: ${t}`)
  }
  if (!c.detalleObra) {
    const t = listaCorta(sug.detalle)
    // El detalle se aprende por (proveedor, OBRA). Si la obra todavía no está decidida, lo que se
    // ofrece es el detalle de la obra SUGERIDA: decirlo sin esa condición sería ofrecer el frente de
    // una obra que puede no ser la que termine quedando.
    const obra = sug.detalle?.obra ?? null
    if (t) {
      const cond = obra && !c.obra ? `si la obra queda en **${obra}**, ` : (obra ? `en **${obra}** ` : '')
      l.push(`**Detalle de obra** _(no lo necesito para cargar)_: ${cond}${t}`)
    }
  }
  return l
}

/** "**Civil** 68 · Estructura 47 · Mantenimiento 11 — de 126 cargas": los valores con su conteo. */
export function listaCorta(s) {
  const ops = opcionesDe(s)
  if (!ops.length) return null
  const n = s?.n ?? 0
  const partes = ops.map((o) => {
    const cuenta = o.n != null ? ` ${o.n}` : ''
    return o.valor === s?.sugerido ? `**${o.valor}**${cuenta}` : `${o.valor}${cuenta}`
  })
  return `${partes.join(' · ')}${n ? ` — de ${n} ${plural(n, 'carga', 'cargas')}` : ''}`
}

/**
 * El rubro de caja NO SE PREGUNTA NUNCA: es derivado de la imputación y lo define `rubro-caja.mjs`,
 * la única definición del rubro en todo el sistema. Se muestra para que el dueño vea la consecuencia
 * de la imputación que está por elegir — es la línea del Cash Flow donde va a caer esta plata.
 */
export function lineaRubro(item = {}) {
  const r = item.sugerencia?.rubro
  if (!r?.sugerido || r.evidencia === 'sin_clasificar') return null
  const cond = r.evidencia === 'depende_de_la_imputacion' ? 'con esa imputación sería' : 'es'
  return `el rubro de caja no te lo pregunto: sale de la imputación — ${cond} **${r.sugerido}**`
}

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
    // LA PREGUNTA DE LA OBRA SE REEMPLAZA POR EL BLOQUE CON LAS OPCIONES. `preguntasDe` decide QUÉ
    // falta (y por eso `estaCompleto` sigue siendo false); acá se decide CÓMO se pregunta. El resto de
    // las preguntas —el total, la fecha, el número— no tienen historial que ofrecer: van tal cual.
    const preguntas = preguntasDe(it).filter((p) => !/ya esté cargado/.test(p))
    const bloques = preguntas.flatMap((p) => (p === PREGUNTA_OBRA ? bloqueObra(it) : [`❓ ${p}`]))
    if (bloques.length) {
      l.push('')
      for (const b of bloques) l.push(b)
    }
    const ofertas = ofertasDe(it)
    if (ofertas.length) {
      l.push('')
      for (const o of ofertas) l.push(o)
    }
    const notas = notasDe(it)
    const rubro = lineaRubro(it)
    if (rubro) notas.push(rubro)
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
  else if (pendientes) {
    // Si hay opciones ofrecidas hay botones para tocarlas: decir sólo "contestame" haría escribir lo
    // que se resuelve con un click.
    const hayBotones = items.some((it) => opcionesDe(it?.sugerencia?.obra).length && !it?.comprobante?.obra)
    l.push(hayBotones
      ? '**No hay nada que cargar todavía.** Tocá la obra —o escribime otra— y lo cargo.'
      : '**No hay nada que cargar todavía.** Contestame lo que falta y lo cargo.')
  }
  else l.push('**No hay nada que cargar:** ya estaba en Compras.')
  return l.join('\n')
}

/** El mensaje completo (texto + botones) tal como sale al canal. */
export function mensajeFajo(fajo, { url } = {}) {
  return { texto: resumenFajo(fajo), attachments: botonesFajo(fajo, { url }) }
}
