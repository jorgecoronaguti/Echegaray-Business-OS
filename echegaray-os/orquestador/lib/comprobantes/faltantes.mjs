// ¿QUÉ LE FALTA A ESTE COMPROBANTE PARA PODER CARGARSE? — UNA definición, dos POLÍTICAS.
//
// ═══ EL DEFECTO QUE ARREGLA (03/08) ═══
//
// La misma pregunta se contestaba en dos lugares distintos y con dos criterios distintos:
//   · `validar()` en `lib/carga-comprobantes.mjs` (el cargador de Claude Code) exigía fecha,
//     proveedor e importe, y escribía la fila igual con Obra/Unidad/Detalle vacías;
//   · `preguntasDe()` en `lib/comprobantes/fajo.mjs` (el bot de Mattermost) exigía además obra y
//     número, y no dejaba cargar sin obra.
//
// El resultado no era "dos políticas": era que el bot revisaba el proveedor y el tipo con reglas que
// el cargador no tenía, el cargador revisaba el importe con una regla que el bot no tenía, y ninguna
// de las dos caras sabía lo que revisaba la otra. Un comprobante sin proveedor legible pasaba las
// cinco preguntas del bot y recién moría dentro del cargador, con un mensaje que el dueño no veía.
//
// ═══ LA OBRA: POR QUÉ DIFERÍA Y QUÉ DECIDIÓ EL DUEÑO (03/08/2026) ═══
//
// La diferencia existía por una razón real: una fila sin obra entra al Flujo de Caja con el rubro sin
// clasificar —"compras sin obra asignada" es un problema que el dueño mismo listó—, así que el bot la
// exigía y bloqueaba; el cargador por línea de comandos, en cambio, escribía la fila igual y dejaba
// que él completara la imputación después en el Sheet, que es como viene trabajando.
//
// **DECIDIDO (03/08/2026): el bot carga igual con la obra vacía, alineado con el cargador.** Bloquear
// costaba más que el dato que protegía: el comprobante quedaba sin cargar en ningún lado —ni en el
// Sheet, ni con obra— y el jefe abandonaba el flujo. Una fila cargada sin obra es un dato incompleto
// que se completa en un minuto; una foto que nunca llegó a Compras es un gasto perdido.
//
// LO QUE NO CAMBIA: **la obra se sigue OFRECIENDO.** El desplegable con las obras del historial
// (`PREGUNTA_OBRA` → `bloqueObra`/`ofertasDe` en `mensaje.mjs`, botones en `fajo.mjs`) aparece igual,
// con su conteo y su sugerida. Lo único que cambió es que no BLOQUEA: si el jefe no elige, se carga
// con la obra vacía y el mensaje lo dice con todas las letras. Ofrecer y exigir son dos cosas
// distintas, y esta política decide sólo la segunda.
//
// Lo que NO puede diferir es la LÓGICA. Por eso la diferencia vive en un objeto de política
// (`POLITICA.CARGADOR` vs `POLITICA.CHAT`) y no en dos funciones: cuando el dueño decidió, se cambió
// una bandera y las dos caras quedaron iguales sin tocar una línea de código de decisión.
//
// NÚCLEO PURO: no lee el Sheet, no consulta la base, no llama a ningún modelo.

import { aFechaAR, aNumero, normalizar, tipoComprobante } from '../carga-comprobantes.mjs'
import { identidadDelComprobante, fueraDeEscala, pesos, FACTOR_FUERA_DE_ESCALA } from './aritmetica.mjs'

/** Por qué un comprobante no está listo. El código es el contrato; los textos son presentación. */
export const MOTIVO = Object.freeze({
  PROVEEDOR_NUEVO: 'proveedor_nuevo',
  DUPLICADO: 'duplicado',
  OBRA: 'obra',
  PROVEEDOR: 'proveedor',
  IMPORTE: 'importe',
  TOTAL: 'total',
  FECHA: 'fecha',
  TIPO: 'tipo',
  NUMERO: 'numero',
  ARITMETICA: 'aritmetica',
  ESCALA: 'escala',
})

/**
 * La pregunta de la obra, como constante y no como literal repetido: `mensaje.mjs` la reemplaza por
 * el bloque con las opciones del historial y necesita reconocerla sin acoplarse a una redacción.
 *
 * Desde el 03/08/2026 la obra ya NO es un faltante (ninguna política la exige), así que esta pregunta
 * no sale de `faltantesDe`. La constante sigue viva porque el bloque que la ofrece —con las opciones
 * del historial y los botones— sigue existiendo: `mensaje.mjs` la usa para armarlo.
 */
export const PREGUNTA_OBRA = 'no dice a qué obra va — ¿cuál es?'

/**
 * Las dos políticas vigentes. Lo que cambia es QUÉ se exige, nunca CÓMO se evalúa.
 *
 * Las tres diferencias que quedan responden al CANAL, no a una decisión de negocio pendiente: el chat
 * puede preguntar y esperar, la línea de comandos no tiene a quién preguntarle en el medio de una
 * corrida. `exigirObra` era la única de negocio y ya está decidida: no se exige en ninguna de las dos.
 */
export const POLITICA = Object.freeze({
  // Claude Code: escribe la fila y el dueño completa la imputación en el Sheet.
  CARGADOR: Object.freeze({
    nombre: 'cargador',
    exigirObra: false,
    exigirNumero: false,
    exigirTotal: false,
    exigirProveedorConocido: false,
  }),
  // El bot: tiene botones, así que lo que falta se pregunta antes de escribir nada.
  CHAT: Object.freeze({
    nombre: 'chat',
    // DECIDIDO 03/08/2026 — ver el encabezado. La obra se ofrece con todo el historial adelante, pero
    // no bloquea: sin elección se carga con la obra vacía y el mensaje lo dice.
    exigirObra: false,
    exigirNumero: true,
    // El fajo que viaja al cargador NO lleva el neto (`aFajoJson`): la columna M se deriva de
    // Total − IVA. Sin total, del otro lado no hay con qué escribir la fila.
    exigirTotal: true,
    exigirProveedorConocido: true,
  }),
})

/**
 * Todo lo que le falta a un comprobante, en un solo lugar.
 *
 * El DUPLICADO y el YA CARGADO son parte de la respuesta y no dependen de la política: un gasto
 * contado dos veces en el Flujo de Fondos cuesta lo mismo entre por donde entre.
 *
 * @param {{comprobante?:object, proveedorNuevo?:boolean, posibleDuplicado?:object,
 *          duplicadoResuelto?:string|null, yaCargado?:object}} item
 * @param {object} politica  una de `POLITICA`
 * @returns {Array<{codigo:string, texto:string, pregunta:string}>}
 */
export function faltantesDe(item = {}, politica = POLITICA.CARGADOR) {
  const c = item.comprobante ?? {}
  const p = politica ?? POLITICA.CARGADOR
  const out = []
  const falta = (codigo, texto, pregunta) => out.push({ codigo, texto, pregunta: pregunta ?? texto })

  if (p.exigirProveedorConocido && item.proveedorNuevo) {
    const quien = c.proveedor ?? '(ilegible)'
    falta(MOTIVO.PROVEEDOR_NUEVO, `proveedor fuera del desplegable: "${quien}"`,
      `el proveedor **${quien}** no está en la lista de Compras — ¿lo agrego?`)
  }
  // UN PROBABLE DUPLICADO ES UNA PREGUNTA, NO UNA DECISIÓN. Ni cargar ni descartar solo: mismo
  // proveedor, mismo día y mismo importe con otro número puede ser el mismo comprobante con un
  // dígito mal leído —lo que ya pasó— o dos compras distintas. Las dos salidas son caras.
  if (item.posibleDuplicado && !item.duplicadoResuelto) {
    const fila = item.posibleDuplicado.fila ?? '?'
    falta(MOTIVO.DUPLICADO, `puede que ya esté cargado en la fila ${fila}`,
      `puede que ya esté cargado en la **fila ${fila}** — ¿es el mismo?`)
  }
  if (p.exigirObra && !c.obra) falta(MOTIVO.OBRA, 'sin obra imputada', PREGUNTA_OBRA)
  if (!normalizar(c.proveedor)) falta(MOTIVO.PROVEEDOR, 'sin proveedor', 'no pude leer el proveedor')
  if (aNumero(c.neto) == null && aNumero(c.total) == null) {
    falta(MOTIVO.IMPORTE, 'sin importe numérico', 'no pude leer el total')
  } else if (p.exigirTotal && aNumero(c.total) == null) {
    falta(MOTIVO.TOTAL, 'sin total (sólo el neto)', 'no pude leer el total')
  }
  // ═══ UN IMPORTE QUE NO CIERRA NO SE ESCRIBE (04/08) ═══
  //
  // Es el control que faltaba el día que entraron $201M falsos al Flujo de Caja. La identidad
  // —neto + IVA + otros tributos = total— la mira `vision.mjs` ANTES, y por eso todo comprobante que
  // llega hasta acá sin cerrar ya tuvo su segunda lectura con el modelo grande: no es una duda que se
  // pueda despejar insistiendo. La única salida honesta es que una persona mire el papel.
  //
  // NO DEPENDE DE LA POLÍTICA. Cargar un importe que no cierra cuesta lo mismo entre por donde entre;
  // la diferencia entre el chat y la línea de comandos es a quién se le puede preguntar, no si el
  // número está bien. Del lado del cargador el neto no viaja (`aFajoJson` lo omite a propósito), así
  // que allá esto simplemente no es verificable y no opina — que es lo correcto, no una excepción.
  const ar = identidadDelComprobante({ neto: c.neto, iva: c.iva, otros: c.otrosTributos, total: c.total })
  if (ar.verificable && !ar.cierra) {
    falta(MOTIVO.ARITMETICA,
      `los importes no cierran: suman ${pesos(ar.suma)} y el total dice ${pesos(ar.total)}`,
      `los importes no cierran — neto + IVA + otros tributos dan **${pesos(ar.suma)}** y el total dice **${pesos(ar.total)}** (${pesos(Math.abs(ar.diferencia))} de diferencia). Tocá **Corregir** y arreglá el que esté mal leído.`)
  }

  // ═══ Y UNO QUE SE SALE DE ESCALA, TAMPOCO ═══
  //
  // `item.escala` es la evidencia —cuántos comprobantes de ESE proveedor se conocen y cuál fue el
  // mayor— que arma quien leyó la pestaña Compras. Acá sólo se compara: guardar el veredicto en vez
  // de la evidencia haría que corregir el total no volviera a evaluarlo, y el control quedaría
  // opinando sobre un número que ya nadie usa.
  //
  // Un total TIPEADO POR UNA PERSONA no se cuestiona: `totalTipeado` lo pone el formulario de
  // Corregir. Alguien miró el papel y escribió el número; seguir preguntando sería un callejón sin
  // salida para toda compra grande de verdad.
  if (!c.totalTipeado) {
    const esc = fueraDeEscala(c.total, item.escala)
    if (esc.sospechoso) {
      falta(MOTIVO.ESCALA,
        `${pesos(c.total)} es ${esc.factor}× el máximo histórico de este proveedor (${pesos(esc.max)} en ${esc.n} comprobantes)`,
        `**${pesos(c.total)}** es ${esc.factor}× lo más grande que ${c.proveedor ?? 'este proveedor'} nos facturó nunca (${pesos(esc.max)}, sobre ${esc.n} comprobantes). Más de ${FACTOR_FUERA_DE_ESCALA}× es casi siempre una coma mal leída — confirmalo con **Corregir**.`)
    }
  }

  if (!aFechaAR(c.fecha)) falta(MOTIVO.FECHA, 'fecha ilegible o ausente', 'no pude leer la fecha')
  if (c.tipo && !tipoComprobante(c.tipo)) {
    falta(MOTIVO.TIPO, `tipo de comprobante no reconocido: "${c.tipo}"`,
      `no reconozco el tipo de comprobante "${c.tipo}"`)
  }
  if (p.exigirNumero && !c.numero) falta(MOTIVO.NUMERO, 'sin número de comprobante', 'no pude leer el número de comprobante')
  return out
}

/**
 * ¿Este comprobante se puede escribir sin preguntarle nada a nadie?
 *
 * `yaCargado` es CERTEZA de que la fila ya está en Compras y no lo levanta ninguna política: por eso
 * se chequea acá y no en `faltantesDe`. `duplicadoResuelto:'mismo'` es el dueño diciendo que ya
 * estaba — tampoco se carga, aunque no le falte ningún dato.
 */
export function puedeCargarse(item = {}, politica = POLITICA.CARGADOR) {
  if (item.yaCargado) return false
  if (item.duplicadoResuelto === 'mismo') return false
  return faltantesDe(item, politica).length === 0
}

/**
 * Los problemas que impiden cargar un comprobante suelto, en la política del cargador.
 * Vacío = cargable. Es la forma en que lo consume `scripts/cargar-comprobantes-compras.mjs`.
 */
export function validar(c = {}) {
  return faltantesDe({ comprobante: c }, POLITICA.CARGADOR).map((f) => f.texto)
}
