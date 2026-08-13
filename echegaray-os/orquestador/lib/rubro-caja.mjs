import { NOMBRES } from './sheet-pestanas.mjs'

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

// ═══ LAS DOS COLUMNAS DE COMPRAS QUE MANDAN EN CAJA — UNA SOLA DEFINICIÓN ═══
//
// POR QUÉ VIVEN ACÁ (25/07). "Rubro de caja" (qué es cada gasto) y "Fecha de caja" (cuándo sale la
// plata) son las dos columnas que rubro-caja-sheet.mjs ESCRIBE en Compras y de las que cuelga todo
// el cash flow. Pero la "Fecha de caja" no la lee sólo el cash flow: la pestaña CAJA la lee para
// DESCARGAR de su saldo las compras ya pagadas por transferencia/débito que el extracto todavía no
// muestra (lib/caja-posterior-al-corte.mjs, CMP.fecha). Ese es el efecto directo de un pago en
// Compras sobre CAJA, y depende de que ESCRITOR y LECTOR apunten a la MISMA columna.
//
// Antes la letra estaba tipeada por separado en los dos archivos (COL_FECHA=29 en el script, 'AD' en
// CMP). Si alguien mueve una y no la otra, el pago deja de descargar de la caja sin dar un solo
// error — el patrón "una fuente que se congela sin gritar" que este repo ya pagó caro. Por eso la
// identidad de la columna se define UNA vez, acá, los dos la importan, y un test verifica que
// coinciden. Cambiar la columna es cambiar esta línea; el resto sigue solo.
export const COL_RUBRO_CAJA = 'AC' // 0-based 28 — la escribe rubro-caja-sheet.mjs
export const COL_FECHA_CAJA = 'AD' // 0-based 29 — la escribe rubro-caja-sheet.mjs y la lee CAJA (CMP.fecha)

/** NÚCLEO PURO: el índice 0-based de una columna en letras de Sheet (A=0, AA=26, AD=29). */
export const colIndex = (letras) => [...String(letras).toUpperCase()].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

// Los proveedores que facturan TODOS los meses el mismo servicio. Sale de la pestaña Recurrentes.
export const RECURRENTES = ['robles jose maria', 'movistar', 'meglioli facundo fabian', 'sanitarios od s.a.s.', 'ruviño matias esteban', 'rsv', 'mass consultora']
// Los que son recurrentes AUNQUE la fila diga una unidad de obra. La exclusión por unidad existe
// para servicios que una obra consume y se terminan con ella (baños químicos); estos dos no son
// eso: el GPS de RSV es de la flota (un mes vino tipeado "Civil" y julio desapareció del cuadro), y
// MASS CONSULTORA la declaró el dueño (07/08/2026: "agregar a mass consultora que se pagó acá") —
// factura todos los meses aunque el servicio se preste en obras.
export const RECURRENTES_SIEMPRE = ['rsv', 'mass consultora']
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
    // ═══ EL MONTO SALE DE LA CADENA, NO DE LA FILA PLANA (06/08) ═══
    //
    // Decía `paga: 'compras'` y desde hoy es falso para lo que viene: la pestaña "Cargas Sociales"
    // proyecta las cargas del mes desde los jornales —$8.569.345 en agosto contra los $8.000.000
    // redondos tipeados en Compras— y publica la serie como rangos con nombre que el Libro lee. Es la
    // misma forma que ya tienen los jornales de obra: las filas siguen cargadas en Compras para
    // registrar el PAGO (y ese pago, cuando ocurre, entra por Compras como REAL), pero el monto
    // proyectado del cuadro sale de la pestaña que lo calcula.
    rubro: 'Nómina · Cargas sociales', detalle: 'Cargas Sociales', paga: 'Cargas Sociales',
    js: (r) => norm(r.cliente) === 'f931',
    sheet: '(LOWER($J$4:$J)="f931")',
    sql: ES('cliente', 'f931'),
  },
  {
    // Ídem: FCL, UOCRA, IERIC y FODECO son cuatro de los diez conceptos de la misma cadena y viajan
    // en su propio subtotal (CARGAS_MES_GREMIALES) para no mudarse a la línea de cargas sociales.
    rubro: 'Nómina · Gremiales', detalle: 'Cargas Sociales', paga: 'Cargas Sociales',
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
    // SE PAGA DESDE "Jornales por Quincena", igual que los jornales de obra (01/08). Compras tiene
    // estas filas cargadas a mano y le faltaban meses: los retiros de Dirección están una sola vez
    // (julio, a pagar el 10/08) y de septiembre a diciembre queda el renglón viejo de $3.000.000
    // contra un compromiso real de $9.800.000 — $26.000.000 que el cash flow no mostraba. La pestaña
    // de nómina tiene las dos mitades (planilla de Oficina + retiros de Dirección) y las proyecta.
    // Las filas siguen cargadas acá para registrar el PAGO; el monto del cuadro ya no sale de acá.
    rubro: 'Nómina · Sueldos administración', detalle: 'Jornales por Quincena', paga: 'Jornales por Quincena',
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
    // SÓLO SI NO ES DE UNA OBRA. Medido el 20/07: $4.186.497 de baños químicos, agua y servicio de
    // higiene y seguridad facturados a LA ESTRELLA y San Francisco caían acá y salían del costo de
    // esas obras. Peor todavía para proyectar: un baño de obra NO es un gasto fijo mensual — se
    // termina cuando termina la obra, y proyectarlo como recurrente inventa caja que no se va a usar.
    // Un servicio recurrente lo es cuando lo paga la estructura, no cuando lo consume una obra.
    rubro: 'Servicios recurrentes', detalle: 'Recurrentes', paga: 'compras',
    // La exclusión por unidad NO aplica a los SIEMPRE: la fórmula es (proveedor en la lista) Y
    // (unidad no es de obra O el proveedor es recurrente declarado por el dueño).
    js: (r) => RECURRENTES.includes(norm(r.proveedor))
      && (!['civil', 'mantenimiento'].includes(norm(r.unidad)) || RECURRENTES_SIEMPRE.includes(norm(r.proveedor))),
    sheet: `(REGEXMATCH(LOWER($E$4:$E&"");"^(${RECURRENTES.join('|').replace(/\./g, '\\.')})$")`
      + `*(((LOWER($I$4:$I)<>"civil")*(LOWER($I$4:$I)<>"mantenimiento"))`
      + `+REGEXMATCH(LOWER($E$4:$E&"");"^(${RECURRENTES_SIEMPRE.join('|')})$")>0)>0)`,
    sql: `(${UNO_DE('proveedor', RECURRENTES.map((r) => r.replace(/\./g, '\\.')))} and (${L(P.unidad)} not in ('civil', 'mantenimiento') or ${UNO_DE('proveedor', RECURRENTES_SIEMPRE)}))`,
  },
  {
    rubro: 'Materiales Civil', detalle: NOMBRES.proveedoresMateriales, paga: 'compras',
    js: (r) => norm(r.unidad) === 'civil',
    sheet: '(LOWER($I$4:$I)="civil")',
    sql: ES('unidad', 'civil'),
  },
  {
    rubro: 'Materiales Mantenimiento', detalle: NOMBRES.proveedoresMateriales, paga: 'compras',
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
 * La fecha en que la plata SALE de la caja. Nunca la de la factura: una factura de enero pagada en
 * junio es caja de junio.
 *
 * ═══ DOS CORRECCIONES (02/08) ═══
 *
 * 1 · SE CAYÓ LA RAMA `$Y`. El comentario de esta función decía "Y = fecha contable del pago". Esa
 *     columna NO EXISTE: la Y de Compras se llama "Tipo de Costo" y contiene "Directo"/"Indirecto".
 *     La referencia quedó fosilizada de cuando las columnas estaban en otro lado —el mismo desplazamiento
 *     que dejó los encabezados duplicados AB/AC y AG/AH—. Medido en el Sheet vivo: 0 filas tienen un
 *     número en Y, así que la rama nunca se usó y no rompió nada. Pero el día que alguien tipee un
 *     número ahí, ese número se leería como la fecha en que salió la plata. Se saca: una rama que
 *     apunta a la columna equivocada no es una funcionalidad, es una trampa esperando.
 *
 * 2 · UNA FECHA EN TEXTO CON MÁS DE UNA FECHA. `DATEVALUE("28/1/2026 y 7/3/26")` falla, así que la
 *     fila quedaba SIN fecha de caja y el control del Cash Flow la reportaba como "gasto sin fecha
 *     de pago". El dueño, con razón: *"esto es mentira, yo mismo corroboré la columna y todo tiene
 *     fecha"*. Tenía dos. Era la factura de Alumetal por $11.423.913, pagada en dos veces.
 *
 *     El control decía la causa equivocada, que es peor que no decir nada: manda a buscar una fecha
 *     que ya estaba. Ahora se EXTRAE la primera fecha del texto y la fila entra al cuadro por ella.
 *
 *     Es una aproximación declarada, no un dato: un pago en dos partes son dos movimientos de caja y
 *     acá entra como uno solo, en la fecha del primero. Para partirlo de verdad están las columnas
 *     que ya existen en Compras —"Monto Parcial 1" (U), "Fecha prevista de pago 2" (V) y "Monto
 *     Parcial 2" (W)—; mientras no se usen, una fecha aproximada y visible es mejor que una fila
 *     invisible para todo el cuadro.
 *
 * @returns {string} ARRAYFORMULA en es-AR
 */
export function formulaFechaCaja() {
  const q = '$Q$4:$Q'
  // La primera fecha dd/mm/aaaa que aparezca en el texto. Sirve igual para "23/7/2026" a secas.
  const primeraFecha = `REGEXEXTRACT(${q}&"";"\\d{1,2}/\\d{1,2}/\\d{2,4}")`
  return `=ARRAYFORMULA(IF(${FILA_REAL};"";IF(ISNUMBER(${q});${q};IFERROR(DATEVALUE(${primeraFecha});""))))`
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
