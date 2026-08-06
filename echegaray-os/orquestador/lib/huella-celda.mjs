// LA HUELLA POR CELDA — evidencia POSITIVA de la propia escritura, celda por celda.
//
// POR QUÉ EXISTE (05/08). El dueño: *"no podés volver a escribir algo si yo ya lo borré, pasó en los
// dos cash flows"*. Le propuse guardar un snapshot para restaurar después del daño y me corrigió:
// **"mal hecho entonces, tiene que tener una mejor práctica"**. Tenía razón: un snapshot es una red
// debajo del precipicio. Lo que hace falta es que el generador sea ESTRUCTURALMENTE INCAPAZ de
// re-crear lo que él borró.
//
// ═══ LA DISTINCIÓN QUE HOY NO SE PUEDE HACER ═══
//
// `respetar-ediciones.mjs` guarda una lista de RÓTULOS (texto → reemplazo). Con esa lista, "el texto
// que yo escribía no está en la pestaña" tiene tres causas indistinguibles:
//
//     · el dueño lo borró          → no lo vuelvo a escribir
//     · nunca existió ahí          → no hay nada que respetar
//     · cambió porque lleva la fecha de hoy adentro → falso positivo diario
//
// Medido sobre el Cash Flow Semanal: de 92 "borrados" registrados, 53 eran rótulos que el dueño nunca
// borró —entre ellos "ACTIVIDADES OPERATIVAS" y "AUMENTO / (DISMINUCIÓN) NETA DEL EFECTIVO"—, vivos en
// la pestaña. Una lista de textos no puede probar de quién es una celda.
//
// La huella sí, porque guarda la evidencia positiva: **esta celda la escribí yo, con esta FORMA.**
//
//     huella propia  +  celda VACÍA hoy      →  la vaciaste vos      →  NO la vuelvo a escribir
//     SIN huella     +  celda CON contenido  →  nunca fue mía        →  NO la piso, jamás
//     el resto                               →  se escribe normal
//
// ═══ POR QUÉ ES INMUNE AL CONTENIDO VARIABLE ═══
//
// No se guarda el texto: se guarda la FORMA —el contenido con cada parte variable enmascarada—.
// "Conciliación del OS al 2026-08-04 — 3 diferencias" y la de mañana tienen la MISMA forma
// (`conciliación del os al <F> — <N> diferencias`), y "$ 1.234,56" y "$ 9.870,00" son las dos `<$>`.
// Un rótulo con fecha, un importe que cambia y un contador dejaron de ser eventos.
//
// ═══ POR QUÉ LA POSICIÓN, SI LA REGLA DEL REPO DICE "ANCLAR AL TEXTO" ═══
//
// Porque acá la pregunta es otra. Anclar al texto sirve para "¿qué rótulo cambiaste?"; NO sirve para
// "¿esta celda está vacía porque la vaciaste vos?", que es una pregunta sobre una celda, no sobre un
// texto. La primera versión de `respetar-ediciones` ya se quemó anclando a la posición SOLA: una fila
// de subtítulo corrió todo un renglón y la regla "respetó" un importe pegado donde iba un título.
//
// La cura no es abandonar la posición: es **exigir posición Y forma para reclamar propiedad**, y
// medir la alineación antes de creerle al mapa. Si las formas ya no caen donde el mapa dice, se busca
// el desplazamiento de filas que las devuelve a su lugar (una pestaña que crece o se achorta se corre
// EN BLOQUE); y si ningún desplazamiento alinea, la huella NO DECIDE esa corrida y se resiembra.
//
// ═══ CONTRA QUÉ LECTURA SE COMPARA ═══
//
// Contra la lectura FORMULA, no contra el texto visible. Una fórmula `=SI(...;"";...)` se VE vacía y
// tiene contenido: comparar contra lo visible daría "el dueño la borró" y el generador dejaría de
// escribir la fórmula para siempre. La pregunta de la huella es "¿hay algo en esta celda?", y eso lo
// contesta la fórmula. (La Regla 0 usa la otra lectura porque su pregunta es "¿qué dice la pestaña?".)

import { createHash } from 'node:crypto'
import { query } from './db.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

/** Cuántas celdas comparables hacen falta para que la alineación sea un juicio y no una casualidad. */
export const MIN_COMPARABLES = 8
/** Qué fracción de las formas tiene que caer donde el mapa dice para creerle al mapa. */
export const UMBRAL_ALINEACION = 0.6
/** Desplazamientos de fila que se prueban, del más probable al menos. Una pestaña se corre en bloque. */
export const DESPLAZAMIENTOS = [0, -1, 1, -2, 2, -3, 3, -5, 5]

/**
 * LA FORMA DE UNA CELDA: su contenido con cada parte variable enmascarada.
 *
 * Es el corazón de la inmunidad al contenido variable. Una fecha, un importe, un porcentaje y un
 * contador se reemplazan por su marca; el resto se normaliza (sin apóstrofo inicial, espacios
 * colapsados, minúsculas). Dos textos "iguales salvo el día" dan la misma forma.
 *
 * Una celda vacía —o el centinela VACIO, que significa "es mía y va vacía"— no tiene forma: devuelve
 * cadena vacía. Ese es el estado que distingue "borrada" de todo lo demás.
 */
export function formaDe(v) {
  if (v === undefined || v === null) return ''
  let s = String(v).replace(/^'/, '').trim()
  if (!s || s === VACIO.trim() || s === VACIO) return ''
  // Una fórmula se enmascara por sus números: así `=SUMA(B4:B9)` y `=SUMA(B5:B10)` —la misma fórmula
  // después de insertar una fila— comparten forma y el corrimiento no se lee como una edición.
  if (s.startsWith('=')) return `=${s.slice(1).replace(/\d+/g, '#').toLowerCase()}`
  s = s
    .replace(/\d{4}-\d{2}(-\d{2})?/g, '<F>')                       // 2026-08-04 · 2026-08
    .replace(/\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?/g, '<F>')           // 4/8/2026 · 4-8
    .replace(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*[-/ ]\d{2,4}\b/gi, '<F>')
    .replace(/-?\$\s?[\d.]+(,\d+)?/g, '<$>')                       // -$1.234,56
    .replace(/-?[\d.]+(,\d+)?\s?%/g, '<%>')                        // 12,5%
    .replace(/-?\b\d[\d.]*(,\d+)?\b/g, '<N>')                      // 1.234,56 · 7
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Hash corto de la forma. Es la clave que se compara; la forma se guarda al lado como evidencia. */
export function huellaDe(v) {
  const f = formaDe(v)
  return f ? createHash('sha1').update(f).digest('hex').slice(0, 16) : null
}

/** ¿El generador quiere ESCRIBIR esta celda? El centinela VACIO cuenta: es una orden de limpiar. */
export function quiereEscribir(v) {
  return v === VACIO || formaDe(v) !== ''
}

/** ¿La celda TIENE algo? Es la única pregunta que decide "borrada": la contesta la lectura FORMULA. */
export const hayContenido = (v) => formaDe(v) !== ''

export const claveCelda = (fila, col) => `${fila}:${col}`

/**
 * LAS FORMAS DE TEXTO QUE EL GENERADOR ESCRIBE HOY, EN CUALQUIER PARTE DE SU GRILLA.
 *
 * ═══ EL RESIDUO INMORTAL (06/08) ═══
 *
 * "Impuestos y Financieros" quedó con cinco celdas "⚠ PROYECCIÓN" en I20:M20, colgando a la derecha de
 * una fila del calendario de vencimientos. Ese texto lo escribe la fila "DDJJ presentada", que en el
 * layout anterior vivía en la fila 20 y hoy vive en la 57. El generador SÍ manda el centinela VACIO en
 * I20:M20 —la grilla rellena su ancho entero— así que la limpieza estaba pedida y no ocurría.
 *
 * La causa es de acá: `huellasDeEscritura` no deja huella de una celda VACIO (correcto: no hay
 * contenido que registrar) y el barrido borra las huellas viejas de la ventana escrita. Entonces la
 * celda queda OCUPADA (con el resto del layout viejo) y SIN huella propia, que es exactamente la
 * firma de "nunca fue mía y tiene algo tuyo" → se preservaba. Para siempre, y en cada corrida.
 *
 * La regla de propiedad no se afloja: se le agrega la única evidencia que faltaba. Si el generador
 * manda VACIO —una orden explícita de limpiar SU celda— y lo que hay ahí es un TEXTO que él mismo
 * sigue escribiendo en otra parte de esta misma grilla, esa celda es suya: la escribió él en un layout
 * anterior. El dueño tendría que haber tipeado, letra por letra, uno de los textos del generador.
 *
 * SÓLO TEXTO, Y CON LETRAS. Un importe o una fecha residual comparten forma (`<$>`, `<f>`) con
 * cualquier importe o fecha que el generador escriba hoy: bastaría eso para borrar un número del
 * dueño. Una fórmula tampoco cuenta —el dueño copia fórmulas—. Queda el texto con al menos tres
 * letras, que es lo que produce un rótulo y no produce un dato.
 */
export function formasDeTextoPropio(generado = []) {
  const out = new Set()
  for (const f of generado || []) {
    for (const c of f || []) {
      const forma = formaDe(c)
      if (!forma || forma.startsWith('=')) continue
      if ((forma.match(/[a-záéíóúüñ]/g) || []).length < 3) continue
      // SÓLO TEXTO INCONFUNDIBLE DE GENERADOR (rechazo del auditor de cierre, 06/08, probado en
      // frío): la versión anterior reclamaba TODA palabra de la grilla — 129 formas en Impuestos,
      // entre ellas "total", "iva", "importe", "disponible" — y una nota del dueño que coincidiera
      // se borraba. La propiedad exige una marca tipográfica que ningún humano tipea al anotar
      // (⚠ ⇒ ‖ § · —) o un rótulo largo: "Total" nunca vuelve a ser evidencia de que lo escribí yo.
      if (!/[⚠⇒‖§·—]/.test(forma) && forma.length < 23) continue
      out.add(forma)
    }
  }
  return out
}

/**
 * Cuántas de mis huellas caen sobre una celda con la MISMA forma, probando un desplazamiento de filas.
 * Las celdas vacías no se cuentan: son justo lo que se está juzgando, e incluirlas sesgaría el
 * veredicto hacia "desalineada" cada vez que el dueño borra algo.
 */
export function coincidencias(actual = [], huellas = new Map(), off = 0, { fila0 = 1, col0 = 0 } = {}) {
  let comparables = 0; let coinciden = 0
  for (const [k, h] of huellas) {
    const [fila, col] = k.split(':').map(Number)
    const i = fila - fila0 + off
    const j = col - col0
    if (i < 0 || i >= actual.length || j < 0) continue
    const f = formaDe((actual[i] || [])[j])
    if (!f) continue
    comparables++
    if (f === h.forma) coinciden++
  }
  return { comparables, coinciden }
}

/**
 * El desplazamiento de filas que mejor alinea el mapa con la pestaña de hoy, y si alcanza para
 * creerle. Sin huellas, con pocas comparables o con una coincidencia baja, la huella NO decide: se
 * escribe como siempre y se resiembra. Ese es el lado tímido — se nota y se arregla.
 */
export function mejorDesplazamiento(actual = [], huellas = new Map(), opts = {}) {
  if (!huellas.size) return { off: 0, alineada: false, fraccion: 0, comparables: 0, motivo: 'sin huella previa: primera corrida' }
  // Se ARRANCA de `off: 0` en vez de un mejor vacío: si NINGÚN desplazamiento acierta una sola celda,
  // el veredicto tiene que ser "mi mapa ya no cae donde dice" —que es la verdad— y no "no hay nada
  // comparable", que suena a pestaña vacía y esconde justo el caso peligroso.
  let mejor = { off: 0, ...coincidencias(actual, huellas, 0, opts) }
  for (const off of DESPLAZAMIENTOS) {
    const r = coincidencias(actual, huellas, off, opts)
    if (r.coinciden > mejor.coinciden) mejor = { off, ...r }
  }
  const { comparables, coinciden, off } = mejor
  const fraccion = comparables ? coinciden / comparables : 0
  if (comparables < MIN_COMPARABLES) {
    return { off, alineada: false, fraccion, comparables, motivo: `sólo ${comparables} celdas comparables: no alcanza para juzgar` }
  }
  if (fraccion < UMBRAL_ALINEACION) {
    return { off, alineada: false, fraccion, comparables, motivo: `mi mapa ya no cae donde dice (${coinciden}/${comparables}): la pestaña cambió de forma` }
  }
  return { off, alineada: true, fraccion, comparables, motivo: `${coinciden} de ${comparables} celdas caen donde mi huella dice${off ? ` (corrida ${off > 0 ? '+' : ''}${off} fila${Math.abs(off) === 1 ? '' : 's'})` : ''}` }
}

/**
 * NÚCLEO PURO: aplica la huella sobre la grilla que el generador quiere escribir.
 *
 * Devolver `''` en una celda NO la borra: `fusionar()` lee la cadena vacía como "no es mi celda,
 * preservá lo que hay". Por eso suprimir es exactamente escribir `''` — la celda queda como el dueño
 * la dejó, vacía si él la vació, con su contenido si es suya.
 *
 * @returns {{grid:any[][], suprimidas:Array, ajenas:Array, residuos:Array, alineacion:object}}
 */
export function aplicarHuella(generado = [], actual = [], huellas = new Map(), opts = {}) {
  const { fila0 = 1, col0 = 0 } = opts
  const alineacion = mejorDesplazamiento(actual, huellas, opts)
  const suprimidas = []; const ajenas = []; const residuos = []
  if (!alineacion.alineada) return { grid: generado, suprimidas, ajenas, residuos, alineacion }
  const mias = formasDeTextoPropio(generado)
  const grid = generado.map((f, i) => (f || []).map((c, j) => {
    if (!quiereEscribir(c)) return c
    const fila = fila0 + i - alineacion.off
    const col = col0 + j
    const mia = huellas.get(claveCelda(fila, col))
    const ocupada = hayContenido((actual[i] || [])[j])
    // LA VACIASTE VOS. Tengo huella propia de esta celda y hoy no hay nada: no la resucito.
    // La marca viaja con DOS coordenadas: dónde estaba la huella (`fila`) y dónde vive la celda hoy
    // (`filaHoy`). Si la pestaña se corrió, la marca tiene que quedar donde la celda está AHORA — si
    // no, la corrida siguiente la buscaría en la fila vieja y el borrado se olvidaría.
    if (mia && !ocupada) {
      suprimidas.push({ fila, col, filaHoy: fila0 + i, colHoy: col, forma: mia.forma, huella: mia.huella, mio: String(c).slice(0, 60) })
      return ''
    }
    if (!mia && ocupada) {
      // MI RESIDUO DE UN LAYOUT ANTERIOR. Pedí limpiar esta celda y lo que hay es un texto que yo
      // mismo sigo escribiendo en otra parte de la grilla: la escribí yo cuando esa fila era otra
      // cosa. Sin esto el residuo es inmortal — no dejé huella (era VACIO) y por eso parece tuyo.
      if (c === VACIO && mias.has(formaDe((actual[i] || [])[j]))) {
        residuos.push({ fila: fila0 + i, col, suyo: String((actual[i] || [])[j]).slice(0, 60) })
        return c
      }
      // NUNCA FUE MÍA Y TIENE ALGO TUYO. Sin evidencia de que la escribí yo, no se pisa.
      ajenas.push({ fila, col, suyo: String((actual[i] || [])[j]).slice(0, 60) }); return ''
    }
    return c
  }))
  return { grid, suprimidas, ajenas, residuos, alineacion }
}

/**
 * NÚCLEO PURO: las celdas propias de esta escritura, listas para persistir. Sólo las que llevan
 * contenido real: el centinela VACIO limpia una celda y no deja huella (si mañana aparece algo ahí,
 * la celda estará ocupada sin huella mía → ajena → se preserva, que es el lado correcto).
 */
export function huellasDeEscritura(grid = [], { fila0 = 1, col0 = 0 } = {}) {
  const out = []
  grid.forEach((f, i) => (f || []).forEach((c, j) => {
    const forma = formaDe(c)
    if (!forma) return
    out.push({ fila: fila0 + i, col: col0 + j, forma: forma.slice(0, 300), huella: huellaDe(c) })
  }))
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PERSISTENCIA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

async function asegurarTabla() {
  await query(`
    create table if not exists public.sheet_huella_celda (
      file_id    text not null,
      pestana    text not null,
      fila       int  not null,
      col        int  not null,
      forma      text not null,
      huella     text not null,
      borrada_en timestamptz,
      escrito_en timestamptz not null default now(),
      primary key (file_id, pestana, fila, col)
    )`)
}

/**
 * El mapa de lo que escribí la última vez en esta pestaña: "fila:col" → {forma, borrada}.
 *
 * Se acota a la VENTANA de este bloque (con holgura para detectar un corrimiento de filas). Sin
 * acotar, las huellas de OTRO bloque de la misma pestaña —CAJA escribe dos veces, Proveedores tiene
 * dos cuadros— caerían sobre celdas que no les corresponden y ensuciarían la medición de alineación
 * hasta hacerla fallar. La huella dejaría de decidir justo en las pestañas más pobladas.
 */
export async function leerHuellas(fileId, pestana, ventana = null) {
  await asegurarTabla()
  const cond = ventana ? ' and fila between $3 and $4 and col between $5 and $6' : ''
  const holgura = Math.max(...DESPLAZAMIENTOS.map(Math.abs))
  const args = ventana
    ? [ventana.fila0 - holgura, ventana.fila0 + ventana.alto - 1 + holgura, ventana.col0, ventana.col0 + ventana.ancho - 1]
    : []
  const r = await query(
    `select fila, col, forma, huella, borrada_en from public.sheet_huella_celda
      where file_id = $1 and pestana = $2${cond}`,
    [fileId, pestana, ...args],
  )
  return new Map(r.rows.map((x) => [claveCelda(x.fila, x.col), { forma: x.forma, huella: x.huella, borrada: Boolean(x.borrada_en) }]))
}

/** Inserta/actualiza en tandas: una pestaña grande son miles de celdas y un solo INSERT no entra. */
async function upsertHuellas(fileId, pestana, filas, sello) {
  for (let i = 0; i < filas.length; i += 400) {
    const tanda = filas.slice(i, i + 400)
    const vals = tanda.map((_, k) => `($1,$2,$${k * 4 + 4},$${k * 4 + 5},$${k * 4 + 6},$${k * 4 + 7},$3)`).join(',')
    await query(
      `insert into public.sheet_huella_celda (file_id, pestana, fila, col, forma, huella, escrito_en) values ${vals}
       on conflict (file_id, pestana, fila, col)
       do update set forma = excluded.forma, huella = excluded.huella, escrito_en = excluded.escrito_en, borrada_en = null`,
      [fileId, pestana, sello, ...tanda.flatMap((f) => [f.fila, f.col, f.forma, f.huella])],
    )
  }
}

/**
 * Guarda la huella de lo que quedó escrito, y MARCA como borradas por el dueño las celdas que se
 * suprimieron en esta corrida.
 *
 * LA MARCA DE BORRADO SOBREVIVE. Las filas de celdas que ya no escribo se limpian con el sello de
 * corrida —son historia de un layout que dejé atrás— pero las que llevan `borrada_en` NO: son la
 * decisión del dueño, y si se borraran con el resto la celda volvería a la corrida siguiente. Se sale
 * de esa marca de una sola forma legítima: que la celda vuelva a tener algo (la escribe él, o la
 * escribo yo porque volvió a haber contenido), y entonces el upsert la limpia.
 */
export async function guardarHuellas(fileId, pestana, grid, { fila0 = 1, col0 = 0, suprimidas = [] } = {}) {
  await asegurarTabla()
  const sello = new Date()
  const filas = huellasDeEscritura(grid, { fila0, col0 })
  if (filas.length) await upsertHuellas(fileId, pestana, filas, sello)
  for (const s of suprimidas) {
    const fila = s.filaHoy ?? s.fila
    const col = s.colHoy ?? s.col
    await query(
      `insert into public.sheet_huella_celda (file_id, pestana, fila, col, forma, huella, borrada_en, escrito_en)
       values ($1,$2,$3,$4,$5,$6,now(),$7)
       on conflict (file_id, pestana, fila, col)
       do update set borrada_en = coalesce(public.sheet_huella_celda.borrada_en, now()), escrito_en = excluded.escrito_en`,
      [fileId, pestana, fila, col, s.forma, s.huella ?? '', sello],
    )
    // La pestaña se corrió: la huella vieja quedaría marcando una celda que ya no es ésa.
    if (fila !== s.fila || col !== s.col) {
      await query('delete from public.sheet_huella_celda where file_id = $1 and pestana = $2 and fila = $3 and col = $4',
        [fileId, pestana, s.fila, s.col])
    }
  }
  // ═══ EL BARRIDO SE LIMITA A LA VENTANA QUE SE ESCRIBIÓ ═══
  //
  // Una pestaña la escriben VARIOS bloques (CAJA hace una segunda pasada sobre la columna de
  // orígenes; Proveedores escribe dos cuadros). Barrer por pestaña entera haría que el segundo
  // escritor borrara la huella del primero, y a la corrida siguiente las celdas del primero
  // aparecerían "sin huella" → ajenas → dejaría de mantenerlas. Es la misma forma del candado falso
  // por dos escritores. Sólo se limpia lo que estaba DENTRO del rectángulo que esta corrida escribió.
  const ancho = Math.max(...grid.map((f) => (f || []).length), 1)
  await query(
    `delete from public.sheet_huella_celda
      where file_id = $1 and pestana = $2 and borrada_en is null and escrito_en < $3
        and fila between $4 and $5 and col between $6 and $7`,
    [fileId, pestana, sello, fila0, fila0 + grid.length - 1, col0, col0 + ancho - 1],
  )
  return { escritas: filas.length, borradas: suprimidas.length }
}

/**
 * El ciclo completo para el portón de escritura. Sin base, la huella no decide y se avisa: es el mismo
 * lado que ya toman el candado y la firma, y quedarse sin escribir por una base caída no protege nada
 * que las otras dos guardas no protejan ya.
 */
export async function conHuellaDeCelda(fileId, pestana, generado, actual, opts = {}) {
  const ventana = {
    fila0: opts.fila0 ?? 1,
    col0: opts.col0 ?? 0,
    alto: generado.length,
    ancho: Math.max(...generado.map((f) => (f || []).length), 1),
  }
  const huellas = await leerHuellas(fileId, pestana, ventana).catch(() => new Map())
  const r = aplicarHuella(generado, actual, huellas, opts)
  return {
    ...r,
    guardar: (escrito) => guardarHuellas(fileId, pestana, escrito, { ...opts, suprimidas: r.suprimidas })
      .catch((e) => console.warn(`  ⚠ no pude guardar la huella por celda: ${e.message}`)),
  }
}
