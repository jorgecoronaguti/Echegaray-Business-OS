// QUÉ SINCRONIZAR EN EL REGISTRO DE "Cheques Emitidos". NÚCLEO PURO, SIN RED NI BASE.
//
// ═══ POR QUÉ EXISTE (30/07) ═══
//
// El registro de la pestaña lo carga el dueño a mano, y una columna la decide el banco: DEBITADO
// —¿el cheque ya salió de la cuenta?—. De ese dato depende la única cifra con la que se decide en esa
// pestaña ("con esto podés pagar" = plata disponible − cheques firmados no debitados), así que un
// DEBITADO en "No" cuando el banco ya lo pagó infla el comprometido y esconde plata que existe.
//
// Hasta hoy la fuente de ese sync era `ECHEQS_EMITIDOS`: un array ESCRITO A MANO en
// banco-santander.mjs, con corte congelado. Un array a mano no es una fuente: envejece sin gritar
// —el defecto que ya congeló el espejo de JORNALES y el IPC en este mismo archivo— y obliga a editar
// código cada vez que el banco emite un cheque. Ahora la fuente es `public.cheques`, que se llena por
// `importar-cheques.mjs` (con verificación del cierre de la orden de pago y cruce contra el extracto).
//
// ═══ LA TRAMPA QUE OBLIGA A CRUZAR POR INSTRUMENTO + NÚMERO ═══
//
// El registro tiene el número 313 DOS VECES: como FISICO (Corralón Progreso, $470.945) y como ECHEQ
// (Maderas Lliteras, $383.175). Son dos cheques distintos: las chequeras física y electrónica numeran
// por separado. Cruzar sólo por número marca el DEBITADO del cheque equivocado —y encima sin dar
// error—. La clave es (instrumento, número), nunca el número solo.
//
// ═══ LO QUE ESTE NÚCLEO NO HACE ═══
//
// No inventa un cheque MUERTO. Un echeq anulado o repudiado no se agrega ni se cuenta como pendiente:
// un repudiado suele ser el duplicado de uno que sí se pagó, y contarlo sería inventar una deuda.
// Y no borra ni reordena NADA del registro: sólo corrige la columna DEBITADO y agrega al final lo que
// falta. Las filas son del dueño.

// La misma definición de "¿este N° de comprobante sirve para cruzar?" que usa el cruce contra
// Compras. Si acá se avisara con otro criterio, el sync diría "está" sobre un número que el cruce
// después descarta, y el aviso perdería sentido justo donde tiene que servir.
import { normComprobante, esLlaveUtil } from './cheques-cobertura.mjs'

/** Sólo dígitos y sin ceros a la izquierda: "00000303" y "303" son el mismo cheque. */
export const norm = (n) => String(n ?? '').replace(/\D/g, '').replace(/^0+/, '')

/**
 * NÚCLEO PURO: LOS CHEQUES QUE ENTRAN —O YA ESTÁN— SIN N° DE COMPROBANTE.
 *
 * ═══ POR QUÉ SE AVISA ACÁ Y NO SEIS MESES DESPUÉS (05/08) ═══
 *
 * `filaRegistro` no escribe la columna del N° de comprobante, y no puede: el banco informa el cheque,
 * no la factura que paga. O sea que TODO cheque que entra por esta puerta nace sin la llave que
 * después necesita el cruce contra Compras. Medido el 05/08: 50 cheques del registro sin N°, y 11
 * todavía no debitados por $8.424.279 cuya cobertura no se puede afirmar de ninguna manera. Ese hueco
 * no se descubrió al cargarlos: se descubrió meses después, cuando alguien fue a conciliar y encontró
 * un número que no se podía verificar en el momento en que se usa para decidir.
 *
 * El dato lo tiene quien firmó el cheque, y lo tiene EN EL MOMENTO. Diez segundos ahí valen más que
 * cualquier cruce por importe después — y el cruce por importe, medido, recupera 2 de 11.
 *
 * SÓLO LOS NO DEBITADOS del registro. Un cheque ya debitado sin N° también es un hueco, pero es un
 * hueco de archivo: su plata ya salió y ya está dentro del saldo del banco. Mezclarlos convertía el
 * aviso en una lista de 50 que nadie iba a leer.
 *
 * @param {{registro?:Array<{fila:number, nroComp?:string, debitado?:string, proveedor?:string, monto?:*}>, agregar?:Array}} args
 * @returns {{yaEnElRegistro:Array, seEstanAgregando:Array}}
 */
export function sinComprobante({ registro = [], agregar = [] } = {}) {
  const falta = (v) => !esLlaveUtil(normComprobante(v))
  return {
    yaEnElRegistro: registro.filter((r) => falta(r.nroComp) && String(r.debitado ?? '').trim().toUpperCase() !== 'SI'),
    // Los que este sync está por agregar: nacen sin N° por construcción, no hace falta mirarles nada.
    seEstanAgregando: agregar,
  }
}

/**
 * El estado del banco → la marca del desplegable DEBITADO (estricto: "SI"/"No", esa mayúscula exacta).
 * null = no se toca: el cheque está muerto (anulado, repudiado, rechazado) o el estado no se conoce.
 */
export function debitadoDe(estado) {
  const e = String(estado ?? '').trim().toLowerCase()
  if (e === 'pagado') return 'SI'
  if (e === 'aceptado' || e === 'por aceptar' || e === 'en custodia') return 'No'
  return null
}

/**
 * El instrumento con el que se emitió, para poder cruzar contra la columna "Tipo" del registro.
 * Se DEDUCE de la procedencia declarada del cheque, no se adivina: los que entran por la pantalla de
 * eCHEQs del banco son ECHEQ. Si no se puede afirmar, devuelve null y el cheque no se agrega —antes
 * que ponerlo en la chequera equivocada, se reporta.
 */
export function instrumentoDe(c) {
  const t = `${c?.origen ?? ''} ${c?.cuenta ?? ''}`.toLowerCase()
  if (/echeq|e-cheq/.test(t)) return 'ECHEQ'
  if (/f[íi]sico|chequera/.test(t)) return 'FISICO'
  return null
}

/** La clave del cruce: instrumento + número. El número SOLO confunde el FISICO 313 con el ECHEQ 313. */
export const clave = (instrumento, numero) => `${String(instrumento ?? '').toUpperCase()}|${norm(numero)}`

/** Índices (0-based) de las columnas del registro. Se verifican contra el encabezado real. */
export const COL = { tipo: 0, numero: 1, emision: 2, cuit: 3, proveedor: 4, monto: 5, tipoComp: 6, nroComp: 7, pago: 8, debitado: 10, unidad: 11 }
/** Los rótulos que tiene que tener el encabezado del registro para que estos índices sean válidos. */
export const ENCABEZADO_ESPERADO = { 0: /^tipo$/i, 1: /^nro$/i, 5: /^monto$/i, 8: /fecha de pago/i, 10: /^debitado$/i }

/**
 * ¿El encabezado del registro sigue siendo el que estos índices asumen?
 *
 * POR QUÉ. El dueño edita esta pestaña; si inserta o borra una columna, TODO lo que viene después se
 * corre y el sync escribiría el DEBITADO sobre otra columna sin dar error. Misma defensa que ya usa
 * el generador de Proveedores contra Compras: ubicar por ENCABEZADO, y si no coincide, ABORTAR.
 * @returns {string[]} los problemas encontrados; vacío = el layout es el esperado
 */
export function verificarEncabezado(fila = []) {
  const problemas = []
  for (const [i, re] of Object.entries(ENCABEZADO_ESPERADO)) {
    const visto = String(fila?.[Number(i)] ?? '').trim()
    if (!re.test(visto)) problemas.push(`columna ${String.fromCharCode(65 + Number(i))} dice "${visto || '∅'}" y se esperaba ${re}`)
  }
  return problemas
}

/** "2026-08-15" → "15/08/2026". El registro es es-AR y una fecha al revés no da error, da el día equivocado. */
export function aFechaAR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/**
 * EL PLAN: qué corregir y qué agregar, comparando la base contra el registro que hay en la pestaña.
 *
 * @param {object[]} base filas de public.cheques (tipo='emitido')
 * @param {object[]} registro [{fila, tipo, numero, debitado}] leído de la pestaña
 * @returns {{updates:object[], agregar:object[], muertos:object[], sinInstrumento:object[], soloEnPestana:object[], iguales:number}}
 */
export function planSync(base = [], registro = []) {
  const enPestana = new Map()
  for (const r of registro) {
    const k = clave(r.tipo, r.numero)
    if (norm(r.numero)) enPestana.set(k, r)
  }

  const updates = []; const agregar = []; const muertos = []; const sinInstrumento = []
  const vistos = new Set()
  let iguales = 0

  for (const c of base) {
    const marca = debitadoDe(c.estado)
    if (!marca) { muertos.push(c); continue }
    const inst = instrumentoDe(c)
    if (!inst) { sinInstrumento.push(c); continue }
    const k = clave(inst, c.numero)
    vistos.add(k)
    const enP = enPestana.get(k)
    if (!enP) { agregar.push({ ...c, instrumento: inst, debitado: marca }); continue }
    if (String(enP.debitado ?? '').trim() !== marca) {
      updates.push({ fila: enP.fila, instrumento: inst, numero: norm(c.numero), de: enP.debitado || '∅', a: marca })
    } else iguales++
  }

  // LA OTRA DIRECCIÓN, QUE TAMBIÉN IMPORTA: cheques que la pestaña tiene y la base no. No se tocan
  // —el registro es del dueño y tiene los físicos, que el banco no lista— pero se REPORTAN: es la
  // medida de cuánto del registro todavía no pasa por la puerta de entrada del OS.
  const soloEnPestana = registro.filter((r) => norm(r.numero) && !vistos.has(clave(r.tipo, r.numero)))
  return { updates, agregar, muertos, sinInstrumento, soloEnPestana, iguales }
}

/** La fila que se agrega al registro. Respeta el ancho ROTULADO (A–L): no escribe fuera del cuadro. */
export function filaRegistro(c) {
  const f = Array(12).fill('')
  f[COL.tipo] = c.instrumento
  f[COL.numero] = norm(c.numero)
  f[COL.cuit] = c.contraparte_cuit ?? ''
  f[COL.proveedor] = c.contraparte ?? ''
  f[COL.monto] = Number(c.importe) || 0
  f[COL.pago] = aFechaAR(c.fecha_pago)
  f[COL.debitado] = c.debitado
  f[COL.unidad] = c.obra ?? ''
  return f
}
