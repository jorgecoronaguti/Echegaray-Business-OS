// EL RUBRO DE CAJA DE CADA GASTO — UNA SOLA DEFINICIÓN.
//
// POR QUÉ EXISTE (20/07). El dueño: "no puede haber nada ni duplicado ni fuera de consideración" y
// "no estoy conforme con los conceptos que contempla Compras". Al medirlo, tenía razón por partida
// triple:
//   · El Cash Flow Semanal y el Mensual NO tenían las mismas líneas. El Mensual no tenía "Servicios
//     recurrentes": $9.825.332 quedaban afuera del año entero, sin que nada lo avisara.
//   · Los dos leían "Estructura" de un rango de filas que ya no existía → $33.223.269 en $0.
//   · La regla que decide qué es cada gasto vivía en una COLUMNA AUXILIAR ESCONDIDA del Cash Flow
//     Semanal (BF1). Invisible para el dueño, y copiada a mano en cada pestaña que la necesitaba.
//
// La causa de fondo es una sola y es la regla de arquitectura del proyecto: un concepto que se ve en
// más de un lado se define UNA vez. El rubro de un gasto se ve en Compras, en los dos cash flow, en
// cada pestaña de detalle y en la web. Por eso ahora vive en Compras, en una columna VISIBLE, y todo
// lo demás la referencia.
//
// LA PROPIEDAD QUE ESTE ARCHIVO DEFIENDE: los rubros son una PARTICIÓN de Compras. Cada fila cae en
// exactamente uno (el primero que matchea gana, el orden es parte de la regla) y ninguna queda
// afuera. Eso se puede verificar con una resta, y la resta está permanentemente a la vista en el
// Sheet. Medido sobre las 736 filas reales: 736/736, $572.065.865 = el total de Compras, 0 sin
// clasificar.
//
// CUIDADO CON EL ORDEN. "Sueldos" a una obra son jornales; "Sueldos" sin obra son administración.
// El F931 es carga social, no impuesto. UOCRA/FCL/IERIC/FODECO son gremiales, no impuestos. Si
// alguien reordena las reglas, la partición sigue cerrando pero la plata cambia de línea.

/** Normaliza para comparar: sin espacios de más, en minúsculas. PURA. */
export const norm = (s) => String(s ?? '').trim().toLowerCase()

// Los proveedores que facturan TODOS los meses el mismo servicio. Sale de la pestaña Recurrentes.
const RECURRENTES = ['robles jose maria', 'movistar', 'meglioli facundo fabian', 'sanitarios od s.a.s.', 'ruviño matias esteban', 'rsv']
// Los clientes/obras que identifican una obra real: "Sueldos" contra uno de estos son JORNALES.
const OBRAS = ['obras', 'san francisco', 'la estrella', 'messinas', 'arcor', 'javier sanchez', 'imotor']
const GREMIALES = ['sindicatos', 'uocra', 'fcl', 'ieric', 'fodeco']

// Los nombres de las columnas de costos_obra que corresponden a cada dato de Compras. La tabla usa
// otros nombres que la planilla (obra_texto es el "Cliente/Asignación" de la columna J), así que la
// traducción se escribe UNA vez acá y no en cada consulta.
const P = { proveedor: 'proveedor', unidad: 'unidad_negocio', cliente: 'obra_texto', concepto: 'concepto' }
/** Compara en minúsculas y sin NULL: en SQL, NULL = 'x' no es falso, es NULL, y arrastra el CASE. */
const L = (c) => `lower(coalesce(${c}, ''))`
const ES = (c, v) => `${L(P[c])} = '${v}'`
const UNO_DE = (c, vs) => `${L(P[c])} ~ '^(${vs.join('|')})$'`

/**
 * Las reglas, EN ORDEN. La primera que matchea gana.
 *   rubro   — la línea del cash flow (el nombre exacto que se ve en el Sheet)
 *   detalle — qué pestaña tiene el detalle de ese rubro. Es lo que evita la duplicación: si un rubro
 *             se paga desde otra pestaña, el cash flow lo toma de ahí y NO de Compras.
 *   paga    — 'compras' = el monto sale de Compras · el nombre de una pestaña = sale de esa pestaña.
 *   js      — la condición
 *   sheet   — la MISMA condición en fórmula es-AR, para la columna de Compras. Las dos se escriben
 *             acá pegadas a propósito: separadas, se desincronizan y nadie se entera.
 */
export const REGLAS = [
  {
    rubro: 'Nómina · SAC', detalle: 'Compras', paga: 'compras',
    js: (r) => norm(r.proveedor) === 'sac',
    sheet: '(LOWER($E$4:$E)="sac")',
    sql: ES('proveedor', 'sac'),
  },
  {
    // NO son impuestos: son F931 viejos financiados en cuotas. Estaban dentro de "Impuestos" y por
    // eso esa línea mostraba $9.835.877 — tapando que de IVA e IIBB no hay NADA cargado. Es deuda
    // de seguridad social, y para la caja se comporta como una cuota fija, no como un impuesto que
    // varía con las ventas.
    //
    // MIRA EL CONCEPTO, NO EL CLIENTE. Todas estas filas tienen cliente "Plan de pago", pero bajo esa
    // misma etiqueta también están el Anticipo de Ganancias ($577.710) y Acciones y Participaciones
    // ($205.974), que SÍ son impuestos nacionales. Filtrando por cliente se los llevaba puestos.
    //
    // VA ANTES QUE "Cargas sociales" A PROPÓSITO. El "Plan F931 W303094" tiene cliente F931, así que
    // la regla de cargas sociales se lo llevaba y sus $7.484.627 aparecían como F931 del mes. No lo
    // es: es la financiación en cuotas del F931 de junio. Para la caja son cosas distintas — una
    // varía con la nómina del mes, la otra es una cuota fija que ya está comprometida.
    rubro: 'Deuda previsional (planes de pago)', detalle: 'Cargas Sociales', paga: 'compras',
    js: (r) => /deuda previcional|deuda previsional|plan f931/i.test(String(r.concepto ?? '')),
    sheet: '(REGEXMATCH(LOWER($K$4:$K&" "&$L$4:$L);"deuda previcional|deuda previsional|plan f931"))',
    sql: `${L(P.concepto)} ~ 'deuda previcional|deuda previsional|plan f931'`,
  },
  {
    rubro: 'Nómina · Cargas sociales', detalle: 'Cargas Sociales', paga: 'compras',
    js: (r) => norm(r.cliente) === 'f931',
    sheet: '(LOWER($J$4:$J)="f931")',
    sql: ES('cliente', 'f931'),
  },
  {
    rubro: 'Nómina · Gremiales', detalle: 'Cargas Sociales', paga: 'compras',
    js: (r) => GREMIALES.includes(norm(r.proveedor)) || GREMIALES.slice(1).includes(norm(r.cliente)),
    sheet: `(REGEXMATCH(LOWER($E$4:$E&"");"^(${GREMIALES.join('|')})$")+REGEXMATCH(LOWER($J$4:$J&"");"^(${GREMIALES.slice(1).join('|')})$")>0)`,
    sql: `(${UNO_DE('proveedor', GREMIALES)} or ${UNO_DE('cliente', GREMIALES.slice(1))})`,
  },
  {
    // Se paga desde Jornales por Quincena, que tiene el dato REAL de la planilla de jornales.
    // Compras acá tiene estimaciones tipeadas a mano ($144,8M) contra $114,4M reales.
    rubro: 'Nómina · Jornales de obra', detalle: 'Jornales por Quincena', paga: 'Jornales por Quincena',
    js: (r) => norm(r.proveedor) === 'sueldos' && OBRAS.includes(norm(r.cliente)),
    sheet: `((LOWER($E$4:$E)="sueldos")*REGEXMATCH(LOWER($J$4:$J&"");"^(${OBRAS.join('|')})$")>0)`,
    sql: `(${ES('proveedor', 'sueldos')} and ${UNO_DE('cliente', OBRAS)})`,
  },
  {
    rubro: 'Nómina · Sueldos administración', detalle: 'Compras', paga: 'compras',
    js: (r) => norm(r.proveedor) === 'sueldos',
    sheet: '(LOWER($E$4:$E)="sueldos")',
    sql: ES('proveedor', 'sueldos'),
  },
  {
    // Impuestos de verdad. Hoy son sólo $783.684 (Anticipo de Ganancias y Acciones y
    // Participaciones): de IVA y de IIBB no hay NI UN PAGO cargado en todo el año, aunque ARCA tiene
    // 459 comprobantes y la posición de marzo dio $11,1M a pagar. La línea existe justamente para
    // que ese hueco se vea en el cash flow en vez de quedar tapado por los planes de pago.
    rubro: 'Impuestos', detalle: 'Impuestos y Financieros', paga: 'compras',
    js: (r) => norm(r.unidad) === 'impuestos' || norm(r.proveedor) === 'arca' || norm(r.cliente) === 'plan de pago',
    sheet: '((LOWER($I$4:$I)="impuestos")+(LOWER($E$4:$E)="arca")+(LOWER($J$4:$J)="plan de pago")>0)',
    sql: `(${ES('unidad', 'impuestos')} or ${ES('proveedor', 'arca')} or ${ES('cliente', 'plan de pago')})`,
  },
  {
    rubro: 'Financiero', detalle: 'Impuestos y Financieros', paga: 'compras',
    js: (r) => norm(r.unidad) === 'financiero' || norm(r.cliente) === 'credito prendario' || norm(r.proveedor) === 'banco',
    sheet: '((LOWER($I$4:$I)="financiero")+(LOWER($J$4:$J)="credito prendario")+(LOWER($E$4:$E)="banco")>0)',
    sql: `(${ES('unidad', 'financiero')} or ${ES('cliente', 'credito prendario')} or ${ES('proveedor', 'banco')})`,
  },
  {
    rubro: 'Servicios recurrentes', detalle: 'Recurrentes', paga: 'compras',
    js: (r) => RECURRENTES.includes(norm(r.proveedor)),
    sheet: `(REGEXMATCH(LOWER($E$4:$E&"");"^(${RECURRENTES.join('|').replace(/\./g, '\\.')})$"))`,
    sql: UNO_DE('proveedor', RECURRENTES.map((r) => r.replace(/\./g, '\\.'))),
  },
  {
    rubro: 'Materiales Civil', detalle: 'Materiales', paga: 'compras',
    js: (r) => norm(r.unidad) === 'civil',
    sheet: '(LOWER($I$4:$I)="civil")',
    sql: ES('unidad', 'civil'),
  },
  {
    rubro: 'Materiales Mantenimiento', detalle: 'Materiales', paga: 'compras',
    js: (r) => norm(r.unidad) === 'mantenimiento',
    sheet: '(LOWER($I$4:$I)="mantenimiento")',
    sql: ES('unidad', 'mantenimiento'),
  },
  {
    rubro: 'Estructura', detalle: 'Estructura', paga: 'compras',
    js: (r) => norm(r.unidad) === 'estructura',
    sheet: '(LOWER($I$4:$I)="estructura")',
    sql: ES('unidad', 'estructura'),
  },
]

/** El nombre que se usa cuando NINGUNA regla matchea. Tiene que dar 0 filas y $0. */
export const SIN_CLASIFICAR = 'SIN CLASIFICAR'

/** Todos los rubros, en el orden en que se muestran en el cash flow. PURA. */
export const RUBROS = REGLAS.map((r) => r.rubro)

/** Los rubros cuyo monto sale de Compras (los otros los paga su propia pestaña). PURA. */
export const RUBROS_DE_COMPRAS = REGLAS.filter((r) => r.paga === 'compras').map((r) => r.rubro)

/**
 * NÚCLEO PURO: a qué rubro de caja pertenece una fila de Compras.
 * @param {{proveedor?:string, unidad?:string, cliente?:string, concepto?:string}} fila columnas E, I, J, K+L de Compras
 * @returns {string} el rubro, o SIN_CLASIFICAR
 */
export function rubroDeCaja(fila = {}) {
  for (const r of REGLAS) if (r.js(fila)) return r.rubro
  return SIN_CLASIFICAR
}

// ¿Esta fila de Compras es un gasto de verdad?
//
// NO alcanza con mirar el Total (columna O): O tiene la fórmula "=N+M" copiada hasta el fondo de la
// planilla, así que en una fila vacía devuelve 0 — no vacío. Con el guard puesto en O="" las 194
// filas en blanco del final entraban a clasificarse y salían como SIN CLASIFICAR, ensuciando el
// control que justamente existe para avisar de gastos sin rubro. Una fila es real si tiene
// proveedor o tiene plata.
const FILA_REAL = '(($E$4:$E="")*(N($O$4:$O)=0))'

/**
 * La MISMA regla, como una sola fórmula para la columna de Compras.
 * Se genera desde REGLAS para que no pueda desincronizarse de rubroDeCaja().
 * @returns {string} ARRAYFORMULA en es-AR (separador ';')
 */
export function formulaRubro() {
  let f = `"${SIN_CLASIFICAR}"`
  for (const r of [...REGLAS].reverse()) f = `IF(${r.sheet};"${r.rubro}";${f})`
  return `=ARRAYFORMULA(IF(${FILA_REAL};"";${f}))`
}

/**
 * La MISMA regla, como función de Postgres. Tercera cara de la única definición.
 *
 * POR QUÉ HACE FALTA. La regla estaba escrita para JS y para el Sheet, pero NO para la base — así
 * que la web y el chat, que leen Supabase, no sabían qué rubro era cada gasto. Medido: el calendario
 * de caja de la web mostraba $4.121.169 de egresos futuros contra $352.066.471 en el Sheet. No era
 * un bug de la web: era que la definición vivía en la planilla en vez de en el núcleo.
 *
 * Se GENERA desde REGLAS, igual que formulaRubro(). Un CASE tipeado a mano en una migración se
 * desincroniza el día que alguien agrega un rubro, y nadie se entera hasta que los números no cierran.
 * @returns {string} cuerpo del CASE, en SQL
 */
export function sqlRubroDeCaja() {
  const ramas = REGLAS.map((r) => {
    if (!r.sql) throw new Error(`rubro-caja: la regla "${r.rubro}" no tiene traducción a SQL`)
    return `    when ${r.sql} then '${r.rubro}'`
  })
  return ['  case', ...ramas, `    else '${SIN_CLASIFICAR}'`, '  end'].join('\n')
}

/**
 * La fecha en que la plata SALE de la caja: la contable del pago si está, si no la prevista.
 * (Y = fecha contable del pago, Q = fecha prevista). Nunca la fecha de la factura: una factura de
 * enero pagada en junio es caja de junio.
 * @returns {string} ARRAYFORMULA en es-AR
 */
export function formulaFechaCaja() {
  return `=ARRAYFORMULA(IF(${FILA_REAL};"";IF(ISNUMBER($Y$4:$Y);$Y$4:$Y;IF(ISNUMBER($Q$4:$Q);$Q$4:$Q;IFERROR(DATEVALUE($Q$4:$Q&"");"")))))`
}

/**
 * NÚCLEO PURO: reparte una lista de filas por rubro y verifica que sea una partición.
 * @param {Array} filas filas con {proveedor, unidad, cliente, total}
 * @returns {{por_rubro:Array, total:number, sin_clasificar:number, cierra:boolean}}
 */
export function repartir(filas = []) {
  const acc = new Map()
  let total = 0
  for (const f of filas) {
    const k = rubroDeCaja(f)
    const m = Number(f.total) || 0
    total += m
    const a = acc.get(k) ?? { rubro: k, filas: 0, monto: 0 }
    a.filas++; a.monto += m
    acc.set(k, a)
  }
  const por_rubro = [...acc.values()].sort((a, b) => b.monto - a.monto)
  const sc = acc.get(SIN_CLASIFICAR)
  const suma = por_rubro.reduce((s, r) => s + r.monto, 0)
  return {
    por_rubro,
    total,
    sin_clasificar: sc?.filas ?? 0,
    // Tolerancia de un peso por redondeo; una diferencia real es un bug, no un decimal.
    cierra: !sc && Math.abs(suma - total) < 1,
  }
}
