// EL DETALLE TÉCNICO DE "IMPUESTOS Y FINANCIEROS" — lo REGISTRADO, sección por sección, cada una con su
// driver. La proyección a fin de mes vive aparte, en impuestos-proyeccion.mjs (opción A, 24/09/2026).
//
// Va DESPUÉS de la posición, y es a propósito: la pantalla contesta primero "cuánto tengo que pagar,
// cuándo el IVA pide caja y cuánto debo", y recién después "cómo se calculó". Acá vive el cómo.

import { seccion, total as rotuloTotal } from './patron-pestana.mjs'
import { rango } from './compras-columnas.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import {
  formulaCuotaPrendario, formulaPrendarioPendiente,
  formulaAlicuotaIibbVigente, formulaIibbDeterminado,
  formulaImpuestoChequeReal, rangoIibb,
} from './impuestos-cuadro.mjs'
import { formulaDebitoArca, formulaCreditoArca, formulaNetoVentasArca } from './arca-formula.mjs'
import { exigirColumnas } from './cobranzas-columnas.mjs'
import { rangoAbierto } from './columnas-por-encabezado.mjs'
import { IIBB_RAW, IIBB_COL, IIBB_FILA0, BANCO_RAW } from './impuestos-fuentes.mjs'
import { M12, cmes, AJENO } from './impuestos-grilla.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · IVA — LA DDJJ OFICIAL (F.2051)
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
//   4. proyección                       → las facturas B de Cobranzas (ver impuestos-base-libro).
//
// ═══ AGOSTO SE CALCULÓ MAL DOS VECES EL 09/09/2026, Y ÉSTA ES LA REGLA QUE QUEDÓ ═══
//
// Primero el mes cerrado salía de ARCA y el bloque de IIBB, tres filas más abajo, de Cobranzas B:
// dos bases para el mismo mes ($34,2M contra $86,0M). Después se probó MAX(Cobranzas B; ARCA) en el
// débito y agosto pasó a $18,1M — y el dueño: *«está mal calculado el IVA de agosto: lo que aparece
// en AfipSDK, que tiene que ser como lo facturado en B de Cobranzas»*. Las diez filas B de agosto
// sin número de comprobante no son ventas de agosto: son lo que se va a facturar.
//
// Entonces: un mes CERRADO sin DDJJ sale de ARCA (lo emitido, que es un hecho), y Cobranzas B para
// ese mismo mes cuenta sólo lo emitido —misma población—; si difieren, lo dice `cobranzas-vs-arca`
// en el log. Las B vencidas y no emitidas se corren al mes de su cobro: ver impuestos-base-libro.
//
// POR QUÉ EL MES AJENO LE GANA A ARCA, que es mejor dato. Porque un mes que una persona calculó a
// mano es una afirmación firmada, y `respetar-ediciones` no protege importes: pisarlo con una fórmula
// sería la séptima pérdida de trabajo del dueño de esta lista. Si el dueño quiere que ARCA mande en
// ese mes, borra la celda y el generador la llena solo en la corrida siguiente.

/** Los estados posibles de un mes del cuadro. El texto es el que va a la fila de procedencia. */
export const ORIGEN = {
  ddjj: 'ddjj', ajeno: 'ajeno', arca: 'arca', arcaParcial: 'arca-parcial', proyeccion: 'proyeccion',
  sinVentas: 'sin-ventas', vacio: 'vacio',
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
 * @param {number[]} ctx.sinVentas   meses que se iban a proyectar y NO tienen base de ventas
 */
export function origenDelMes(m, { mesesDDJJ = [], ancla = 0, mesesArca = [], mesesProy = [], mesEnCurso = 0, sinVentas = [] } = {}) {
  if (mesesDDJJ.includes(m)) return ORIGEN.ddjj
  if (m <= ancla) return ORIGEN.ajeno
  // UN MES POSTERIOR AL CORRIENTE NO USA ARCA aunque tenga comprobantes. Una factura con fecha futura
  // existe (se emiten adelantadas) y no convierte un mes que no ocurrió en un hecho: sigue siendo
  // proyección, o el cuadro daría por cerrado un mes con una sola factura adentro.
  if (mesesArca.includes(m) && !(mesEnCurso && m > mesEnCurso)) {
    return m === mesEnCurso ? ORIGEN.arcaParcial : ORIGEN.arca
  }
  // SIN BASE DE VENTAS NO HAY PERÍODO FISCAL QUE CALCULAR. Proyectar sólo el crédito —que es lo que
  // pasaba— fabrica saldo a favor de la nada: ver `planDeVentas` en impuestos-base-libro.
  if (mesesProy.includes(m)) return sinVentas.includes(m) ? ORIGEN.sinVentas : ORIGEN.proyeccion
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

/**
 * DE QUÉ MES ES EL SALDO A FAVOR QUE EL HERO PUBLICA COMO «F.2051» (04/09/2026).
 *
 * No es lo mismo que `mesDelSaldoVigente`, y confundirlos publicaba un número falso bajo el rótulo
 * de la declaración jurada. Aquélla contesta «cuál es el último mes CERRADO» e incluye los meses que
 * cierra ARCA — una posición TÉCNICA, reconstruida de comprobantes. Ésta contesta «qué saldo a favor
 * DECLARÉ», y eso sólo puede salir de una F.2051 presentada.
 *
 * MEDIDO el 04/09/2026: el hero publicaba «saldo a favor de IVA · F.2051 = $4.046.759», que era la
 * proyección de AGOSTO — un mes cuya DDJJ ni siquiera está presentada (venció el 20/08). La última
 * declarada, la de julio, dice **$9.856.370,42**. El titular subdeclaraba $5,8M de crédito fiscal
 * propio y llamaba «F.2051» a un número que ningún formulario respalda.
 *
 * Un activo fiscal mal medido en la celda más visible de la pestaña es peor que no mostrarlo: se usa
 * para decidir si se pide plata prestada.
 */
export function mesDeLaUltimaDDJJ(porOrigen = {}) {
  const declarados = porOrigen[ORIGEN.ddjj] ?? []
  return declarados.length ? Math.max(...declarados) : 0
}

// ═══ LO REGISTRADO Y LA PROYECCIÓN, APARTE (dueño, 24/09/2026 — «opción A») ═══
//
// Hasta hoy el mes en curso mezclaba las dos cosas en la misma celda: MAX(ARCA parcial; facturas B de
// Cobranzas). Septiembre publicaba $9,6 M de IVA a pagar donde ARCA registraba $0,39 M, y la app —que
// lee lo registrado— decía otro número para el mismo concepto. El dueño eligió: el dato del día es lo
// devengado según ARCA hasta hoy (débito − crédito − retenciones y percepciones − saldo a favor), y la
// proyección a fin de mes va en su propio renglón, rotulado como estimación, con su propio total.
//
// Este bloque es SÓLO lo registrado: meses con DDJJ, el mes con dato de una persona, y los meses
// cerrados o en curso sin DDJJ calculados sobre _ARCA_RAW. Los meses futuros quedan VACÍOS acá: su
// cifra es una proyección y vive en la sección «Proyección a fin de mes (estimación)».
//
// LAS RETENCIONES Y PERCEPCIONES ENTRAN AL REGISTRADO. Antes el mes sin DDJJ restaba sólo el saldo a
// favor: las retenciones de IVA de Cobranzas y las percepciones RG 2408 del banco —impuesto YA pagado—
// quedaban afuera y el «a pagar» salía inflado. Es la misma cuenta que hace la base
// (`obligacionesIvaCalculadas` + `creditosPorPeriodo`): la pestaña y la app no pueden diferir.
export const ROTULO_IVA_REGISTRADO = rotuloTotal('IVA a pagar · registrado')
export const ROTULO_IIBB_REGISTRADO = rotuloTotal('IIBB a pagar · registrado')

/** El mes de HOY si la grilla es del año corriente; 0 si el año ya pasó. */
export const mesEnCursoDe = (anio, hoy) => (String(hoy ?? '').slice(0, 4) === String(anio) ? Number(String(hoy).slice(5, 7)) : 0)

/**
 * NÚCLEO PURO: la retención sufrida de un régimen en el mes, de Cobranzas por FECHA DE COBRO. Es la
 * misma fórmula que la fila del cuadro 3; se comparte para que el registrado de IVA/IIBB y el cuadro
 * de retenciones no puedan contar distinto.
 */
export function formulaRetencionDelMes(cob, clave, anio, m) {
  const { fechaCobro } = exigirColumnas(cob, ['fechaCobro'], 'formulaRetencionDelMes')
  const col = exigirColumnas(cob, [clave], 'formulaRetencionDelMes')[clave]
  const fecha = rangoAbierto('Cobranzas', fechaCobro)
  const r = rangoAbierto('Cobranzas', col)
  return `SUMPRODUCT((YEAR(${fecha})=${anio})*(MONTH(${fecha})=${m})*IF(ISNUMBER(${r});${r};0))`
}

/**
 * NÚCLEO PURO: las percepciones de IVA (RG 2408) que el banco cobró en el mes. Mismo patrón que la base
 * (`/Iva percep(cion)? rg 2408/`): un pago a cuenta del IVA que el F.2051 computa.
 */
export function formulaPercepcionIvaBanco(anio, m) {
  const B = BANCO_RAW
  return `SUMPRODUCT((YEAR(${B}!$A$4:$A)=${anio})*(MONTH(${B}!$A$4:$A)=${m})`
    + `*ISNUMBER(SEARCH("iva percep";${B}!$B$4:$B))*ISNUMBER(SEARCH("rg 2408";${B}!$B$4:$B))`
    + `*-IF(ISNUMBER(${B}!$C$4:$C);${B}!$C$4:$C;0))`
}

export function bloqueIva(G, { anio, ivaOficial, proy, arca, hoy, cob }) {
  G.push([seccion(1, 'IVA')])
  // LA FILA DE ENCABEZADO SE DEVUELVE: el hero lee de ahí el NOMBRE del mes.
  const fCabecera = G.cabecera()
  const porMesOf = new Map((ivaOficial ?? []).filter((d) => d.periodo).map((d) => [Number(String(d.periodo).slice(5, 7)), d]))
  const mesesOf = M12.filter((m) => porMesOf.has(m))
  const proyIva = proy?.meses ?? []
  // LOS MESES QUE YA TIENEN DATO EN LA HOJA PERO NO TIENEN DDJJ SE PRESERVAN (AJENO): los escribió una persona.
  const ancla = proy?.ultimoMesConDato ?? 0
  const conDato = M12.filter((m) => m <= ancla && !mesesOf.includes(m))
  const ofOAjeno = (m, campo) => (porMesOf.has(m) ? porMesOf.get(m)[campo] : (m <= ancla ? AJENO : VACIO))

  const mesEnCurso = mesEnCursoDe(anio, hoy)
  const mesesArca = arca?.meses ?? []
  const ctx = { mesesDDJJ: mesesOf, ancla, mesesArca, mesesProy: proyIva, mesEnCurso, sinVentas: proy?.sinBase ?? [] }
  const origen = (m) => origenDelMes(m, ctx)
  const periodo = (m) => `${anio}-${String(m).padStart(2, '0')}`
  // REGISTRADO CALCULADO: sin DDJJ ni dato de persona, y ya ocurrido (cerrado o en curso). Del año que
  // ya pasó, los meses con comprobantes.
  const calculado = (m) => !porMesOf.has(m) && !(m <= ancla) && (mesEnCurso ? m <= mesEnCurso : mesesArca.includes(m))
  const meses = M12.filter((m) => porMesOf.has(m) || conDato.includes(m) || calculado(m))
  // LA PROYECCIÓN: el mes en curso y los futuros que la proyección del Libro cubre, con base de ventas.
  const mesesProy = mesEnCurso
    ? M12.filter((m) => m >= mesEnCurso && !porMesOf.has(m) && !(m <= ancla)
      && (m === mesEnCurso || proyIva.includes(m)) && origen(m) !== ORIGEN.sinVentas)
    : []

  const fDeb = G.n() + 1
  const fCred = fDeb + 1
  const fRet = fDeb + 2
  const fLibre = fDeb + 4
  const prev = (m) => `${cmes(m - 1)}${fLibre}`

  G.mensual('Débito fiscal del período',
    (m) => (calculado(m) ? formulaDebitoArca(periodo(m)) : ofOAjeno(m, 'debito')),
    'F.2051 · IVA generado por las ventas del mes. Sin DDJJ: lo emitido según ARCA (_ARCA_RAW), hasta hoy. Los meses futuros no van acá: son proyección (sección 7).', { meses })
  G.mensual('Crédito fiscal del período',
    (m) => (calculado(m) ? formulaCreditoArca(periodo(m)) : ofOAjeno(m, 'credito')),
    'F.2051 · IVA de las compras del mes. Sin DDJJ: el libro de compras de ARCA (_ARCA_RAW), notas de crédito restadas.', { meses })
  G.mensual('Retenciones y percepciones',
    (m) => (calculado(m)
      ? `=${formulaRetencionDelMes(cob, 'retIva', anio, m)}+${formulaPercepcionIvaBanco(anio, m)}`
      : ofOAjeno(m, 'retenciones_percep')),
    'F.2051 · retenciones, percepciones y pagos a cuenta. Sin DDJJ: retenciones de IVA de Cobranzas (por fecha de cobro) + percepciones RG 2408 del extracto. Es impuesto YA pagado.', { meses })
  const fAPagar = G.mensual(ROTULO_IVA_REGISTRADO,
    (m) => (calculado(m)
      ? `=MAX(0;${cmes(m)}${fDeb}-${cmes(m)}${fCred}-N(${cmes(m)}${fRet})-N(${prev(m)}))`
      : ofOAjeno(m, 'a_pagar_efectivo')),
    'Lo devengado hasta hoy: débito − crédito − retenciones y percepciones − saldo de libre disponibilidad del mes anterior. HECHO donde hay DDJJ; CÁLCULO sobre ARCA donde no. La proyección a fin de mes va aparte.', { meses })
  G.mensual('Saldo de libre disponibilidad (acumulado)',
    (m) => (calculado(m)
      ? `=MAX(0;N(${prev(m)})+${cmes(m)}${fCred}+N(${cmes(m)}${fRet})-${cmes(m)}${fDeb})`
      : ofOAjeno(m, 'libre_disp')),
    'F.2051 · crédito de la empresa inmovilizado en ARCA. Se arrastra; el total no aplica.', { meses, totaliza: false })
  const procedencia = (m) => {
    if (porMesOf.has(m)) return 'presentada'
    if (m <= ancla) return AJENO
    return m === mesEnCurso ? 'parcial' : 'ARCA'
  }
  const fDDJJ = G.mensual('DDJJ presentada', procedencia,
    'F.2051 presentada ante ARCA. «ARCA» es un período cerrado sin presentar, calculado sobre comprobantes reales; «parcial» es el mes en curso, lo registrado hasta hoy.', { meses, totaliza: false })
  G.blanco()
  const todos = [...new Set([...meses, ...mesesProy])].sort((a, b) => a - b)
  const porOrigen = Object.fromEntries(Object.values(ORIGEN).map((o) => [o, todos.filter((m) => origen(m) === o)]))
  return { fDeb, fCred, fRet, fAPagar, fLibre, fDDJJ, fCabecera, meses, mesesOf, mesesProy, mesEnCurso, ancla, anio, porOrigen, origen }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · INGRESOS BRUTOS SAN JUAN — AHORA CON PROYECCIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL HUECO QUE ESTO CIERRA (06/08). El bloque tenía las seis DDJJ presentadas y de julio en adelante
// SEIS COLUMNAS VACÍAS. El Libro no emitía ni una fila de IIBB —`if (!importe) continue`— así que el
// cash flow proyectaba $0 de Ingresos Brutos hasta diciembre, en un impuesto que la empresa paga
// todos los meses y cuyo driver ya estaba medido y replicado en el archivo.
//
// EL DRIVER, DECLARADO: base × alícuota. La alícuota es la que la empresa DECLARÓ en su última DDJJ
// (2,0%), leída de _IIBB_RAW y no tipeada. NO es un promedio de los meses anteriores: un promedio no
// reacciona cuando el dueño carga una factura, y todo el punto de proyectar es que reaccione.
//
// ═══ LA BASE ES LA MISMA QUE LA DEL IVA, Y ANTES NO LO ERA (04/09/2026) ═══
//
// Este bloque tomaba las COBRANZAS del Libro netas de IVA y el de arriba las FACTURAS EMITIDAS: dos
// definiciones del mismo concepto en la misma pantalla, y en septiembre una decía $71.149.689 y la
// otra $183.717.604. Ahora los dos piden la misma función —`ventasFacturadasDelMes`— y sólo cambian
// de columna: el IVA la K (el impuesto) y esto la J (el neto, que es la base imponible). El porqué,
// medido contra las siete DDJJ de Rentas presentadas, está en `impuestos-base-libro.mjs`.

export function bloqueIibb(G, { anio, iibb, proy, hoy, cob }) {
  G.push([seccion(2, 'Ingresos Brutos San Juan')])
  G.cabecera()
  const porMes = new Map(iibb.map((d) => [Number(String(d.periodo ?? '').slice(5, 7)), d]))
  const reales = M12.filter((m) => porMes.has(m))
  const ultimoReal = reales[reales.length - 1] ?? 0
  const ultimoPeriodo = ultimoReal ? porMes.get(ultimoReal).periodo : null
  const mesEnCurso = mesEnCursoDe(anio, hoy)
  const periodo = (m) => `${anio}-${String(m).padStart(2, '0')}`
  // REGISTRADO SIN DDJJ (24/09/2026): los meses posteriores a la última DDJJ que ya ocurrieron —el
  // cerrado sin presentar y el en curso— salen de lo EMITIDO según ARCA, la misma base que la base de
  // datos (`obligacionesIibbEstimadas`: neto de ventas de comprobantes_arca × la alícuota declarada).
  const registrados = mesEnCurso ? M12.filter((m) => m > ultimoReal && m <= mesEnCurso) : []
  const meses = [...reales, ...registrados]
  // LA PROYECCIÓN: mismo horizonte que la del IVA; un mes futuro sin facturas no entra.
  const hastaMes = Math.max(proy?.meses?.length ? proy.meses[proy.meses.length - 1] : 0, ultimoReal)
  const sinBase = proy?.sinBase ?? []
  const proyectados = mesEnCurso
    ? M12.filter((m) => m >= mesEnCurso && m > ultimoReal && (m === mesEnCurso || m <= hastaMes) && !(m !== mesEnCurso && sinBase.includes(m)))
    : []

  const fBase = G.n() + 1
  const fAli = fBase + 1
  const fImp = fBase + 2
  const fRet = fBase + 3
  const fSaldo = fBase + 5
  const ref = (m, col) => `IFERROR(INDEX(${rangoIibb(IIBB_RAW, IIBB_FILA0, col)};MATCH("${porMes.get(m).periodo}";${rangoIibb(IIBB_RAW, IIBB_FILA0, IIBB_COL.periodo)};0));0)`
  const prev = (m) => (m === meses[0] ? (porMes.has(m) ? ref(m, IIBB_COL.saldoAnt) : "0") : `${cmes(m - 1)}${fSaldo}`)
  const esReal = (m) => porMes.has(m)
  const alicuotaVigente = formulaAlicuotaIibbVigente(IIBB_RAW, IIBB_FILA0, IIBB_COL, ultimoPeriodo)

  G.mensual('Base imponible',
    (m) => (esReal(m) ? `=${ref(m, IIBB_COL.base)}` : `=${formulaNetoVentasArca(periodo(m))}`),
    'DDJJ de Rentas · réplica _IIBB_RAW hasta el último período presentado. Después, el neto gravado de lo EMITIDO según ARCA (_ARCA_RAW), hasta hoy. Criterio devengado, el mismo que declara la DDJJ. La proyección a fin de mes va en la sección 7.', { meses })
  G.mensual('Alícuota de la actividad',
    (m) => (esReal(m) ? `=${ref(m, IIBB_COL.alicuota)}` : alicuotaVigente),
    'DDJJ de Rentas · réplica _IIBB_RAW. Es la que la empresa declara (base ponderada), no la de la ley. Sin DDJJ, la de la última presentada, referenciada.', { meses, totaliza: false })
  G.mensual('Impuesto determinado', (m) => formulaIibbDeterminado(`${cmes(m)}${fBase}`, `${cmes(m)}${fAli}`),
    'Base × alícuota.', { meses })
  G.mensual('Retenciones sufridas',
    (m) => (esReal(m) ? `=${ref(m, IIBB_COL.retenciones)}` : `=${formulaRetencionDelMes(cob, 'retIibb', anio, m)}`),
    'DDJJ de Rentas · réplica _IIBB_RAW. Sin DDJJ: las retenciones de IIBB de Cobranzas del mes (por fecha de cobro). Es impuesto YA pagado.', { meses })
  const fAPagar = G.mensual(ROTULO_IIBB_REGISTRADO,
    (m) => `=MAX(0;N(${cmes(m)}${fImp})-N(${cmes(m)}${fRet})-N(${prev(m)}))`,
    'Impuesto menos retenciones menos el saldo a favor que venía. Lo devengado hasta hoy; la proyección a fin de mes va aparte.', { meses })
  G.mensual('Saldo a favor al cierre del mes', (m) => `=MAX(0;N(${prev(m)})+N(${cmes(m)}${fRet})-N(${cmes(m)}${fImp}))`,
    'Se arrastra al mes siguiente. El total no aplica.', { meses, totaliza: false })
  G.blanco()
  return { fBase, fAli, fImp, fRet, fAPagar, fSaldo, meses, reales, registrados, proyectados, ultimoReal, ultimoPeriodo, alicuotaVigente, mesEnCurso }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · RETENCIONES SUFRIDAS — referencia, no suma
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Una retención es impuesto YA PAGADO. No se suma al hero porque ya está DENTRO de la libre
// disponibilidad del F.2051 y de la DDJJ de Rentas: sumarla otra vez la contaría dos veces.

/**
 * LAS TRES COLUMNAS DE RETENCIONES Y LA FECHA DE COBRO, POR RÓTULO (14/09/2026). Eran `X`/`Y`/`Z` y
 * `Q` tipeadas: con «Obra» insertada en Cobranzas H, la fila «IVA» habría sumado las retenciones de
 * Ganancias y la de Ingresos Brutos la columna «Moneda», agrupadas por «Mes cobro (auto)».
 * @param {{anio:number, cob:Record<string,{letra:string}>}} ctx `cob` resuelto contra la fila 4 viva
 */
export function bloqueRetenciones(G, { anio, cob }) {
  const { retIva, retGanancias, retIibb, fechaCobro } = exigirColumnas(cob, ['retIva', 'retGanancias', 'retIibb', 'fechaCobro'], 'bloqueRetenciones')
  G.push([seccion(3, 'Retenciones sufridas')])
  G.cabecera()
  // RANGO ABIERTO. Cerrado en la fila 400 funcionaba con 357 filas de Cobranzas y reventaba callado
  // en la 401: el número que decide sale de la fuente con rango abierto.
  const fecha = rangoAbierto('Cobranzas', fechaCobro)
  const retMes = (col) => (m) => {
    const r = rangoAbierto('Cobranzas', col)
    return `=SUMPRODUCT((YEAR(${fecha})=${anio})*(MONTH(${fecha})=${m})*IF(ISNUMBER(${r});${r};0))`
  }
  const r0 = G.n() + 1
  G.mensual('IVA', retMes(retIva), 'Cobranzas · ya computada en el "a pagar" de la sección 1.')
  G.mensual('Ganancias', retMes(retGanancias), 'Cobranzas · es pago a cuenta del impuesto anual: no se recupera hasta la DDJJ.')
  G.mensual('Ingresos Brutos', retMes(retIibb), 'Cobranzas · ya viene declarada en la DDJJ de Rentas de la sección 2.')
  const r1 = G.n()
  const fTotal = G.mensual(rotuloTotal('Total retenido'), (m) => `=SUM(${cmes(m)}${r0}:${cmes(m)}${r1})`,
    'Plata de la empresa que está en manos del fisco. NO se suma a la posición: ya está adentro de los dos saldos a favor.')
  G.blanco()
  return { fTotal }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · OTROS IMPUESTOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL BLOQUE MUERTO QUE SE ENTIERRA (06/08) — el defecto E. La proyección del impuesto al cheque vivía
// en una fila DEBAJO del total (o sea fuera de la suma), calculada con `AVERAGEIF` de los meses con
// extracto, que EXCLUÍA agosto, y cuyo total coincidía al centavo con el de la fila real: a simple
// vista parecía un duplicado del total. Ahora el impuesto se deriva de SU driver —el 0,6% de cada
// lado del movimiento bancario que el Libro ya tiene cargado— y la fila vive DENTRO del total, que es
// donde tiene que estar un impuesto que se paga.

export const ROTULO_CHEQUE_DEBITADO = 'Impuesto al cheque · debitado'

export function bloqueOtros(G, { anio, C }) {
  G.push([seccion(4, 'Otros impuestos')])
  G.cabecera()
  const o0 = G.n() + 1
  // LO REGISTRADO ES LO QUE EL BANCO DEBITÓ (24/09/2026). La fila con el rótulo de la Ley 25.413 —la
  // que lee el Libro— es MAX(debitado; 0,6 % proyectado): una estimación, y se mudó a la sección 7.
  // Acá queda el hecho: la suma del extracto, igual que la base (`obligacionesDeDebitosBancarios`).
  const fCheque = G.mensual(ROTULO_CHEQUE_DEBITADO, (m) => formulaImpuestoChequeReal(BANCO_RAW, anio, m),
    'Extracto del Santander (_BANCO_RAW) · naturaleza «Impuesto al cheque», anulaciones restadas. Los meses sin extracto quedan en cero: no se estima acá.')
  const fGanancias = G.mensual('Anticipo de Ganancias', (m) =>
    `=SUMIFS(${rango(C.total)};${rango(C.detalle)};"*Anticipo de Ganancias*";${rango(C.fechaPrev)};">="&DATE(${anio};${m};1);${rango(C.fechaPrev)};"<="&EOMONTH(DATE(${anio};${m};1);0))`,
  'Compras · concepto "Anticipo de Ganancias", por su fecha prevista de pago. Es pago a cuenta del impuesto anual: se recupera recién en la DDJJ.')
  const o1 = G.n()
  const fTotal = G.mensual(rotuloTotal('Total otros impuestos'), (m) => `=SUM(${cmes(m)}${o0}:${cmes(m)}${o1})`,
    'Lo registrado por fuera de IVA, IIBB y cargas sociales.')
  G.blanco()
  return { fCheque, fGanancias, fTotal }
}

// ═══ LA SECCIÓN 5 —«PLANES DE PAGO F931»— SE RETIRÓ (09/09/2026) ═══
//
// El dueño: *«Cargas Sociales sigue mezclando conceptos con la pestaña Impuestos y Financieros»*.
// Era, renglón por renglón, el cuadro 4 de «Cargas Sociales»: los mismos tres planes, la misma
// plata, la misma columna de Compras — pero por OTRO criterio (fecha PREVISTA acá, fecha de caja
// allá) y con OTROS nombres. Dos cuadros de la misma obligación que coincidían por casualidad.
//
// Un plan de pago de un F931 es DEUDA PREVISIONAL, no un impuesto: su cuadro vive donde vive el
// F931, y la cuota del mes se LEE por `CARGAS_MES_PLANES`. `bloquePlanes` y el `planesDePago` de
// `impuestos-fuentes.mjs` se borraron con él: lo que ya no llama nadie es capa fósil.

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · DEUDA FINANCIERA — LO QUE FALTA PAGAR (los defectos A y B, muertos)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// `C` (las columnas de Compras) dejó de ser un parámetro el 11/09/2026: las dos fórmulas de este bloque
// leen el Libro. El llamador puede seguir pasándolo; que no figure acá es la señal de que nadie lo lee.
export function bloqueDeudaFinanciera(G, { anio }) {
  G.push([seccion(5, 'Deuda financiera')])
  G.cabecera()
  const d0 = G.n() + 1
  const fCuota = G.mensual('Prendario Ford XLS · Santander — cuota',
    (m) => formulaCuotaPrendario(anio, m),
    'Libro `_MOVIMIENTOS`, rubro "Financiero" y contraparte del préstamo: el débito real cuando el extracto lo muestra, y la cuota proyectada con el importe del último débito cuando todavía no llegó. Dejó de leer Compras el 11/09/2026 —esas filas se vacían— y sigue siendo por MES: un SUMIF sobre el extracto entero crece cada vez que se importa un mes más de banco, y así declaraba $2.567.316 de cuota donde la cuota es $1.282.811.')
  // ═══ LA FILA MENSUAL «PLANES PREVISIONALES F931» SE RETIRÓ (09/09/2026) ═══
  //
  // El dueño: *«siguen duplicando cosas Cargas Sociales e Impuestos y Financieros»*. Era, mes por
  // mes, la fila «⇒ Total de cuotas del año» del cuadro 4 de «Cargas Sociales» —los mismos
  // $16.536.820 del año— traída acá con `INDEX(CARGAS_MES_PLANES;m)`. Leerla por rango con nombre
  // evitaba el segundo CÁLCULO, pero no el segundo CUADRO: el lector veía la misma serie en dos
  // pestañas y ninguna de las dos decía cuál manda.
  //
  // UN CONCEPTO, UNA FILA, UNA PESTAÑA. Un plan de pago de un F931 es deuda previsional y su cuadro
  // vive donde vive el F931. Lo que esta pestaña necesita de él es UN NÚMERO —lo que falta pagar—, y
  // eso lo publica `CARGAS_MES_PLANES_SIN_PAGAR` en la fila del titular, en una sola celda.
  //
  // LA CUOTA DEL MES SIGUE CONTANDO EN «A pagar en 30 días»: entra al calendario por el mismo rango
  // con nombre, dentro de la fórmula del hero. Sacarla de ahí habría bajado la ventana ~$2,49M y el
  // dueño lo habría leído como que esa cuota no hay que pagarla.
  const d1 = G.n()
  const fSalida = G.mensual(rotuloTotal('Salida financiera del mes'), (m) => `=SUM(${cmes(m)}${d0}:${cmes(m)}${d1})`,
    'Todo lo que se va por deuda con instrumento propio, mes a mes. Las cuotas de planes de F931 NO están acá: son deuda previsional y su cuadro es el de «Cargas Sociales».')
  // ═══ "PENDIENTE" QUIERE DECIR PENDIENTE (el defecto B) ═══
  //
  // Estas dos filas sumaban el rubro entero y el total del año —cuotas YA PAGADAS incluidas— y el
  // hero las publicaba como deuda: $31.895.983 donde la pendiente real es $14.372.450. $17,5M de
  // sobredeclaración justo en el número con el que se decide si hay que salir a cubrir un bache.
  // EL CORTE LO EVALÚA LA PLANILLA, NO LA CORRIDA: `TODAY()`. Con el serial del día tipeado, estas dos
  // celdas —que son las que el hero publica como DEUDA PENDIENTE— empiezan a contar cuotas ya
  // debitadas apenas la pestaña se queda un día sin regenerar.
  // EL «·» DE SUB-ÍTEM SE FUE CON LA PROSA (09/09/2026): no cuelga de la fila de arriba —es un
  // SALDO, no la cuota del mes— y el sangrado lo hacía pasar por un desglose de la serie mensual.
  const fPrendPend = G.lista('Prendario · cuotas por vencer',
    [formulaPrendarioPendiente()],
    'Libro `_MOVIMIENTOS`, rubro "Financiero" y contraparte del préstamo: las cuotas que NO están pagadas y vencen desde HOY (el corte lo evalúa la planilla, no la corrida). Una cuota con fecha pasada que el banco nunca debitó sigue debiéndose, y eso la fecha sola no lo puede contestar. Es un saldo, no una serie: por eso va fuera de la grilla mensual.')
  // ═══ Y LA TERCERA DEFINICIÓN DE «LO QUE FALTA PAGAR DE LOS PLANES» TAMBIÉN SE FUE ═══
  //
  // Era el renglón `   · planes F931 — cuotas que todavía no vencieron  $4.989.751`, medido por
  // FECHA. «Cargas Sociales» publica el mismo saldo medido por HECHO —lo que la planilla no marcó
  // «Pagado»—, criterio estrictamente mejor: incluye la cuota vencida que nadie pagó y las de otros
  // años. Hoy las dos dan $4.989.751; el día que se separen, la que tiene razón es la de hecho.
  //
  // ═══ Y CON ELLA SE FUE «⇒ Deuda fiscal-financiera PENDIENTE» (09/09/2026) ═══
  //
  // Sumaba `$B$fPrendPend + CARGAS_MES_PLANES_SIN_PAGAR` y el hero publicaba EXACTAMENTE la misma
  // cuenta, con las mismas dos referencias, catorce filas más arriba: dos renglones con el mismo
  // rótulo y el mismo peso en una pantalla de una carilla. El total combinado es la pregunta del
  // hero —cuánto se debe hoy—; este bloque es dueño del prendario y de nada más.
  G.blanco()
  return { fCuota, fSalida, fPrendPend }
}

// ═══ LA SECCIÓN 6 —«SUPUESTOS Y HUECOS»— SE ELIMINÓ ENTERA (09/09/2026) ═══
//
// El dueño, sobre las cuatro pestañas: *«minimalismo extremo, sin aclaraciones ni explicaciones de
// nada»*. El bloque eran seis renglones «▲ …» al pie de la pantalla —una alarma dibujada todos los
// días deja de significar algo el día que importa— más el parámetro de la alícuota, que no es un
// hueco sino una ENTRADA. Lo que decía cada uno vive acá, en el código, que es donde se lee cuando
// se va a cambiar la fórmula que depende de ello:
//
//   · TASA MUNICIPAL DE SEGURIDAD E HIGIENE — no hay una sola fila en Compras ni en el banco. Si la
//     obra tributa tasa municipal, ese costo no está en ningún cuadro del OS. Para cerrarlo hacen
//     falta el municipio de cada obra y su ordenanza vigente.
//   · IMPUESTO DE SELLOS — sin dato. Aplica sobre contratos: si se firmó alguno con sellado, no está
//     registrado. Para cerrarlo hace falta la lista de contratos firmados en el año.
//   · ANTICIPO DE GANANCIAS — último anticipo cargado: abril. De mayo en adelante Compras no tiene
//     ninguna fila. Si el anticipo sigue vigente son ~$144.427 por mes que el cash flow no proyecta.
//     Lo confirma el estudio contable. La fila del cuadro 4 lo mide igual: si vuelve, aparece sola.
//   · EL VENCIMIENTO DE IIBB DE SAN JUAN ES UN SUPUESTO — día 16, la moda de las presentaciones
//     reales de _IIBB_RAW (`IIBB_SUPUESTO`, en vencimientos-fiscales.mjs, que es donde se cambia).
//     Lo cierra una consulta a la DGR o al estudio contable.
//   · LOS PAGOS DE IVA E IIBB NO SE CARGAN EN COMPRAS — el cash flow los ve por ESTA pestaña. Si
//     alguien los cargara además en Compras, la misma plata saldría dos veces del flujo sin que
//     ningún total se rompa.
//   · EL IVA PROYECTADO ES UN CÁLCULO, NO UN HECHO — el supuesto completo lo arma `supuestoDelMes` y
//     lo imprime `informarProyeccion` en cada corrida. En la pestaña la proyección se distingue por
//     la tipografía (gris e itálica), como en las pestañas hermanas.
//   · UN TEXTO DONDE VA EL SALDO DE LIBRE DISPONIBILIDAD — se descarta del ancla y el mes se
//     recalcula desde _ARCA_RAW. Cada caso se imprime en el log de `planDeProyeccionIva`, con el mes
//     y el texto que había, para que el que lo escribió sepa por qué no está.
//
// Y LA ALÍCUOTA SE MUDÓ A «Parámetros», con su rango con nombre ALICUOTA_IVA. Es una entrada que
// firma el dueño, no un renglón de este cuadro: vive donde ya viven F931_DIA_DE_PAGO, las alícuotas
// del FCL y los días de vacaciones. Ver `asegurarParametros` en jornales-pestana.mjs.
