// EL PAGO DE UNA FILA DE «COMPRAS», EN NÚCLEO PURO — qué celdas se escriben y qué queda diciendo la fila.
//
// ═══ EL PEDIDO (dueño, 16/09/2026) ═══
//
// *«tenés que replicar las funciones de pagado y montos o montos parciales que tiene la pestaña
// Compras del Sheet Flujo de Fondos en Compras de app.ecsas.com.ar y en Proveedores […] para que las
// pueda usar directamente en la app, esto impacte en Supabase y quede reflejado también en el Sheet»*.
//
// ═══ LAS COLUMNAS DE PAGO NO SON SEIS DECLARACIONES: SON DOS TRAMOS Y TRES DERIVADAS ═══
//
// Medido y ya publicado en `deuda-por-tramos.mjs` (18/08/2026, sobre 1.151 filas leídas con render
// FORMULA, no con valores):
//
//   tramo 1 → `Fecha prevista de pago (día)` + `Monto Pagado`
//   tramo 2 → `Fecha prevista de pago 2`     + `Monto Parcial 2`
//
//   · `Monto Parcial 1` **NO ES UN TRAMO**: en 716 de sus 717 celdas con contenido es la fórmula
//     `=T-O`, o sea el saldo que queda DESPUÉS del primer tramo, con signo negativo. No hay una sola
//     celda con un negativo tipeado a mano en toda la pestaña. Escribirle un valor MATA la fórmula de
//     esa fila para siempre, y no aporta nada: la aritmética del saldo no la usa. **No se escribe.**
//   · `Estado pago` es la fórmula del semáforo (`compras-valores.mjs`), derivada de `Estado` y de la
//     fecha prevista. **No se escribe.**
//   · `Saldo pendiente (OS)` es una ARRAYFORMULA anclada en la fila 4 que derrama la columna entera
//     (`deuda-por-tramos.mjs · formulaSaldoPendiente`). Escribirle un valor encima **mata la columna
//     entera desde la fila 4**, no una fila. **No se escribe.**
//
// Lo que sí se escribe son las celdas de ENTRADA, y cuáles son no lo decide este archivo: sale de
// `comprobantes/contrato-columnas.mjs`, que es el contrato A→AN con su test de regresión. Una segunda
// lista escrita a mano acá se separaría del contrato el día que el contrato cambie — que es
// exactamente el defecto que el contrato vino a cerrar. Ver `ESCRIBIBLES`.
//
// ═══ LA ARITMÉTICA ES LA DE LA PLANILLA, LETRA POR LETRA ═══
//
// La propia pestaña decide el estado con esta fórmula, viva en 619 filas:
//
//     IF(ABS(T+W-O)<1;"Pagado";IF(T+W<O;"Pendiente";"Revisar"))
//
// `estadoCalculado` es esa expresión y nada más. Si la app escribiera un estado con otro criterio, la
// fila diría «Pagado» y la columna `Saldo pendiente (OS)` —que suma toda la pestaña Proveedores—
// diría otra cosa, sin un solo error en pantalla.
//
// ═══ LO QUE ESTE ARCHIVO NO HACE ═══
//
// No toca Google, no toca Postgres y no sabe en qué fila del Sheet vive la compra: eso es del bisturí
// (`bisturi-compras-pago.mjs`) y del worker. Acá sólo entra lo que la réplica dice de la fila y la
// acción pedida, y sale el conjunto de celdas y la proyección de cómo queda la fila.

import { PAGADO, PENDIENTE, TOL, pagadoDeTramos } from './deuda-por-tramos.mjs'
import { COMPRAS } from './columnas-por-encabezado.mjs'
import { DECLARACION, NATURALEZA } from './comprobantes/contrato-columnas.mjs'
import { SEMAFORO } from './glifos.mjs'

/** El tercer estado de la fórmula de la planilla: se pagó MÁS que el total. Nunca lo produce la app. */
export const REVISAR = 'Revisar'

/** Los rótulos que intervienen en un pago. Los tres derivados están nombrados para poder NEGARLOS. */
export const ROTULOS_PAGO = Object.freeze({
  tipoPago: COMPRAS.tipoPago,
  totalParcial: COMPRAS.totalParcial,
  pagado: COMPRAS.pagado,
  fechaPrevista2: COMPRAS.fechaPrevista2,
  parcial2: COMPRAS.parcial2,
  estado: COMPRAS.estado,
})

/** Las tres que la planilla calcula sola. Escribir cualquiera de ellas rompe algo que hoy funciona. */
export const DERIVADAS = Object.freeze([COMPRAS.parcial1, 'Estado pago', COMPRAS.saldo])

/**
 * QUÉ CELDA PUEDE ESCRIBIR UN PAGO, DERIVADO DEL CONTRATO A→AN — no de una lista escrita acá.
 *
 * Una columna es escribible si el contrato dice que la completa una PERSONA, o que la escribe el
 * CARGADOR, o que es fórmula por fila que **el cargador ya pisa** (`pisaElCargador`: hoy `Monto
 * Pagado` y `Estado`, declarado y congelado por `contrato-columnas.test.mjs`). Todo lo demás —fórmula
 * por fila que nadie pisa, ARRAYFORMULA— queda afuera por construcción.
 *
 * El día que alguien saque `pisaElCargador` de `Estado`, este conjunto se achica solo y el plan de
 * pago deja de proponer esa celda. Eso es lo que se busca: una sola declaración.
 */
export const ESCRIBIBLES = Object.freeze(new Set(
  DECLARACION
    .filter((c) => c.naturaleza === NATURALEZA.PERSONA
      || c.naturaleza === NATURALEZA.CARGADOR
      || (c.naturaleza === NATURALEZA.FORMULA_FILA && c.pisaElCargador === true))
    .map((c) => c.rotulo),
))

/**
 * Rótulo de la columna → la clave con la que la fila viaja en `compra_sheet` y en `filaACompra`.
 *
 * Vive acá y no en el bisturí porque la usan los dos lados del viaje: el que arma el plan y el que lo
 * aplica. Dos mapas serían dos opiniones sobre qué columna es «Monto Pagado».
 */
export const CLAVE_POR_ROTULO = Object.freeze({
  [ROTULOS_PAGO.tipoPago]: 'tipo_pago',
  [ROTULOS_PAGO.totalParcial]: 'pago_total_o_parcial',
  [ROTULOS_PAGO.pagado]: 'monto_pagado',
  [ROTULOS_PAGO.fechaPrevista2]: 'fecha_prevista_2',
  [ROTULOS_PAGO.parcial2]: 'monto_parcial_2',
  [ROTULOS_PAGO.estado]: 'estado',
})

/** La especie de cada celda que un pago escribe: decide cómo se manda y cómo se relee. */
export const ESPECIE_PAGO = Object.freeze({
  [ROTULOS_PAGO.tipoPago]: 'texto',
  [ROTULOS_PAGO.totalParcial]: 'texto',
  [ROTULOS_PAGO.pagado]: 'importe',
  [ROTULOS_PAGO.fechaPrevista2]: 'fecha',
  [ROTULOS_PAGO.parcial2]: 'importe',
  [ROTULOS_PAGO.estado]: 'texto',
})

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0)
/** Dos decimales: el peso los tiene por ley y «Total» es `=Importe+IVA`, con su cola binaria. */
export const pesos = (n) => Math.round(num(n) * 100) / 100
const txt = (v) => String(v ?? '').trim()

/** Lo pagado de una fila: los DOS tramos. Sale de `deuda-por-tramos`, no se reimplementa. */
export const pagadoDeCompra = (c = {}) => pagadoDeTramos({ pagado: c.monto_pagado, parcial2: c.monto_parcial_2 })

/** El saldo por aritmética pura: `O − T − W`. Sin mirar el estado. */
export const saldoDeCompra = (c = {}) => pesos(num(c.total) - pagadoDeCompra(c))

/**
 * EL ESTADO QUE CALCULA LA PROPIA PLANILLA: `IF(ABS(T+W-O)<1;"Pagado";IF(T+W<O;"Pendiente";"Revisar"))`.
 * @param {{total:any, monto_pagado:any, monto_parcial_2:any}} c
 */
export function estadoCalculado(c = {}) {
  const t = pagadoDeCompra(c)
  const o = num(c.total)
  if (Math.abs(t - o) < TOL) return PAGADO
  return t < o ? PENDIENTE : REVISAR
}

/**
 * EL SEMÁFORO DE `Estado pago`, EN JS — la misma decisión que la fórmula de `compras-valores.mjs`.
 *
 * No se escribe nunca: se proyecta, para que la app pueda mostrar hoy lo que el Sheet va a mostrar
 * cuando recalcule. La rareza de la fórmula se conserva a propósito: `Q<TODAY()` con `Q` en TEXTO da
 * falso en Sheets (un texto es mayor que cualquier número), así que una fila «Pendiente» con la fecha
 * prevista escrita como palabra dibuja «Por vencer» aunque haya vencido. Arreglarlo cambia lo que el
 * dueño ve en su pestaña y es decisión suya (ver `cuentas-por-pagar.mjs`): acá se REPRODUCE.
 *
 * @param {{total:any, estado:any, fecha_prevista:any}} c `fecha_prevista` en ISO, o null/texto
 * @param {string} hoy ISO del día
 */
export function semaforoDe(c = {}, hoy) {
  if (txt(c.total) === '' || num(c.total) === 0) return ''
  const e = txt(c.estado)
  if (e === PAGADO) return `${SEMAFORO.pagado} Pagado`
  if (e === 'Vencido') return `${SEMAFORO.vencido} Vencido`
  if (e === PENDIENTE) {
    const f = txt(c.fecha_prevista)
    const vencida = /^\d{4}-\d{2}-\d{2}$/.test(f) && f < txt(hoy)
    return vencida ? `${SEMAFORO.vencido} Vencido` : `${SEMAFORO.porVencer} Por vencer`
  }
  if (e === 'Proyectado') return `${SEMAFORO.vigente} Vigente`
  return e
}

/**
 * EL SALDO COMO LO VA A DECIR LA COLUMNA `Saldo pendiente (OS)`, o `null` si no se puede probar.
 *
 * La ARRAYFORMULA es `IF((Estado="Pendiente")*(comercial=1); O-T-W; 0)`, y `¿Proveedor comercial?
 * (OS)` NO está en la réplica. En vez de suponerla, se deduce de la fila tal como está HOY: si su
 * saldo publicado es coherente con la regla, el flag se conoce; si no, se devuelve `null` y quien
 * muestre el número dice que todavía no lo confirmó el Sheet. Inventar el flag haría que la app
 * publique una deuda que la pestaña Proveedores no tiene.
 */
export function saldoPublicadoProyectado(compra = {}, estadoNuevo, saldoNuevo) {
  const aritmetica = saldoDeCompra(compra)
  const pendienteHoy = txt(compra.estado) === PENDIENTE
  const publicado = num(compra.saldo_pendiente)
  let comercial = null
  if (pendienteHoy && aritmetica > TOL) comercial = publicado > TOL
  else if (!pendienteHoy && publicado === 0) comercial = null
  if (comercial === null) return null
  return estadoNuevo === PENDIENTE && comercial ? saldoNuevo : 0
}

const error = (motivo) => ({ error: motivo })

/** ¿Qué tramo queda libre? 1, 2, o `null` si los dos están usados. */
export function tramoLibre(compra = {}) {
  if (num(compra.monto_pagado) <= TOL) return 1
  if (num(compra.monto_parcial_2) <= TOL) return 2
  return null
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Una celda del plan. `valor` es canónico (número o ISO); `escribir` es lo que va al Sheet. */
function celda(rotulo, valor, anterior) {
  const especie = ESPECIE_PAGO[rotulo]
  return { rotulo, especie, valor, anterior: anterior ?? null, escribir: paraElSheet(valor, especie) }
}

/**
 * CÓMO VIAJA UN VALOR AL SHEET. El archivo está en locale es-AR y se escribe con `USER_ENTERED`:
 *   · un número va como NÚMERO (un `"1234,56"` dependería de que Google acierte el locale);
 *   · una fecha va como el texto `dd/mm/yyyy`, que es lo que una persona tipearía en ese archivo.
 */
export function paraElSheet(valor, especie) {
  if (especie === 'importe') return pesos(valor)
  if (especie === 'fecha') {
    if (!ISO.test(txt(valor))) return ''
    const [a, m, d] = txt(valor).split('-')
    return `${d}/${m}/${a}`
  }
  return txt(valor)
}

/** Las celdas que de verdad cambian algo. Una celda que ya dice lo pedido no se escribe. */
function soloLasQueCambian(celdas) {
  return celdas.filter((c) => {
    if (c.escribir === '' || c.escribir === null) return false
    if (c.especie === 'importe') return Math.abs(pesos(c.valor) - pesos(c.anterior)) >= 0.005
    return txt(c.valor) !== txt(c.anterior)
  })
}

/** Las validaciones que no dependen de la acción. Devuelve el motivo, o null. */
function revisarLaFila(compra) {
  if (!compra) return 'no tengo la fila de la compra'
  if (compra.anulada) return 'la fila está anulada: no se le registra un pago'
  if (num(compra.total) <= 0) return 'la fila no tiene Total cargado: sin total no hay saldo que pagar'
  return null
}

/**
 * EL PLAN DE UN PAGO. Devuelve `{celdas, proyeccion}` o `{error}`.
 *
 * @param {{compra:object, accion:{tipo:'total'|'parcial', monto?:number, fecha?:string,
 *   fechaResto?:string, medio?:string|null}, hoy:string}} p
 *   `compra` es la fila de `compra_sheet` · `fecha` = el día del pago (ISO) · `fechaResto` = la fecha
 *   prevista del saldo que queda (ISO), obligatoria cuando el parcial usa el tramo 1 y deja resto.
 */
export function planDePago({ compra, accion, hoy } = {}) {
  const malo = revisarLaFila(compra)
  if (malo) return error(malo)
  const falta = saldoDeCompra(compra)
  if (falta <= TOL) return error('la compra ya está saldada: no queda saldo')

  const tramo = tramoLibre(compra)
  if (tramo === null) {
    return error('los dos tramos de pago de la pestaña ya están usados (Monto Pagado y Monto Parcial 2): '
      + 'lo que falte se completa en el Sheet')
  }
  const monto = accion?.tipo === 'total' ? falta : pesos(accion?.monto)
  if (!(monto > 0)) return error('el monto tiene que ser mayor que cero')
  if (monto > falta + TOL) return error(`el monto supera el saldo: faltan $${falta.toLocaleString('es-AR')}`)
  const salda = monto >= falta - TOL
  if (!salda && tramo === 2) {
    return error('la pestaña tiene dos tramos de pago y el primero ya está usado: un parcial que no '
      + 'salda no tiene dónde guardar la fecha del resto')
  }
  const fecha = ISO.test(txt(accion?.fecha)) ? txt(accion.fecha) : txt(hoy)
  if (!ISO.test(fecha)) return error('falta la fecha del pago')
  if (!salda && !ISO.test(txt(accion?.fechaResto))) {
    return error('falta la fecha prevista del saldo que queda')
  }
  return armar({ compra, accion, tramo, monto, salda, fecha, hoy })
}

/** Las celdas y la proyección, una vez que el pago ya pasó todas las validaciones. */
function armar({ compra, accion, tramo, monto, salda, fecha, hoy }) {
  const despues = { ...compra }
  const celdas = []
  if (tramo === 1) {
    despues.monto_pagado = pesos(num(compra.monto_pagado) + monto)
    celdas.push(celda(ROTULOS_PAGO.pagado, despues.monto_pagado, num(compra.monto_pagado)))
    if (!salda) {
      despues.fecha_prevista_2 = txt(accion.fechaResto)
      celdas.push(celda(ROTULOS_PAGO.fechaPrevista2, despues.fecha_prevista_2, compra.fecha_prevista_2))
    }
  } else {
    despues.monto_parcial_2 = pesos(num(compra.monto_parcial_2) + monto)
    despues.fecha_prevista_2 = fecha
    celdas.push(celda(ROTULOS_PAGO.parcial2, despues.monto_parcial_2, num(compra.monto_parcial_2)))
    celdas.push(celda(ROTULOS_PAGO.fechaPrevista2, fecha, compra.fecha_prevista_2))
  }
  despues.pago_total_o_parcial = salda ? 'Total' : 'Parcial'
  celdas.push(celda(ROTULOS_PAGO.totalParcial, despues.pago_total_o_parcial, compra.pago_total_o_parcial))
  despues.estado = estadoCalculado(despues)
  celdas.push(celda(ROTULOS_PAGO.estado, despues.estado, compra.estado))
  if (txt(accion?.medio)) celdas.push(celda(ROTULOS_PAGO.tipoPago, txt(accion.medio), compra.tipo_pago))
  if (txt(accion?.medio)) despues.tipo_pago = txt(accion.medio)

  const cambian = soloLasQueCambian(celdas)
  if (!cambian.length) return error('la fila ya dice exactamente eso: no hay nada que escribir')
  const fuera = cambian.filter((c) => !ESCRIBIBLES.has(c.rotulo))
  if (fuera.length) return error(`el contrato de columnas no deja escribir: ${fuera.map((c) => c.rotulo).join(' · ')}`)
  return { celdas: cambian, proyeccion: proyectar(despues, hoy, compra) }
}

/**
 * Cómo queda la fila para la app, incluidas las tres celdas que la planilla calcula sola.
 *
 * `antes` es la fila ORIGINAL y no es un lujo: el flag «¿Proveedor comercial?» se deduce de si la
 * fila publicaba saldo, y una vez que el pago la deja en «Pagado» esa deducción ya no se puede hacer.
 * Proyectando contra la fila de después, el saldo publicado quedaba `null` en todo pago total.
 */
export function proyectar(despues, hoy, antes = despues) {
  const saldoNuevo = saldoDeCompra(despues)
  return {
    tipo_pago: despues.tipo_pago ?? null,
    pago_total_o_parcial: despues.pago_total_o_parcial ?? null,
    monto_pagado: pesos(despues.monto_pagado),
    monto_parcial_2: pesos(despues.monto_parcial_2),
    fecha_prevista_2: despues.fecha_prevista_2 ?? null,
    estado: despues.estado ?? null,
    // Las tres derivadas: se PROYECTAN, nunca se escriben.
    monto_parcial_1: pesos(pesos(despues.monto_pagado) - num(despues.total)),
    estado_pago: semaforoDe(despues, hoy),
    saldo_aritmetico: saldoNuevo,
    saldo_pendiente: saldoPublicadoProyectado(antes, despues.estado, saldoNuevo),
  }
}

/**
 * EL PLAN INVERSO: devolver las celdas a lo que decían antes.
 *
 * Se arma con las celdas del cambio que se está deshaciendo, no recalculando: lo que hay que reponer
 * es exactamente lo que había, y volver a deducirlo abriría la puerta a reponer otra cosa.
 *
 * Una celda cuyo valor anterior era VACÍO no se puede deshacer desde un worker: `no-borrar.mjs` —la
 * única guarda del repo sin bypass— revierte toda escritura vacía sobre una celda con contenido. Se
 * declara en `sinDeshacer` en vez de fingir que se pudo.
 */
export function planDeDeshacer(celdas = []) {
  const reponer = []
  const sinDeshacer = []
  for (const c of celdas ?? []) {
    const especie = ESPECIE_PAGO[c.rotulo]
    if (!especie) { sinDeshacer.push({ rotulo: c.rotulo, motivo: 'no es una celda de pago' }); continue }
    // El `0` NO es un vacío: `no-borrar.mjs` lo declara DATO y lo deja pasar (el arqueo de caja del
    // dueño es cero). Lo que no se puede reponer es el string vacío.
    const escribir = paraElSheet(c.anterior, especie)
    if (escribir === '') {
      sinDeshacer.push({ rotulo: c.rotulo, motivo: 'antes estaba vacía y no-borrar no deja vaciarla desde un worker' })
      continue
    }
    reponer.push({ rotulo: c.rotulo, especie, valor: c.anterior, anterior: c.valor, escribir })
  }
  if (!reponer.length) return error('no hay ninguna celda que se pueda devolver a su valor anterior')
  return { celdas: reponer, sinDeshacer }
}

/** Una fila con las celdas aplicadas encima. No muta la de entrada. */
export function aplicarCeldasDePago(compra = {}, celdas = []) {
  const out = { ...compra }
  for (const c of celdas ?? []) {
    const k = CLAVE_POR_ROTULO[c?.rotulo]
    if (k) out[k] = c.valor
  }
  return out
}

/**
 * DESHACER COMPLETO: las celdas a reponer Y cómo queda la fila, con lo que no se pudo declarado.
 *
 * Es lo que la acción del servidor necesita para llamar a la RPC: el plan inverso solo no alcanza,
 * porque la base verifica los INVARIANTES contra la proyección y hay que decirle cómo va a quedar.
 * Y la proyección NO es `previo`: las celdas que antes estaban vacías no se pueden devolver desde un
 * worker, así que la fila queda parecida a antes, no idéntica. Se calcula lo que de verdad va a
 * quedar en vez de prometer lo que se querría.
 */
export function planDeDeshacerCompleto({ compra, celdas, hoy } = {}) {
  const inverso = planDeDeshacer(celdas)
  if (inverso.error) return inverso
  const despues = aplicarCeldasDePago(compra, inverso.celdas)
  despues.estado = estadoCalculado(despues)
  const yaEsta = inverso.celdas.find((c) => c.rotulo === ROTULOS_PAGO.estado)
  if (yaEsta) yaEsta.valor = despues.estado
  else if (txt(despues.estado) !== txt(compra?.estado)) {
    inverso.celdas.push(celda(ROTULOS_PAGO.estado, despues.estado, compra?.estado))
  }
  return { celdas: inverso.celdas, sinDeshacer: inverso.sinDeshacer, proyeccion: proyectar(despues, hoy, compra) }
}

/**
 * ¿LA RELECTURA PRUEBA LA ESCRITURA? Por especie, porque lo releído no vuelve como se mandó.
 *
 * Un importe releído sin formato vuelve como número con cola binaria; una fecha vuelve como el SERIAL
 * de Sheets, nunca como `dd/mm/yyyy`. Comparar texto contra texto —como hace la cola de Obra, donde
 * todo es texto— daría «relectura distinta» en cada pago.
 *
 * @param {unknown} leido lo que devolvió la relectura con `UNFORMATTED_VALUE`
 * @param {{valor:any, especie:string}} c la celda del plan
 * @param {(v:unknown)=>string|null} diaDe el decodificador de seriales (`compras-fila.mjs`)
 */
export function confirmaCelda(leido, c, diaDe) {
  if (c.especie === 'importe') return Math.abs(num(leido) - pesos(c.valor)) < 0.01
  if (c.especie === 'fecha') return diaDe(leido) === txt(c.valor)
  return txt(leido) === txt(c.valor)
}
