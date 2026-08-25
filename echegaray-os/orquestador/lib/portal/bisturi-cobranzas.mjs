// EL BISTURÍ SOBRE LA PESTAÑA COBRANZAS — qué celda, qué valor, y cuándo NO escribir.
//
// Núcleo puro: entra lo que se leyó de la fila y el cambio pedido; sale la lista exacta de celdas a
// escribir, o un rechazo con motivo. No toca Google. Todo lo peligroso de esta operación vive acá
// justamente para poder probarlo sin escribir en el Sheet real — que es la regla que este repo pagó
// seis veces.
//
// ═══ EL MAPA DE COLUMNAS, LEÍDO DEL SHEET VIVO (25/08/2026) ═══
//
//   J (idx 9)  Monto neto            ← campo `monto`
//   K (idx 10) IVA                     (no se escribe; ver ABAJO por qué manda)
//   L (idx 11) Retenciones / descuentos
//   M (idx 12) TOTAL a cobrar          = `=J+K-L`, fórmula
//   N (idx 13) Forma de Cobro        ← campo `medio`
//   O (idx 14) Estado                 ← campo `estado_cobrado`
//   Q (idx 16) Fecha cobro            ← campo `fecha`  · LA PALANCA DEL COBRO
//   W (idx 22) Notas                 ← la traza, SIEMPRE APENDADA
//
// El contrato decía que H era «un rótulo con s/ total …». Es falso: H es ORDEN DE COMPRA. El mapa de
// acá está leído del archivo real, no del contrato.

/** Sheets cuenta los días desde el 30/12/1899. Verificado: 3/2/2026 = 46056 y 6/1/2026 = 46028. */
const EPOCA = Date.UTC(1899, 11, 30)

export const COLUMNA = Object.freeze({
  monto: 'J', medio: 'N', estado_cobrado: 'O', fecha: 'Q', nota: 'W',
})

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
 * ¿SE PUEDE TOCAR J SIN ROMPER EL IVA?
 *
 * M es `=J+K-L`. Cuando K es la fórmula `=J*0,21`, escribir J arrastra K y M sale bien. Pero en la
 * pestaña real hay filas donde K es un NÚMERO PEGADO (la fila 5 tiene 1999200 literal): ahí escribir
 * J deja el IVA del importe viejo y el TOTAL a cobrar queda mal, en silencio y con efecto fiscal.
 *
 * No se adivina la alícuota de la fila ni se «arregla» K: se RECHAZA nombrando la celda. Cambiar un
 * IVA es una decisión con efecto fiscal y la toma una persona mirando la fila, no un worker.
 */
export function puedeEscribirMonto(formulas, fila) {
  const K = String(formulas?.K ?? '').trim()
  const M = String(formulas?.M ?? '').trim()

  const mEsperada = new RegExp(`^=\\s*J${fila}\\s*\\+\\s*K${fila}\\s*-\\s*L${fila}\\s*$`, 'i')
  if (!mEsperada.test(M)) {
    return { ok: false, motivo: 'total_no_deriva', detalle: `M${fila} no es «=J${fila}+K${fila}-L${fila}» sino «${M || '(vacío)'}»: escribir J dejaría el total viejo` }
  }
  if (K === '') return { ok: true }                       // fila sin IVA: J y M cierran solos
  if (esFormula(K) && new RegExp(`J${fila}`, 'i').test(K)) return { ok: true }

  return { ok: false, motivo: 'iva_literal', detalle: `K${fila} es un valor fijo («${K}») y no seguiría a J: el IVA y el total quedarían del importe viejo` }
}

/** La traza se APENDA. La columna W es «Notas» y tiene lo que escribió el dueño. */
export function notaApendada(notaActual, linea) {
  const previo = String(notaActual ?? '').trim()
  if (!linea) return previo || null
  return previo ? `${previo}\n${linea}` : linea
}

/**
 * EL PLAN DE ESCRITURA. Devuelve `{ celdas, rechazo }` — nunca las dos cosas.
 *
 * `celdas` son rangos A1 absolutos y sus valores, listos para `batchUpdateValues` con USER_ENTERED.
 */
export function planificarEscritura({ fila, cambio, leido = {}, formulas = {}, nota = null } = {}) {
  const rechazo = (motivo, detalle) => ({ celdas: [], rechazo: { motivo, detalle } })

  if (!Number.isInteger(fila) || fila < 5) {
    return rechazo('fila_invalida', `la fila ${fila} no es un renglón de datos (los datos empiezan en la 5)`)
  }
  const huella = verificarHuella(leido, cambio)
  if (!huella.ok) return rechazo(huella.motivo, huella.detalle)

  const celdas = []
  const campo = cambio?.campo
  const valor = cambio?.valor_nuevo

  if (campo === 'fecha') {
    const serial = serialDeFecha(valor)
    if (serial === null) return rechazo('valor_invalido', `«${valor}» no es una fecha`)
    celdas.push({ rango: `Cobranzas!Q${fila}`, valor: serial })
  } else if (campo === 'monto') {
    const permiso = puedeEscribirMonto(formulas, fila)
    if (!permiso.ok) return rechazo(permiso.motivo, permiso.detalle)
    const n = Number(valor)
    if (!Number.isFinite(n)) return rechazo('valor_invalido', `«${valor}» no es un importe`)
    celdas.push({ rango: `Cobranzas!J${fila}`, valor: n })
  } else if (campo === 'medio') {
    const rotulo = ROTULO_MEDIO[String(valor ?? '').toLowerCase()]
    if (!rotulo) return rechazo('valor_invalido', `«${valor}» no es un medio conocido (transferencia/cheque/efectivo)`)
    celdas.push({ rango: `Cobranzas!N${fila}`, valor: rotulo })
  } else if (campo === 'estado_cobrado') {
    // El único estado que la app puede poner. «Cobrado» es el rótulo exacto que leen las fórmulas de
    // las columnas U y V: cualquier variante («cobrado», «COBRADO») las deja sin coincidir.
    celdas.push({ rango: `Cobranzas!O${fila}`, valor: 'Cobrado' })
  } else {
    return rechazo('campo_desconocido', `«${campo}» no tiene celda asignada`)
  }

  if (nota) {
    const texto = notaApendada(leido?.nota, nota)
    celdas.push({ rango: `Cobranzas!W${fila}`, valor: texto })
  }
  return { celdas, rechazo: null }
}
