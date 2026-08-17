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
import { formulaDebitoArca, formulaCreditoArca, nuncaMenosQue } from './arca-formula.mjs'
import { IIBB_RAW, IIBB_COL, IIBB_FILA0, BANCO_RAW } from './impuestos-fuentes.mjs'
import { M12, MES, cmes, AJENO } from './impuestos-grilla.mjs'
import { ALERTA } from './glifos.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · IVA — LA DDJJ OFICIAL (F.2051)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El IVA se lee de la F.2051 presentada, que es la fuente primaria, y no del cálculo por
// comprobantes. El dato oficial corrige dos cosas que el cálculo no mostraba: (1) la empresa NO paga
// IVA en efectivo, tiene crédito de LIBRE DISPONIBILIDAD que absorbe la posición a favor de ARCA;
// (2) esa libre disponibilidad es la plata realmente inmovilizada en el fisco, no el saldo técnico.
//
// ═══ LA CASCADA DE TRES ESTADOS (07/08) ═══
//
// El dueño: "en impuestos y financieros el cuadro 4 debería estar vinculado a AfipSDK e irse
// calculando; la columna del mes en curso se debe actualizar sola".
//
// Faltaba un estado. El cuadro sabía decir "DDJJ presentada" o "PROYECCIÓN del Libro", y entre los
// dos hay un mes que no es ninguno: el VENCIDO QUE TODAVÍA NO SE PRESENTÓ. De ese mes ARCA ya tiene
// los comprobantes reales —están en `public.comprobantes_arca` y replicados en `_ARCA_RAW`— y el
// cuadro lo trataba como si no existiera, proyectándolo con un promedio del Libro cuando el hecho
// estaba adentro del mismo archivo.
//
//   1. DDJJ F.2051 presentada          → el dato oficial, valor. Gana siempre.
//   2. mes con dato de una persona      → AJENO: no se toca. Ver `anclaDeProyeccion`.
//   3. comprobantes de ARCA del período → FÓRMULA contra _ARCA_RAW. El mes en curso, con piso en la
//                                         proyección (ver `nuncaMenosQue`).
//   4. proyección del Libro             → como antes.
//
// POR QUÉ EL MES AJENO LE GANA A ARCA, que es mejor dato. Porque un mes que una persona calculó a
// mano es una afirmación firmada, y `respetar-ediciones` no protege importes: pisarlo con una fórmula
// sería la séptima pérdida de trabajo del dueño de esta lista. Si el dueño quiere que ARCA mande en
// ese mes, borra la celda y el generador la llena solo en la corrida siguiente.

/** Los estados posibles de un mes del cuadro. El texto es el que va a la fila de procedencia. */
export const ORIGEN = {
  ddjj: 'ddjj', ajeno: 'ajeno', arca: 'arca', arcaParcial: 'arca-parcial', proyeccion: 'proyeccion', vacio: 'vacio',
}

/**
 * NÚCLEO PURO: de dónde sale el mes `m` del cuadro de IVA. Es la cascada entera, aislada para poder
 * probarla sin armar una grilla.
 *
 * @param {number} m 1..12
 * @param {object} ctx
 * @param {number[]} ctx.mesesDDJJ   meses con F.2051 presentada
 * @param {number} ctx.ancla         último mes con dato en la hoja (de la DDJJ o de una persona)
 * @param {number[]} ctx.mesesArca   meses con comprobantes en `comprobantes_arca`
 * @param {number[]} ctx.mesesProy   meses que la proyección del Libro cubre
 * @param {number} ctx.mesEnCurso    el mes de HOY si el cuadro es del año corriente; 0 si el año ya pasó
 */
export function origenDelMes(m, { mesesDDJJ = [], ancla = 0, mesesArca = [], mesesProy = [], mesEnCurso = 0 } = {}) {
  if (mesesDDJJ.includes(m)) return ORIGEN.ddjj
  if (m <= ancla) return ORIGEN.ajeno
  // UN MES POSTERIOR AL CORRIENTE NO USA ARCA aunque tenga comprobantes. Una factura con fecha futura
  // existe (se emiten adelantadas) y no convierte un mes que no ocurrió en un hecho: sigue siendo
  // proyección, o el cuadro daría por cerrado un mes con una sola factura adentro.
  if (mesesArca.includes(m) && !(mesEnCurso && m > mesEnCurso)) {
    return m === mesEnCurso ? ORIGEN.arcaParcial : ORIGEN.arca
  }
  if (mesesProy.includes(m)) return ORIGEN.proyeccion
  return ORIGEN.vacio
}

/**
 * NÚCLEO PURO: de qué mes es el saldo a favor que el hero publica como LA POSICIÓN DE HOY.
 *
 * ES EL ÚLTIMO MES CERRADO, Y NO EL ANCLA DE LA PROYECCIÓN — son dos preguntas distintas que estaban
 * contestadas con el mismo número. El ancla dice "desde dónde proyecto" y sube hasta el último mes con
 * un importe en la hoja; esto dice "qué tengo a favor hoy", que sólo puede salir de un período
 * terminado. Cuando julio dejó de anclar (su celda tenía una leyenda), el hero se llevó puesto el
 * saldo de junio —$19.344.911— cuando el de julio, ya cerrado y con sus comprobantes en ARCA, es de
 * ~$7,5M: casi $12M de activo fiscal sobredeclarado en la celda más visible de la pestaña.
 *
 * El mes EN CURSO queda afuera a propósito: se completa a medida que ARCA se carga, así que su saldo
 * se movería todos los días bajo un rótulo que dice "la posición al <fecha>".
 */
export function mesDelSaldoVigente(porOrigen = {}) {
  const cerrados = [ORIGEN.ddjj, ORIGEN.ajeno, ORIGEN.arca].flatMap((o) => porOrigen[o] ?? [])
  return cerrados.length ? Math.max(...cerrados) : 0
}

export function bloqueIva(G, { anio, ivaOficial, proy, arca, hoy }) {
  G.push([seccion(4, 'IVA — la DDJJ oficial (F.2051): qué se debe o se tiene a favor')])
  G.cabecera()
  const porMesOf = new Map((ivaOficial ?? []).filter((d) => d.periodo).map((d) => [Number(String(d.periodo).slice(5, 7)), d]))
  const mesesOf = M12.filter((m) => porMesOf.has(m))
  const proyIva = proy?.meses ?? []
  // LOS MESES QUE YA TIENEN DATO EN LA HOJA PERO NO TIENEN DDJJ SE PRESERVAN, NO SE VACÍAN. Es el
  // caso de julio: alguien lo calculó a mano. Entran a la lista de meses escribibles para que
  // `mensual` los recorra, y la función de celda les devuelve AJENO — "no la toques".
  const ancla = proy?.ultimoMesConDato ?? 0
  const conDato = M12.filter((m) => m <= ancla && !mesesOf.includes(m))
  const meses = [...mesesOf, ...conDato, ...proyIva].sort((a, b) => a - b)
  /** El valor de un mes NO proyectado: el de la DDJJ si la hay, y si no se preserva lo que haya. */
  const ofOAjeno = (m, campo) => (porMesOf.has(m) ? porMesOf.get(m)[campo] : (m <= ancla ? AJENO : VACIO))

  // EL MES EN CURSO SALE DE `hoy`, NO DE new Date(): el generador tiene que dar la misma grilla
  // corrido dos veces el mismo día, y un test tiene que poder fijar el día. Si el cuadro es de un año
  // que ya pasó no hay mes en curso y todos los meses con comprobantes están cerrados.
  const mesEnCurso = String(hoy ?? '').slice(0, 4) === String(anio) ? Number(String(hoy).slice(5, 7)) : 0
  const mesesArca = arca?.meses ?? []
  const ctx = { mesesDDJJ: mesesOf, ancla, mesesArca, mesesProy: proyIva, mesEnCurso }
  const origen = (m) => origenDelMes(m, ctx)
  const periodo = (m) => `${anio}-${String(m).padStart(2, '0')}`
  /** ¿El mes lo calcula la planilla (ARCA o proyección), o es un valor que se preserva? */
  const calculado = (m) => [ORIGEN.arca, ORIGEN.arcaParcial, ORIGEN.proyeccion].includes(origen(m))

  const fDeb = G.n() + 1
  const fCred = fDeb + 1
  const fLibre = fDeb + 3
  const colAnt = (m) => `${cmes(m - 1)}${fLibre}`

  /** El término del mes: ARCA si el período ya tiene comprobantes, y si no la proyección del Libro. */
  const termino = (m, { deArca, proyectado }) => {
    const o = origen(m)
    if (o === ORIGEN.arca) return deArca(periodo(m))
    if (o === ORIGEN.arcaParcial) return nuncaMenosQue(deArca(periodo(m)), proyectado(m))
    return proyectado(m)
  }

  G.mensual('Débito fiscal del período',
    (m) => (calculado(m)
      ? termino(m, { deArca: formulaDebitoArca, proyectado: (x) => formulaDebitoProyectado(proy.brutoDebito(x)) })
      : ofOAjeno(m, 'debito')),
    'F.2051 · IVA generado por las ventas del mes. Los meses sin DDJJ pero CON comprobantes salen de _ARCA_RAW —las ventas reales que ARCA registró para ese período— y los que no tienen ni eso son PROYECCIÓN: el IVA contenido en las cobranzas que el Libro ya da por cobradas y esperadas.', { meses })
  G.mensual('Crédito fiscal del período',
    (m) => (calculado(m)
      ? termino(m, { deArca: formulaCreditoArca, proyectado: (x) => formulaCreditoProyectado(proy.brutoCredito(x)) })
      : ofOAjeno(m, 'credito')),
    'F.2051 · IVA de las compras computable del mes. Los meses sin DDJJ pero CON comprobantes salen de _ARCA_RAW: el IVA facturado íntegro del libro de compras, notas de crédito restadas — mismo criterio que la posición técnica del OS. Los que no tienen comprobantes son PROYECCIÓN: el IVA de las compras CON FACTURA que el Libro trae (los cheques y la tarjeta sin factura quedan afuera: sin comprobante no hay crédito computable).', { meses })
  // EL RÓTULO NO SE ESCRIBE ACÁ: sale de CALENDARIO_IMPUESTOS, que es lo que cinco consumidores
  // BUSCAN por texto en la columna A. El texto es el contrato y tiene una sola definición.
  //
  // LA ARITMÉTICA DE ARRASTRE ES UNA SOLA para ARCA y para la proyección: el mes toma el saldo de
  // libre disponibilidad del anterior y le resta su posición. Lo único que cambia entre los dos
  // estados es DE DÓNDE salen el débito y el crédito, y eso ya se resolvió dos filas más arriba.
  const fAPagar = G.mensual(CALENDARIO_IMPUESTOS.rotulos.iva,
    (m) => (calculado(m)
      ? formulaAPagarProyectado(`${cmes(m)}${fDeb}`, `${cmes(m)}${fCred}`, colAnt(m))
      : ofOAjeno(m, 'a_pagar_efectivo')),
    'Hasta el último período presentado lo absorbió el crédito de libre disponibilidad. Después es lo que el saldo a favor del mes anterior ya no alcanza a absorber, con el débito y el crédito reales de ARCA si el período los tiene. ESTA es la fila que leen el Libro y el cash flow.', { meses })
  G.mensual('Saldo de libre disponibilidad (acumulado)',
    (m) => (calculado(m)
      ? formulaLibreDispProyectada(colAnt(m), `${cmes(m)}${fDeb}`, `${cmes(m)}${fCred}`)
      : ofOAjeno(m, 'libre_disp')),
    'F.2051 · crédito de la empresa inmovilizado en ARCA. Se arrastra; el total no aplica.', { meses, totaliza: false })
  // LA PROCEDENCIA DISTINGUE ARCA DE UNA PROYECCIÓN, y no es cosmético: un mes de ARCA es un HECHO
  // parcial o completo sobre comprobantes reales, y una proyección es un supuesto sobre el Libro.
  // Verlos con la misma leyenda hacía que el dueño discutiera un número que no había que discutir.
  const procedencia = {
    [ORIGEN.arca]: `${ALERTA} ARCA (sin DDJJ)`,
    [ORIGEN.arcaParcial]: `${ALERTA} ARCA parcial`,
    [ORIGEN.proyeccion]: `${ALERTA} PROYECCIÓN`,
  }
  const fDDJJ = G.mensual('DDJJ presentada',
    (m) => (calculado(m) ? procedencia[origen(m)] : (porMesOf.has(m)
      // Corto para la columna de mes (108px ≈ 18 caracteres): fecha dd/mm + últimas 4 del N° de
      // transacción — alcanza para verificar contra ARCA sin desbordar la celda.
      ? `${String(porMesOf.get(m).fecha_presentacion).slice(0, 5)}·N…${String(porMesOf.get(m).nro_transaccion).slice(-4)}`
      : (m <= ancla ? AJENO : VACIO))),
    `F.2051 presentada ante ARCA. Fuente primaria, verificable por N° de transacción. "${ALERTA} ARCA (sin DDJJ)" es el período cerrado calculado sobre los comprobantes reales que todavía no se presentaron; "${ALERTA} ARCA parcial" es el mes en curso, que se completa solo a medida que ARCA se carga; "${ALERTA} PROYECCIÓN" no tiene ni comprobantes: es un cálculo, no un hecho.`, { meses, totaliza: false })
  G.blanco()
  const porOrigen = Object.fromEntries(Object.values(ORIGEN).map((o) => [o, meses.filter((m) => origen(m) === o)]))
  return { fDeb, fCred, fAPagar, fLibre, fDDJJ, meses, mesesOf, ancla, anio, porOrigen }
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
    G.mensual(sinFechas || !p.patron ? `${p.nombre}  ${ALERTA} sin fechas de vencimiento cargadas` : p.nombre,
      p.patron ? cuota(p) : () => VACIO,
      `${p.cuotas} cuota(s) de ${p.monto_cuota.toLocaleString('es-AR')} · total ${Math.round(p.total).toLocaleString('es-AR')} · Compras, "${p.patron ?? p.nombre}", por su fecha prevista de pago`
      + (sinFechas ? ` · ${ALERTA} SIN FECHAS DE VENCIMIENTO cargadas: por eso la fila está vacía y su plata no aparece en ningún mes.` : ''),
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

export function bloqueDeudaFinanciera(G, { anio, C, planes, fPlanTotal }) {
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
  // EL CORTE LO EVALÚA LA PLANILLA, NO LA CORRIDA: `TODAY()`. Con el serial del día tipeado, estas dos
  // celdas —que son las que el hero publica como DEUDA PENDIENTE— empiezan a contar cuotas ya
  // debitadas apenas la pestaña se queda un día sin regenerar.
  const fPrendPend = G.lista(subItem('prendario — cuotas que todavía no vencieron'),
    [formulaPrendarioPendiente(C)],
    'Compras, rubro "Financiero", SÓLO las cuotas con fecha prevista posterior a HOY (el corte lo evalúa la planilla, no la corrida). Es un saldo, no una serie: por eso va fuera de la grilla mensual.')
  const fPlanesPend = G.lista(subItem('planes F931 — cuotas que todavía no vencieron'),
    [formulaPlanesPendiente(C, planes)],
    `Compras, los ${planes.length} planes por su patrón, SÓLO las cuotas con fecha prevista posterior a HOY.`)
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
  G.push([`${ALERTA} Tasa municipal de seguridad e higiene`, ...Array(12).fill(SD), 'sin cuantificar',
    'HUECO DECLARADO · no hay una sola fila en Compras ni en el banco. Si la obra tributa tasa municipal, ese costo hoy no está en ningún cuadro. Para cerrarlo hace falta el municipio de cada obra y su ordenanza vigente.'])
  G.push([`${ALERTA} Impuesto de sellos`, ...Array(12).fill(SD), 'sin cuantificar',
    'HUECO DECLARADO · sin dato. Aplica sobre contratos: si se firmó alguno con sellado, no está registrado. Para cerrarlo hace falta la lista de contratos firmados en el año.'])
  // LA PROSA VA EN LA COLUMNA DE PROCEDENCIA (la última), NO EN LA DE IMPORTES. En la columna B se
  // dibuja con formato de moneda y queda cortada a 108 píxeles: un texto de trescientos caracteres
  // sentado donde el ojo busca plata.
  G.lista(`${ALERTA} Anticipo de Ganancias — sin registro desde mayo`, [],
    'HUECO DECLARADO · último anticipo cargado: abril. De mayo en adelante Compras no tiene ninguna fila. ¿Se dio de baja el anticipo, o no se cargó el comprobante? Si sigue vigente son ~$144.427 por mes que el cash flow no está proyectando. Lo confirma el estudio contable.')
  // ═══ LO QUE SE DESCARTÓ DE LA FILA DE LIBRE DISPONIBILIDAD (17/08) ═══
  //
  // El 17/08 la celda de julio tenía "⚠ vence 20/08" —una leyenda tipeada a mano donde la fila promete
  // un importe— y `esNumero` la tomaba por $2.008, anclando ahí la proyección entera. Ahora se
  // descarta, y julio se recalcula desde ARCA. Pero descartar en silencio le borraría a una persona lo
  // que escribió sin decirle por qué: el aviso que ella quiso dejar tiene lugar propio —esta sección,
  // la fila "DDJJ presentada" y la columna de procedencia—, y ese lugar no es una celda de plata.
  for (const { mes, valor } of proy?.textoDondeVaImporte ?? []) {
    G.lista(`${ALERTA} ${MES[mes - 1]}: había un texto donde va el saldo de libre disponibilidad`, [],
      `HUECO DECLARADO · la celda decía "${valor}", que no es un importe: se descartó para no anclar la `
      + 'proyección en un número que no existe, y el mes se recalculó desde los comprobantes de _ARCA_RAW. '
      + 'Si ese aviso hace falta, va en esta sección o en la fila "DDJJ presentada" — nunca en una celda '
      + 'que otras fórmulas suman.')
  }
  G.push([`${ALERTA} El vencimiento de IIBB de San Juan es un SUPUESTO: ${vencimientos.iibb}`])
  G.push([`${ALERTA} Los pagos de IVA e IIBB no están cargados en Compras: el cash flow los ve por esta pestaña, no por Compras.`])
  if (proy?.meses?.length) G.push([`${ALERTA} IVA de ${MES[proy.meses[0] - 1]} a diciembre: ${proy.supuesto}`])
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
