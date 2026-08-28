// LA OFERTA NO ES OTRO PRESUPUESTO: ES LA REPRESENTACIÓN DE UNO. NÚCLEO PURO: SIN FS NI BASE.
//
// ═══ LO QUE MOSTRÓ EL LIBRO, MEDIDO (28/08/2026) ═══
//
// En `Planilla para Cotizar (2).xlsm` la hoja `OFERTA` tiene 130 fórmulas que apuntan a
// `Presupuesto`: cada renglón trae su código, su nombre, su unidad, su cantidad y su precio
// unitario de la fila que le corresponde. Es, casi entera, una VISTA.
//
// Casi. La fila 39 dice:
//
//     B39 = "PERSIANAS METALICAS" · C39 = "UN" · D39 = 2 · E39 = 4200000 · F39 = D39*E39
//
// Tipeada. Sin código, sin análisis, sin composición, sin recursos, sin HH. Y suma
// **$ 8.400.000** al subtotal que ve el cliente. La cuenta cierra al peso:
//
//     OFERTA!F44 (SUB TOTAL)        163.288.969,04
//     Presupuesto!K52 (Σ precios)   154.888.969,71
//     diferencia                      8.400.000,00   ← exactamente las persianas
//
//   y en el total, 197.579.652,54 contra 187.415.653,40 = 10.164.000 = 8.400.000 × 1,21.
//
// Ocho millones cuatrocientos mil pesos que no existen en el presupuesto interno, que no tienen
// costo, que no aportan margen conocido y que nadie puede explicar seis meses después. Ese es el
// defecto que este módulo bloquea.
//
// ═══ LA FUGA ENTRE CLIENTES NO ES UNA CURIOSIDAD: ES EL ARCHIVO QUE SE MANDA POR MAIL ═══
//
// `OFERTA!7` guarda CINCO clientes en la misma fila, uno por bloque de columnas:
//
//     A7  QUATTOPANI FRANCO                     ← el que se está cotizando
//     G7  MANUFACTURAS QUIMICAS JUAN MESSINAS
//     K7  FIMA S.A.
//     O7  JAVIER SANCHEZ
//     S7  ORICA ARGENTINA SAIC
//
// con sus direcciones en la fila 8 y sus alcances en la 10. El `Print_Area` es `A1:F73`, así que
// al imprimir sólo sale el primero — pero el `.xlsm` se manda entero, y las otras cuatro ofertas
// viajan adentro. En `OFERTA ARCOR` es peor: el único renglón que trae del presupuesto es
// «EXCAVACIONES DE BASES Y ZANJAS PARA FUNDACIONES» debajo de un título que dice «COLOCACIÓN DE
// CERAMICOS – OFICINA RRHH», y las columnas F:H llevan un cuaderno de saldos de terceros
// («banco −16,5», «paneles −9,8», «alumetal −2,3»).
//
// Por eso `CROSS_CLIENT_DATA_LEAK` no es un hallazgo informativo: **bloquea la emisión**. Un
// control que detecta y deja pasar es un control que no sirve para lo único que importaba.
//
// ═══ POR QUÉ EL CIERRE EN ERROR TAMBIÉN BLOQUEA ═══
//
// Dos de las catorce planillas medidas en el estudio histórico tienen el SUB TOTAL, el IVA y el
// TOTAL en `#DIV/0!` o `#NAME?`, con un valor cacheado al lado que vale 7. Una oferta sin total
// no se emite, y el 7 no la salva.
//
// LO QUE ESTE MÓDULO NO HACE: no arma la oferta, no la formatea y no elige el adaptador de
// salida. Contesta una sola pregunta —¿cada peso de esta oferta puede decir de dónde salió?— y,
// cuando la respuesta es no, dice exactamente cuál no puede.

import { ESTADO, estadoDe } from './estado-valor.mjs'
import { normalizar, refCelda } from './cotizacion-ecsas.mjs'

/** De dónde salió un renglón de la oferta. */
export const ORIGEN = Object.freeze({
  PRESUPUESTO: 'PRESUPUESTO',   // existe en el presupuesto interno, con código o por nombre
  MANUAL: 'MANUAL',             // lo tipeó una persona en la oferta: no tiene genealogía
})

/** Lo que impide emitir. Todos bloquean; ninguno es informativo. */
export const BLOQUEO = Object.freeze({
  PARTIDA_SIN_GENEALOGIA: 'PARTIDA_SIN_GENEALOGIA',
  CROSS_CLIENT_DATA_LEAK: 'CROSS_CLIENT_DATA_LEAK',
  CIERRE_EN_ERROR: 'CIERRE_EN_ERROR',
  SUBTOTAL_NO_CIERRA: 'SUBTOTAL_NO_CIERRA',
})

/** Un peso de diferencia sobre un subtotal de cientos de millones es redondeo, no un hallazgo. */
export const TOLERANCIA_SUBTOTAL = 1

/**
 * EL ÍNDICE DEL PRESUPUESTO INTERNO, por código y por nombre. PURA.
 *
 * Se indexa por los dos porque la oferta no siempre trae el código: `OFERTA ARCOR` lo esconde y
 * muestra sólo la descripción. Buscar únicamente por código diría que TODA esa oferta es manual,
 * que es falso y taparía el hallazgo real, que es uno solo.
 */
export function indexarPresupuesto(items = []) {
  const porCodigo = new Map()
  const porNombre = new Map()
  for (const it of items) {
    if (it.codigo) porCodigo.set(normalizar(it.codigo), it)
    const n = normalizar(it.tarea ?? it.nombre)
    if (n && !porNombre.has(n)) porNombre.set(n, it)
  }
  return { porCodigo, porNombre }
}

/**
 * ¿DE DÓNDE SALIÓ ESTE RENGLÓN? PURA.
 *
 * @returns {{origen:string, por:string|null, presupuesto:object|null, porque:string}}
 */
export function genealogiaDeItem(item = {}, indice = { porCodigo: new Map(), porNombre: new Map() }) {
  const cod = normalizar(item.codigo)
  if (cod && indice.porCodigo.has(cod)) {
    return { origen: ORIGEN.PRESUPUESTO, por: 'codigo', presupuesto: indice.porCodigo.get(cod), porque: `el código ${item.codigo} está en el presupuesto interno` }
  }
  const nom = normalizar(item.tarea ?? item.nombre)
  if (nom && indice.porNombre.has(nom)) {
    return { origen: ORIGEN.PRESUPUESTO, por: 'nombre', presupuesto: indice.porNombre.get(nom), porque: 'la descripción coincide con una partida del presupuesto interno' }
  }
  return {
    origen: ORIGEN.MANUAL,
    por: null,
    presupuesto: null,
    porque: cod
      ? `ni el código ${item.codigo} ni la descripción existen en el presupuesto interno`
      : 'la descripción no existe en el presupuesto interno y el renglón no trae código',
  }
}

/**
 * LOS DATOS DE OTRO CLIENTE QUE VIAJAN EN LA MISMA HOJA. PURA.
 *
 * Mira la franja de encabezado —lo que hay ARRIBA de la fila de ítems— y a la DERECHA de la última
 * columna de la oferta. Ahí es donde el libro guarda las ofertas anteriores, y ahí no hay ninguna
 * razón legítima para que haya texto.
 *
 * @param {unknown[][]} filas
 * @param {{filaEncabezado:number, ultimaColumna:number}} area
 * @returns {{hay:boolean, casos:Array<{texto:string, celda:string}>}}
 */
export function fugaEntreClientes(filas = [], { filaEncabezado = 0, ultimaColumna = 0 } = {}) {
  const casos = []
  for (let f = 0; f < Math.min(filaEncabezado, filas.length); f++) {
    const fila = filas[f] ?? []
    for (let c = ultimaColumna + 1; c < fila.length; c++) {
      const e = estadoDe(fila[c])
      // Un número suelto a la derecha puede ser una cuenta auxiliar; un NOMBRE no tiene excusa.
      if (e.estado !== ESTADO.UNKNOWN || !e.texto) continue
      casos.push({ texto: e.texto.replace(/\s+/g, ' ').trim().slice(0, 80), celda: refCelda(c, f) })
    }
  }
  return { hay: casos.length > 0, casos }
}

/**
 * LA AUDITORÍA COMPLETA DE UNA OFERTA ANTES DE EMITIRLA.
 *
 * @param {object} p
 * @param {{items:Array, subtotal?:object, total?:object, encabezado?:object}} p.oferta  de `leerOferta()`
 * @param {{items:Array}} p.presupuesto                                                  de `leerPresupuesto()`
 * @param {unknown[][]} [p.filasDeLaOferta]  las filas crudas, para buscar la fuga entre clientes
 * @returns {{puedeEmitirse:boolean, bloqueos:Array, items:Array, conciliacion:object}}
 */
export function auditarOferta({ oferta, presupuesto, filasDeLaOferta = null } = {}) {
  const indice = indexarPresupuesto(presupuesto?.items ?? [])
  const items = (oferta?.items ?? []).map((it) => ({ ...it, genealogia: genealogiaDeItem(it, indice) }))
  const manuales = items.filter((i) => i.genealogia.origen === ORIGEN.MANUAL)

  const bloqueos = []
  for (const m of manuales) {
    bloqueos.push({
      tipo: BLOQUEO.PARTIDA_SIN_GENEALOGIA,
      donde: m.celda ?? null,
      que: m.tarea ?? null,
      importe: estadoDe(m.subtotal).numero,
      porque: m.genealogia.porque,
    })
  }

  if (filasDeLaOferta && oferta?.encabezado) {
    const fuga = fugaEntreClientes(filasDeLaOferta, {
      filaEncabezado: oferta.encabezado.fila,
      ultimaColumna: Math.max(...Object.values(oferta.encabezado.columnas ?? { 0: 0 })),
    })
    for (const c of fuga.casos) {
      bloqueos.push({ tipo: BLOQUEO.CROSS_CLIENT_DATA_LEAK, donde: c.celda, que: c.texto, importe: null, porque: 'hay texto de otra oferta fuera del área de la oferta actual, en el mismo archivo que se manda al cliente' })
    }
  }

  const conciliacion = conciliar(items, oferta?.subtotal)
  if (conciliacion.cierre === ESTADO.ERROR) {
    bloqueos.push({ tipo: BLOQUEO.CIERRE_EN_ERROR, donde: oferta?.subtotal?.celda ?? null, que: oferta?.subtotal?.error ?? null, importe: null, porque: 'el SUB TOTAL de la oferta es un error de fórmula: esta oferta no tiene total' })
  } else if (conciliacion.diferencia !== null && Math.abs(conciliacion.diferencia) > TOLERANCIA_SUBTOTAL) {
    bloqueos.push({ tipo: BLOQUEO.SUBTOTAL_NO_CIERRA, donde: oferta?.subtotal?.celda ?? null, que: null, importe: conciliacion.diferencia, porque: `el SUB TOTAL declarado difiere de la suma de los renglones en ${conciliacion.diferencia}` })
  }

  return { puedeEmitirse: bloqueos.length === 0, bloqueos, items, conciliacion }
}

/**
 * SUBTOTAL DECLARADO CONTRA LO QUE SE PUEDE RASTREAR. PURA.
 *
 * `conGenealogia` es el número que el presupuesto interno respalda; `sinGenealogia` es lo que se
 * agregó en la salida. Su suma tiene que dar el declarado — y cuando no da, la diferencia dice
 * dónde está el agujero en vez de esconderlo adentro de un total.
 */
export function conciliar(items = [], subtotalDeclarado = null) {
  let conGenealogia = 0
  let sinGenealogia = 0
  const noNumericos = []
  for (const it of items) {
    const e = estadoDe(it.subtotal)
    if (e.numero === null) { noNumericos.push({ donde: it.celda ?? null, estado: e.estado, porque: e.porque }); continue }
    if (it.genealogia?.origen === ORIGEN.MANUAL) sinGenealogia += e.numero
    else conGenealogia += e.numero
  }
  // El error se mira ANTES que el valor: `leerOferta` trae los dos, y el valor que Excel dejó
  // cacheado debajo de un `#DIV/0!` vale 7. Ver `celda.mjs`.
  const roto = Boolean(subtotalDeclarado?.error)
  const declarado = roto ? { estado: ESTADO.ERROR, numero: null } : estadoDe(subtotalDeclarado?.valor ?? null)
  const cierre = declarado.estado
  const valorDeclarado = declarado.numero
  return {
    conGenealogia,
    sinGenealogia,
    sumaDeRenglones: conGenealogia + sinGenealogia,
    declarado: valorDeclarado,
    cierre,
    diferencia: valorDeclarado === null ? null : Number((valorDeclarado - (conGenealogia + sinGenealogia)).toFixed(2)),
    noNumericos,
  }
}
