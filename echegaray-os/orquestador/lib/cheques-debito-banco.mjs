// QUÉ CHEQUE SALIÓ DE LA CUENTA, SEGÚN EL BANCO — Y CUÁNDO NO SE PUEDE SABER.
//
// ═══ POR QUÉ EXISTE (03/08) ═══
//
// El FÍSICO 223 de Corralón ($200.000) figuraba "vencido sin debitar" en Cheques Emitidos: el tramo
// que la pestaña rotula "averiguar por qué — o el proveedor no lo presentó, o se perdió". No se había
// perdido nada: salió el 20/07 y el banco lo escribió "Canje interno recibido 24 hs". El OS sólo
// entendía "Cheque debitado", así que un cheque cobrado se leía como una alerta.
//
// El Santander escribe la MISMA salida de al menos cuatro maneras ("Cheque debitado", "Canje interno
// recibido 24 hs", "Echeq canje interno recibido 24hs", "Echeq clearing recibido"), y entre descargas
// cambia mayúsculas, espacios y el pegado de "24hs". Por eso acá no se acumulan literales: se
// NORMALIZA el concepto y recién entonces se compara. Un literal más por variante es una deuda que se
// paga con un cheque mal leído.
//
// ═══ LA TRAMPA QUE ESTE MÓDULO NO PUEDE VOLVER A PISAR ═══
//
// EL NÚMERO NO IDENTIFICA UN CHEQUE. En el registro real conviven FISICO 313 (Corralón, $470.945) y
// ECHEQ 313 (Maderas, $383.175) — y lo mismo con el 310, 311 y 312. La clave es (instrumento, número).
// La referencia bancaria "000000223" trae el número y NO el instrumento: el banco sólo lo declara
// cuando el concepto empieza con "Echeq". Cuando no lo declara, el instrumento se resuelve por
// corroboración (importe) y, si dos instrumentos siguen siendo posibles, el resultado es AMBIGUO con
// motivo. Marcar debitado el cheque equivocado deja vivo uno que ya salió y mata uno que no: emparejar
// mal es peor que no emparejar.
//
// NO ESCRIBE NADA. Devuelve el diagnóstico; quién lo aplica y dónde es decisión de quien escribe.
//
// Distinto de `banco-conceptos.mjs`: aquel contesta "¿estos dos textos son EL MISMO movimiento?"
// (identidad, para deduplicar) y por eso no puede tocar tildes ni unidades —fusionaría movimientos
// distintos—. Éste contesta "¿de qué habla este concepto?" (semántica). Son dos preguntas, dos
// funciones.

/**
 * El concepto listo para comparar por SIGNIFICADO: minúsculas, sin tildes, sin puntuación, espacios
 * colapsados, "24 hs" / "24 horas" → "24hs" y "e-cheq" → "echeq".
 * @param {unknown} s
 * @returns {string}
 */
export function normalizarConcepto(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tildes: "recibído" y "recibido" son lo mismo
    .replace(/[^a-z0-9]+/g, ' ')                      // guiones, º, comas: el banco los pone y los saca
    .replace(/\be\s+cheq/g, 'echeq')                   // "e-cheq" y "e cheq" son el mismo instrumento
    .replace(/\b(\d+)\s*(hs|h|horas)\b/g, '$1hs')      // "24 hs" = "24hs" = "24 horas"
    .replace(/\s+/g, ' ')
    .trim()
}

/** Los dos instrumentos del registro. El banco sólo nombra el ECHEQ; el FÍSICO nunca se declara. */
export const INSTRUMENTOS = ['FISICO', 'ECHEQ']

/**
 * Los conceptos con los que el banco anuncia que un cheque SALIÓ de la cuenta.
 * `instrumento` es lo que el concepto DECLARA, no lo que se supone: null = el banco no lo dice.
 */
const SALIDAS = [
  { patron: /\becheq\b.*\b(clearing|canje)\b/, instrumento: 'ECHEQ' },
  { patron: /\bcheque debitado\b/, instrumento: null },
  { patron: /\bcanje interno recibido\b/, instrumento: null },
]

/** Un crédito nunca es un cheque que sale: "Deposito echeq 48hs" es un recibido que se acreditó. */
const ENTRADAS = /\bdeposito\b.*\becheq\b/

/**
 * ¿El concepto habla de cheques, en cualquier sentido? Reemplaza al literal
 * `/e-?cheq|cheque debitado|canje interno/i` que vivía suelto en `clasificarMovimiento`.
 * @param {unknown} concepto
 * @returns {boolean}
 */
export function esMovimientoDeCheques(concepto) {
  const c = normalizarConcepto(concepto)
  if (!c) return false
  return /\becheq\b/.test(c) || SALIDAS.some((s) => s.patron.test(c))
}

/**
 * ¿Este concepto anuncia la SALIDA de un cheque, y de qué instrumento?
 * @param {unknown} concepto
 * @returns {{familia:'sale_cheque', instrumentoDeclarado:'ECHEQ'|null}|null}
 */
export function familiaDebitoCheque(concepto) {
  const c = normalizarConcepto(concepto)
  if (!c || ENTRADAS.test(c)) return null
  const hit = SALIDAS.find((s) => s.patron.test(c))
  return hit ? { familia: 'sale_cheque', instrumentoDeclarado: hit.instrumento } : null
}

/**
 * El número comparable. El banco rellena con ceros ("000000223") y el registro no: comparados crudos
 * son dos cheques distintos y el 223 no se encuentra nunca.
 * @param {unknown} v
 * @returns {string|null} null si no hay número (una referencia vacía NO es una referencia)
 */
export function normalizarNumeroCheque(v) {
  const s = String(v ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return s === '' ? null : s
}

/** LA CLAVE DE UN CHEQUE. Nunca el número solo. */
export function claveCheque(c) {
  return `${String(c?.instrumento ?? '').toUpperCase()}|${normalizarNumeroCheque(c?.numero) ?? '∅'}`
}

const centavos = (n) => Math.round(Math.abs(Number(n) || 0) * 100)

/**
 * UN movimiento contra el registro, sin mirar a los demás. Devuelve el resultado o la razón por la
 * que no hay ninguno: cada rama declara qué le faltó, porque "no emparejó" sin motivo no se puede
 * revisar a mano.
 * @param {object} mov
 * @param {Map<string, object[]>} porNumero
 * @returns {{estado:string, clave?:string, cheque?:object, candidatos?:object[], motivo?:string}}
 */
function resolverMovimiento(mov, porNumero) {
  const fam = familiaDebitoCheque(mov?.concepto)
  if (!fam || (Number(mov?.importe) || 0) >= 0) return { estado: 'no_es_debito_de_cheque' }

  const num = normalizarNumeroCheque(mov?.referencia)
  if (!num) return { estado: 'sin_referencia', motivo: 'el banco no mandó referencia: el número de cheque no se puede deducir del importe' }

  const delNumero = porNumero.get(num) ?? []
  if (!delNumero.length) return { estado: 'sin_cheque', motivo: `ningún cheque del registro lleva el número ${num}` }

  // 1) El instrumento que el banco DECLARA manda sobre cualquier corroboración.
  const declarado = fam.instrumentoDeclarado
  const porInstrumento = declarado ? delNumero.filter((c) => String(c.instrumento).toUpperCase() === declarado) : delNumero
  if (!porInstrumento.length) return { estado: 'sin_cheque', motivo: `el banco declara ${declarado} y el ${num} del registro no es ${declarado}` }

  // 2) El importe corrobora cuál de los candidatos es. No es un empate a resolver: si no cierra, ese
  //    cheque no es éste — ni siquiera cuando es el único con ese número.
  const candidatos = porInstrumento.filter((c) => centavos(c.importe) === centavos(mov.importe))
  if (!candidatos.length) {
    return {
      estado: 'sin_cheque',
      candidatos: porInstrumento,
      motivo: `el número ${num} existe (${porInstrumento.map(claveCheque).join(', ')}) pero ningún importe coincide con el del banco`,
    }
  }
  if (candidatos.length > 1) {
    return {
      estado: 'ambiguo',
      candidatos,
      motivo: `la referencia ${num} trae el número pero no el instrumento, y ${candidatos.map(claveCheque).join(' y ')} `
        + 'coinciden también en importe: no se puede saber cuál salió',
    }
  }
  return { estado: 'emparejado', clave: claveCheque(candidatos[0]), cheque: candidatos[0], candidatos }
}

/**
 * NÚCLEO PURO — la conciliación de los débitos de cheque del extracto contra el registro.
 *
 * Un movimiento cae en exactamente uno de estos estados, y ninguno se resuelve adivinando:
 *   · emparejado            — clave (instrumento, número) única y con el importe corroborado
 *   · ambiguo               — más de un cheque posible, o la clave ya la tomó otro movimiento
 *   · sin_cheque            — el número no está en el registro, o ninguno de ese número cierra el importe
 *   · sin_referencia        — el banco no mandó número; emparejar por importe suelto ya se pagó caro
 *   · no_es_debito_de_cheque — el concepto no anuncia una salida de cheque (o es un crédito)
 *
 * @param {{fecha?:string, concepto?:string, importe?:number, referencia?:unknown}[]} movimientos
 * @param {{instrumento:string, numero:unknown, importe:number}[]} cheques
 * @returns {{resultados:object[], resumen:{emparejados:number, ambiguos:number, sin_cheque:number, sin_referencia:number}}}
 */
export function conciliarDebitosDeCheques(movimientos = [], cheques = []) {
  const porNumero = new Map()
  for (const c of cheques) {
    const n = normalizarNumeroCheque(c?.numero)
    if (!n) continue
    if (!porNumero.has(n)) porNumero.set(n, [])
    porNumero.get(n).push(c)
  }
  const tomadas = new Map() // clave → el movimiento que ya la explicó
  const resultados = []

  for (const mov of movimientos) {
    const r = resolverMovimiento(mov, porNumero)
    // UN CHEQUE NO SE DEBITA DOS VECES. El segundo movimiento que reclama la misma clave no es una
    // confirmación: o es un movimiento duplicado, o uno de los dos es de otro cheque. Se declara.
    const previo = r.estado === 'emparejado' ? tomadas.get(r.clave) : null
    if (previo) {
      resultados.push({ mov, estado: 'ambiguo', candidatos: r.candidatos, motivo: `${r.clave} ya fue emparejado con el movimiento del ${previo.fecha ?? 's/f'}: un cheque no se debita dos veces` })
      continue
    }
    if (r.estado === 'emparejado') tomadas.set(r.clave, mov)
    resultados.push({ mov, ...r })
  }

  const cuenta = (e) => resultados.filter((r) => r.estado === e).length
  return {
    resultados,
    resumen: {
      emparejados: cuenta('emparejado'),
      ambiguos: cuenta('ambiguo'),
      sin_cheque: cuenta('sin_cheque'),
      sin_referencia: cuenta('sin_referencia'),
    },
  }
}
