// LA FECHA EN QUE SE PAGA UNA QUINCENA — QUE NO ES LA FECHA EN QUE CIERRA.
//
// ═══ EL DEFECTO (31/07) ═══
//
// El dueño: *"los jornales que se pagan de la quincena q termina hoy, se pagarán la semana que viene,
// tengo q reflejar eso en los cash flows"*.
//
// Hasta hoy el OS afirmaba lo contrario, en cuatro lugares y con estas palabras:
//   · cash-flow-lineas.mjs    → "HASTA = fecha de pago, TOTAL = lo pagado"
//   · rubro_caja_nucleo.sql   → "La quincena es caja del día en que CIERRA"
//   · jornales_instrumentos   → "La fecha de caja es HASTA: la quincena se paga al cerrar"
//   · calendario_caja         → el evento de pago es `j.hasta`
//
// No había offset, ni columna, ni parámetro: la fecha de cierre ERA la fecha de pago. Y es falso, y
// el banco lo prueba. Los pagos de haberes del Santander llegan en LOTES, uno por quincena:
//
//   quincena cierra   lote del banco                              desfase
//   ───────────────   ─────────────────────────────────────────   ─────────────────
//   mar 30/06/2026    mié 01/07/2026 · lote 260701507 · 2 movs    +1 día hábil
//   mié 15/07/2026    vie 17/07/2026 · lote 260717507 · 15 movs   +2 días hábiles
//
// El segundo cierra exacto contra la planilla: los 14 movimientos del lote 260717507 ($3.522.950) más
// el "Pago de haberes por cci" del mismo día ($252.200) suman $3.775.150, que es EXACTAMENTE la
// columna "Banco" de la quincena 01/07–15/07 en "Jornales por Quincena". No es una coincidencia de
// magnitud: es el mismo peso.
//
// ═══ LA CONSECUENCIA, MEDIDA ═══
//
// La quincena 16/07–31/07 ($7.675.588) caía en la columna de JULIO del Cash Flow Mensual y en la
// semana del 27/07 del Semanal. Pagándose el lunes 03/08 va a AGOSTO y a la semana del 03/08. Y no es
// sólo esa: TODA quincena que cierra a fin de mes se paga el mes siguiente, y el cuadro las tenía
// todas un mes antes de cuando la plata sale de la cuenta.
//
// ═══ DE DÓNDE SALE LA FECHA — EN ESTE ORDEN, Y SE DECLARA CUÁL SE USÓ ═══
//
//   1. BANCO (hecho con origen). El primer lote de haberes ESTRICTAMENTE posterior al cierre, dentro
//      de una ventana corta. La ventana no es un detalle: sin ella, una quincena de enero se
//      apropiaría del lote del 30/06 —el único que el extracto alcanza— y trece quincenas viejas
//      aterrizarían todas en junio. El banco sólo puede probar lo que el banco cubre.
//   2. PARÁMETRO (supuesto declarado). `hasta` + N días hábiles, con N viviendo en la pestaña
//      Parámetros para que el dueño lo cambie sin tocar código.
//   3. EDICIÓN DEL DUEÑO (verdad definitiva). Si escribió una fecha a mano, gana sobre las dos
//      anteriores y ningún generador la pisa.
//
// EL DEFAULT ES 1 DÍA HÁBIL, Y ESTÁ MEDIDO, NO ELEGIDO. De las tres observaciones que hay hoy, dos
// dan +1 día hábil (30/06→01/07 del banco, y 31/07→lun 03/08 de la instrucción del dueño) y una da
// +2 (15/07→17/07). No hay serie para más precisión que eso, así que se declara la moda y se deja el
// parámetro a la vista en vez de fingir un promedio de tres casos.

/** El default del desfase, en DÍAS HÁBILES. Medido contra el banco: ver el encabezado. */
export const DESFASE_HABILES_DEFAULT = 1

/**
 * Cuántos días después del cierre se acepta un lote del banco como el pago de ESA quincena.
 *
 * Diez días corridos = menos de una quincena: si pasó más que eso, el lote pertenece a la quincena
 * siguiente, no a ésta. Es el guard que impide que el extracto —que hoy arranca el 22/06— le ponga
 * fecha de pago de junio a las quincenas de enero a mayo.
 */
export const VENTANA_BANCO_DIAS = 10

/** La Naturaleza que `lib/banco-santander.mjs` le pone a un pago de haberes. Es el filtro del lote. */
export const NATURALEZA_SUELDOS = 'Sueldos'

const DIA = 86400000
/** Fecha (Date | 'YYYY-MM-DD' | Date-like) → Date a mediodía UTC, para que sumar días no cruce husos. */
export function aFecha(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 12)) : null
  const s = String(v).trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12))
  return null
}

/** Date → 'YYYY-MM-DD'. PURA. */
export const iso = (d) => (d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` : null)

/**
 * NÚCLEO PURO: el equivalente exacto de WORKDAY() de Sheets — suma DÍAS HÁBILES salteando sábados y
 * domingos.
 *
 * NO CONTEMPLA FERIADOS, y se dice acá en vez de descubrirlo con un pago corrido. WORKDAY sin lista
 * de feriados tampoco los saltea, así que el JS y la fórmula del Sheet dan lo mismo — que es el
 * requisito: si dieran distinto habría dos verdades sobre la misma fecha. Un feriado que corre el
 * pago se resuelve editando la celda, que es editable a propósito.
 */
export function sumarDiasHabiles(fecha, n = 1) {
  const d = aFecha(fecha)
  if (!d) return null
  let quedan = Math.max(0, Math.round(Number(n) || 0))
  const out = new Date(d)
  while (quedan > 0) {
    out.setUTCDate(out.getUTCDate() + 1)
    const dow = out.getUTCDay()
    if (dow !== 0 && dow !== 6) quedan--
  }
  return out
}

/** Días hábiles entre dos fechas (excluyendo la primera, incluyendo la última). PURA. */
export function diasHabilesEntre(a, b) {
  const d0 = aFecha(a), d1 = aFecha(b)
  if (!d0 || !d1 || d1 < d0) return null
  let n = 0
  const d = new Date(d0)
  while (d < d1) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

/**
 * NÚCLEO PURO: los LOTES de pago de haberes de un extracto.
 *
 * Un pago de quincena no es un movimiento: son quince transferencias del mismo día, una por persona.
 * Lo que identifica el pago es la FECHA del lote, y agrupar por fecha es lo que convierte quince
 * líneas del banco en un hecho ("el 17/07 se pagó la quincena").
 *
 * @param {{fecha:any, concepto?:string, importe?:number, naturaleza?:string}[]} movimientos
 * @returns {{fecha:Date, movimientos:number, total:number}[]} ordenados por fecha
 */
export function lotesDeHaberes(movimientos = []) {
  const porFecha = new Map()
  for (const m of movimientos) {
    const esSueldo = m?.naturaleza
      ? String(m.naturaleza).trim() === NATURALEZA_SUELDOS
      : /haber(es)?|sueldo/i.test(String(m?.concepto ?? ''))
    if (!esSueldo) continue
    const f = aFecha(m?.fecha)
    if (!f) continue
    const k = iso(f)
    const acc = porFecha.get(k) ?? { fecha: f, movimientos: 0, total: 0 }
    acc.movimientos++
    acc.total += Math.abs(Number(m?.importe) || 0)
    porFecha.set(k, acc)
  }
  return [...porFecha.values()].sort((a, b) => a.fecha - b.fecha)
}

/**
 * NÚCLEO PURO: cuándo se paga una quincena, y de dónde salió esa fecha.
 *
 * @param {any} hasta fecha de cierre de la quincena
 * @param {{fecha:Date, movimientos:number, total:number}[]} lotes lotes de haberes del banco
 * @param {{desfaseHabiles?:number, ventanaDias?:number, manual?:any}} opts
 * @returns {{pago:Date|null, origen:'manual'|'banco'|'parametro', lote:object|null,
 *            diasCorridos:number|null, diasHabiles:number|null}}
 */
export function pagoDeQuincena(hasta, lotes = [], {
  desfaseHabiles = DESFASE_HABILES_DEFAULT, ventanaDias = VENTANA_BANCO_DIAS, manual = null,
} = {}) {
  const cierre = aFecha(hasta)
  if (!cierre) return { pago: null, origen: 'parametro', lote: null, diasCorridos: null, diasHabiles: null }

  // LO QUE EL DUEÑO ESCRIBIÓ A MANO MANDA. Es la regla de oro del archivo, y acá es además la única
  // forma de cargar un dato que todavía no existe: la quincena que cierra hoy no tiene lote en el
  // banco porque el pago es la semana que viene.
  const aMano = aFecha(manual)
  if (aMano) {
    return {
      pago: aMano, origen: 'manual', lote: null,
      diasCorridos: Math.round((aMano - cierre) / DIA), diasHabiles: diasHabilesEntre(cierre, aMano),
    }
  }

  const limite = new Date(cierre.getTime() + Math.max(0, Number(ventanaDias) || 0) * DIA)
  const lote = lotes.find((l) => l.fecha > cierre && l.fecha <= limite) ?? null
  if (lote) {
    return {
      pago: lote.fecha, origen: 'banco', lote,
      diasCorridos: Math.round((lote.fecha - cierre) / DIA), diasHabiles: diasHabilesEntre(cierre, lote.fecha),
    }
  }

  const pago = sumarDiasHabiles(cierre, desfaseHabiles)
  return {
    pago, origen: 'parametro', lote: null,
    diasCorridos: pago ? Math.round((pago - cierre) / DIA) : null, diasHabiles: desfaseHabiles,
  }
}

/**
 * NÚCLEO PURO: el desfase OBSERVADO, quincena por quincena. Es la medición, no el supuesto.
 * Sirve para el informe y para el test: si mañana el banco muestra otro ritmo, el número cambia solo.
 */
export function desfaseObservado(quincenas = [], lotes = [], opts = {}) {
  return quincenas.map((q) => {
    const r = pagoDeQuincena(q.hasta, lotes, opts)
    return { ...q, ...r }
  })
}

// ── DÓNDE CAE LA PLATA: MES Y SEMANA ─────────────────────────────────────────────────────────────
//
// Las dos definiciones son las MISMAS que usan los encabezados del cash flow (cash-flow-rehacer.mjs:
// meses() son los primeros de mes, semanas() son los lunes, y la ventana de cada columna es
// [encabezado, encabezado+7) en la semanal y [encabezado, fin de mes] en la mensual). Están acá para
// que un test pueda afirmar EN QUÉ COLUMNA cae una quincena sin abrir el Sheet — que era justamente
// el agujero: no existía ni un test que verificara eso.

/** El primero del mes de una fecha, como 'YYYY-MM-01'. PURA. */
export function mesDe(fecha) {
  const d = aFecha(fecha)
  return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01` : null
}

/** El LUNES de la semana de una fecha, en ISO. Es el encabezado de la columna semanal. PURA. */
export function semanaDe(fecha) {
  const d = aFecha(fecha)
  if (!d) return null
  const out = new Date(d)
  while (out.getUTCDay() !== 1) out.setUTCDate(out.getUTCDate() - 1)
  return iso(out)
}

// ── LA FÓRMULA DE LA PESTAÑA ─────────────────────────────────────────────────────────────────────

/** Los rangos con nombre del parámetro. Viven en Parámetros; los publica jornales-pestana.mjs. */
export const RANGO_DESFASE = 'JORNALES_DESFASE_PAGO'
export const RANGO_VENTANA = 'JORNALES_VENTANA_BANCO'

/**
 * NÚCLEO PURO: la fórmula es-AR de la columna "Se paga el".
 *
 * TRES DECISIONES QUE ESTÁN ADENTRO DE ESTA FÓRMULA:
 *
 *  1. RANGO ABIERTO, SIN FILA FINAL. `'_BANCO_RAW'!$A$4:$A` y no `$A$4:$A$400`. El extracto crece en
 *     cada importación; un techo fijo deja de ver los lotes nuevos SIN dar error y la fecha de pago
 *     se congela en la del mes pasado. Es el mismo modo de falla que ya costó el techo de 14
 *     quincenas y el de 200 filas de Cobranzas.
 *  2. ESTRICTAMENTE POSTERIOR AL CIERRE (`>B`), no `>=`. Un lote del MISMO día del cierre es el pago
 *     de la quincena ANTERIOR —el extracto tiene un caso, el 30/06— y tomarlo daría desfase cero,
 *     que es exactamente el defecto que esto viene a arreglar.
 *  3. VENTANA CORTA. Ver VENTANA_BANCO_DIAS: sin ella las quincenas viejas se apropian del primer
 *     lote que el extracto alcanza.
 *
 * @param {string} celdaHasta la celda con la fecha de cierre (ej. 'B60')
 * @returns {string} fórmula es-AR (separador `;`, nunca `,`)
 */
export function formulaSePagaEl(celdaHasta) {
  return `=IF(N(${celdaHasta})=0;"";${expresionSePagaEl(celdaHasta)})`
}

/**
 * LA MISMA FECHA, COMO EXPRESIÓN: LOS TRES GRUPOS COBRAN EL MISMO DÍA (14/08 — orden del dueño).
 *
 * ═══ LA ORDEN ═══
 *
 * *"en la pestaña 'jornales por quincena' las tres grupos de empleados, quiero q cobren el mismo dia"*.
 * Y no cobraban: obreros salía del lote del banco (o `WORKDAY(cierre;desfase)`), oficina de
 * `EOMONTH(mes)+desfase` —días CORRIDOS, sumando un parámetro que está expresado en días HÁBILES— y
 * dirección del día 10 del mes siguiente. Tres criterios para un solo evento de caja.
 *
 * ═══ CUÁL DE LAS TRES FECHAS MANDA — DERIVADA, NO ELEGIDA ═══
 *
 * El extracto contesta con dos lotes que cierran al peso contra la planilla:
 *
 *   · lote 260717507 del vie 17/07 → 14 movimientos + 1 "por cci" = $3.775.150, que es EXACTAMENTE la
 *     columna Banco de la quincena 01/07–15/07 del registro.
 *   · lote 260731507 del vie 31/07 → 14 movimientos + 1 "por cci" = $3.336.233, que es EXACTAMENTE la
 *     columna Banco de la quincena 16/07–31/07. Y EN EL MISMO LOTE, dos movimientos idénticos de
 *     $1.365.843,84: dos personas, importes iguales, cadencia mensual — la nómina de OFICINA sale en
 *     el mismo lote de haberes que la de obra, el mismo día. (El 03/06 se repite el patrón: dos de
 *     $1.360.865,60 junto al lote de obreros.)
 *
 * Y dirección: "Pago de honorarios" el 01/06 ($3.000.000), el 02/07 ($2.000.000) y el 03/08
 * ($3.000.000), más la transferencia a Ana Laura Echegaray del 03/08 ($3.000.000, que es el retiro de
 * Jorge Corona). Primeros días del mes siguiente — nunca un día 10.
 *
 * O sea: la fecha que manda es la del LOTE DE HABERES del cierre de mes, que es la que obra ya usa. Es
 * además la única de las tres que sale de un HECHO (el extracto) y no de una constante. Oficina y
 * dirección la referencian; ninguno de los tres tiene criterio propio.
 *
 * LO QUE ESTA UNIFICACIÓN NO BORRA: un pago YA REGISTRADO gana sobre cualquier previsión. La fecha de
 * dirección sigue saliendo de las filas de Compras cuando el mes está pagado, y la de obra de la
 * columna «Pagado el». Esto unifica la PREVISIÓN, que es lo que estaba en tres versiones.
 *
 * @param {string} exprHasta expresión de la fecha de cierre (celda o `EOMONTH(...)`)
 */
export function expresionSePagaEl(exprHasta) {
  const F = `'_BANCO_RAW'!$A$4:$A`
  const NAT = `'_BANCO_RAW'!$F$4:$F`
  const lote = `MIN(FILTER(${F};${NAT}="${NATURALEZA_SUELDOS}";${F}>${exprHasta};${F}<=${exprHasta}+${RANGO_VENTANA}))`
  return `IFERROR(${lote};WORKDAY(${exprHasta};${RANGO_DESFASE}))`
}

/**
 * NÚCLEO PURO: la fecha de pago de la nómina del MES `mes` — la que comparten los tres grupos.
 *
 * El cierre del mes es el de la segunda quincena, así que la fecha es la misma que la de esa quincena.
 * Se arma acá y no en cada bloque para que no puedan volver a separarse.
 */
export const expresionPagoDelMes = (anio, mes) =>
  expresionSePagaEl(`EOMONTH(DATE(${anio};${mes};1);0)`)

/**
 * NÚCLEO PURO: la fecha que decide en qué período cae la quincena, con FALLBACK a `hasta`.
 *
 * POR QUÉ EL FALLBACK NO ES OPCIONAL. Si la celda de pago quedara vacía —una quincena vieja sin lote
 * y sin parámetro, una fórmula borrada a mano— la línea de jornales del cash flow devolvería cero
 * para esa quincena y NADIE se enteraría: el cuadro seguiría cuadrando con menos plata. Que una línea
 * quede en cero sin avisar es el peor resultado posible de este archivo, peor que la fecha vieja.
 *
 * @param {string} pago  rango con nombre de la fecha de pago
 * @param {string} cierre rango con nombre de la fecha de cierre
 */
// ═══ LA JERARQUÍA DE LAS TRES FECHAS, EN LA FÓRMULA (31/07) ═══
//
// El dueño, después de marcar los pagos: "jornales de obra aparece a pagarse la semana que viene cdo
// marque que hoy ya lo pagué... si se pago, se pagó".
//
// Tenía razón y era un error mío: agregué la columna "Pagado el", cablée CAJA para que la mire, y
// la línea del CASH FLOW se quedó mirando la fecha PREVISTA. Marcó el pago el 31/07 y el cuadro
// seguía poniendo los $8.227.000 en la semana del 03/08 — la semana que viene, plata que ya salió.
//
// El orden es el mismo en todo el archivo y no admite excepciones:
//
//   1. PAGADO   — salió de verdad. Es un HECHO. Gana siempre.
//   2. PREVISTA — el lote del banco si ya pasó, o el parámetro. Es una estimación.
//   3. CIERRE   — último recurso, para que una quincena sin ninguna fecha no desaparezca del cuadro.
//
// `pagado` es opcional para no romper a los llamadores que no lo tienen (la proyección: una quincena
// que todavía no existe no puede estar pagada).
export const fechaDeCajaDeQuincena = (pago, cierre, pagado = null) => (pagado
  ? `IF(ISNUMBER(${pagado});${pagado};IF(ISNUMBER(${pago});${pago};${cierre}))`
  : `IF(ISNUMBER(${pago});${pago};${cierre})`)

/** Los dos parámetros que viven en Parámetros, con su rótulo exacto, su default y su por qué. */
export const PARAMETROS = [
  {
    rango: RANGO_DESFASE,
    rotulo: 'Desfase de pago de la quincena (días hábiles)',
    valor: DESFASE_HABILES_DEFAULT,
    nota: 'Cuántos días hábiles después de cerrar se paga una quincena, cuando el banco todavía no lo prueba. MEDIDO en el extracto: 30/06→01/07 = 1 hábil; 15/07→17/07 = 2 hábiles. Cambiá este número y todo el cash flow se recalcula.',
  },
  {
    rango: RANGO_VENTANA,
    rotulo: 'Ventana para reconocer el lote del banco (días)',
    valor: VENTANA_BANCO_DIAS,
    nota: 'Hasta cuántos días después del cierre un lote de "Pago haberes" del extracto se acepta como el pago de ESA quincena. Más que esto y el lote es de la quincena siguiente.',
  },
]
