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

import { estaCompleto, preguntasDe, rotulosDe, etiquetaComprobante, botonesFajo, PREGUNTA_OBRA, opcionesDe } from './fajo.mjs'
import { dudasDeLectura } from './plausibilidad.mjs'

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
  if (fal && !lis) {
    // ═══ LA PREGUNTA NOMBRA LO QUE FALTA (04/08) ═══
    //
    // Decía "Me falta un dato para poder cargarlo" y abajo listaba todo. El dueño tenía que leer el
    // mensaje entero para descubrir que lo único dudoso era la fecha. Cuando es UN comprobante y son
    // una o dos cosas, se dicen: contestar una pregunta precisa cuesta un segundo y descifrar una
    // genérica cuesta el mensaje entero. Con tres o más vuelve al texto corto, porque enumerarlas en
    // el titular sería repetir el bloque de preguntas que viene abajo.
    if (uno) {
      const r = rotulosDe(items[0])
      if (r.length === 1) return `❓ **Sólo me falta ${r[0]}** — el resto lo leí bien.`
      if (r.length === 2) return `❓ **Me faltan dos cosas: ${r[0]} y ${r[1]}** — el resto lo leí bien.`
    }
    return `❓ **${uno ? 'Me falta un dato' : `Me faltan datos en ${fal}`}** para poder cargar${uno ? 'lo' : ''}.`
  }
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
  // ═══ LO QUE NO PUEDE SER CIERTO NO SE MUESTRA COMO LEÍDO (04/08) ═══
  //
  // La tabla decía `Fecha 05/12/2003` e `IVA $0,01` con el mismo formato con el que muestra el total
  // que sí estaba impreso. Para el que lee, las tres filas valen igual: son "lo que dice el papel".
  // Ahí es donde un error de OCR se convierte en un dato de la empresa.
  //
  // Se marca como ilegible Y SE MUESTRA QUÉ SE LEYÓ. Las dos cosas: sin lo segundo el dueño no puede
  // corregirlo de memoria ni entender qué pasó; sin lo primero, no es un aviso, es el dato.
  const dudas = dudasDeLectura(item)
  const f = []
  f.push(['Comprobante', etiquetaComprobante(c)])
  f.push(['Fecha', dudas.fecha ? ilegible(`leí ${dudas.fecha.leida}`) : (c.fecha ?? '_falta_')])
  f.push(['Obra', valorObra(c, item)])
  if (c.detalleObra || item.aprendido?.detalle) f.push(['Detalle', conOrigen(c.detalleObra ?? '_falta_', origenDetalle(c, item))])
  if (c.unidad) f.push(['Unidad', conOrigen(c.unidad, item.aprendido?.unidad ? sugeridoTexto(item.aprendido.unidad) : null)])
  // LA CATEGORÍA (columna B) SE MUESTRA. El bot la escribe desde el 04/08 y nunca la mostraba: una
  // columna que se escribe sin que el dueño la vea es una columna que nadie revisa.
  if (c.categoria) f.push(['Categoría', conOrigen(c.categoria, item.aprendido?.categoria ? sugeridoTexto(item.aprendido.categoria) : null)])
  if (c.concepto) f.push(['Concepto', c.concepto])
  else if (c.conceptoDescartado) f.push(['Concepto', ilegible('no pude leer qué se compró')])
  // LA CONDICIÓN DE VENTA SE MUESTRA CUANDO LA DECIDIÓ LA MANO DEL DUEÑO (05/08). Es la que define
  // si la fila entra **Pendiente** o **Pagada**, o sea si esa plata aparece como deuda en el Flujo
  // de Fondos, y le gana a la impresa: un cambio de esa consecuencia no puede pasar en silencio.
  if (c.condicion && c.condicionVia === 'manuscrita') {
    f.push(['Condición', conOrigen(`${c.condicion} → ${c.condicion === 'Cuenta Corriente' ? 'Pendiente' : 'Pagado'}`, 'escrito a mano')])
  }
  const importe = c.total != null ? redondear(c.total - (c.iva ?? 0)) : null
  // El importe de la columna M se DERIVA del IVA (M = Total − IVA). Si el IVA no se pudo leer, este
  // número tampoco es un dato leído: es una cuenta hecha con un dato malo, y se declara así.
  f.push(['Importe a Compras', dudas.iva ? `${money(importe)} _(sale del IVA, que no pude leer)_` : money(importe)])
  f.push(['IVA', dudas.iva ? ilegible(`leí ${money(dudas.iva.iva)}`) : (c.iva != null ? money(c.iva) : '_sin IVA discriminado_')])
  f.push(['**Total**', `**${c.total != null ? money(c.total) : '_ilegible_'}**`])
  return ['| | |', '|---|---|', ...f.map(([k, v]) => `| ${k} | ${v} |`)].join('\n')
}

/** Un dato que no se pudo leer, con la evidencia de lo que se leyó al lado. Nunca uno inventado. */
const ilegible = (que) => `_ilegible — ${que}_`

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
    return [`❓ **¿A qué obra va?**${sin}`, SIN_OBRA_NO_BLOQUEA]
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
  l.push(SIN_OBRA_NO_BLOQUEA)
  return l
}

/**
 * QUE SE OFREZCA NO SIGNIFICA QUE BLOQUEE (03/08/2026).
 *
 * El dueño decidió que el bot cargue igual con la obra vacía, alineado con el cargador de Claude Code
 * (ver `faltantes.mjs`). Pero la pregunta se sigue haciendo con todo el historial adelante: elegir la
 * obra en el momento cuesta un click y completarla después cuesta abrir el Sheet y buscar la fila.
 *
 * Lo que NO se puede hacer es dejar la pregunta como estaba: un `❓` que ya no bloquea y no lo dice
 * hace que el jefe crea que tiene que contestar para que se cargue, y el que no contesta se va
 * pensando que no cargó nada. La consecuencia va escrita al lado de la pregunta.
 */
export const SIN_OBRA_NO_BLOQUEA = '_ℹ no me hace falta para cargar: si no elegís ninguna, lo cargo **sin obra** y la completás en Compras._'

/**
 * ¿A este comprobante hay que ofrecerle la obra? Falta la obra y todavía se va a cargar.
 *
 * Uno ya cargado o marcado como "es el mismo" no se ofrece: no hay nada que imputar. Un duplicado sin
 * contestar tampoco pregunta la obra — primero se decide si existe, después dónde va.
 */
export function ofreceObra(item = {}) {
  if (item.yaCargado || item.duplicadoResuelto === 'mismo') return false
  if (item.posibleDuplicado && !item.duplicadoResuelto) return false
  return !item.comprobante?.obra
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
  // ═══ LAS FOTOS REPETIDAS SE NOMBRAN (05/08) ═══
  //
  // El mismo tique llegó TRES veces en tres fotos y el mensaje mostraba una sola línea, sin decir
  // nada de las otras dos: para quien mandó las tres, dos fotos se habían perdido. Va acá —y no sólo
  // en la rendición del post— porque el mensaje se vuelve a dibujar desde el fajo en cada click, y
  // la rendición del post no viaja a Postgres.
  const copias = (item.copias ?? []).length
  if (copias) {
    l.push(`mandaste ${copias + 1} fotos de este mismo comprobante (${(item.copias ?? []).map((x) => `\`${x.nombre ?? x.fileId}\``).join(', ')}) — lo cargo **una sola vez**`)
  }
  if (c.otrosTributos) l.push(`percepciones / otros tributos ${money(c.otrosTributos)} — ya están dentro del Importe, no son IVA`)
  if (c.numeroLeidoMal) l.push(`había leído **${c.numeroLeidoMal}**; según ARCA el número es **${c.numero}**`)
  // ═══ POR QUÉ FALTA EL CONCEPTO DE UN PAPEL QUE LO TIENE IMPRESO (04/08) ═══
  //
  // Sin esta nota, descartar el concepto envenenado se ve igual que no haberlo leído, y el dueño no
  // tiene forma de saber que el bot leyó mal el nombre del proveedor — que es el dato que le permite
  // desconfiar del resto de la fila.
  if (c.nombreLeidoMal && (c.conceptoDescartado || c.categoriaDescartada)) {
    const tirado = [
      c.conceptoDescartado ? `el concepto ("${c.conceptoDescartado}")` : null,
      c.categoriaDescartada ? `la categoría ("${c.categoriaDescartada}")` : null,
    ].filter(Boolean).join(' y ')
    l.push(`leí el proveedor como **${c.nombreLeidoMal}** y es **${c.proveedor}**: descarté ${tirado} porque salía${c.conceptoDescartado && c.categoriaDescartada ? 'n' : ''} de ese nombre mal leído, no del comprobante`)
  }
  if (item.arca?.importesCorregidos) {
    const v = item.arca.importesCorregidos
    l.push(`los importes que leí no cerraban (total ${money(v.total)} · IVA ${money(v.iva)}): puse los de ARCA`)
  }
  const arca = lineaArca(item.arca)
  if (arca) l.push(arca)
  const banco = lineaBanco(item.banco)
  if (banco) l.push(banco)
  if (item.comprasNoRevisadas) l.push('**no pude leer la pestaña Compras**, así que no puedo asegurarte que no esté ya cargado')
  return l
}

/** El resultado del cruce contra el extracto, en una línea. Sólo existe para los comprobantes que
 *  declaran pago bancario; el resto no tiene débito que buscar. Ver lib/comprobantes/banco.mjs. */
function lineaBanco(banco) {
  if (!banco) return null
  if (banco.estado === 'cruza') {
    const junto = banco.agrupado > 1 ? ` — una sola transferencia de ${money(banco.importe)} paga las ${banco.agrupado} facturas de este envío` : ''
    return `pagada verificada en el banco: débito${banco.fecha ? ` del ${String(banco.fecha).slice(0, 10)}` : ''} por ${money(banco.importe)}${banco.referencia ? ` · ref ${banco.referencia}` : ''}${junto}`
  }
  if (banco.estado === 'sin_debito') {
    return 'dice pagada por transferencia y **no encuentro ese débito en el extracto** — puede que el banco todavía no lo muestre, o que no esté paga: vale la pena mirarlo'
  }
  return 'no pude cruzarla contra el extracto bancario'
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
    // LA OBRA SE OFRECE SIEMPRE QUE FALTE, AUNQUE YA NO SEA UN FALTANTE (03/08/2026).
    //
    // Antes el bloque salía porque `preguntasDe` devolvía `PREGUNTA_OBRA`: la obra era obligatoria y
    // el mensaje se limitaba a reemplazar el texto pelado por las opciones del historial. Ahora que no
    // bloquea, `faltantesDe` ya no la devuelve — y si el bloque colgara de ahí, el desplegable con las
    // siete obras del proveedor y sus conteos habría desaparecido junto con la exigencia. Eso sería
    // apagar la parte útil por haber apagado la molesta: se decide acá, y por la única condición que
    // importa, que la obra falte. El resto de las preguntas —el total, la fecha, el número— siguen
    // saliendo de la política y no tienen historial que ofrecer: van tal cual.
    const preguntas = preguntasDe(it).filter((p) => !/ya esté cargado/.test(p) && p !== PREGUNTA_OBRA)
    const bloques = [
      ...(ofreceObra(it) ? bloqueObra(it) : []),
      ...preguntas.map((p) => `❓ ${p}`),
    ]
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
  // CUÁNTOS VAN A ENTRAR SIN OBRA, DICHO ANTES DE APRETAR. La obra dejó de bloquear, así que el
  // Confirmar puede escribir una fila con la columna J vacía. Que eso pase en silencio sería cambiar
  // el resultado de un botón sin avisarlo: el jefe apretó lo mismo de siempre.
  const sinObra = items.filter((it) => estaCompleto(it) && !it.comprobante?.obra).length
  if (cargables) {
    l.push(`Si está bien, apretá **Confirmar** y lo escribo en Compras (${cargables} fila${cargables > 1 ? 's' : ''}).`)
    if (sinObra) {
      l.push(sinObra === 1 && cargables === 1
        ? '⚠️ Va **sin obra** — completala en Compras, o elegila arriba y lo cargo imputado.'
        : `⚠️ ${sinObra} de ${cargables} van **sin obra** — completalas en Compras, o elegilas arriba.`)
    }
  }
  else if (pendientes) {
    // ═══ DECIR QUÉ TIENE QUE HACER ÉL, NO QUE FALTA ALGO (04/08) ═══
    //
    // "Contestame lo que falta" mandaba a contestar cosas que NO se contestan escribiendo: un total
    // que no se leyó, una fecha imposible o un proveedor fuera del desplegable sólo se arreglan desde
    // **Corregir**. El dueño escribía la respuesta, no pasaba nada, y la conclusión razonable era que
    // el bot no funciona. Cada cierre nombra la acción que de verdad resuelve lo que está trabado.
    const hayBotones = items.some((it) => opcionesDe(it?.sugerencia?.obra).length && !it?.comprobante?.obra)
    const necesitaCorregir = items.some((it) => preguntasDe(it).some((p) => !/ya esté cargado/.test(p) && p !== PREGUNTA_OBRA))
    if (necesitaCorregir) {
      l.push(hayBotones
        ? '**No hay nada que cargar todavía.** Lo de arriba con ❓ no lo pude leer del papel: tocá **Corregir** y completalo. La obra sí podés tocarla o escribírmela acá.'
        : '**No hay nada que cargar todavía.** Lo de arriba con ❓ no lo pude leer del papel: tocá **Corregir** y completalo, y lo cargo.')
    } else {
      l.push(hayBotones
        ? '**No hay nada que cargar todavía.** Tocá la obra —o escribime el nombre acá mismo— y lo cargo.'
        : '**No hay nada que cargar todavía.** Contestame lo que falta y lo cargo.')
    }
  }
  else l.push('**No hay nada que cargar:** ya estaba en Compras.')
  return l.join('\n')
}

/** El mensaje completo (texto + botones) tal como sale al canal. */
export function mensajeFajo(fajo, { url } = {}) {
  return { texto: resumenFajo(fajo), attachments: botonesFajo(fajo, { url }) }
}
