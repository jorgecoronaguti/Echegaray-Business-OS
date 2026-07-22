// LOS eCHEQ QUE LA EMPRESA RECIBIÓ, según el registro de operaciones del banco. NO ES UNA OPINIÓN.
//
// POR QUÉ EXISTE (22/07). El dueño trajo la pantalla de operaciones eCHEQ del Santander. Es el
// espejo de "Cheques Emitidos" del otro lado del mostrador: los valores que ENTRAN. Hasta hoy el OS
// veía los cheques recibidos sólo por Cobranzas (que registra que se cobró) y por el extracto (que
// ve el depósito), pero no tenía el registro del banco de cada operación sobre el valor.
//
// ═══ QUÉ ES CADA FILA — Y POR QUÉ NO SE SUMA LA COLUMNA ═══
//
// Cada fila es una OPERACIÓN, no un cheque. El mismo valor pasa por varios estados y cada uno genera
// una fila: Aceptación → Custodia → Depósito, o Aceptación → Endoso. Sumar la columna Importe
// contaría el mismo cheque tres veces —el endoso de $20.000.000 figura como Endoso Y como Rescate el
// mismo día—. Por eso el resumen CUENTA operaciones por tipo y NO totaliza el importe: la cartera
// real de HOY la manda CAJA (bloque de valores), no este registro histórico.
//
// ═══ QUÉ NO ENTRA ACÁ (regla 9, no duplicar) ═══
//
// La pantalla del banco mezcla las EMISIONES (cheques que la empresa emitió para pagar). Esas ya
// viven en "Cheques Emitidos" y no se copian acá: esta pestaña es sólo lo RECIBIDO. Se excluyeron 13
// operaciones de Emisión.
//
// ES UNA RÉPLICA, Y SE DECLARA COMO TAL: `CORTE` y `ORIGEN` dicen a qué fecha está sacada. Una
// réplica que no dice cuándo se sacó envejece sin gritar.

/** El día de la foto. Todo lo de abajo es verdad A ESTA FECHA. */
export const CORTE = '2026-07-22'
export const ORIGEN = 'Santander Empresas · pantalla de operaciones eCHEQ (captura del 22/07/2026)'

/**
 * LAS OPERACIONES RECIBIDAS, una por una, tal como el banco las lista (excluidas las 13 Emisión).
 * `recepcionAuto` marca las que el banco rotula "(Recepción Automática)" = valores que entraron a
 * nuestra cuenta eCHEQ. `cheques` es la cantidad de cheques de la operación (el banco la trae).
 */
export const OPERACIONES = [
  { op: '7934081', fecha: '2026-07-22', hora: '15:46', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 290000, estado: 'Aceptada' },
  { op: '7934078', fecha: '2026-07-22', hora: '15:46', tipo: 'Depósito', recepcionAuto: true, cheques: 1, importe: 3940000, estado: 'Aceptada' },
  { op: '7934076', fecha: '2026-07-22', hora: '15:46', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 290000, estado: 'Aceptada' },
  { op: '7934073', fecha: '2026-07-22', hora: '15:46', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 3940000, estado: 'Aceptada' },
  { op: '7551923', fecha: '2026-07-10', hora: '10:08', tipo: 'Endoso', recepcionAuto: false, cheques: 2, importe: 20000000, estado: 'Aceptada' },
  { op: '7551615', fecha: '2026-07-10', hora: '10:03', tipo: 'Rescate', recepcionAuto: false, cheques: 2, importe: 20000000, estado: 'Aceptada' },
  { op: '6769810', fecha: '2026-06-15', hora: '19:08', tipo: 'Depósito', recepcionAuto: false, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '6769806', fecha: '2026-06-15', hora: '19:07', tipo: 'Rescate', recepcionAuto: false, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '6687176', fecha: '2026-06-11', hora: '10:40', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 10000000, estado: 'Aceptada' },
  { op: '6687174', fecha: '2026-06-11', hora: '10:40', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 10000000, estado: 'Aceptada' },
  { op: '6687173', fecha: '2026-06-11', hora: '10:40', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 10000000, estado: 'Aceptada' },
  { op: '6687172', fecha: '2026-06-11', hora: '10:40', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 10000000, estado: 'Aceptada' },
  { op: '6687170', fecha: '2026-06-11', hora: '10:40', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 10000000, estado: 'Aceptada' },
  { op: '6687169', fecha: '2026-06-11', hora: '10:40', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 10000000, estado: 'Aceptada' },
  { op: '6687168', fecha: '2026-06-11', hora: '10:40', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 10000000, estado: 'Aceptada' },
  { op: '6687167', fecha: '2026-06-11', hora: '10:40', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 10000000, estado: 'Aceptada' },
  { op: '6481563', fecha: '2026-06-01', hora: '09:48', tipo: 'Depósito', recepcionAuto: false, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '6481530', fecha: '2026-06-01', hora: '09:48', tipo: 'Rescate', recepcionAuto: false, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5737765', fecha: '2026-04-20', hora: '13:34', tipo: 'Depósito', recepcionAuto: false, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5737723', fecha: '2026-04-20', hora: '13:32', tipo: 'Rescate', recepcionAuto: false, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053601', fecha: '2026-03-11', hora: '12:09', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053597', fecha: '2026-03-11', hora: '12:09', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053595', fecha: '2026-03-11', hora: '12:09', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053593', fecha: '2026-03-11', hora: '12:09', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053591', fecha: '2026-03-11', hora: '12:09', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053590', fecha: '2026-03-11', hora: '12:09', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053589', fecha: '2026-03-11', hora: '12:09', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053588', fecha: '2026-03-11', hora: '12:09', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053585', fecha: '2026-03-11', hora: '12:09', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
  { op: '5053581', fecha: '2026-03-11', hora: '12:09', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 15000000, estado: 'Aceptada' },
]

/** Los tipos de operación que puede tener un valor recibido, en orden de ciclo de vida. */
export const TIPOS = ['Aceptación', 'Custodia', 'Depósito', 'Endoso', 'Rescate']

/**
 * NÚCLEO PURO: qué significa cada tipo de operación para la cartera. Es la columna que hace legible
 * el registro sin que haya que saber la jerga del banco.
 */
export function lectura(tipo) {
  switch (tipo) {
    case 'Aceptación': return 'El valor entró a nuestra cuenta eCHEQ'
    case 'Custodia': return 'Guardado en custodia en el banco — todavía no depositado'
    case 'Depósito': return 'Depositado a la cuenta: ya es plata en el banco'
    case 'Endoso': return 'Endosado a un tercero para pagarle: ya no es nuestro'
    case 'Rescate': return 'Rescatado de custodia/inversión'
    default: return ''
  }
}

/** NÚCLEO PURO: cuenta las operaciones por tipo (cantidad e importe bruto, que NO es cartera). */
export function porTipo(ops = OPERACIONES) {
  const acc = new Map()
  for (const o of ops) {
    const a = acc.get(o.tipo) ?? { tipo: o.tipo, cantidad: 0, importe: 0 }
    a.cantidad++; a.importe += Number(o.importe) || 0
    acc.set(o.tipo, a)
  }
  return TIPOS.filter((t) => acc.has(t)).map((t) => acc.get(t))
}
