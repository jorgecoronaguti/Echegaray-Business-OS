// EL DETALLE TÉCNICO DE "IMPUESTOS Y FINANCIEROS" — las secciones 4 a 10, cada una con su driver.
//
// Va DESPUÉS de la posición y del calendario, y es a propósito: la pantalla contesta primero "cuánto
// tengo, qué vence y cuánto necesito", y recién después "cómo se calculó". Acá vive el cómo.

import { seccion, sub as subItem, total as rotuloTotal } from './patron-pestana.mjs'
import { CALENDARIO_IMPUESTOS } from './cash-flow-lineas.mjs'
import { rango } from './compras-columnas.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import {
  formulaDebitoProyectado, formulaCreditoProyectado, formulaAPagarProyectado,
  formulaLibreDispProyectada, RANGO_ALICUOTA_IVA,
} from './iva-libre-disponibilidad.mjs'
import {
  formulaCuotaPrendario, formulaPrendarioPendiente, formulaPlanesPendiente,
  formulaAlicuotaIibbVigente, formulaBaseIibbProyectada, formulaIibbDeterminado,
  formulaImpuestoCheque, rangoIibb,
} from './impuestos-cuadro.mjs'
import { IIBB_RAW, IIBB_COL, IIBB_FILA0, BANCO_RAW } from './impuestos-fuentes.mjs'
import { M12, MES, cmes, AJENO } from './impuestos-grilla.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · IVA — LA DDJJ OFICIAL (F.2051)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El IVA se lee de la F.2051 presentada, que es la fuente primaria, y no del cálculo por
// comprobantes. El dato oficial corrige dos cosas que el cálculo no mostraba: (1) la empresa NO paga
// IVA en efectivo, tiene crédito de LIBRE DISPONIBILIDAD que absorbe la posición a favor de ARCA;
// (2) esa libre disponibilidad es la plata realmente inmovilizada en el fisco, no el saldo técnico.

export function bloqueIva(G, { anio, ivaOficial, proy }) {
  G.push([seccion(4, 'IVA — la DDJJ oficial (F.2051): qué se debe o se tiene a favor')])
  G.cabecera()
  const porMesOf = new Map((ivaOficial ?? []).filter((d) => d.periodo).map((d) => [Number(String(d.periodo).slice(5, 7)), d]))
  const mesesOf = M12.filter((m) => porMesOf.has(m))
  const proyIva = proy?.meses ?? []
  const esProy = (m) => proyIva.includes(m)
  // LOS MESES QUE YA TIENEN DATO EN LA HOJA PERO NO TIENEN DDJJ SE PRESERVAN, NO SE VACÍAN. Es el
  // caso de julio: alguien lo calculó a mano. Entran a la lista de meses escribibles para que
  // `mensual` los recorra, y la función de celda les devuelve AJENO — "no la toques".
  const ancla = proy?.ultimoMesConDato ?? 0
  const conDato = M12.filter((m) => m <= ancla && !mesesOf.includes(m))
  const meses = [...mesesOf, ...conDato, ...proyIva].sort((a, b) => a - b)
  /** El valor de un mes NO proyectado: el de la DDJJ si la hay, y si no se preserva lo que haya. */
  const ofOAjeno = (m, campo) => (porMesOf.has(m) ? porMesOf.get(m)[campo] : (m <= ancla ? AJENO : VACIO))

  const fDeb = G.n() + 1
  const fCred = fDeb + 1
  const fLibre = fDeb + 3
  const colAnt = (m) => `${cmes(m - 1)}${fLibre}`

  G.mensual('Débito fiscal del período',
    (m) => (esProy(m) ? formulaDebitoProyectado(proy.brutoDebito(m)) : ofOAjeno(m, 'debito')),
    'F.2051 · IVA generado por las ventas del mes. Los meses futuros son PROYECCIÓN: el IVA contenido en las cobranzas que el Libro ya da por cobradas y esperadas.', { meses })
  G.mensual('Crédito fiscal del período',
    (m) => (esProy(m) ? formulaCreditoProyectado(proy.brutoCredito(m)) : ofOAjeno(m, 'credito')),
    'F.2051 · IVA de las compras computable del mes. Los meses futuros son PROYECCIÓN: el IVA contenido en las compras CON FACTURA que el Libro ya trae (los cheques y la tarjeta sin factura quedan afuera: sin comprobante no hay crédito computable).', { meses })
  // EL RÓTULO NO SE ESCRIBE ACÁ: sale de CALENDARIO_IMPUESTOS, que es lo que cinco consumidores
  // BUSCAN por texto en la columna A. El texto es el contrato y tiene una sola definición.
  const fAPagar = G.mensual(CALENDARIO_IMPUESTOS.rotulos.iva,
    (m) => (esProy(m)
      ? formulaAPagarProyectado(`${cmes(m)}${fDeb}`, `${cmes(m)}${fCred}`, colAnt(m))
      : ofOAjeno(m, 'a_pagar_efectivo')),
    'Hasta el último período presentado lo absorbió el crédito de libre disponibilidad. Después es PROYECCIÓN: lo que el saldo a favor del mes anterior ya no alcanza a absorber. ESTA es la fila que leen el Libro y el cash flow.', { meses })
  G.mensual('Saldo de libre disponibilidad (acumulado)',
    (m) => (esProy(m)
      ? formulaLibreDispProyectada(colAnt(m), `${cmes(m)}${fDeb}`, `${cmes(m)}${fCred}`)
      : ofOAjeno(m, 'libre_disp')),
    'F.2051 · crédito de la empresa inmovilizado en ARCA. Se arrastra; el total no aplica.', { meses, totaliza: false })
  const fDDJJ = G.mensual('DDJJ presentada',
    (m) => (esProy(m) ? '⚠ PROYECCIÓN' : (porMesOf.has(m)
      // Corto para la columna de mes (108px ≈ 18 caracteres): fecha dd/mm + últimas 4 del N° de
      // transacción — alcanza para verificar contra ARCA sin desbordar la celda.
      ? `${String(porMesOf.get(m).fecha_presentacion).slice(0, 5)}·N…${String(porMesOf.get(m).nro_transaccion).slice(-4)}`
      : (m <= ancla ? AJENO : VACIO))),
    'F.2051 presentada ante ARCA. Fuente primaria, verificable por N° de transacción. Los meses con "⚠ PROYECCIÓN" no tienen DDJJ: son un cálculo, no un hecho.', { meses, totaliza: false })
  G.blanco()
  return { fDeb, fCred, fAPagar, fLibre, fDDJJ, meses, mesesOf, ancla, anio }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · INGRESOS BRUTOS SAN JUAN — AHORA CON PROYECCIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL HUECO QUE ESTO CIERRA (06/08). El bloque tenía las seis DDJJ presentadas y de julio en adelante
// SEIS COLUMNAS VACÍAS. El Libro no emitía ni una fila de IIBB —`if (!importe) continue`— así que el
// cash flow proyectaba $0 de Ingresos Brutos hasta diciembre, en un impuesto que la empresa paga
// todos los meses y cuyo driver ya estaba medido y replicado en el archivo.
//
// EL DRIVER, DECLARADO: base × alícuota. La base proyectada son las cobranzas del Libro netas de IVA;
// la alícuota, la que la empresa DECLARÓ en su última DDJJ (2,0%), leída de _IIBB_RAW y no tipeada.
// NO es un promedio de los meses anteriores: un promedio no reacciona cuando el dueño mueve una
// cobranza, y todo el punto de proyectar es que reaccione.
//
// EL CRITERIO NO ES EL MISMO QUE EL DE LA DDJJ, Y SE DICE: Rentas recibe base DEVENGADA (facturación);
// el Libro tiene PERCIBIDO (cobranzas). Se elige el percibido porque es el único driver que existe
// hacia adelante y porque es el MISMO que usa el débito fiscal de IVA — así los dos impuestos
// proyectados se mueven juntos en vez de contarse cada uno por su lado.

export function bloqueIibb(G, { anio, iibb, proy }) {
  G.push([seccion(5, 'Ingresos Brutos San Juan — ¿cuánto se debe cada mes?')])
  G.cabecera()
  const porMes = new Map(iibb.map((d) => [Number(String(d.periodo ?? '').slice(5, 7)), d]))
  const reales = M12.filter((m) => porMes.has(m))
  const ultimoReal = reales[reales.length - 1] ?? 0
  const ultimoPeriodo = ultimoReal ? porMes.get(ultimoReal).periodo : null
  // Se proyecta desde el mes siguiente al último declarado hasta donde llegue la proyección de IVA
  // (mismo horizonte: dos horizontes distintos en la misma pestaña serían dos verdades del año).
  const hastaMes = Math.max(proy?.meses?.length ? proy.meses[proy.meses.length - 1] : 0, ultimoReal)
  const proyectados = M12.filter((m) => m > ultimoReal && m <= hastaMes)
  const meses = [...reales, ...proyectados]

  const fBase = G.n() + 1
  const fAli = fBase + 1
  const fImp = fBase + 2
  const fRet = fBase + 3
  const fSaldo = fBase + 5
  const ref = (m, col) => `IFERROR(INDEX(${rangoIibb(IIBB_RAW, IIBB_FILA0, col)};MATCH("${porMes.get(m).periodo}";${rangoIibb(IIBB_RAW, IIBB_FILA0, IIBB_COL.periodo)};0));0)`
  const prev = (m) => (m === meses[0] ? ref(m, IIBB_COL.saldoAnt) : `${cmes(m - 1)}${fSaldo}`)
  const esProy = (m) => proyectados.includes(m)

  G.mensual('Base imponible declarada',
    (m) => (esProy(m) ? formulaBaseIibbProyectada(anio, m, RANGO_ALICUOTA_IVA) : `=${ref(m, IIBB_COL.base)}`),
    'DDJJ de Rentas · réplica _IIBB_RAW hasta el último período presentado. Los meses en ámbar son PROYECCIÓN: las cobranzas del Libro del mes, netas de IVA. La DDJJ declara base DEVENGADA y esto proyecta PERCIBIDO — criterios distintos, declarado.', { meses })
  // LA ALÍCUOTA POR MES, NO UNA CONSTANTE ENTERRADA. Si Rentas la cambia, la DDJJ nueva la trae,
  // _IIBB_RAW la refleja y todo lo de abajo se recalcula solo. Los meses proyectados heredan la
  // ÚLTIMA declarada, referenciada — no una copia del número.
  G.mensual('Alícuota de la actividad',
    (m) => (esProy(m)
      ? formulaAlicuotaIibbVigente(IIBB_RAW, IIBB_FILA0, IIBB_COL, ultimoPeriodo)
      : `=${ref(m, IIBB_COL.alicuota)}`),
    'DDJJ de Rentas · réplica _IIBB_RAW. Es la que la empresa declara (base ponderada), no la de la ley. Los meses proyectados usan la de la última DDJJ, referenciada.', { meses, totaliza: false })
  G.mensual('Impuesto determinado', (m) => formulaIibbDeterminado(`${cmes(m)}${fBase}`, `${cmes(m)}${fAli}`),
    'Base × alícuota. Es el driver, no un promedio: si el mes proyectado cambia de cobranzas, el impuesto cambia.', { meses })
  G.mensual('Retenciones sufridas',
    (m) => (esProy(m) ? '=0' : `=${ref(m, IIBB_COL.retenciones)}`),
    'DDJJ de Rentas · réplica _IIBB_RAW. Ya vienen computadas ahí: no se vuelven a sumar en la sección 6. Los meses proyectados van en CERO a propósito: proyectar retenciones sería inventar cuánto le va a retener cada cliente, y de más (una retención que no ocurre baja el impuesto a pagar y sube el piso de caja).', { meses })
  const fAPagar = G.mensual(CALENDARIO_IMPUESTOS.rotulos.iibb,
    (m) => `=MAX(0;${cmes(m)}${fImp}-${cmes(m)}${fRet}-${prev(m)})`,
    'Impuesto menos retenciones menos el saldo a favor que venía. ESTA es la fila que leen el Libro y el cash flow.', { meses })
  G.mensual('Saldo a favor al cierre del mes', (m) => `=MAX(0;${prev(m)}+${cmes(m)}${fRet}-${cmes(m)}${fImp})`,
    'Se arrastra al mes siguiente. El total no aplica.', { meses, totaliza: false })
  G.blanco()
  return { fBase, fAli, fImp, fRet, fAPagar, fSaldo, meses, reales, proyectados, ultimoReal, ultimoPeriodo }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · RETENCIONES SUFRIDAS — referencia, no suma
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Una retención es impuesto YA PAGADO. No se suma al hero porque ya está DENTRO de la libre
// disponibilidad del F.2051 y de la DDJJ de Rentas: sumarla otra vez la contaría dos veces.

export function bloqueRetenciones(G, { anio }) {
  G.push([seccion(6, 'Retenciones sufridas — ¿cuánto impuesto ya pagado está inmovilizado?')])
  G.cabecera()
  // RANGO ABIERTO. Cerrado en la fila 400 funcionaba con 357 filas de Cobranzas y reventaba callado
  // en la 401: el número que decide sale de la fuente con rango abierto.
  const retMes = (col) => (m) => `=SUMPRODUCT((YEAR(Cobranzas!$Q$5:$Q)=${anio})*(MONTH(Cobranzas!$Q$5:$Q)=${m})*IF(ISNUMBER(Cobranzas!$${col}$5:$${col});Cobranzas!$${col}$5:$${col};0))`
  const r0 = G.n() + 1
  G.mensual('IVA', retMes('X'), 'Cobranzas · ya computada en el "a pagar" de la sección 4.')
  G.mensual('Ganancias', retMes('Y'), 'Cobranzas · es pago a cuenta del impuesto anual: no se recupera hasta la DDJJ.')
  G.mensual('Ingresos Brutos', retMes('Z'), 'Cobranzas · ya viene declarada en la DDJJ de Rentas de la sección 5.')
  const r1 = G.n()
  const fTotal = G.mensual(rotuloTotal('Total retenido'), (m) => `=SUM(${cmes(m)}${r0}:${cmes(m)}${r1})`,
    'Plata de la empresa que está en manos del fisco. NO se suma a la posición: ya está adentro de los dos saldos a favor.')
  G.blanco()
  return { fTotal }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 7 · OTROS IMPUESTOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL BLOQUE MUERTO QUE SE ENTIERRA (06/08) — el defecto E. La proyección del impuesto al cheque vivía
// en una fila DEBAJO del total (o sea fuera de la suma), calculada con `AVERAGEIF` de los meses con
// extracto, que EXCLUÍA agosto, y cuyo total coincidía al centavo con el de la fila real: a simple
// vista parecía un duplicado del total. Ahora el impuesto se deriva de SU driver —el 0,6% de cada
// lado del movimiento bancario que el Libro ya tiene cargado— y la fila vive DENTRO del total, que es
// donde tiene que estar un impuesto que se paga.

export function bloqueOtros(G, { anio, C }) {
  G.push([seccion(7, 'Otros impuestos — ¿qué más se paga y no estaba a la vista?')])
  G.cabecera()
  const o0 = G.n() + 1
  const fCheque = G.mensual('Impuesto al cheque (Ley 25.413)', (m) => formulaImpuestoCheque(BANCO_RAW, anio, m),
    'MAX(lo que el banco YA debitó en el extracto; el 0,6% de cada lado del movimiento que el Libro proyecta para el mes). El banco declara la alícuota en el propio concepto ("debito 0,6%"): no se cita de memoria. Nunca subestima.')
  // Y EN LA COLUMNA DONDE ESTÁ, NO EN LA QUE PARECE. El texto "Anticipo de Ganancias" no vive en
  // "Concepto" sino en "Detalles / Obra": buscarlo en la columna equivocada daba cero en los doce
  // meses. Y por la FECHA PREVISTA DE PAGO: estas filas no tienen "Fecha de caja" cargada.
  //
  // SIN IFERROR (defecto G). El IFERROR convertía un plan renombrado o una columna movida en $0 —el
  // modo de falla exacto que el resto del repo persigue. Si SUMIFS no puede resolver, que se vea.
  const fGanancias = G.mensual('Anticipo de Ganancias', (m) =>
    `=SUMIFS(${rango(C.total)};${rango(C.detalle)};"*Anticipo de Ganancias*";${rango(C.fechaPrev)};">="&DATE(${anio};${m};1);${rango(C.fechaPrev)};"<="&EOMONTH(DATE(${anio};${m};1);0))`,
  'Compras · concepto "Anticipo de Ganancias", por su fecha prevista de pago. Es pago a cuenta del impuesto anual: se recupera recién en la DDJJ.')
  const o1 = G.n()
  const fTotal = G.mensual(rotuloTotal('Total otros impuestos'), (m) => `=SUM(${cmes(m)}${o0}:${cmes(m)}${o1})`,
    'Lo que se paga por fuera de IVA, IIBB y cargas sociales. Las dos filas están DENTRO del total: no hay proyección colgando por afuera.')
  G.blanco()
  return { fCheque, fGanancias, fTotal }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 8 · PLANES DE PAGO F931
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloquePlanes(G, { anio, C, planes }) {
  G.push([seccion(8, 'Planes de pago F931 — ¿qué cuota vence cada mes?')])
  G.cabecera()
  const q0 = G.n() + 1
  const colPlan = (campo) => (campo === 'concepto' ? C.concepto : C.detalle)
  // CADA CUOTA SE SUMA DESDE COMPRAS, NO SE PEGA. Y sin IFERROR: un plan renombrado tiene que
  // romperse a la vista, no valer $0 (defecto G).
  const cuota = (p) => (m) => `=SUMIFS(${rango(C.total)};${rango(colPlan(p.campo))};"*${p.patron}*";${rango(C.fechaPrev)};">="&DATE(${anio};${m};1);${rango(C.fechaPrev)};"<="&EOMONTH(DATE(${anio};${m};1);0))`
  for (const p of planes) {
    const sinFechas = !p.porMes.some((x) => x)
    const meses = M12.filter((m) => p.porMes[m])
    G.mensual(sinFechas || !p.patron ? `${p.nombre}  ⚠ sin fechas de vencimiento cargadas` : p.nombre,
      p.patron ? cuota(p) : () => VACIO,
      `${p.cuotas} cuota(s) de ${p.monto_cuota.toLocaleString('es-AR')} · total ${Math.round(p.total).toLocaleString('es-AR')} · Compras, "${p.patron ?? p.nombre}", por su fecha prevista de pago`
      + (sinFechas ? ' · ⚠ SIN FECHAS DE VENCIMIENTO cargadas: por eso la fila está vacía y su plata no aparece en ningún mes.' : ''),
      { meses })
  }
  const q1 = G.n()
  const fTotal = G.mensual(rotuloTotal('Cuotas del año'), (m) => `=SUM(${cmes(m)}${q0}:${cmes(m)}${q1})`,
    'Lo que sale por planes previsionales cada mes. Es el TOTAL DEL AÑO, pagadas incluidas: lo pendiente está en la sección 9.')
  G.blanco()
  return { fTotal }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 9 · DEUDA FINANCIERA — LO QUE FALTA PAGAR (los defectos A y B, muertos)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloqueDeudaFinanciera(G, { anio, C, planes, hoy, fPlanTotal }) {
  G.push([seccion(9, 'Deuda financiera — cuánto se va por mes y cuánto FALTA pagar')])
  G.cabecera()
  const fCuota = G.mensual('Prendario Ford XLS · Santander — cuota',
    (m) => formulaCuotaPrendario(C, anio, m),
    'Compras, rubro "Financiero": el cuadro de amortización del banco, cuota por cuota, por su fecha prevista de pago (el banco debita el día 7). NO sale del extracto: un SUMIF sobre el extracto crece cada vez que se importa un mes más de banco, y así declaraba $2.567.316 de cuota donde la cuota es $1.282.811.')
  G.mensual('Planes previsionales F931 — cuota', (m) => `=${cmes(m)}${fPlanTotal}`,
    'Traído de la sección 8: un solo cálculo, un solo lugar.')
  const fSalida = G.mensual(rotuloTotal('Salida financiera del mes'), (m) => `=${cmes(m)}${fCuota}+${cmes(m)}${fPlanTotal}`,
    'Todo lo que se va por deuda con instrumento, mes a mes.')
  // ═══ "PENDIENTE" QUIERE DECIR PENDIENTE (el defecto B) ═══
  //
  // Estas dos filas sumaban el rubro entero y el total del año —cuotas YA PAGADAS incluidas— y el
  // hero las publicaba como deuda: $31.895.983 donde la pendiente real es $14.372.450. $17,5M de
  // sobredeclaración justo en el número con el que se decide si hay que salir a cubrir un bache.
  const fPrendPend = G.lista(subItem('prendario — cuotas que todavía no vencieron'),
    [formulaPrendarioPendiente(C, hoy)],
    `Compras, rubro "Financiero", SÓLO las cuotas con fecha prevista posterior al ${hoy}. Es un saldo, no una serie: por eso va fuera de la grilla mensual.`)
  const fPlanesPend = G.lista(subItem('planes F931 — cuotas que todavía no vencieron'),
    [formulaPlanesPendiente(C, planes, hoy)],
    `Compras, los ${planes.length} planes por su patrón, SÓLO las cuotas con fecha prevista posterior al ${hoy}.`)
  const fPend = G.lista(rotuloTotal('Deuda fiscal-financiera PENDIENTE'),
    [`=$B$${fPrendPend}+$B$${fPlanesPend}`],
    'Lo que FALTA pagar con instrumento. Es el número del hero, y el hero lo REFERENCIA: no lo vuelve a calcular.')
  G.blanco()
  return { fCuota, fSalida, fPrendPend, fPlanesPend, fPend }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 10 · LO QUE FALTA Y EL PARÁMETRO — abajo de todo, para que ninguna fila nueva lo corra
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloqueCierre(G, { proy, vencimientos }) {
  G.push([seccion(10, 'Lo que falta, y el parámetro que edita el dueño')])
  // UN HUECO SE VE COMO UN HUECO, NO COMO UN CERO. El dueño: "$0 y 'no lo sabemos' no son lo mismo y
  // hoy se ven igual". "s/d" es TEXTO a propósito: SUM() lo ignora, así que el hueco queda a la vista
  // sin ensuciar un solo total y sin que aparezca un cero que después alguien sume de buena fe.
  const SD = 's/d'
  G.push(['⚠ Tasa municipal de seguridad e higiene', ...Array(12).fill(SD), 'sin cuantificar',
    'HUECO DECLARADO · no hay una sola fila en Compras ni en el banco. Si la obra tributa tasa municipal, ese costo hoy no está en ningún cuadro. Para cerrarlo hace falta el municipio de cada obra y su ordenanza vigente.'])
  G.push(['⚠ Impuesto de sellos', ...Array(12).fill(SD), 'sin cuantificar',
    'HUECO DECLARADO · sin dato. Aplica sobre contratos: si se firmó alguno con sellado, no está registrado. Para cerrarlo hace falta la lista de contratos firmados en el año.'])
  // LA PROSA VA EN LA COLUMNA DE PROCEDENCIA (la última), NO EN LA DE IMPORTES. En la columna B se
  // dibuja con formato de moneda y queda cortada a 108 píxeles: un texto de trescientos caracteres
  // sentado donde el ojo busca plata.
  G.lista('⚠ Anticipo de Ganancias — sin registro desde mayo', [],
    'HUECO DECLARADO · último anticipo cargado: abril. De mayo en adelante Compras no tiene ninguna fila. ¿Se dio de baja el anticipo, o no se cargó el comprobante? Si sigue vigente son ~$144.427 por mes que el cash flow no está proyectando. Lo confirma el estudio contable.')
  G.push([`⚠ El vencimiento de IIBB de San Juan es un SUPUESTO: ${vencimientos.iibb}`])
  G.push(['⚠ Los pagos de IVA e IIBB no están cargados en Compras: el cash flow los ve por esta pestaña, no por Compras.'])
  if (proy?.meses?.length) G.push([`⚠ IVA de ${MES[proy.meses[0] - 1]} a diciembre: ${proy.supuesto}`])
  G.blanco()

  // LA ALÍCUOTA VIVE EN UNA CELDA CON NOMBRE, NO ADENTRO DE UNA FÓRMULA. La skill de impuestos
  // prohíbe afirmar una alícuota vigente sin verificarla, y el OS no puede verificar una norma en
  // cada corrida. Así que el OS no la afirma — la LEE de acá, y la firma quien puede.
  //
  // AL FINAL DE LA PESTAÑA, Y ES DELIBERADO: una fila nueva arriba correría el rango con nombre.
  // SI YA HAY UN VALOR, NO SE PISA: `alicuotaVigente` sale de la celda leída antes de escribir.
  const fAlic = G.lista('Alícuota general de IVA', [proy?.alicuotaVigente ?? 0.21],
    `PARÁMETRO EDITABLE · lo usa la proyección de IVA de la sección 4 y la base de IIBB de la 5, por el rango con nombre ${RANGO_ALICUOTA_IVA}. `
    + 'El OS NO afirma que esta alícuota esté vigente: la lee de acá. Si cambia la norma, se cambia esta celda y todo el cuadro se recalcula. Confirmala con el estudio contable.')
  return { fAlic }
}
