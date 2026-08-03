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
// ═══ LO QUE ES POLÍTICA Y SIGUE SIENDO DISTINTO A PROPÓSITO ═══
//
// **Exigir la obra es una decisión de negocio del dueño, y todavía no la tomó.** Una fila sin obra
// entra al Flujo de Caja con el rubro sin clasificar —"compras sin obra asignada" es un problema que
// él mismo listó—, y por eso el bot bloquea; el cargador por línea de comandos sigue escribiendo la
// fila y dejando que él complete la imputación después, que es como viene trabajando.
//
// Lo que NO puede diferir es la LÓGICA. Por eso la diferencia vive en un objeto de política
// (`POLITICA.CARGADOR` vs `POLITICA.CHAT`) y no en dos funciones: el día que el dueño decida, se
// cambia una bandera y las dos caras quedan iguales sin tocar una línea de código de decisión.
//
// NÚCLEO PURO: no lee el Sheet, no consulta la base, no llama a ningún modelo.

import { aFechaAR, aNumero, normalizar, tipoComprobante } from '../carga-comprobantes.mjs'

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
})

/**
 * La pregunta de la obra, como constante y no como literal repetido: `mensaje.mjs` la reemplaza por
 * el bloque con las opciones del historial y necesita reconocerla sin acoplarse a una redacción.
 */
export const PREGUNTA_OBRA = 'no dice a qué obra va — ¿cuál es?'

/**
 * Las dos políticas vigentes. Lo que cambia es QUÉ se exige, nunca CÓMO se evalúa.
 *
 * `exigirObra` es la única diferencia que responde a una decisión de negocio pendiente. Las otras
 * tres responden al canal: el chat puede preguntar y esperar, la línea de comandos no tiene a quién
 * preguntarle en el medio de una corrida.
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
    exigirObra: true,
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
