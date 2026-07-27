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

// ═══ FECHA DE PAGO — CUÁNDO EL VALOR SE VUELVE CAJA (T05) ═══
//
// La pregunta que faltaba en la pestaña: "¿cuándo se vuelve plata este cheque?". La respuesta es la
// FECHA DE PAGO del eCHEQ (todo cheque de pago diferido la tiene) — desde ese día se puede depositar y
// acreditar. NO es la fecha de la OPERACIÓN (`fecha`): esa es cuándo el banco registró la aceptación,
// custodia o depósito, no cuándo el valor es cobrable.
//
// LA CAPTURA DEL 22/07 NO LA REGISTRÓ. La pantalla de operaciones que originó este archivo trae la
// fecha de cada operación, el tipo y el importe, pero no se copió la fecha de pago de cada cheque. Por
// eso `fechaPago` es OPCIONAL y hoy está casi toda vacía: es un dato a capturar del detalle del eCHEQ
// en el Santander, no algo que se pueda inferir de las fechas de operación. No se inventa.
//
// LO QUE SÍ HAY, CON EVIDENCIA: el dueño ya prototipó la fecha de pago en la copia del Sheet (pestaña
// "Cheques Recibidos" del archivo 1Ry4MGcc…, columna "Fecha de pago"). De ahí sale, con mapeo
// inequívoco por librador + CUIT + importe, el cheque 514 (Mineral Del Río SA, $290.000 → 31/07/2026),
// que en este registro son las operaciones 7934081 (Custodia) y 7934076 (Aceptación). Las de Alimentos
// Del Sur ($10.000.000) del prototipo (31/07, 15/08, 31/08) NO se asignan acá: el registro es por
// OPERACIÓN y no trae número de cheque, así que cuál de las varias operaciones de $10.000.000 es cuál
// cheque es ambiguo — asignarlo sería inventar. Quedan para que el dueño las cargue.
//
// La columna "Días a vencer" de la pestaña se calcula VIVA (=Fecha de pago − HOY) por fórmula, no acá.

/**
 * LAS OPERACIONES RECIBIDAS, una por una, tal como el banco las lista (excluidas las 13 Emisión).
 * `recepcionAuto` marca las que el banco rotula "(Recepción Automática)" = valores que entraron a
 * nuestra cuenta eCHEQ. `cheques` es la cantidad de cheques de la operación (el banco la trae).
 * `fechaPago` (ISO 'YYYY-MM-DD', OPCIONAL): la fecha de pago del eCHEQ = cuándo el valor se vuelve
 * caja. Sólo presente donde se pudo sourcear con evidencia (ver bloque de arriba); el resto se captura.
 */
export const OPERACIONES = [
  { op: '7934081', fecha: '2026-07-22', hora: '15:46', tipo: 'Custodia', recepcionAuto: true, cheques: 1, importe: 290000, fechaPago: '2026-07-31', estado: 'Aceptada' },
  { op: '7934078', fecha: '2026-07-22', hora: '15:46', tipo: 'Depósito', recepcionAuto: true, cheques: 1, importe: 3940000, estado: 'Aceptada' },
  { op: '7934076', fecha: '2026-07-22', hora: '15:46', tipo: 'Aceptación', recepcionAuto: true, cheques: 1, importe: 290000, fechaPago: '2026-07-31', estado: 'Aceptada' },
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
// EL VOCABULARIO ES EL DEL DUEÑO, NO EL DEL HOMEBANKING (23/07). "Custodia", "Aceptación" y
// "Rescate" son palabras del banco: si aparecen, tienen que venir con QUÉ SIGNIFICAN PARA LA PLATA.
// Cada lectura dice, en el mismo orden: qué pasó · si es caja o no.
export function lectura(tipo) {
  switch (tipo) {
    case 'Aceptación': return 'ENTRÓ: el valor es nuestro — todavía no es caja'
    case 'Custodia': return 'GUARDADO en el banco, sin depositar — todavía no es caja'
    case 'Depósito': return 'ES CAJA: acreditado en la cuenta bancaria'
    case 'Endoso': return 'SALIÓ: se entregó a un tercero para pagarle — no vuelve'
    case 'Rescate': return 'Paso interno: se saca de custodia para depositarlo o endosarlo — no mueve plata'
    default: return ''
  }
}

/**
 * NÚCLEO PURO: la fecha de cobro (fecha de pago del eCHEQ) de una operación, en ISO, o '' si no se
 * capturó. Es lo que va en la columna "Fecha de cobro"; vacío = "todavía no sé cuándo se cobra".
 */
export function fechaCobro(op) {
  const f = op?.fechaPago
  return typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : ''
}

/**
 * NÚCLEO PURO: convierte una fecha ISO 'YYYY-MM-DD' al SERIAL de fecha de Google Sheets (días desde
 * 1899-12-30). Se escribe el serial —un número— y no el texto ISO: en un Sheet es_AR, USER_ENTERED NO
 * parsea 'YYYY-MM-DD' como fecha (espera dd/mm/yyyy) y lo guardaría como texto, dejando la celda sin
 * formato de fecha. Un serial es una fecha real en cualquier locale. Devuelve null si la fecha no es ISO.
 */
export function serialDeFecha(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)
  return Math.round(ms / 86400000)
}

/**
 * NÚCLEO PURO: la fórmula VIVA de "Días a vencer" para la fila `fila`, tomando la fecha de cobro de la
 * columna `colCobro` (letra). Blank-safe: si no hay fecha, la celda queda vacía (no 0, no error). El
 * resultado es negativo cuando el cheque ya venció/es cobrable — la pestaña lo pinta en rojo.
 * Formato canónico (coma = separador): google.mjs lo localiza a ';' en el Sheet es_AR.
 */
export function formulaDiasAVencer(colCobro, fila) {
  const ref = `$${colCobro}${fila}`
  return `=IF(${ref}="","",${ref}-TODAY())`
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
