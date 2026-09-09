// EL DETALLE TÉCNICO DE "IMPUESTOS Y FINANCIEROS" — las cinco secciones, cada una con su driver.
//
// Va DESPUÉS de la posición, y es a propósito: la pantalla contesta primero "cuánto tengo que pagar,
// cuándo el IVA pide caja y cuánto debo", y recién después "cómo se calculó". Acá vive el cómo.

import { seccion, total as rotuloTotal } from './patron-pestana.mjs'
import { CALENDARIO_IMPUESTOS } from './cash-flow-lineas.mjs'
import { rango } from './compras-columnas.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import {
  formulaDebitoDeclarado, formulaCreditoProyectado, formulaAPagarProyectado,
  formulaLibreDispProyectada,
} from './iva-libre-disponibilidad.mjs'
import {
  formulaCuotaPrendario, formulaPrendarioPendiente,
  formulaAlicuotaIibbVigente, formulaIibbDeterminado,
  formulaImpuestoCheque, rangoIibb,
} from './impuestos-cuadro.mjs'
import { formulaDebitoArca, formulaCreditoArca, nuncaMenosQue } from './arca-formula.mjs'
import { ventasFacturadasDelMes } from './impuestos-base-libro.mjs'
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
//   3. mes sin DDJJ (cerrado o en curso) → MAX(lo que Cobranzas dice que se factura; lo que ARCA
//                                         ya registró). Ver «LO QUE SE VA A FACTURAR» abajo.
//   4. proyección                       → las facturas B de Cobranzas, por «Fecha de Factura».
//
// ═══ LO QUE SE VA A FACTURAR ES LO QUE COBRANZAS MARCA CON «B» (09/09/2026) ═══
//
// El dueño: *«considerar que lo que se va a facturar es lo que Cobranzas indica con B»*. Hasta hoy
// un mes CERRADO sin DDJJ salía de ARCA solo, y ARCA sólo tiene lo ya emitido. MEDIDO el 09/09:
// agosto tenía en _ARCA_RAW 8 facturas ($34.244.282 de neto, $7.191.299 de IVA) y en Cobranzas 18
// filas «B» con fecha de factura de agosto ($85.964.721, $18.052.591): las diez que faltan
// —Quattropani ×9 y MESSINA 31/08— no tienen número de comprobante todavía. El bloque de IIBB, tres
// filas más abajo, ya contaba las dieciocho: la misma pestaña afirmaba dos bases distintas para el
// mismo mes, y el hero reservaba $4,7M de menos para el IVA que vence el 18/09.
//
// Un mes sin DDJJ —cerrado o en curso— usa entonces la MISMA regla: MAX(Cobranzas B; ARCA). Cobranzas
// es el plan del dueño (lo que se va a facturar); ARCA es el piso (lo que ya se facturó y Cobranzas
// pudo no tener cargado). Cuando la F.2051 se presenta, gana ella y el mes se cierra con el dato
// oficial. Verificado contra las DDJJ ya presentadas: Cobranzas B difiere de la F.2051 en ±$2M por
// mes (mayo +$674k, junio −$1,75M, julio +$1,6M), por eso ARCA queda como piso y la DDJJ manda.
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

export function bloqueIva(G, { anio, ivaOficial, proy, arca, hoy }) {
  G.push([seccion(1, 'IVA')])
  // LA FILA DE ENCABEZADO SE DEVUELVE: el hero lee de ahí el NOMBRE del mes en que el IVA empieza a
  // salir de la caja. Sin devolverla habría que contarla desde afuera, que es cómo una referencia se
  // queda apuntando a la fila de al lado el día que el bloque cambia de forma.
  const fCabecera = G.cabecera()
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
  const ctx = { mesesDDJJ: mesesOf, ancla, mesesArca, mesesProy: proyIva, mesEnCurso, sinVentas: proy?.sinBase ?? [] }
  const origen = (m) => origenDelMes(m, ctx)
  const periodo = (m) => `${anio}-${String(m).padStart(2, '0')}`
  /** ¿El mes lo calcula la planilla (ARCA o proyección), o es un valor que se preserva? */
  const calculado = (m) => [ORIGEN.arca, ORIGEN.arcaParcial, ORIGEN.proyeccion].includes(origen(m))

  const fDeb = G.n() + 1
  const fCred = fDeb + 1
  const fLibre = fDeb + 3
  const colAnt = (m) => `${cmes(m - 1)}${fLibre}`

  /**
   * El término del mes. El mes EN CURSO es MAX(hecho parcial; proyección) en los dos lados. El mes
   * CERRADO sin DDJJ distingue los lados: el DÉBITO es MAX(Cobranzas B; ARCA) —ver «LO QUE SE VA A
   * FACTURAR»—, y el CRÉDITO es ARCA solo, porque las compras de un mes cerrado ya están todas en el
   * libro R y el Libro del cash flow mide otra cosa (lo PAGADO en el mes, no lo facturado). MEDIDO
   * el 09/09 en la copia: con MAX en el crédito, agosto saltaba de $3.504.360 (ARCA) a $11.355.577
   * y el IVA a pagar del 21/09 bajaba de $4,7M a $0 — un crédito que la DDJJ no va a tener.
   */
  const termino = (m, { deArca, proyectado, planDelDueno = false }) => {
    const o = origen(m)
    if (o === ORIGEN.arcaParcial) return nuncaMenosQue(deArca(periodo(m)), proyectado(m))
    if (o === ORIGEN.arca) return planDelDueno ? nuncaMenosQue(deArca(periodo(m)), proyectado(m)) : deArca(periodo(m))
    return proyectado(m)
  }

  G.mensual('Débito fiscal del período',
    (m) => (calculado(m)
      ? termino(m, { deArca: formulaDebitoArca, proyectado: (x) => formulaDebitoDeclarado(proy.brutoDebito(x)), planDelDueno: true })
      : ofOAjeno(m, 'debito')),
    'F.2051 · IVA generado por las ventas del mes. Sin DDJJ: MAX(el IVA de las facturas B de Cobranzas por «Fecha de Factura»; lo que ARCA ya registró en _ARCA_RAW). Sin comprobantes: las facturas B solas.', { meses })
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
  // ═══ EL ESTADO ES UNA PALABRA, SIN GLIFO Y SIN EL N° DE TRANSACCIÓN (09/09/2026) ═══
  //
  // La fila decía «19/02·N…8367» en los meses presentados y «▲ ARCA (sin DDJJ)», «▲ PROYECCIÓN» o
  // «▲ SIN VENTAS CARGADAS» en el resto: tres glifos de alarma dibujados TODOS los días en una fila
  // que no decide nada, más una cadena de trazabilidad de dieciocho caracteres apretada en 100 px.
  // El dueño mandó sacar los ▲ de las cuatro pestañas; y una alarma que aparece siempre deja de
  // significar algo el día que importa.
  //
  // LA DISTINCIÓN QUE SÍ IMPORTA —hecho declarado contra cálculo— NO SE PIERDE: sigue siendo cuatro
  // estados con cuatro palabras distintas, y la PROYECCIÓN además se dibuja gris e itálica, como
  // marca una estimación cualquier statement serio (ver `proyectadas` en la piel).
  //
  // LA TRAZABILIDAD SE VA DE LA PESTAÑA, NO DEL OS. La fecha de presentación y el N° de transacción
  // de cada F.2051 se imprimen en el log de la corrida (`informarProyeccion`), que es donde se los
  // busca cuando hay que verificar contra ARCA — no en una celda de 100 px que se lee doce veces por
  // día sin necesitarlos.
  const procedencia = {
    [ORIGEN.arca]: 'Cobranzas',
    [ORIGEN.arcaParcial]: 'parcial',
    [ORIGEN.proyeccion]: 'proyección',
    [ORIGEN.sinVentas]: 'sin ventas',
  }
  const fDDJJ = G.mensual('DDJJ presentada',
    (m) => (procedencia[origen(m)] ?? (porMesOf.has(m)
      ? 'presentada'
      : (m <= ancla ? AJENO : VACIO))),
    'F.2051 presentada ante ARCA. Fuente primaria, verificable por N° de transacción — la fecha y el número de cada una salen en el log de la corrida. "ARCA" es el período cerrado calculado sobre los comprobantes reales que todavía no se presentaron; "parcial" es el mes en curso, que se completa solo a medida que ARCA se carga; "proyección" no tiene ni comprobantes: es un cálculo, no un hecho.', { meses, totaliza: false })
  G.blanco()
  const porOrigen = Object.fromEntries(Object.values(ORIGEN).map((o) => [o, meses.filter((m) => origen(m) === o)]))
  return { fDeb, fCred, fAPagar, fLibre, fDDJJ, fCabecera, meses, mesesOf, ancla, anio, porOrigen }
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

export function bloqueIibb(G, { anio, iibb, proy }) {
  G.push([seccion(2, 'Ingresos Brutos San Juan')])
  G.cabecera()
  const porMes = new Map(iibb.map((d) => [Number(String(d.periodo ?? '').slice(5, 7)), d]))
  const reales = M12.filter((m) => porMes.has(m))
  const ultimoReal = reales[reales.length - 1] ?? 0
  const ultimoPeriodo = ultimoReal ? porMes.get(ultimoReal).periodo : null
  // Se proyecta desde el mes siguiente al último declarado hasta donde llegue la proyección de IVA
  // (mismo horizonte: dos horizontes distintos en la misma pestaña serían dos verdades del año).
  const hastaMes = Math.max(proy?.meses?.length ? proy.meses[proy.meses.length - 1] : 0, ultimoReal)
  // UN MES FUTURO SIN FACTURAS NO ENTRA: fuera de `meses`, `G.mensual` le escribe VACIO en las seis
  // filas. El porqué, con los números medidos, está en `planDeVentas` (impuestos-base-libro).
  const sinBase = proy?.sinBase ?? []
  const proyectados = M12.filter((m) => m > ultimoReal && m <= hastaMes && !sinBase.includes(m))
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
    (m) => (esProy(m) ? `=${ventasFacturadasDelMes(anio, m, 'neto')}` : `=${ref(m, IIBB_COL.base)}`),
    'DDJJ de Rentas · réplica _IIBB_RAW hasta el último período presentado. Los meses en ámbar son PROYECCIÓN y salen de LA MISMA definición que el débito fiscal del bloque 1: el neto de las facturas B emitidas en el mes (Cobranzas, columna J, por «Fecha de Factura»). Criterio DEVENGADO, el mismo que declara la DDJJ. Un mes futuro sin facturas cargadas queda VACÍO: no se proyecta una base que no tiene de dónde salir.', { meses })
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
    'DDJJ de Rentas · réplica _IIBB_RAW. Ya vienen computadas ahí: no se vuelven a sumar en la sección 3. Los meses proyectados van en CERO a propósito: proyectar retenciones sería inventar cuánto le va a retener cada cliente, y de más (una retención que no ocurre baja el impuesto a pagar y sube el piso de caja).', { meses })
  const fAPagar = G.mensual(CALENDARIO_IMPUESTOS.rotulos.iibb,
    (m) => `=MAX(0;N(${cmes(m)}${fImp})-N(${cmes(m)}${fRet})-N(${prev(m)}))`,
    'Impuesto menos retenciones menos el saldo a favor que venía. ESTA es la fila que leen el Libro y el cash flow.', { meses })
  G.mensual('Saldo a favor al cierre del mes', (m) => `=MAX(0;N(${prev(m)})+N(${cmes(m)}${fRet})-N(${cmes(m)}${fImp}))`,
    'Se arrastra al mes siguiente. El total no aplica.', { meses, totaliza: false })
  G.blanco()
  return { fBase, fAli, fImp, fRet, fAPagar, fSaldo, meses, reales, proyectados, ultimoReal, ultimoPeriodo }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · RETENCIONES SUFRIDAS — referencia, no suma
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Una retención es impuesto YA PAGADO. No se suma al hero porque ya está DENTRO de la libre
// disponibilidad del F.2051 y de la DDJJ de Rentas: sumarla otra vez la contaría dos veces.

export function bloqueRetenciones(G, { anio }) {
  G.push([seccion(3, 'Retenciones sufridas')])
  G.cabecera()
  // RANGO ABIERTO. Cerrado en la fila 400 funcionaba con 357 filas de Cobranzas y reventaba callado
  // en la 401: el número que decide sale de la fuente con rango abierto.
  const retMes = (col) => (m) => `=SUMPRODUCT((YEAR(Cobranzas!$Q$5:$Q)=${anio})*(MONTH(Cobranzas!$Q$5:$Q)=${m})*IF(ISNUMBER(Cobranzas!$${col}$5:$${col});Cobranzas!$${col}$5:$${col};0))`
  const r0 = G.n() + 1
  G.mensual('IVA', retMes('X'), 'Cobranzas · ya computada en el "a pagar" de la sección 1.')
  G.mensual('Ganancias', retMes('Y'), 'Cobranzas · es pago a cuenta del impuesto anual: no se recupera hasta la DDJJ.')
  G.mensual('Ingresos Brutos', retMes('Z'), 'Cobranzas · ya viene declarada en la DDJJ de Rentas de la sección 2.')
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

export function bloqueOtros(G, { anio, C }) {
  G.push([seccion(4, 'Otros impuestos')])
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

export function bloqueDeudaFinanciera(G, { anio, C }) {
  G.push([seccion(5, 'Deuda financiera')])
  G.cabecera()
  const d0 = G.n() + 1
  const fCuota = G.mensual('Prendario Ford XLS · Santander — cuota',
    (m) => formulaCuotaPrendario(C, anio, m),
    'Compras, rubro "Financiero": el cuadro de amortización del banco, cuota por cuota, por su fecha prevista de pago (el banco debita el día 7). NO sale del extracto: un SUMIF sobre el extracto crece cada vez que se importa un mes más de banco, y así declaraba $2.567.316 de cuota donde la cuota es $1.282.811.')
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
    [formulaPrendarioPendiente(C)],
    'Compras, rubro "Financiero", SÓLO las cuotas con fecha prevista posterior a HOY (el corte lo evalúa la planilla, no la corrida). Es un saldo, no una serie: por eso va fuera de la grilla mensual.')
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
