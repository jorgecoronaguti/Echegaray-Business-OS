// EL ÚNICO MENSAJE DE LA CARGA DE COMPROBANTES — NÚCLEO PURO, CERO RED Y CERO MODELO.
//
// ═══ EL PEDIDO, TEXTUAL Y DOS VECES ═══
//
//   «no quiero mensajes del bot en la carga de comprobantes, necesito q la experiencia sea sin
//    fisuras. solo quiero q confirme q termino todo»
//   «me envie solo mensaje de confirmacion de q fue cargado ok, cuantos fueron cargados»
//
// Antes de esto: cada post con fotos disparaba una tarea, cada tarea publicaba, y cada publicación
// traía la tabla de lo escrito, la rendición de adjuntos, el acumulado de la tanda y una tarjeta con
// botones. Doce fotos en tres posts = tres mensajes largos + tres tarjetas. El dueño no quiere leer
// un informe: quiere saber que terminó y cuántos entraron.
//
// ═══ QUÉ DICE, Y NADA MÁS ═══
//
//   · que TERMINÓ (o que todavía está leyendo, mientras lo hace)
//   · cuántos se CARGARON
//   · cuántos YA ESTABAN en Compras y no se volvieron a cargar
//   · lo que NO SE PUDO LEER y lo que quedó SIN IMPUTAR — en un renglón cada cosa
//
// Y no pregunta nada. Todo lo que antes se contestaba con un botón (elegir la obra, decidir un
// duplicado) hoy se NOMBRA y se sigue de largo: el gasto entra igual con la celda vacía, o no entra
// y se dice cuál. Ver `botonesFajo` en `fajo.mjs`, que es donde se apagaron las tarjetas.
//
// ═══ POR QUÉ ES UN OBJETO Y NO UN STRING ═══
//
// Porque la tanda son varios posts y el mensaje es uno: hay que poder SUMAR lo de tres posts antes
// de escribir un renglón. Un texto no se suma. `sumarPartes` es asociativo y conmutativo a propósito
// —los posts pueden terminar en cualquier orden— y `PARTE_VACIA` es su elemento neutro.

/** El recuento de un post, o de una tanda entera. Todas las claves siempre presentes. */
export const PARTE_VACIA = Object.freeze({
  recibidos: 0,   // adjuntos que ENTRARON (no los que sobrevivieron: ésa es la cuenta que importa)
  cargados: 0,    // comprobantes escritos en Compras AHORA
  yaEstaban: 0,   // ya estaban en Compras: no se volvieron a cargar
  copias: 0,      // otra foto de un comprobante que ya está en esta misma tanda
  suma: 0,        // plata cargada ahora
  ilegibles: [],  // {nombre, motivo}
  sinImputar: [], // {fila, proveedor, campos:[...]}
  trabados: [],   // {nombre, motivo} — no se pudo cargar y NO se pregunta nada
  avisos: [],     // texto suelto: lo que rompió y hay que decir sí o sí
})

/** Una parte nueva, con las listas propias (nunca las de `PARTE_VACIA`). */
export function parteVacia() {
  return { ...PARTE_VACIA, ilegibles: [], sinImputar: [], trabados: [], avisos: [] }
}

/**
 * Suma dos partes. Asociativa y conmutativa: los posts de una tanda pueden terminar en cualquier
 * orden y el mensaje tiene que dar lo mismo.
 */
export function sumarPartes(a, b) {
  const x = { ...parteVacia(), ...(a ?? {}) }
  const y = { ...parteVacia(), ...(b ?? {}) }
  return {
    recibidos: (x.recibidos ?? 0) + (y.recibidos ?? 0),
    cargados: (x.cargados ?? 0) + (y.cargados ?? 0),
    yaEstaban: (x.yaEstaban ?? 0) + (y.yaEstaban ?? 0),
    copias: (x.copias ?? 0) + (y.copias ?? 0),
    suma: (Number(x.suma) || 0) + (Number(y.suma) || 0),
    ilegibles: [...(x.ilegibles ?? []), ...(y.ilegibles ?? [])],
    sinImputar: [...(x.sinImputar ?? []), ...(y.sinImputar ?? [])],
    trabados: [...(x.trabados ?? []), ...(y.trabados ?? [])],
    avisos: [...(x.avisos ?? []), ...(y.avisos ?? [])],
  }
}

/** Todas las partes de una tanda, sumadas. */
export function acumular(partes = []) {
  return (partes ?? []).reduce((a, p) => sumarPartes(a, p), parteVacia())
}

/**
 * La rendición de adjuntos (`rendicion.mjs`) → una parte.
 *
 * `seCargaron` decide qué pasa con los adjuntos que quedaron LISTOS: si la escritura ocurrió, los
 * cuenta `parteDeEscritura` (que sabe en qué fila quedó cada uno) y acá se ignoran para no contarlos
 * dos veces. Si NO ocurrió, quedan trabados y hay que nombrarlos — un comprobante «listo» que nadie
 * escribió es un gasto perdido, y ése es justo el silencio que este mensaje no puede tener.
 */
export function parteDeRendicion(rendicion = {}, { seCargaron = false } = {}) {
  const p = parteVacia()
  p.recibidos = rendicion?.total ?? 0
  for (const a of rendicion?.porAdjunto ?? []) {
    if (a.destino === 'cargado') p.yaEstaban += 1
    else if (a.destino === 'copia') p.copias += 1
    else if (a.destino === 'ilegible') p.ilegibles.push({ nombre: a.nombre, motivo: a.detalle })
    else if (a.destino === 'sin_rastro') p.avisos.push(`\`${a.nombre}\` entró y no aparece en ningún lado. Mandalo de nuevo.`)
    else if (a.destino === 'pendiente' || a.destino === 'duplicado') p.trabados.push({ nombre: a.nombre, motivo: a.detalle })
    else if (a.destino === 'listo' && !seCargaron) p.trabados.push({ nombre: a.nombre, motivo: 'quedó sin cargar' })
  }
  return p
}

/**
 * Lo que devolvió la escritura (`escribirFajo`) → una parte.
 *
 * `yaEstaban` de acá NO se pisa con el de la rendición: son cosas distintas y no se solapan. El de
 * la rendición es «lo encontré en Compras antes de intentar»; éste es «la clave ya estaba reservada
 * cuando fui a escribir», o sea que entró por otro camino en el medio. Los dos son «ya estaba» para
 * el dueño y por eso se SUMAN.
 */
export function parteDeEscritura(res = {}) {
  const p = parteVacia()
  if (!res) return p
  p.cargados = (res.filas ?? []).filter((f) => f?.fila != null).length
  p.yaEstaban = Number(res.yaEstaban) || 0
  p.suma = Number(res.suma) || 0
  for (const s of res.sinImputar ?? []) p.sinImputar.push(s)
  for (const a of res.avisos ?? []) if (a) p.avisos.push(a)
  return p
}

/** Cómo se llama cada columna de imputación cuando hay que nombrarla. Rótulos REALES de Compras. */
const ROTULO = Object.freeze({
  categoria: 'Categoría', unidad: 'Unidad de Negocio', obra: 'Obra', detalle: 'Detalle',
})

const enPesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`
const plural = (n, uno, varios) => (n === 1 ? uno : varios)

/**
 * EL MENSAJE. Uno solo, y el mismo post se reescribe de «⏳ leyendo» a «✔ terminé».
 *
 * @param {object} p        el acumulado de la tanda
 * @param {{enVuelo?:number}} o  cuántos posts de la tanda siguen procesándose
 */
export function textoTanda(p = {}, { enVuelo = 0 } = {}) {
  const a = { ...parteVacia(), ...p }

  // ═══ MIENTRAS TRABAJA: SEÑAL DE VIDA, NO SILENCIO ═══
  //
  // El especialista tarda ~2m30s por post. Este repo ya decidió que un bot que calla se lee como un
  // bot colgado, y por eso se descartó la ventana de agrupación por inactividad: no hay que elegir
  // entre un solo mensaje y dar señal de vida — el mismo post hace las dos cosas.
  if (enVuelo > 0) {
    const l = [`⏳ Recibí **${a.recibidos} ${plural(a.recibidos, 'comprobante', 'comprobantes')}**, los estoy leyendo…`]
    if (a.cargados) l.push(`_Van ${a.cargados} ${plural(a.cargados, 'cargado', 'cargados')}._`)
    return l.join('\n')
  }

  const l = []
  // 1) QUE TERMINÓ, Y CUÁNTOS ENTRARON. Es lo que pidió, en el primer renglón.
  if (a.cargados > 0) {
    const plata = a.suma ? ` — total ${enPesos(a.suma)}` : ''
    l.push(`✔ **Listo, terminé.** Cargué **${a.cargados} ${plural(a.cargados, 'comprobante', 'comprobantes')}** en Compras${plata}.`)
  } else if (a.recibidos > 0) {
    l.push(`✔ **Terminé, pero no cargué ninguno** de los ${a.recibidos} que mandaste.`)
  } else {
    l.push('✔ **Listo, terminé.** No había nada para cargar.')
  }

  // 2) CUÁNTOS YA ESTABAN. El segundo número que pidió, y el que evita que los mande de nuevo.
  if (a.yaEstaban > 0) {
    l.push(`_${a.yaEstaban} ya ${plural(a.yaEstaban, 'estaba cargado', 'estaban cargados')}: no ${plural(a.yaEstaban, 'lo volví', 'los volví')} a cargar._`)
  }
  if (a.copias > 0) {
    l.push(`_${a.copias} ${plural(a.copias, 'era otra foto', 'eran otras fotos')} de un comprobante que ya estaba en esta tanda._`)
  }

  // 3) LO QUE NO SE PUDO LEER. Breve y con el nombre del archivo: sin el nombre no se puede volver a
  //    mandar el que falta, y volver a mandar los doce es peor que no avisar.
  if (a.ilegibles.length) {
    l.push(`⚠ ${a.ilegibles.length} no ${plural(a.ilegibles.length, 'lo pude leer', 'los pude leer')}: ${a.ilegibles.map((i) => `\`${i.nombre}\``).join(' · ')}. Mandámelos de nuevo.`)
  }
  if (a.trabados.length) {
    l.push(`⚠ ${a.trabados.length} no ${plural(a.trabados.length, 'entró', 'entraron')}: ${a.trabados.map((t) => `\`${t.nombre}\` (${t.motivo})`).join(' · ')}.`)
  }

  // 4) LO QUE QUEDÓ SIN IMPUTAR. Con la fila, porque completarlo es abrir Compras e ir a esa línea.
  //    SIN pedirle que conteste: la celda vacía se completa en el Sheet, no en el chat.
  if (a.sinImputar.length) {
    const filas = a.sinImputar.map((s) => s.fila).filter((f) => f != null)
    const cols = [...new Set(a.sinImputar.flatMap((s) => s.campos ?? []))].map((c) => ROTULO[c] ?? c)
    const donde = filas.length ? ` (${plural(filas.length, 'fila', 'filas')} ${filas.join(', ')})` : ''
    const que = cols.length ? `: falta ${cols.join(', ')}` : ''
    l.push(`ℹ ${a.sinImputar.length} ${plural(a.sinImputar.length, 'quedó', 'quedaron')} sin imputar en Compras${donde}${que}.`)
  }

  for (const av of a.avisos) l.push(`⚠ ${av}`)
  return l.join('\n')
}
