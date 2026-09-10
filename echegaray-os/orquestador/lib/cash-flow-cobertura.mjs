// EL CONTROL DE COBERTURA DE LOS CASH FLOW — cada línea con dueño y con horizonte declarado.
//
// ═══ POR QUÉ SE REESCRIBIÓ ENTERO (13/08/2026) ═══
//
// Este archivo es el instrumento de la regla de oro 8 del dueño: *"todo movimiento de toda pestaña se
// refleja en los conceptos de los Cash Flows, sin doble conteo y sin huecos"*. Hasta hoy lo verificaba
// contra `CUADRO` de `cash-flow-lineas.mjs` — **el diseño de bloques verticales que se retiró el
// 06/08**. Desde entonces las dos vistas son una MATRIZ (`cash-flow-matriz.mjs`) que cuelga del Libro
// (`_MOVIMIENTOS`): el control seguía verde midiendo un cuadro que ya no se escribe en el archivo.
//
// Y el hueco que dejó pasar no fue teórico. El dueño, textual: *"necesito que todo esté contemplado en
// cash flows, no pueden no ser fiables"* — sus líneas de Materiales y de Estructura tenían plata hasta
// agosto y nada de septiembre a diciembre, y sobre ese flujo incompleto se armó un informe de compra
// de rodados. Ningún test se puso rojo.
//
// ═══ LAS DOS PREGUNTAS QUE CONTESTA, Y POR QUÉ SON DOS ═══
//
// 1. **¿Toda pestaña que aporta plata tiene un rol declarado, y ninguna DERIVADA se suma?** Es la
//    garantía anti-doble-conteo. Se mide contra el Libro real, no contra una lista de fórmulas.
// 2. **¿Cada línea del cuadro tiene dueño y llega hasta diciembre?** Es la garantía anti-hueco, y es
//    la que faltaba. Una línea que se corta en agosto no da error: da un número más chico, coherente
//    consigo mismo, y se lee como si fuera la verdad.
//
// ═══ EL HORIZONTE SE DECLARA, NO SE ADIVINA ═══
//
// No toda línea DEBE llegar a diciembre, y confundir eso sería peor que no controlar nada: exigirle
// cobranzas de noviembre al cuadro es pedirle que invente ventas que nadie firmó. Por eso cada rubro
// declara cuál de los tres horizontes le corresponde y POR QUÉ:
//
//   · `DICIEMBRE`        la fuente proyecta sola hasta fin de año. Cortarse antes es un DEFECTO.
//   · `HASTA_LO_CARGADO` sólo sale lo que ya tiene fecha (una factura, un cheque, una obra vendida).
//                        Que se corte antes de diciembre es correcto: proyectar sería fabricar.
//   · `SIN_PROYECCION`   hueco CONOCIDO y declarado. No se rellena, se nombra — y sigue apareciendo
//                        en cada corrida hasta que exista una fuente legítima.
//
// NO CALCULA PLATA. Recibe los movimientos que el Libro emitió y contesta sobre ellos.

import { RUBROS_INGRESO, RUBROS_EGRESO } from './cash-flow-rubros.mjs'
import { RUBRO_OBRAS } from './libro-extractores-obras.mjs'

/** Los tres horizontes posibles. Ver el bloque de arriba. */
export const HORIZONTE = Object.freeze({
  diciembre: 'DICIEMBRE',
  cargado: 'HASTA_LO_CARGADO',
  sin: 'SIN_PROYECCION',
})

/**
 * EL DUEÑO Y EL HORIZONTE DE CADA LÍNEA DE PLATA DEL CUADRO.
 *
 * `dueno` es la pestaña/fuente de la que sale el dato (la que hay que ir a mirar cuando la línea está
 * vacía), no la pestaña donde se muestra. Un rubro sin entrada acá hace fallar `verificarCobertura`:
 * agregar una línea al cuadro obliga a decir quién la llena y hasta cuándo.
 *
 * @type {Array<{rubro:string, dueno:string, horizonte:string, porque:string}>}
 */
export const DUENOS = [
  // ── INGRESOS ────────────────────────────────────────────────────────────────────────────────────
  {
    rubro: 'Cobranzas', dueno: 'Cobranzas', horizonte: HORIZONTE.cargado,
    porque: 'Un cobro se proyecta cuando existe la venta o la certificación cargada con su fecha. '
      + 'Extender una serie de cobranzas hasta diciembre sería inventar ventas que nadie firmó.',
  },
  {
    rubro: 'Valores en cartera', dueno: '_CHEQUES_RAW', horizonte: HORIZONTE.cargado,
    porque: 'Es la cartera de cheques de terceros en custodia, cada uno con su fecha de pago. Después '
      + 'del último vencimiento no hay nada que proyectar: los valores futuros todavía no existen.',
  },
  // ── EGRESOS ─────────────────────────────────────────────────────────────────────────────────────
  {
    rubro: 'Materiales Civil', dueno: 'Compras', horizonte: HORIZONTE.cargado,
    porque: 'Son las facturas de materiales ya cargadas (pagadas o pendientes). Lo que va a comprarse '
      + `para las obras en curso NO sale de acá: sale de "${RUBRO_OBRAS}", con su explosión de costos.`,
  },
  {
    rubro: RUBRO_OBRAS, dueno: 'Obras', horizonte: HORIZONTE.cargado,
    porque: 'La explosión de costos que declaró el dueño, obra por obra, con proveedor y fecha. Llega '
      + 'hasta donde llega el cronograma de las obras VENDIDAS; una obra que todavía no se vendió no '
      + 'tiene materiales que proyectar.',
  },
  {
    rubro: 'Materiales Mantenimiento', dueno: 'Compras', horizonte: HORIZONTE.cargado,
    porque: 'Mismo criterio que Materiales Civil: sólo lo facturado. El mantenimiento no tiene una '
      + 'pestaña que proyecte demanda futura.',
  },
  {
    rubro: 'Nómina · Jornales de obra', dueno: 'Jornales por Quincena', horizonte: HORIZONTE.diciembre,
    porque: 'La planilla proyecta quincenas seis meses hacia adelante sobre la demanda de las obras '
      + 'y el piso al convenio. Si esta línea se corta antes de diciembre, la proyección de jornales '
      + 'dejó de correr.',
  },
  {
    rubro: 'Nómina · Sueldos administración', dueno: 'Jornales por Quincena', horizonte: HORIZONTE.diciembre,
    porque: 'Oficina y Dirección son sueldos mensuales de un plantel estable: la planilla publica su '
      + 'proyectado por rango con nombre. Un mes sin sueldos de administración no existe.',
  },
  {
    rubro: 'Nómina · Cargas sociales', dueno: 'Cargas Sociales', horizonte: HORIZONTE.diciembre,
    porque: 'La cadena F931 proyecta las cargas desde los jornales. Cuelga de la línea de arriba: si '
      + 'los jornales llegan a diciembre y las cargas no, se rompió la cadena.',
  },
  {
    rubro: 'Nómina · Gremiales', dueno: 'Cargas Sociales', horizonte: HORIZONTE.diciembre,
    porque: 'Misma cadena que las cargas: UOCRA e IERIC se devengan con cada quincena liquidada.',
  },
  {
    rubro: 'Nómina · SAC', dueno: 'Compras', horizonte: HORIZONTE.sin,
    porque: 'HUECO DECLARADO: el aguinaldo es ESTACIONAL (junio y diciembre), no una serie mensual. '
      + 'Hoy sólo entra si alguien lo tipea en Compras, así que el medio aguinaldo de diciembre puede '
      + 'no estar en el cuadro. Proyectarlo con un promedio mensual sería peor que no tenerlo: lo '
      + 'repartiría en doce meses donde sale en uno. Necesita que la planilla de nómina lo devengue.',
  },
  {
    rubro: 'Impuestos', dueno: 'Impuestos y Financieros', horizonte: HORIZONTE.diciembre,
    porque: 'El calendario de IVA e IIBB proyecta los doce períodos del año con su fecha de '
      + 'vencimiento real. Un mes sin impuestos es un mes que no se calculó.',
  },
  {
    rubro: 'Estructura', dueno: 'Estructura', horizonte: HORIZONTE.diciembre,
    porque: 'La pestaña proyecta por sub-rubro el promedio de los meses cerrados con gasto. Es el '
      + 'gasto que existe aunque no haya obra: si se corta, el cuadro afirma que la empresa deja de '
      + 'tener estructura. Eso es exactamente lo que pasaba antes del 13/08/2026.',
  },
  {
    rubro: 'Servicios recurrentes', dueno: 'Recurrentes', horizonte: HORIZONTE.diciembre,
    porque: 'Provisión por proveedor: la mediana de sus meses cerrados con gasto, neta de lo ya '
      + 'materializado. Movistar y los seguros se pagan todos los meses, haya obra o no.',
  },
  {
    rubro: 'Financiero', dueno: 'Compras', horizonte: HORIZONTE.cargado,
    porque: 'Cuotas del prendario y cargos del banco ya conocidos. El costo del descubierto futuro '
      + 'depende del saldo proyectado y lo calcula el motor de liquidez, no esta línea.',
  },
  {
    rubro: 'Deuda previsional (planes de pago)', dueno: 'Compras', horizonte: HORIZONTE.cargado,
    porque: 'Las cuotas de los planes de ARCA tienen fecha fija y se cargan por adelantado. Se corta '
      + 'cuando se termina el plan, que es lo correcto.',
  },
  {
    rubro: 'Cheques emitidos', dueno: 'Cheques Emitidos', horizonte: HORIZONTE.cargado,
    porque: 'Un cheque librado y no debitado, con su fecha de pago. No hay cheques futuros que '
      + 'proyectar: se libran contra una factura que ya está en Compras.',
  },
  {
    rubro: 'Cheques y tarjeta sin factura cargada', dueno: 'Cheques Emitidos', horizonte: HORIZONTE.cargado,
    porque: 'Es una línea que existe para DESAPARECER: sólo los pagos cuya factura todavía no se '
      + 'cargó. Que llegue a cero es el objetivo, no un hueco.',
  },
]

const porRubro = new Map(DUENOS.map((d) => [d.rubro, d]))

/** El dueño declarado de un rubro, o `null` si nadie lo declaró. PURA. */
export const duenoDe = (rubro) => porRubro.get(rubro) ?? null

/** Los rubros que el cuadro abre como línea propia: ingresos y egresos, en orden. PURA. */
export const rubrosDelCuadro = () => [...RUBROS_INGRESO, ...RUBROS_EGRESO]

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL MAPA DE PESTAÑAS — el rol de cada una frente al cuadro (la garantía anti-doble-conteo)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   PARTICION   — Compras. Cada fila cae en EXACTAMENTE un rubro de caja; duplicar es imposible.
//   FUENTE      — sus movimientos ENTRAN al Libro con un `origen.pestana` propio.
//   DERIVADA    — es una VISTA de otra pestaña. Su plata ya entró por la fuente: NO se suma.
//   ANCLA       — CAJA. Aporta el SALDO, no un flujo.
//   INFORMATIVO — registro histórico. No alimenta el cuadro.

/** @type {Array<{pestania:string, rol:string, concepto:string, deriva_de?:string, nota:string}>} */
export const MAPA = [
  {
    pestania: 'Compras', rol: 'PARTICION',
    concepto: 'los rubros de egreso del cuadro (materiales, estructura, impuestos, financiero, SAC…)',
    nota: 'Cada fila cae en exactamente un rubro de caja. El control del pie resta rubros contra el total de Compras: si algo quedara afuera, la diferencia deja de ser $0.',
  },
  {
    pestania: 'Cobranzas', rol: 'FUENTE', concepto: 'Ingresos · Cobranzas',
    nota: 'Único origen de los cobros. Un valor endosado no se suma: se entregó a un tercero y nunca va a acreditar.',
  },
  {
    pestania: 'Jornales por Quincena', rol: 'FUENTE',
    concepto: 'Nómina · Jornales de obra y Nómina · Sueldos administración',
    nota: 'El dato REAL de la planilla, no la estimación tipeada en Compras. Por eso `deCompras` saltea esos dos rubros: si los emitiera, la nómina entraría dos veces.',
  },
  {
    pestania: 'Cargas Sociales', rol: 'FUENTE', concepto: 'Nómina · Cargas sociales y Nómina · Gremiales',
    nota: 'La cadena proyecta desde los jornales y el Libro excluye las filas PROYECTADAS de esos rubros en Compras; las PAGADAS entran por Compras. Si deja de publicar, Compras vuelve entero (fail-safe).',
  },
  {
    pestania: 'Impuestos y Financieros', rol: 'FUENTE', concepto: 'Impuestos (IVA e IIBB a pagar)',
    // DEJÓ DE SER DERIVADA EN ESTA REESCRITURA: el mapa viejo decía "el pago vive en Compras", y es
    // falso desde que `deImpuestosCalendario` emite los doce períodos con su vencimiento real. En
    // Compras no hay UNA SOLA fila de IVA ni de IIBB — el propio generador de la pestaña lo dice.
    nota: 'El neto a pagar lo calcula esta pestaña mes por mes y el Libro lo toma de acá con la fecha de vencimiento real. Compras no tiene filas de IVA/IIBB, así que no hay doble conteo posible.',
  },
  {
    pestania: 'Recurrentes', rol: 'FUENTE', concepto: 'Servicios recurrentes (la provisión del mes)',
    // También cambió de rol: la provisión es un movimiento propio con `origen.pestana` "Recurrentes".
    nota: 'La provisión es "lo esperado − lo ya materializado en Compras", así que se consume sola cuando la factura real llega. Un mes completo proyecta $0.',
  },
  {
    pestania: 'Estructura', rol: 'FUENTE', concepto: 'Estructura (la proyección de los meses futuros)',
    nota: 'El real sale del rubro Estructura de Compras; esta pestaña aporta la proyección de los meses que todavía no llegaron, neta del real que ella misma publica en su bloque auxiliar. Nunca las dos.',
  },
  {
    pestania: 'Obras', rol: 'FUENTE', concepto: `${RUBRO_OBRAS} (materiales, alquileres y combustible por obra)`,
    nota: 'La explosión de costos declarada por el dueño. La mano de obra NO entra acá (va por Jornales) y la máquina propia tampoco (no es plata que sale). El importe es fórmula viva: se descuenta solo cuando la factura real entra a Compras.',
  },
  {
    pestania: 'Cheques Emitidos', rol: 'FUENTE', concepto: 'Cheques emitidos · Cheques y tarjeta sin factura cargada',
    nota: 'Sólo los cheques cuya factura NO está en Compras. El cheque cuya factura SÍ está ya viajó por el rubro de esa factura: sumarlo acá lo duplicaría.',
  },
  {
    pestania: 'Tarjeta de Credito', rol: 'FUENTE', concepto: 'Cheques y tarjeta sin factura cargada',
    nota: 'Mismo criterio anti-doble-conteo que Cheques Emitidos: sólo los consumos cuya factura no está en Compras.',
  },
  {
    pestania: '_BANCO_RAW', rol: 'FUENTE', concepto: 'Financiero (cargos e impuestos del banco)',
    nota: 'El extracto es testigo de lo que las pestañas todavía no saben. Sus cargos no están en Compras: si no entraran por acá, no entrarían por ningún lado.',
  },
  {
    pestania: '_CHEQUES_RAW', rol: 'FUENTE', concepto: 'Valores en cartera',
    nota: 'Los cheques de terceros en custodia, con su fecha de pago. Entran COMPROMETIDOS: están en la mano, no en la cuenta.',
  },
  {
    pestania: 'Proveedores', rol: 'DERIVADA', deriva_de: 'Compras',
    concepto: 'detalle de Materiales por proveedor',
    nota: 'Vista de las mismas compras agrupadas por proveedor. El dinero ya está en los rubros de materiales: NO se suma.',
  },
  {
    pestania: 'Materiales', rol: 'DERIVADA', deriva_de: 'Compras',
    concepto: 'detalle de Materiales por insumo',
    nota: 'Vista de las mismas compras agrupadas por material. El dinero ya está en los rubros de materiales: NO se suma.',
  },
  {
    pestania: 'CAJA', rol: 'ANCLA', concepto: 'Efectivo y equivalentes al inicio / al cierre del período',
    nota: 'Aporta el SALDO, no un flujo. El cuadro lo usa como punto de partida y encadena. Sumar un saldo como movimiento mezclaría stock con flujo.',
  },
  {
    pestania: 'Cheques Recibidos', rol: 'INFORMATIVO', concepto: '(ninguno — registro histórico de operaciones eCHEQ)',
    nota: 'Cada fila es una operación, no un cheque: sumar la columna contaría el mismo valor varias veces. La cartera real vive en _CHEQUES_RAW y el cobro en Cobranzas.',
  },
]

/** Los roles que representan plata que el cuadro SUMA. */
export const ROLES_SUMADOS = new Set(['PARTICION', 'FUENTE'])

/** NÚCLEO PURO: las pestañas que el mapa declara como sumadas. */
export const pestanasSumadasSegunMapa = () =>
  new Set(MAPA.filter((m) => ROLES_SUMADOS.has(m.rol)).map((m) => m.pestania))

/**
 * NÚCLEO PURO: las pestañas de las que el LIBRO realmente trae plata.
 *
 * Antes esto se derivaba de las fórmulas del cuadro retirado. Ahora se mide sobre los movimientos:
 * es la única forma de que el control siga siendo cierto cuando cambia el diseño de la vista.
 * @param {Array<{origen?:{pestana?:string}}>} movimientos
 * @returns {Set<string>}
 */
export function fuentesSumadas(movimientos = []) {
  const s = new Set()
  for (const m of movimientos ?? []) if (m?.origen?.pestana) s.add(m.origen.pestana)
  return s
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS DOS VERIFICACIONES
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO Y ESTÁTICO: que el mapa y la tabla de dueños sean internamente coherentes.
 *
 * No necesita movimientos: contesta "¿alguien declaró quién llena cada línea?" antes de que exista un
 * solo dato. Es lo que se rompe cuando alguien agrega un rubro al cuadro y se olvida de decir de dónde
 * sale — que es exactamente cómo nace una línea vacía que nadie reclama.
 * @returns {string[]} vacío = todo cierra
 */
export function verificarCobertura() {
  const problemas = []
  const declarados = new Set(DUENOS.map((d) => d.rubro))
  if (declarados.size !== DUENOS.length) problemas.push('hay un rubro declarado dos veces en DUENOS')

  for (const r of rubrosDelCuadro()) {
    if (!declarados.has(r)) {
      problemas.push(`la línea "${r}" del cuadro no tiene dueño declarado: nadie sabe de dónde sale ni hasta cuándo llega`)
    }
  }
  for (const d of DUENOS) {
    if (!rubrosDelCuadro().includes(d.rubro)) problemas.push(`"${d.rubro}" tiene dueño declarado pero el cuadro no lo abre como línea`)
    if (!Object.values(HORIZONTE).includes(d.horizonte)) problemas.push(`"${d.rubro}": horizonte inválido (${d.horizonte})`)
    if (!d.porque || d.porque.length < 40) problemas.push(`"${d.rubro}": el horizonte se declara sin explicar por qué`)
    const enMapa = MAPA.find((m) => m.pestania === d.dueno)
    if (!enMapa) problemas.push(`"${d.rubro}" dice salir de "${d.dueno}", que no está en el mapa de pestañas`)
    else if (!ROLES_SUMADOS.has(enMapa.rol)) problemas.push(`"${d.rubro}" sale de "${d.dueno}", que el mapa marca ${enMapa.rol} (no se suma)`)
  }
  const pestanias = MAPA.map((m) => m.pestania)
  if (new Set(pestanias).size !== pestanias.length) problemas.push('hay una pestaña repetida en el mapa')
  for (const m of MAPA.filter((x) => x.rol === 'DERIVADA')) {
    if (!m.deriva_de) problemas.push(`"${m.pestania}" es DERIVADA pero no dice de qué pestaña deriva`)
    else if (!pestanasSumadasSegunMapa().has(m.deriva_de)) problemas.push(`"${m.pestania}" deriva de "${m.deriva_de}", que no se suma`)
  }
  return problemas
}

/**
 * NÚCLEO PURO: hasta qué mes llega cada línea del cuadro, medido sobre el Libro.
 *
 * ═══ QUÉ CUENTA COMO "MES CUBIERTO", Y POR QUÉ NO ES SÓLO LO PENDIENTE ═══
 *
 * Un mes FUTURO sólo se puede cubrir con una proyección: un movimiento REAL con fecha de octubre es
 * una contradicción, no una cobertura. Pero el mes EN CURSO se cubre igual de bien con lo ya pagado —
 * los sueldos de administración de este mes salieron el día 3, y exigirles además un pendiente sería
 * reportar como hueco una línea que está al día. Ése era un falso positivo medido: un control que
 * grita por algo correcto se deja de mirar, y entonces tampoco se ve el grito que importa.
 *
 * Por eso: cubre lo PENDIENTE siempre, y lo REAL sólo hasta el mes en curso (`mesDesde`).
 *
 * `monto` en cambio suma SÓLO lo pendiente: es la plata que todavía va a salir, que es lo que se lleva
 * a una decisión de compra.
 *
 * @param {Array} movimientos el libro entero
 * @param {{anio:number, mesDesde:number, fechaDe:(serial:number)=>Date}} ctx
 * @returns {Array<{rubro:string, dueno:string, horizonte:string, ultimoMes:number|null, monto:number, meses:Set<number>}>}
 */
export function coberturaPorRubro(movimientos = [], { anio, mesDesde = 1, fechaDe } = {}) {
  const out = new Map(rubrosDelCuadro().map((r) => {
    const d = duenoDe(r)
    return [r, { rubro: r, dueno: d?.dueno ?? '(sin dueño)', horizonte: d?.horizonte ?? null, ultimoMes: null, monto: 0, meses: new Set() }]
  }))
  for (const m of movimientos ?? []) {
    const fila = out.get(m?.rubro)
    if (!fila) continue
    const f = fechaDe(m.fecha)
    if (f.getUTCFullYear() !== anio) continue
    const mes = f.getUTCMonth() + 1
    if (mes < mesDesde) continue
    const real = m?.estado === 'REAL'
    if (real && mes > mesDesde) continue // un REAL con fecha futura no cubre nada: es un dato roto
    fila.meses.add(mes)
    if (!real) {
      fila.monto += Math.abs(Number(m.importe) || 0)
      if (fila.ultimoMes === null || mes > fila.ultimoMes) fila.ultimoMes = mes
    }
  }
  return [...out.values()]
}

/**
 * NÚCLEO PURO: LO QUE HAY QUE GRITAR. Un renglón por línea que debía llegar a diciembre y no llega,
 * o que no tiene dueño, o cuyo hueco está declarado y sigue abierto.
 *
 * @param {Array} movimientos
 * @param {{anio:number, mesDesde?:number, hastaMes?:number, fechaDe:Function}} ctx
 * @returns {Array<{rubro:string, nivel:'HUECO'|'DECLARADO', texto:string}>}
 */
export function huecosDeCobertura(movimientos = [], { anio, mesDesde = 1, hastaMes = 12, fechaDe } = {}) {
  const avisos = []
  for (const c of coberturaPorRubro(movimientos, { anio, mesDesde, fechaDe })) {
    if (c.horizonte === HORIZONTE.diciembre) {
      const faltan = []
      for (let m = Math.max(mesDesde, 1); m <= hastaMes; m++) if (!c.meses.has(m)) faltan.push(m)
      if (faltan.length) {
        avisos.push({
          rubro: c.rubro, nivel: 'HUECO',
          texto: `"${c.rubro}" tiene que llegar a diciembre y le faltan los meses ${faltan.join(', ')} `
            + `(último con dato: ${c.ultimoMes ?? 'ninguno'}). Dueño: ${c.dueno}. `
            + `${duenoDe(c.rubro)?.porque ?? ''}`,
        })
      }
    } else if (c.horizonte === HORIZONTE.sin) {
      avisos.push({
        rubro: c.rubro, nivel: 'DECLARADO',
        texto: `"${c.rubro}" NO se proyecta y es un hueco conocido: ${duenoDe(c.rubro)?.porque ?? ''}`,
      })
    } else if (c.horizonte === null) {
      avisos.push({ rubro: c.rubro, nivel: 'HUECO', texto: `"${c.rubro}" no tiene dueño declarado` })
    }
  }
  return avisos
}

/**
 * NÚCLEO PURO: los problemas de ROL medidos contra el libro real (la mitad anti-doble-conteo).
 * @param {Array} movimientos
 * @returns {string[]}
 */
export function problemasDeRol(movimientos = []) {
  const problemas = []
  const reales = fuentesSumadas(movimientos)
  const declaradas = pestanasSumadasSegunMapa()
  const enMapa = new Set(MAPA.map((m) => m.pestania))
  for (const p of reales) {
    // Una pestaña que el mapa SÍ conoce pero con otro rol la reporta el bucle de abajo, con su rol
    // adentro del mensaje. Duplicar el aviso convierte un problema en dos y hace parecer peor lo que
    // es lo mismo — y un control que exagera se deja de mirar igual que uno que se calla.
    if (!declaradas.has(p) && !enMapa.has(p)) {
      problemas.push(`el libro trae plata de "${p}" y el mapa no la declara FUENTE/PARTICION (hueco de gobierno)`)
    }
  }
  for (const m of MAPA) {
    if (!ROLES_SUMADOS.has(m.rol) && reales.has(m.pestania)) {
      problemas.push(`"${m.pestania}" está marcada ${m.rol} pero el libro trae plata de ella (doble conteo)`)
    }
  }
  return problemas
}
