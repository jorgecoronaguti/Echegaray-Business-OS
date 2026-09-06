// ¿CUÁNTA PLATA DEL ARCHIVO LLEGA A LOS CASH FLOW? — la regla de oro 8 medida EN PESOS.
//
// ═══ POR QUÉ HACÍA FALTA OTRO CONTROL (06/09/2026) ═══
//
// La regla, textual del dueño: *"los cash flows semanales y mensuales tienen q reflejar todos los
// datos del sheet"*. Lo que ya existía no la prueba:
//
//   · `auditar-cuadre-cash-flow` compara las DOS VISTAS entre sí. Su propia cabecera declara que no
//     valida el número del que parten. Dos vistas que se equivocan igual siguen cuadrando.
//   · `cash-flow-cobertura.mjs` mide COBERTURA TEMPORAL (que a una línea no le falten meses) y ROLES
//     (que ninguna pestaña derivada se sume). Las dos preguntas son de estructura: ninguna cuenta
//     pesos, así que una fila de origen que se cae del Libro no mueve ni un renglón.
//
// Falta la pregunta de plata: **cuánta hay en el archivo, cuánta llega a las vistas, y de qué fila
// sale cada peso que no llega.** Eso es lo que mide este núcleo.
//
// ═══ LA CADENA TIENE DOS ESLABONES, Y SE MIDEN POR SEPARADO ═══
//
// Desde el 06/08 las dos vistas son una matriz que cuelga del Libro (`_MOVIMIENTOS`) con SUMPRODUCT
// por ventana de fechas (`libro-sumas.mjs`). Entonces un peso del archivo llega a una celda sólo si
// pasa los dos:
//
//   1. FUENTE → LIBRO. La fila de la pestaña de origen produjo un movimiento. Se mide fila por fila
//      contra la columna `Fila` del Libro, que es la que dice de dónde salió cada movimiento.
//   2. LIBRO → VISTA. La fecha del movimiento cae dentro de alguna columna. Las dos vistas están
//      ACOTADAS AL EJERCICIO (`cash-flow-borde-anio.mjs`: la última semana corta en `DATE(2027;1;1)`),
//      así que un movimiento fechado fuera del año no aparece en ninguna celda de ninguna de las dos.
//      Y el filtro lleva `ISNUMBER(fecha)` siempre: una fecha que no es número tampoco suma.
//
// ═══ POR QUÉ ESTO NO SE VALIDA CONTRA LO QUE ÉL MISMO PRODUCE ═══
//
// El eslabón 1 compara DOS artefactos distintos: la pestaña de origen tal como está escrita, y el
// Libro tal como quedó publicado. No recalcula el movimiento —no vuelve a correr el extractor— así
// que no puede "acertar por construcción": si el extractor deja una fila afuera, acá aparece.
//
// El eslabón 2 cruza los movimientos publicados contra los BORDES DE VENTANA que produce la geometría
// de la vista, que es otro módulo y otra corrida.
//
// ═══ LO QUE NO PRUEBA (límite declarado) ═══
//
// No prueba que el IMPORTE del movimiento sea el correcto: prueba que la fila produjo movimiento y que
// el movimiento cae en una ventana. Una fila que entró al Libro por la mitad de su valor pasa este
// control en verde. Eso lo tiene que medir un control de importe, que hoy no existe.
//
// NÚCLEO PURO: no toca la red, no lee el Sheet, no sabe de Google.

/** Serial de Sheets (base 30/12/1899) de una fecha UTC. */
export const serialDe = (anio, mes, dia) =>
  (Date.UTC(anio, mes - 1, dia) - Date.UTC(1899, 11, 30)) / 86400000

/**
 * LA VENTANA QUE CUBREN LAS DOS VISTAS. Es el ejercicio entero y ni un día más.
 *
 * Sale del mismo criterio que `expresionAcotada` escribe en la celda: la primera columna arranca en
 * `MAX(cab; DATE(anio;1;1))` y la última corta en `MIN(cab+7; DATE(anio+1;1;1))`. Si mañana el borde
 * cambia, este control tiene que cambiar con él o va a medir una ventana que la hoja ya no usa.
 */
export const ventanaDelEjercicio = (anio) => ({ desde: serialDe(anio, 1, 1), hasta: serialDe(anio + 1, 1, 1) })

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/**
 * ESLABÓN 2 · la plata del Libro que no cae en NINGUNA columna de NINGUNA vista.
 *
 * Devuelve magnitudes (valor absoluto): la pregunta es "cuánta plata no se ve", y una devolución que
 * se pierde es tan invisible como un pago que se pierde. El neto se despeja aparte si hace falta.
 *
 * @param {Array<{fecha:any, importe:any, origen:string, fila:any, rubro:string, estado:string}>} movs
 * @param {{desde:number, hasta:number}} ventana
 * @returns {{n:number, monto:number, porOrigen:Array, detalle:Array}}
 */
export function fueraDeLaVentana(movs = [], { desde, hasta } = {}) {
  const detalle = []
  for (const m of movs ?? []) {
    const fecha = num(m?.fecha)
    const importe = Math.abs(num(m?.importe) ?? 0)
    if (importe === 0) continue
    // Sin fecha numérica la fila no la suma ninguna celda: `terminoLibro` antepone ISNUMBER(fecha)
    // justamente porque una celda vacía compara como 0 y caería dentro de cualquier ventana.
    const motivo = fecha === null ? 'fecha que no es un número'
      : (fecha < desde ? 'anterior al ejercicio' : (fecha >= hasta ? 'posterior al ejercicio' : null))
    if (!motivo) continue
    detalle.push({ origen: txt(m?.origen), fila: m?.fila ?? null, fecha, importe, motivo, rubro: txt(m?.rubro), estado: txt(m?.estado) })
  }
  const porOrigen = agrupar(detalle, (d) => `${d.origen} · ${d.motivo}`)
  return { n: detalle.length, monto: detalle.reduce((s, d) => s + d.importe, 0), porOrigen, detalle }
}

/** Agrupa renglones por una clave y suma su importe. PURA. */
function agrupar(renglones, clave) {
  const m = new Map()
  for (const r of renglones) {
    const k = clave(r)
    const a = m.get(k) ?? { clave: k, n: 0, monto: 0, filas: [] }
    a.n++; a.monto += r.importe ?? r.monto ?? 0
    if (a.filas.length < 12) a.filas.push(r.fila)
    m.set(k, a)
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto)
}

/**
 * ESLABÓN 1 · qué filas de una pestaña de origen produjeron movimiento, según el LIBRO.
 *
 * La columna `Fila` del Libro es un número para casi todos los orígenes y un texto para los que no
 * tienen una fila propia que citar ("76 · cheque 104" cuando una compra se parte en cuotas de cheque,
 * "Quincenas reales:3"). Se toma el entero inicial: es la fila de la pestaña, y sin esto una compra
 * partida en cheques se contaría como no cubierta —era el falso positivo de $6,5M de la primera
 * medición de este control.
 *
 * @param {Array<{origen:string, fila:any}>} movs
 * @param {string} pestana
 * @returns {Set<number>}
 */
export function filasCubiertas(movs = [], pestana) {
  const s = new Set()
  for (const m of movs ?? []) {
    if (txt(m?.origen) !== pestana) continue
    const n = parseInt(String(m?.fila ?? ''), 10)
    if (Number.isFinite(n)) s.add(n)
  }
  return s
}

/**
 * LAS EXCLUSIONES DECLARADAS DE COMPRAS: plata que la pestaña tiene y el Libro NO toma **a propósito**,
 * porque la misma obligación entra por otra puerta. Cada una nombra la puerta.
 *
 * Un motivo que NO esté acá deja la fila como HUECO, que es fallar cerrado: se prefiere gritar por una
 * exclusión legítima todavía no declarada que callarse una que no lo es.
 */
export const EXCLUSIONES_COMPRAS = Object.freeze([
  {
    motivo: 'la nómina entra por "Jornales por Quincena"',
    cuando: (r) => /^Nómina · (Jornales de obra|Sueldos administración)$/.test(r.rubro),
    porque: 'Son la estimación tipeada a mano en Compras. El dato real sale de la planilla de quincenas; '
      + 'emitir los dos contaría la nómina dos veces (ver `deCompras`, que saltea esos dos rubros).',
  },
  {
    motivo: 'la cadena de "Cargas Sociales" reemplaza la previsión de Compras',
    cuando: (r) => /^Nómina · (Cargas sociales|Gremiales)$/.test(r.rubro) && !r.pagada,
    porque: 'La cadena proyecta el F931 y los gremiales mes por mes desde los jornales, y el Libro excluye '
      + 'las filas PROYECTADAS de esos rubros en Compras. Las PAGADAS sí entran por Compras.',
  },
])

/** Las exclusiones declaradas de Cobranzas. */
export const EXCLUSIONES_COBRANZAS = Object.freeze([
  {
    motivo: 'valor endosado a un proveedor: nunca va a acreditar',
    cuando: (r) => r.endosado,
    porque: 'El echeq entró y se entregó para pagar una compra. Esa plata no pasa por la cuenta corriente: '
      + 'el egreso ya está en Compras y sumar el ingreso lo mostraría cobrado dos veces.',
  },
  {
    motivo: 'fila anulada por el dueño (Estado = Cancelar)',
    cuando: (r) => /cancelar/i.test(r.estado),
    porque: 'Un estado "Cancelar" es la anulación explícita de la fila. No es un cobro que se perdió.',
  },
])

/**
 * NÚCLEO: la cobertura de UNA fuente. Devuelve la plata censada, la que llegó al Libro, y la que no
 * llegó abierta en DECLARADA (una exclusión con nombre) y HUECO (plata que desaparece sin explicación).
 *
 * @param {{pestana:string, renglones:Array<{fila:number, monto:number}>, cubiertas:Set<number>,
 *          exclusiones:Array<{motivo:string, cuando:Function, porque:string}>}} arg
 */
export function coberturaDeFuente({ pestana, renglones = [], cubiertas = new Set(), exclusiones = [] } = {}) {
  const declarados = []
  const huecos = []
  let censado = 0
  let cubierto = 0
  for (const r of renglones) {
    const monto = Math.abs(num(r?.monto) ?? 0)
    censado += monto
    if (cubiertas.has(r.fila)) { cubierto += monto; continue }
    const regla = exclusiones.find((e) => e.cuando(r))
    if (regla) declarados.push({ ...r, monto, motivo: regla.motivo })
    else huecos.push({ ...r, monto, motivo: r.motivoHueco ?? 'no produjo movimiento y ninguna exclusión declarada lo explica' })
  }
  return {
    pestana,
    censado,
    cubierto,
    declarado: declarados.reduce((s, d) => s + d.monto, 0),
    hueco: huecos.reduce((s, d) => s + d.monto, 0),
    porMotivoDeclarado: agrupar(declarados, (d) => d.motivo),
    porMotivoHueco: agrupar(huecos, (d) => d.motivo),
    huecos,
  }
}

/**
 * EL RESUMEN DEL ARCHIVO: la única cifra que contesta la regla 8, y su desglose.
 *
 * `platoDelArchivo` es lo CENSADO, no "toda la plata del Sheet": sólo las fuentes que tienen un censo
 * de filas declarado. Las demás se listan aparte con su motivo — un total que dijera "el archivo
 * entero" sin haber mirado doce pestañas sería el peor resultado posible, porque se leería como una
 * garantía que nadie dio.
 */
export function resumenDeCobertura({ fuentes = [], fuera = null, sinCenso = [] } = {}) {
  const censado = fuentes.reduce((s, f) => s + f.censado, 0)
  const hueco = fuentes.reduce((s, f) => s + f.hueco, 0)
  const declarado = fuentes.reduce((s, f) => s + f.declarado, 0)
  const fueraDeVista = fuera?.monto ?? 0
  return {
    censado,
    llegaAlLibro: fuentes.reduce((s, f) => s + f.cubierto, 0),
    declarado,
    hueco,
    fueraDeVista,
    noLlegaALaVista: hueco + fueraDeVista,
    fuentes,
    fuera,
    sinCenso,
    ok: hueco === 0 && fueraDeVista === 0,
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS CENSOS DE FILA — qué filas de cada pestaña tienen plata. Puros: reciben filas y columnas ya
// resueltas por rótulo (`columnasDeCompras`, `columnasObligatorias`), nunca índices tipeados acá.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * COMPRAS. `fila0` es 1-based: los datos arrancan en la 4 (1 título, 2 agrupador, 3 encabezado).
 *
 * Se censa TODA fila con importe distinto de cero, incluida la que no tiene fecha de caja: esa es
 * justamente la que desaparece, y dejarla fuera del censo la volvería invisible para su propio control.
 */
export function censoDeCompras(filas = [], c, { fila0 = 4 } = {}) {
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[c.importe])
    if (importe === null || importe === 0) continue
    const fechaCaja = num(f[c.fechaCaja])
    out.push({
      fila: i + 1,
      monto: importe,
      rubro: txt(f[c.rubro]),
      proveedor: txt(f[c.proveedor]),
      comprobante: txt(f[c.comprobante]),
      cuit: txt(f[c.cuit]),
      fechaCaja,
      estado: txt(f[c.estado]),
      pagada: /^pagado$/i.test(txt(f[c.estado]).replace(/[^a-záéíóúüñ]/gi, '')),
      tipoPago: txt(f[c.tipoPago]),
      motivoHueco: fechaCaja === null
        ? 'la celda "Fecha de caja" está vacía: sin fecha no hay movimiento y la plata no entra a ninguna columna'
        : 'la clave (CUIT · comprobante · signo) choca con otra fila y la deduplicación se queda con una sola',
    })
  }
  return out
}

/** COBRANZAS. Los datos arrancan en la fila 5 (la 4 es el encabezado). */
export function censoDeCobranzas(filas = [], c, { fila0 = 5 } = {}) {
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[c.importe])
    if (importe === null || importe === 0) continue
    const fecha = num(f[c.fechaEsperada])
    out.push({
      fila: i + 1,
      monto: importe,
      estado: txt(f[c.estado]),
      cliente: txt(f[c.cliente]),
      fecha,
      endosado: false,
      motivoHueco: fecha === null
        ? 'la celda "Fecha cobro" está vacía: sin fecha no hay movimiento'
        : 'no produjo movimiento y ninguna exclusión declarada lo explica',
    })
  }
  return out
}

/**
 * MARCAR LOS COBROS QUE SE FUERON ENDOSADOS — la explicación, no el veredicto.
 *
 * ═══ POR QUÉ SÓLO SOBRE LAS FILAS QUE EL LIBRO NO TOMÓ (06/09/2026) ═══
 *
 * La primera versión emparejaba contra TODAS las filas de Cobranzas por orden de aparición, y los dos
 * valores de $10.000.000 se los llevaba el primer cobro de ese importe que aparecía en la planilla —
 * que estaba perfectamente cubierto—. Resultado: las dos filas realmente excluidas (43 y 48, LA
 * ESTRELLA) quedaban denunciadas como hueco de $20.000.000 y el control publicaba un rojo falso.
 *
 * Quién está cubierto lo sigue diciendo el LIBRO y sólo el Libro: esto no cambia un solo veredicto de
 * cobertura, únicamente reparte los motivos entre las filas que ya quedaron afuera. Si mañana un cobro
 * desaparece del Libro por otra razón, no encuentra endoso libre y sale como hueco igual.
 *
 * Uno a uno: dos cobros endosados consumen dos valores de la cartera, no uno.
 *
 * @param {Array} renglones el censo de Cobranzas
 * @param {number[]} endosados los importes que `_CHEQUES_RAW` declara con estado "Endosado"
 * @param {Set<number>} cubiertas las filas que sí produjeron movimiento
 */
export function marcarEndosos(renglones = [], endosados = [], cubiertas = new Set()) {
  const libres = [...endosados]
  for (const r of renglones) {
    if (cubiertas.has(r.fila)) continue
    const j = libres.findIndex((v) => Math.abs(v - r.monto) < 1)
    if (j < 0) continue
    libres.splice(j, 1)
    r.endosado = true
  }
  return renglones
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL INVENTARIO DE FUENTES — quién está censado fila por fila y quién no, con el motivo
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LAS FUENTES CON CENSO DE FILA. Su plata se compara renglón por renglón contra el Libro.
 *
 * Son las dos que registran una OBLIGACIÓN POR FILA: una factura, un cobro. En ellas "esta fila no
 * produjo movimiento" es una afirmación exacta.
 */
export const CENSADAS = Object.freeze(['Compras', 'Cobranzas'])

/**
 * LAS FUENTES SIN CENSO DE FILA, Y POR QUÉ NO SE PUEDEN CENSAR ASÍ.
 *
 * No es una lista de perdón: es la declaración de qué parte de la regla 8 este control TODAVÍA no
 * prueba. Todas siguen cubiertas por el eslabón 2 (si su movimiento cae fuera de la ventana, aparece);
 * lo que no se mide es si la pestaña tenía una fila más que nunca produjo movimiento.
 *
 * @type {Array<{pestana:string, porque:string}>}
 */
export const SIN_CENSO_DE_FILA = Object.freeze([
  { pestana: 'Jornales por Quincena', porque: 'el movimiento no sale de una fila sino de un BLOQUE (quincena, oficina, dirección) y se parte en pagado + pendiente: no hay fila que citar.' },
  { pestana: 'Cargas Sociales', porque: 'la cadena proyecta un devengado por mes desde los jornales; el origen que cita es "F931 · devengado 9", no una fila.' },
  { pestana: 'Estructura', porque: 'la proyección es por CONCEPTO y mes ("Combustible·10"), neta de lo ya facturado en Compras. No hay correspondencia 1:1 con una fila.' },
  { pestana: 'Recurrentes', porque: 'la provisión es "lo esperado del mes − lo materializado en Compras": un cálculo, no una fila.' },
  { pestana: 'Obras', porque: 'sale del cuadro 5 de OBRAS (explosión de costos declarada por el dueño) y cita "cuadro5:f45": la fila es del cuadro, no de una pestaña de registro.' },
  { pestana: 'Impuestos y Financieros', porque: 'el movimiento es la celda de un calendario (IVA/IIBB del mes), citada como "I28". Censar filas no aplica: se censarían celdas.' },
  { pestana: 'Cheques Emitidos', porque: 'por diseño sólo emite los cheques SIN factura cargada — el que tiene factura viaja por Compras. Un censo de filas marcaría como hueco cada cheque correctamente excluido.' },
  { pestana: 'Tarjeta de Credito', porque: 'mismo criterio anti-doble-conteo que Cheques Emitidos: sólo la cuota sin factura cargada.' },
  { pestana: '_BANCO_RAW', porque: 'el extracto NO emite movimientos de caja salvo los cargos sin factura; el saldo del banco ya contiene el resto. Censarlo entero pediría duplicar $9,9M.' },
  { pestana: '_CHEQUES_RAW', porque: 'sólo emite los valores de terceros EN CARTERA; el depositado ya entró por Cobranzas y el endosado no va a entrar nunca.' },
])

/**
 * NÚCLEO PURO: ¿hay un origen en el Libro que nadie censó ni declaró?
 *
 * Es la guarda que hace que este control no se quede viejo solo. El día que un extractor nuevo empiece
 * a emitir con un `origen.pestana` que no está en ninguna de las dos listas, la regla 8 deja de estar
 * medida para esa fuente — y esto lo dice en vez de seguir publicando un total que ya no la incluye.
 *
 * @param {Array<{origen:string}>} movs
 * @returns {string[]} vacío = todo origen tiene su tratamiento declarado
 */
export function origenesSinDeclarar(movs = []) {
  const declarados = new Set([...CENSADAS, ...SIN_CENSO_DE_FILA.map((s) => s.pestana)])
  const vistos = new Set()
  for (const m of movs ?? []) {
    const o = txt(m?.origen)
    if (o && !declarados.has(o)) vistos.add(o)
  }
  return [...vistos].sort()
}
