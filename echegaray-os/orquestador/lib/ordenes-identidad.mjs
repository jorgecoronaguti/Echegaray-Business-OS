// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA IDENTIDAD DE UNA ORDEN Y LA CADENA QUE LA ATA A UNA OBRA — núcleo PURO, sin imports
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `ordenes-cliente.mjs` lee UN papel: qué clase es, qué número, qué fecha, qué importe. Acá vive lo
// que relaciona VARIOS papeles entre sí, que es una pregunta distinta:
//
//   · ¿estos dos papeles son la MISMA orden?      → `numeroCanonico`, `agruparPorNumero`
//   · ¿qué cita este papel?                       → `ocsCitadas`, `comprobantesCitados`
//   · ¿qué obra hereda de lo que cita?            → `mapaDeEvidencia`, `mapaDeCitas`, `obraPorReferencia`
//   · ¿este papel lo emitimos NOSOTROS?           → `comprobantePropio`, `facturaPropiaDe`
//
// Se separó de `ordenes-cliente.mjs` el 10/09/2026, cuando ese archivo pasó de 509 a 654 líneas: no
// es un corte cosmético por el tamaño, es la costura que ya estaba —leer un documento y cruzar
// documentos son dos trabajos— y que el crecimiento hizo visible. Sin imports a propósito: es la
// hoja del grafo, y así no puede haber ciclo con quien la use.

// ── IDENTIDAD DE LA ORDEN: EL NÚMERO CANÓNICO ───────────────────────────────────────────────────
//
// El mismo número de orden se escribe de tres formas según quién lo teclee: Messina emite
// «00002-00002162», su propia notificación de pago cita «OC 02- 00002162» (con el espacio adentro)
// y la factura que le mandamos dice «OC: 02-00002097». Comparar los tres como cadenas da tres
// órdenes distintas, y por eso la OC 2162 entró dos veces en `cliente_orden`: llegó en dos mails.
//
// El canónico tira los ceros a la izquierda de cada tramo y se queda con los dígitos: «2-2162».
// No sirve para mostrar —eso es `numeroCorto`— sino para decir «esto ya lo tengo».
export function numeroCanonico(numero) {
  const tramos = String(numero ?? '').match(/\d+/g)
  if (!tramos) return null
  const limpios = tramos.map((t) => t.replace(/^0+/, '') || '0').filter((t) => t !== '0')
  return limpios.length ? limpios.join('-') : null
}

/** Lo que se DIBUJA: el último tramo sin ceros. «00002-00002162» → «2162». La fila de una obra
 *  tiene 80px para esto y «00002-00002162» los gasta sin decir nada que el 2162 no diga. */
export function numeroCorto(numero) {
  const canon = numeroCanonico(numero)
  return canon ? canon.split('-').pop() : null
}

/** Todos los números de OC que este texto CITA, en canónico y sin repetir. Es lo que convierte una
 *  factura nuestra («Limpieza de Escombros Embolsado OC 02- 00002162») en evidencia de qué obra es
 *  esa OC, y lo que deja a una orden de pago colgada de la OC que paga. */
export function ocsCitadas(texto) {
  const t = String(texto ?? '')
  const salida = new Set()
  // Dos formas, y las dos exigen el rótulo entero: la sigla («OC 02- 00002162», como la escribe
  // nuestra factura) y la frase («Orden de compra 53016726», como la escribe ARCOR). Sin la
  // segunda, la factura que le emitimos a ARCOR no citaba ninguna orden y la cadena
  // factura → OC → obra se cortaba en el primer eslabón.
  const patrones = [
    /\bo\/?c\s*(?:n[°ºo.]*)?\s*[:#-]?\s*(\d{1,5}\s*-\s*\d{3,10}|\d{4,10})/gi,
    /\borden(?:es)?\s+de\s+compra\s*(?:n[°ºo.r]*)?\s*[:#-]?\s*(\d{1,5}\s*-\s*\d{3,10}|\d{4,10})/gi,
  ]
  for (const re of patrones) {
    for (const m of t.matchAll(re)) {
      const canon = numeroCanonico(m[1])
      if (canon) salida.add(canon)
    }
  }
  return [...salida]
}

/**
 * El comprobante que este PDF ES (una factura nuestra) o los que CITA (una orden de pago).
 *
 * Messina no cita la OC en su orden de pago: cita la FACTURA («FAC A0000100000225»). La cadena
 * completa es entonces OP → factura → OC → obra, y sin este eslabón la OP se queda sin obra aunque
 * la evidencia esté escrita. Devuelve claves «A-1-225».
 */
export function comprobantesCitados(texto) {
  const salida = new Set()
  for (const m of String(texto ?? '').matchAll(/\bfac\.?\s*([abcm])\s*(\d{4,5})(\d{8})\b/gi)) {
    salida.add(`${m[1].toUpperCase()}-${Number(m[2])}-${Number(m[3])}`)
  }
  return [...salida]
}

/** El comprobante que este PDF es, leído de su propio encabezado. null si no es una factura. */
export function comprobantePropio(texto) {
  const t = String(texto ?? '')
  const letra = t.match(/factura\s+([abcm])\b/i)
  const nro = t.match(/comp\.?\s*n(?:ro|°|º)\.?:?\s*(\d{4,5})\s+(\d{6,8})/i)
  if (!letra || !nro) return null
  return `${letra[1].toUpperCase()}-${Number(nro[1])}-${Number(nro[2])}`
}

// ── ATRIBUIR SIN ADIVINAR ───────────────────────────────────────────────────────────────────────

/**
 * A qué obra pertenece un documento que no la nombra, según los DEMÁS documentos ya atribuidos.
 *
 * `citadas` son las claves que este documento cita (números de OC canónicos o comprobantes) y
 * `obraPorClave` el mapa que arman los documentos que sí tienen obra. Devuelve
 * `{ obraId, porque }` o `{ obraId: null, porque }` — el motivo se escribe SIEMPRE, también cuando
 * no se pudo: una lista de nueve órdenes sin obra y sin motivo no le sirve a nadie para decidir.
 *
 * DOS OBRAS DISTINTAS ⇒ NADA. Una orden de pago que cancela tres facturas de tres obras no
 * pertenece a una de las tres: repartirla sería inventar. Queda a nivel cliente y se dice por qué.
 */
export function obraPorReferencia(citadas, obraPorClave) {
  const halladas = new Map()
  const sinRastro = []
  for (const c of citadas ?? []) {
    const obra = obraPorClave.get(c)
    if (obra) halladas.set(obra, [...(halladas.get(obra) ?? []), c])
    else sinRastro.push(c)
  }
  if (!citadas?.length) return { obraId: null, porque: 'el PDF no cita ninguna OC ni comprobante' }
  if (halladas.size === 1) {
    const [obraId, claves] = [...halladas.entries()][0]
    return { obraId, porque: `hereda la obra de ${claves.join(', ')}` }
  }
  if (halladas.size > 1) {
    return { obraId: null, porque: `cita ${citadas.join(', ')} y caen en ${halladas.size} obras distintas` }
  }
  return { obraId: null, porque: `cita ${sinRastro.join(', ')}, que no está en el OS` }
}

/**
 * UNA SOLA FILA POR ORDEN. Agrupa por (tipo, número canónico) y devuelve un grupo por orden real,
 * con todas sus filas adentro: la OC 2162 llegó dos veces —la orden que emitió Messina y la
 * factura nuestra que la cita— y son dos papeles de UNA orden, no dos órdenes.
 *
 * Las filas SIN número no se agrupan entre sí: dos documentos sin número no son el mismo documento,
 * y unirlos por «ninguno de los dos tiene número» sería el peor de los inventos.
 */
export function agruparPorNumero(filas) {
  const grupos = new Map()
  const salida = []
  for (const f of filas ?? []) {
    const canon = numeroCanonico(f.numero)
    const clave = canon ? `${f.tipo}::${canon}` : null
    if (clave && grupos.has(clave)) { grupos.get(clave).filas.push(f); continue }
    const g = { clave: clave ?? `sola::${f.id}`, tipo: f.tipo, numero: f.numero, filas: [f] }
    if (clave) grupos.set(clave, g)
    salida.push(g)
  }
  return salida
}

/**
 * EL MAPA CONTRA EL QUE SE HEREDA: clave → obra, armado sólo con los documentos que YA tienen obra.
 *
 * Cada documento entra por su número canónico («2-2173») y, si es una factura nuestra, por su
 * comprobante («A-1-225»). Y entra TAMBIÉN por su número corto («2173»), porque el papel se cita
 * como se habla: la OC 2256 dice «ADICIONAL OC 2173, CONSTRUCCION DEL TERCER MURO» y sin la clave
 * corta esa cita se leía como «no está en el OS» — un motivo falso, que es peor que no atribuir.
 *
 * LA CLAVE CORTA SE CAE SOLA CUANDO ES AMBIGUA: si dos órdenes de puntos de venta distintos
 * terminan en el mismo número y apuntan a obras distintas, «2173» deja de significar algo y se
 * borra. Heredar por una clave ambigua es exactamente la adivinanza que esto no hace.
 */
export function mapaDeEvidencia(docs) {
  const mapa = new Map()
  const cortas = new Map()
  for (const d of docs ?? []) {
    if (!d.obra_id) continue
    const canon = numeroCanonico(d.numero)
    if (canon) {
      mapa.set(canon, d.obra_id)
      const corta = canon.split('-').pop()
      if (corta !== canon) cortas.set(corta, cortas.has(corta) && cortas.get(corta) !== d.obra_id ? null : d.obra_id)
    }
    if (d.comprobante) mapa.set(d.comprobante, d.obra_id)
  }
  for (const [corta, obraId] of cortas) if (obraId && !mapa.has(corta)) mapa.set(corta, obraId)
  return mapa
}

/**
 * LA FECHA DE LA ORDEN, que no es la primera fecha del papel.
 *
 * MEDIDO el 10/09/2026 contra las cinco OC del bucket: las cinco quedaron fechadas «22/08/86». El
 * encabezado de Messina trae «Fecha Inicio Act. 22-08-86» —cuándo abrió la empresa— antes que la
 * fecha de la orden, que además viene con espacios adentro («Mendoza - 11 /08 /2026»). La primera
 * fecha que encontraba `extraerFecha` era la del año 1986 leído como 2086.
 *
 * Por eso se busca por ETIQUETA primero y sólo después a ciegas, y toda fecha fuera de una ventana
 * razonable se descarta: un documento administrativo de esta empresa no es de 2086 ni de 1986.
 */

// ── LA FACTURA NUESTRA NO ES UNA ORDEN DE COMPRA ────────────────────────────────────────────────
//
// MEDIDO el 10/09/2026: seis de las dieciséis filas de `cliente_orden` estaban guardadas como
// `orden_compra` y son FACTURAS A EMITIDAS POR NOSOTROS. Se colaron porque la regla de tipo mira el
// nombre del archivo («OC 02-00002162.pdf») y el detalle de la factura cita la OC que factura. El
// resultado era una pantalla que dibujaba dos órdenes de compra donde el cliente emitió una sola, y
// le atribuía a Messina un papel que Messina no firmó.
//
// LA EVIDENCIA QUE MANDA ES EL ENCABEZADO DEL PROPIO PDF, no el nombre ni la cita: si el documento
// dice «FACTURA A» y trae su «Comp. Nro», ES esa factura. Sigue siendo evidencia de la obra —cita
// la OC y describe el trabajo—, por eso no se descarta: cambia de clase.
export const TIPOS = Object.freeze(['orden_compra', 'orden_pago', 'retencion', 'factura', 'otro'])

/**
 * Qué es REALMENTE este documento, con el PDF ya leído. Devuelve `{ tipo, numero, cita }`:
 *   · `numero` de una factura es SU comprobante («A-1-225»), no el de la OC que cita — guardar ahí
 *     el número ajeno es lo que hacía que dos papeles distintos parecieran la misma orden;
 *   · `cita` es la OC que la factura nombra, en canónico. Es lo que deja el rótulo «Factura 225 ·
 *     cita OC 2162» y lo que ata la factura a la orden sin fingir que la reemplaza.
 * `null` cuando el PDF no se declara factura: no se fuerza nada y el tipo previo queda como está.
 */
export function facturaPropiaDe(texto) {
  const comprobante = comprobantePropio(texto)
  if (!comprobante) return null
  const citadas = ocsCitadas(texto)
  return { tipo: 'factura', numero: comprobante, cita: citadas.length === 1 ? citadas[0] : null }
}

/**
 * EL CAMINO INVERSO DE LA HERENCIA: clave de OC → obra, según los documentos que la CITAN.
 *
 * `mapaDeEvidencia` responde «¿qué obra tiene la OC que yo cito?». Ésta responde la otra mitad: la
 * factura nuestra describe el trabajo («Construccion de platea... PLAYON DE AZUFRE») y por eso el
 * OS le encuentra obra; la OC del cliente, en cambio, a veces sólo trae el código de centro de
 * costo. Sin este mapa, la obra que la factura ya probó no llegaba nunca a la OC que factura.
 *
 * Hasta el 10/09 esa herencia existía por accidente: la factura quedaba guardada con el número de
 * la OC y `agruparPorNumero` las juntaba como si fueran el mismo papel. Al separar los tipos eso
 * desaparece, y lo que era un efecto colateral pasa a ser una regla escrita y probada.
 *
 * DOS OBRAS PARA LA MISMA OC ⇒ LA CLAVE SE CAE. Dos facturas de obras distintas citando la misma OC
 * significa que la cita no distingue nada: heredar ahí sería sortear.
 */
export function mapaDeCitas(docs) {
  const mapa = new Map()
  for (const d of docs ?? []) {
    if (!d.obra_id) continue
    for (const c of d.citadas ?? []) {
      if (!/^\d/.test(c)) continue // los comprobantes («A-1-225») no son OC: no dan obra a nadie
      mapa.set(c, mapa.has(c) && mapa.get(c) !== d.obra_id ? null : d.obra_id)
    }
  }
  for (const [c, obraId] of [...mapa]) if (!obraId) mapa.delete(c)
  return mapa
}
