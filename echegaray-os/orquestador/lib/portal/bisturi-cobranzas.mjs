// EL BISTURÍ SOBRE LA PESTAÑA COBRANZAS — qué celda, qué valor, y cuándo NO escribir.
//
// Núcleo puro: entra lo que se leyó de la fila y el cambio pedido; sale la lista exacta de celdas a
// escribir, o un rechazo con motivo. No toca Google. Todo lo peligroso de esta operación vive acá
// justamente para poder probarlo sin escribir en el Sheet real — que es la regla que este repo pagó
// seis veces.
//
// ═══ QUÉ CAMPO VA A QUÉ COLUMNA — POR RÓTULO, NO POR LETRA (14/09/2026) ═══
//
//   Monto neto               ← campo `monto`
//   IVA                        (no se escribe; ver ABAJO por qué manda)
//   Retenciones / descuentos
//   TOTAL a cobrar           = neto + IVA − retenciones, fórmula
//   Forma de Cobro           ← campo `medio`
//   Estado                   ← campo `estado_cobrado`
//   Fecha cobro              ← campo `fecha`  · LA PALANCA DEL COBRO
//   Notas                    ← la traza, SIEMPRE APENDADA
//
// Hasta el 14/09 esto era `{ monto: 'J', fecha: 'Q', nota: 'W' }`. Con «Obra» insertada en H, la Q es
// «Mes cobro (auto)» y la W «Estado cobro»: el worker habría escrito la fecha de un cobro encima de
// una fórmula y la traza encima de otra, con la huella verificada y sin un error. Las letras salen de
// la fila de rótulos que el llamador leyó (`cols`, de `cobranzas-columnas.mjs`).

import { exigirColumnas } from '../cobranzas-columnas.mjs'

/** Sheets cuenta los días desde el 30/12/1899. Verificado: 3/2/2026 = 46056 y 6/1/2026 = 46028. */
const EPOCA = Date.UTC(1899, 11, 30)

/** Campo del cambio → clave de columna en `COBRANZAS_OS`. */
export const CAMPO_A_COLUMNA = Object.freeze({
  monto: 'neto', medio: 'formaCobro', estado_cobrado: 'estado', fecha: 'fechaCobro', nota: 'notas',
})

/** Las columnas que el bisturí necesita resueltas: las que escribe y las tres de la aritmética del total. */
export const COLUMNAS_BISTURI = Object.freeze(['comprobante', 'neto', 'iva', 'retenciones', 'total', 'formaCobro', 'estado', 'fechaCobro', 'notas'])

/**
 * LA FECHA SE ESCRIBE COMO NÚMERO DE SERIE, NUNCA COMO TEXTO.
 *
 * «3/2/2026» con USER_ENTERED depende de que el locale del archivo sea es-AR para significar 3 de
 * febrero y no 2 de marzo. El archivo HOY es es-AR, pero un valor cuyo significado depende de una
 * preferencia regional es una bomba de tiempo: el serial 46056 significa el mismo día en cualquier
 * locale del mundo. Ya hubo un parser que vació fechas por leer dd/mm/yy como mm/dd/yy.
 */
export function serialDeFecha(iso) {
  if (!iso) return null
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  return Math.round((t - EPOCA) / 86400000)
}

export function fechaDeSerial(serial) {
  const n = Number(serial)
  if (!Number.isFinite(n)) return null
  return new Date(EPOCA + n * 86400000).toISOString().slice(0, 10)
}

/** Los rótulos que la columna N ya usa en el Sheet. No se inventa vocabulario nuevo. */
const ROTULO_MEDIO = Object.freeze({
  transferencia: 'Transferencia', cheque: 'Echeq', efectivo: 'Efectivo',
})

/**
 * EL NETO DESDE UN BRUTO, COMO FÓRMULA ENTERA.
 *
 * En el Sheet ya existe `=10000000/1,21` (fila 48). Esa coma es el decimal en es-AR y funciona…
 * hasta que alguien copia el archivo a otro locale, donde `1,21` pasa a ser dos argumentos y la
 * fórmula se rompe. Nunca escribimos una coma decimal dentro de un paréntesis: la misma cuenta con
 * aritmética entera (`*100/121`) es exacta, legible y no depende de ninguna configuración regional.
 */
export function formulaNetoDesdeBruto(bruto, alicuotaPorCiento = 21) {
  const b = Number(bruto)
  const a = Number(alicuotaPorCiento)
  if (!Number.isFinite(b) || !Number.isInteger(a) || a < 0) return null
  return `=${b}*100/${100 + a}`
}

const esFormula = (v) => String(v ?? '').trim().startsWith('=')

/**
 * ¿ES ÉSTA LA FILA QUE CREÍAMOS?
 *
 * La columna A es `=IF(C5="";"";ROW()-4)`: el «ID» de una fila es su POSICIÓN. Entre que la pantalla
 * encola y el worker aplica, el dueño puede insertar una fila y correr todo lo de abajo. Escribir
 * «cobrado» en la fila corrida le cambia el estado a un cobro ajeno y descuadra la caja sin dejar
 * rastro. Por eso se compara contra lo que la pantalla vio.
 *
 * El monto se compara con tolerancia de un peso: J puede ser una fórmula (`=10000000/1,21`) cuyo
 * resultado tiene decimales que el redondeo del camino cambia. Un peso no confunde dos cobros.
 */
export function verificarHuella(leido, cambio) {
  const espComp = String(cambio?.huella_comprobante ?? '').trim()
  const espMonto = cambio?.huella_monto

  if (!espComp && (espMonto === null || espMonto === undefined)) {
    return { ok: false, motivo: 'sin_huella', detalle: 'el cambio se encoló sin huella: no se puede verificar la fila' }
  }
  if (espComp) {
    const real = String(leido?.comprobante ?? '').trim()
    if (real !== espComp) {
      return { ok: false, motivo: 'huella_distinta', detalle: `la fila tiene el comprobante «${real}» y se esperaba «${espComp}»` }
    }
  }
  if (espMonto !== null && espMonto !== undefined) {
    const real = Number(leido?.monto_neto)
    if (!Number.isFinite(real) || Math.abs(real - Number(espMonto)) > 1) {
      return { ok: false, motivo: 'huella_distinta', detalle: `la fila tiene neto ${real} y se esperaba ${espMonto}` }
    }
  }
  return { ok: true }
}

/**
 * ¿SE PUEDE TOCAR EL NETO SIN ROMPER EL IVA?
 *
 * El total es `=neto+IVA-retenciones` (hoy `=J+K-L`). Cuando el IVA es la fórmula `=J*0,21`, escribir
 * el neto arrastra el IVA y el total sale bien. Pero en la pestaña real hay filas donde el IVA es un
 * NÚMERO PEGADO (la fila 5 tiene 1999200 literal): ahí escribir el neto deja el IVA del importe viejo
 * y el TOTAL a cobrar queda mal, en silencio y con efecto fiscal.
 *
 * No se adivina la alícuota de la fila ni se «arregla» el IVA: se RECHAZA nombrando la celda. Cambiar
 * un IVA es una decisión con efecto fiscal y la toma una persona mirando la fila, no un worker.
 *
 * @param {{iva?:string, total?:string}} formulas las fórmulas de la fila, por clave de columna
 * @param {Record<string,{letra:string}>} cols columnas resueltas por encabezado
 */
export function puedeEscribirMonto(formulas, fila, cols) {
  const { neto: { letra: N }, iva: { letra: I }, retenciones: { letra: R }, total: { letra: T } } =
    exigirColumnas(cols, ['neto', 'iva', 'retenciones', 'total'], 'puedeEscribirMonto')
  const iva = String(formulas?.iva ?? '').trim()
  const total = String(formulas?.total ?? '').trim()

  const esperada = `=${N}${fila}+${I}${fila}-${R}${fila}`
  const totalEsperado = new RegExp(`^=\\s*${N}${fila}\\s*\\+\\s*${I}${fila}\\s*-\\s*${R}${fila}\\s*$`, 'i')
  if (!totalEsperado.test(total)) {
    return { ok: false, motivo: 'total_no_deriva', detalle: `${T}${fila} no es «${esperada}» sino «${total || '(vacío)'}»: escribir ${N} dejaría el total viejo` }
  }
  if (iva === '') return { ok: true }                     // fila sin IVA: neto y total cierran solos
  if (esFormula(iva) && new RegExp(`(^|[^A-Z])${N}${fila}(?!\\d)`, 'i').test(iva)) return { ok: true }

  return { ok: false, motivo: 'iva_literal', detalle: `${I}${fila} es un valor fijo («${iva}») y no seguiría a ${N}: el IVA y el total quedarían del importe viejo` }
}

/** La traza se APENDA. La columna «Notas» tiene lo que escribió el dueño. */
export function notaApendada(notaActual, linea) {
  const previo = String(notaActual ?? '').trim()
  if (!linea) return previo || null
  return previo ? `${previo}\n${linea}` : linea
}

/**
 * EL PLAN DE ESCRITURA. Devuelve `{ celdas, rechazo }` — nunca las dos cosas.
 *
 * `celdas` son rangos A1 absolutos y sus valores, listos para `batchUpdateValues` con USER_ENTERED.
 * `cols` son las columnas de Cobranzas resueltas contra la fila de rótulos VIVA (`COLUMNAS_BISTURI`).
 */
export function planificarEscritura({ fila, cambio, leido = {}, formulas = {}, nota = null, cols } = {}) {
  const rechazo = (motivo, detalle) => ({ celdas: [], rechazo: { motivo, detalle } })

  if (!Number.isInteger(fila) || fila < 5) {
    return rechazo('fila_invalida', `la fila ${fila} no es un renglón de datos (los datos empiezan en la 5)`)
  }
  const huella = verificarHuella(leido, cambio)
  if (!huella.ok) return rechazo(huella.motivo, huella.detalle)

  exigirColumnas(cols, COLUMNAS_BISTURI, 'planificarEscritura')
  const celda = (campoDelCambio) => `Cobranzas!${cols[CAMPO_A_COLUMNA[campoDelCambio]].letra}${fila}`
  const celdas = []
  const campo = cambio?.campo
  const valor = cambio?.valor_nuevo

  if (campo === 'fecha') {
    const serial = serialDeFecha(valor)
    if (serial === null) return rechazo('valor_invalido', `«${valor}» no es una fecha`)
    celdas.push({ rango: celda('fecha'), valor: serial })
  } else if (campo === 'monto') {
    const permiso = puedeEscribirMonto(formulas, fila, cols)
    if (!permiso.ok) return rechazo(permiso.motivo, permiso.detalle)
    const n = Number(valor)
    if (!Number.isFinite(n)) return rechazo('valor_invalido', `«${valor}» no es un importe`)
    celdas.push({ rango: celda('monto'), valor: n })
  } else if (campo === 'medio') {
    const rotulo = ROTULO_MEDIO[String(valor ?? '').toLowerCase()]
    if (!rotulo) return rechazo('valor_invalido', `«${valor}» no es un medio conocido (transferencia/cheque/efectivo)`)
    celdas.push({ rango: celda('medio'), valor: rotulo })
  } else if (campo === 'estado_cobrado') {
    // El único estado que la app puede poner. «Cobrado» es el rótulo exacto que leen las fórmulas de
    // «Monto ponderado» y «Días hasta vto.»: cualquier variante («cobrado», «COBRADO») las deja sin coincidir.
    celdas.push({ rango: celda('estado_cobrado'), valor: 'Cobrado' })
  } else {
    return rechazo('campo_desconocido', `«${campo}» no tiene celda asignada`)
  }

  if (nota) {
    const texto = notaApendada(leido?.nota, nota)
    celdas.push({ rango: celda('nota'), valor: texto })
  }
  return { celdas, rechazo: null }
}
