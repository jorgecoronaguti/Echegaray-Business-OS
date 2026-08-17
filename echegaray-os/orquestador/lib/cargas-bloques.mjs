// LOS SIETE CUADROS DE "CARGAS SOCIALES" — cada uno con su dueño, todos sobre la misma grilla.
//
// Toda la pestaña habla de lo mismo —el costo de la nómina— visto de siete maneras: lo declarado, lo
// pagado, la diferencia, lo que viene, cuándo sale de la caja, lo que se devengó y todavía no se pagó,
// y las cuotas de lo viejo. Cada bloque escribe sus filas y DEVUELVE en qué fila quedó cada total: el
// que viene abajo lo referencia en vez de recalcularlo por otro camino.

import { seccion, sub, total as rotuloTotal } from './patron-pestana.mjs'
import { rango } from './compras-columnas.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { celdaF931, celdaCabecera, PESTAÑA as RAW } from '../scripts/f931-sheet.mjs'
import {
  CONCEPTOS_CADENA, A_VERIFICAR, RANGO_DIA_PAGO_F931,
  formulaProporcionPrimerAnio, proyeccionDeConcepto, jornalesDelMes,
} from './cargas-cadena.mjs'
import { ROTULOS_CARGAS, RUBRO_PLANES, RUBRO_CARGAS, RUBRO_GREMIALES } from './libro-extractores-cargas.mjs'
import { MES, cm, REALES } from './cargas-grilla.mjs'
import { notaSupuesto } from './proyeccion-convenio.mjs'
import { ALERTA } from './glifos.mjs'

const ar = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '')

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · DECLARADO — ¿cuánto generó la nómina cada mes?
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloqueDeclarado(G, { anio, periodos, conceptos }) {
  G.push([seccion(1, 'Declarado en la DDJJ F931 — ¿cuánto generó la nómina cada mes?')])
  G.cabecera()
  const per = (m) => `${anio}-${String(m).padStart(2, '0')}`
  const d0 = G.n() + 1
  const filaDecl = {}
  for (const c of conceptos) {
    filaDecl[c.codigo] = G.mensual(c.rotulo, (m) => (periodos.includes(per(m)) ? celdaF931(per(m), c.codigo) : VACIO),
      `Código ${c.codigo} de la DDJJ · ${RAW}`)
  }
  const d1 = G.n()
  const fDeclTot = G.mensual(rotuloTotal('Total declarado'), (m) => `=SUM(${cm(m)}${d0}:${cm(m)}${d1})`, 'Suma de los conceptos de arriba.')
  const fEmp = G.mensual('Empleados en nómina', (m) => (periodos.includes(per(m)) ? celdaCabecera(per(m), 'E') : VACIO),
    'Cabecera de la DDJJ.', { totaliza: false })
  const fRem = G.mensual('Remuneración declarada', (m) => (periodos.includes(per(m)) ? celdaCabecera(per(m), 'F') : VACIO),
    'Cabecera de la DDJJ. Es la base de todas las alícuotas.')
  G.push()
  return { filaDecl, fDeclTot, fEmp, fRem }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · PAGADO — ¿cuánto salió efectivamente de la caja?
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloquePagado(G, { anio, C, fArtDecl = 0, fDeclTot = 0 }) {
  G.push([seccion(2, 'Pagado — ¿cuánto salió efectivamente de la caja?')])
  G.cabecera()
  // LAS COLUMNAS DE COMPRAS SE RESUELVEN POR SU ENCABEZADO. Éste es el bloque que estaba en #VALUE!
  // desde que una columna de Compras se movió y la referencia por letra quedó en #REF!.
  // PAGADO ES PAGADO: LO QUE LA PLANILLA MARCÓ, Y SÓLO HASTA HOY.
  //
  // EL DEFECTO QUE ESTO CORRIGE (23/07). Compras tiene cargados los pagos PREVISTOS de los meses que
  // vienen, con su fecha de caja futura. Sin el tope de hoy, la sección "¿cuánto salió efectivamente
  // de la caja?" mostraba $9.000.000 en julio, $8.000.000 en agosto y $6.500.000 de septiembre a
  // diciembre —números redondos, o sea presupuestados— y el total del año daba $103,7M contra
  // $44,8M declarados. Un cuadro de lo pagado que incluye lo que todavía no se pagó no es un error
  // de presentación: es un número que se usa para decidir y está mal. Lo previsto se contrasta en la
  // sección 5, donde corresponde, contra la proyección propia.
  //
  // ═══ Y EL TOPE DE HOY NO ALCANZABA: UNA FECHA VENCIDA NO ES UN PAGO (17/08/2026) ═══
  //
  // El corte de arriba resuelve el FUTURO. No resuelve la fila de este mes cuya fecha prevista ya
  // pasó y que nadie marcó — y ésa es justo la que se mira. Medido en el Sheet vivo al 17/08, esta
  // fila publicaba **$10.494.876 de F931 "salido de la caja" en agosto contra $0 realmente pagados**:
  //
  //   · Compras f469 — $8.000.000, ARCA, fecha de caja 10/08, estado «Proyectado». Es el número
  //     redondo tipeado que `libro-extractores-cargas.mjs` denuncia como previsión en su cabecera.
  //   · Compras f725 — $2.494.876, cuota del plan W303094, 16/08, estado «Pendiente» y rubro
  //     «Deuda previsional (planes de pago)», pero con "F931" en Cliente/Asignación.
  //
  // El daño no quedaba acá: el hero saca REAL de esta fila y COMPROMETIDO por diferencia, así que
  // inflaba lo pagado ~$10,5M y desinflaba en lo mismo la deuda que se usa para decidir; y la
  // sección 3 llegó a declarar $10.494.876 de sobrepago que no existe.
  //
  // LA PESTAÑA YA SABÍA CÓMO SE PREGUNTA. Doce filas más arriba el hero de planes mide por HECHO
  // (`"<>Pagado"` sobre la columna del cargador). Convivían dos definiciones de "pagado" en la misma
  // pestaña, la de arriba correcta y la de abajo por fecha. Ahora es una sola, y es la del cargador
  // —la misma que `estaPagada` usa en el libro—, así que la pestaña y el Libro Canónico no pueden
  // discrepar sobre qué salió.
  //
  // EL RUBRO ACOTA ADEMÁS DEL CLIENTE. "F931" en Cliente/Asignación no dice de qué obligación se
  // trata: la cuota de un plan de pago de un F931 viejo también lo lleva. Sin el rubro, esos pesos
  // sumaban en la fila del F931 Y otra vez en la fila del plan, dentro del mismo cuadro. Los textos
  // salen de la taxonomía única (`rubro-caja.mjs` vía `libro-extractores-cargas.mjs`): escritos a
  // mano acá, el día que la taxonomía cambie este filtro devuelve cero sin dar un solo error.
  const mes = (m) => `">="&DATE(${anio};${m};1);${rango(C.fecha)};"<="&MIN(EOMONTH(DATE(${anio};${m};1);0);TODAY())`
  const salio = `${rango(C.estado)};"Pagado"`
  const pagado = (param, rubro) => (m) => `=IFERROR(SUMIFS(${rango(C.total)};${rango(C.cliente)};`
    + `'Parámetros'!$A$${param};${rango(C.rubro)};"${rubro}";${salio};${rango(C.fecha)};${mes(m)});0)`
  const p0 = G.n() + 1
  const filaPag = {}
  filaPag.F931 = G.mensual('F931', pagado(35, RUBRO_CARGAS),
    `Compras · "F931" en Cliente/Asignación con rubro "${RUBRO_CARGAS}", marcado Pagado, por fecha de caja (col. ${C.fecha}).`)
  // El plan conserva su criterio propio (cliente + detalle): es la fila que distingue la cuota
  // financiada del F931 corriente, y su rubro ya la separa del de arriba. Lo que sí gana es el
  // estado — una cuota con vencimiento pasado y sin marcar no salió de la caja.
  filaPag.plan = G.mensual('Deuda previsional en cuotas', (m) =>
    `=IFERROR(SUMIFS(${rango(C.total)};${rango(C.cliente)};'Parámetros'!$A$41;${rango(C.detalle)};`
    + `'Parámetros'!$B$41;${salio};${rango(C.fecha)};${mes(m)});0)`,
  'Compras · plan de pago marcado Pagado, por fecha de caja.')
  ;[['FCL', 36], ['UOCRA', 37], ['IERIC', 38], ['FODECO', 39]].forEach(([r, p]) => {
    filaPag[r] = G.mensual(r, pagado(p, RUBRO_GREMIALES),
      `Compras · "${r}" en Cliente/Asignación con rubro "${RUBRO_GREMIALES}", marcado Pagado, por fecha de caja.`)
  })
  const p1 = G.n()
  const fPagTot = G.mensual(rotuloTotal('Total pagado'), (m) => `=SUM(${cm(m)}${p0}:${cm(m)}${p1})`, 'Suma de los conceptos de arriba.')
  // ═══ EL ESLABÓN ART — DESGLOSE, NO UNA SEGUNDA OBLIGACIÓN (06/08) ═══
  //
  // La auditoría: la pestaña declara $10,8M de ART en la sección 1 y no tiene fila de pago, así que no
  // podía contestar si la ART se paga. La respuesta estaba en el dato y hubo que ir a buscarla:
  //
  //   · `_F931_RAW` trae el código 312 "L.R.T. — ART" leído del MISMO PDF que los códigos 301/302/
  //     351/352/028, con el mismo período, la misma dotación y la misma remuneración declarada. No es
  //     un comprobante aparte: es un renglón de la propia DDJJ.
  //   · Y el pago lo confirma por otro camino: el F931 que Compras registra en el mes m es, al peso,
  //     el Total declarado del mes m−1 —feb/mar/abr/may/jun 2026, cuatro meses consecutivos exactos—
  //     y ese total INCLUYE el 312. Si la ART se pagara aparte, cada pago vendría corto entre $1,3M y
  //     $2,2M todos los meses. No viene corto.
  //
  // Entonces la ART NO suma una segunda vez: sumarla duplicaría $10,8M en el año y —lo grave— la
  // duplicación entraría a la serie que el Libro Canónico lee. Esta fila va DEBAJO del total y FUERA
  // del rango que el total suma: es la parte de un número que ya está arriba, no un número nuevo.
  //
  // Se prorratea en vez de copiar el declarado porque un pago PARCIAL (los hubo: enero 2026 se pagó a
  // medias y el resto se financió en un plan) tiene adentro la parte proporcional de ART, no la
  // entera. Con el pago completo el prorrateo da exactamente el 312 declarado.
  let fArtPag = 0
  if (fArtDecl && fDeclTot) {
    fArtPag = G.mensual(sub('ART · ya incluida en el F931, no se paga aparte'),
      (m) => `=IFERROR(${cm(m)}${filaPag.F931}*${cm(m - 1)}${fArtDecl}/${cm(m - 1)}${fDeclTot};0)`,
      'El código 312 de la DDJJ del mes anterior, en la proporción del F931 que efectivamente se pagó.',
      // Desde febrero: el F931 que sale en enero es la DDJJ de diciembre del año anterior, que esta
      // grilla no tiene. Inventarle una proporción sería fabricar el dato que falta.
      { meses: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })
  }
  G.push()
  return { filaPag, fPagTot, fArtPag }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · DECLARADO CONTRA PAGADO — ¿estamos al día?
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloqueDiferencia(G, { fPagF931, fDeclTot }) {
  // ═══ UN CONTROL COMPARA LO MISMO CONTRA LO MISMO (06/08) ═══
  //
  // Acá decía `Total pagado − Total declarado`, y esos dos totales no son comparables: el pagado suma
  // FCL, UOCRA, IERIC, FODECO y las cuotas de planes —ninguno de los cuales está en la DDJJ— contra un
  // declarado que sólo tiene los seis códigos del F931. La resta daba +$8.020.918 en el año y no
  // significaba nada: ni sobrepago ni deuda, sólo dos canastas distintas restadas entre sí. Un cuadro
  // titulado "¿estamos al día?" que no puede contestar su propia pregunta es peor que no tenerlo,
  // porque el que lo mira se queda tranquilo.
  //
  // Y la nota pedía perdón por el desfasaje ("no tiene que dar cero mes a mes, la diferencia corre un
  // mes"). El desfasaje no es una excusa: es la regla. El F931 del mes m−1 se paga en el mes m, así
  // que la comparación correcta ya viene corrida y entonces SÍ tiene que dar cero. Con esto, los meses
  // pagados completos dan $0 y los que se financiaron en un plan quedan en rojo con su importe exacto
  // —que es justo lo que hay que ver— en vez de esconderse adentro de un número grande y verde.
  G.push([seccion(3, 'Al día con el F931 — lo pagado contra lo declarado')])
  G.cabecera()
  G.mensual('F931 pagado − declarado el mes anterior', (m) => `=${cm(m)}${fPagF931}-${cm(m - 1)}${fDeclTot}`,
    'El F931 de un mes se paga al siguiente: la comparación ya viene corrida, así que un mes pagado completo da $0. En rojo queda lo que se declaró y no salió de la caja.',
    // Enero compara contra diciembre del año anterior, que esta grilla no tiene.
    { meses: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })
  G.push()
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · PROYECCIÓN — ¿cuánto va a costar lo que viene?
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloqueProyeccion(G, {
  anio, desdeProy, filaDecl, filaPag, fRem, fEmp, bloqueBase = null,
  // CON QUÉ BASE QUEDÓ VALUADA LA MASA QUE ESTA PESTAÑA MULTIPLICA. No se decide acá —se lee de lo que
  // Jornales publicó, ver `baseDeJornales`— porque la decisión ya vive en un solo lugar. Sin señal, la
  // glosa lo dice en vez de afirmar un supuesto que puede no estar adentro del número.
  baseJornales = null,
}) {
  G.push([seccion(4, `Proyección ${MES[desdeProy]}–dic — ¿cuánto va a costar lo que viene?`)])
  G.cabecera()
  const proyMeses = Array.from({ length: 12 - desdeProy + 1 }, (_, i) => desdeProy + i)
  const fRelacion = G.mensual('Remuneración declarada ÷ jornales netos', (m) => (m === desdeProy
    ? `=IFERROR(SUM(${REALES(fRem)})/(${[1, 2, 3, 4, 5, 6].map((x) => jornalesDelMes(`DATE(${anio};${x};1)`)).join('+')});"")` : VACIO),
  'Medido sobre los seis meses que tienen las dos cifras. Lo declarado en F931 no es el neto pagado en mano: esta relación traduce una en otra.', { meses: proyMeses, totaliza: false })
  // EL SUPUESTO DEL 100% DEL CONVENIO SE DECLARA ACÁ TAMBIÉN, Y NO ES REDUNDANCIA (07/08): esta fila no
  // muestra la masa, la MULTIPLICA — y sobre ella corren contribuciones, IERIC, FODECO y FCL. El
  // supuesto llega compuesto hasta la última fila de esta pestaña; declararlo sólo en Jornales lo deja
  // fuera de donde se lee. El texto vive UNA vez, en lib/proyeccion-convenio.mjs.
  //
  // Y DICE LA VERDAD EN LOS DOS ESTADOS. Antes se concatenaba siempre: con la réplica del convenio
  // caída, Jornales publicaba la masa al jornal PACTADO y esta glosa seguía afirmando el 100% de la
  // escala. Una nota que declara un supuesto que el número de al lado no tiene adentro no es una
  // limitación declarada: es una afirmación falsa, y encima tranquiliza.
  const fRemProy = G.mensual('Remuneración proyectada', (m) => `=IFERROR((${jornalesDelMes(`DATE(${anio};${m};1)`)})*$${cm(desdeProy)}$${fRelacion};0)`,
    `Jornales proyectados × la relación de arriba. ${notaSupuesto(baseJornales)}`, { meses: proyMeses })
  // ═══ LA DOTACIÓN ES LA ÚLTIMA REAL, NO UN PROMEDIO (defecto A7) ═══
  //
  // Decía `AVERAGE(B19:G19)` = 21 personas: el promedio de los seis F931 presentados (18·16·24·22·23·22).
  // Un promedio no fue cierto ningún mes, y con él se proyectaba el Seguro de Vida y —ahora— IERIC y
  // FODECO, que son costos POR PERSONA. Se usa el último mes declarado, que sí fue cierto.
  //
  // Y AL LADO, EL CONTROL CONTRA OTRA FUENTE. La regla del archivo: un control nunca se valida contra
  // la misma información que produce. La dotación de la DDJJ y el plantel de la planilla de jornales
  // vienen de dos lugares distintos; si se separan mucho, uno de los dos está mal.
  const fDot = G.mensual('Dotación proyectada', () => `=IFERROR(INDEX(${REALES(fEmp)};COUNT(${REALES(fEmp)}));"")`,
    'El ÚLTIMO mes con DDJJ, no el promedio: un promedio no fue cierto ningún mes y acá multiplica costos por persona.', { meses: proyMeses, totaliza: false })
  const fPlantel = G.n() + 1
  G.push([sub('   control: plantel de la última quincena'),
    '=IFERROR(INDEX(JORNALES_REAL_PERSONAS;COUNT(JORNALES_REAL_PERSONAS));"")',
    `=IF(N($B$${fPlantel})=0;"";IF(N($${cm(desdeProy)}$${fDot})=0;"";IF(ABS($${cm(desdeProy)}$${fDot}-$B$${fPlantel})/$${cm(desdeProy)}$${fDot}>0,3;"${ALERTA} la DDJJ y la planilla no coinciden";"✓ coherente con la planilla")))`,
    ...Array(11).fill(VACIO),
    'Dos fuentes distintas: la cabecera de la DDJJ y el registro de quincenas de Jornales. La DDJJ incluye oficina; la planilla de obra, no — una diferencia chica es esperable, una grande es un dato mal cargado.'])
  // La proporción del plantel en su primer año: la base de la alícuota legal de FCL. La antigüedad ya
  // estaba en la fuente que se lee todos los días y no tenía un solo consumidor.
  const fAntig = G.push([sub('   del plantel de obra, en su primer año de antigüedad'),
    formulaProporcionPrimerAnio('_J_OBREROS', bloqueBase), ...Array(12).fill(VACIO),
    'Fecha de ingreso de cada persona en _J_OBREROS, sobre la última quincena cerrada. Es lo que pondera las dos alícuotas del Fondo de Cese.'])
  const sinBase = []
  /**
   * UN BLOQUE DE LA PROYECCIÓN, CON SU SUBTOTAL. Se arma en dos pasadas —lo que declara la DDJJ y lo
   * que no— porque el cash flow tiene DOS líneas, cargas sociales y gremiales, y el Libro Canónico
   * lee cada subtotal por su nombre. Con un solo total, los gremiales se mudarían a la línea de
   * cargas sociales: el consolidado seguiría bien y las dos líneas dirían cosas falsas.
   */
  const bloqueProyectado = (conceptos) => {
    const desde = G.n() + 1
    for (const c of conceptos) {
      const origen = c.de === 'declarado' ? filaDecl[c.codigo] : filaPag[c.rotulo]
      // UN CONCEPTO SIN BASE NO SE PROYECTA EN CERO EN SILENCIO: se anota y se denuncia abajo. Que
      // falte una fila de la proyección tiene que verse, porque el titular de la pestaña la suma.
      if (!origen) { sinBase.push(c.rotulo); continue }
      // La regla de cada concepto vive en lib/cargas-cadena.mjs y viaja en la columna de origen escrita
      // como texto POR FÓRMULA: así lo que se lee en la grilla son pesos —no una mezcla de pesos y
      // porcentajes en la misma columna— y la regla sigue siendo auditable de un vistazo, con el valor
      // que efectivamente se aplicó y no el que había el día que corrió el generador.
      const p = proyeccionDeConcepto(c, {
        filaOrigen: origen, fRem, fEmp, reales: REALES, colMes: cm, fRemProy, fDot,
        celdaProporcion: `$B$${fAntig}`,
      })
      G.mensual(c.rotulo, p.celda, p.origen, { meses: proyMeses })
    }
    return { desde, hasta: G.n() }
  }
  /** El subtotal de un bloque. Con el bloque vacío escribe un cero honesto: `SUM(B45:B44)` sumaría otra cosa. */
  const subtotal = (rotulo, { desde, hasta }, origen) => G.mensual(rotulo,
    (m) => (hasta >= desde ? `=SUM(${cm(m)}${desde}:${cm(m)}${hasta})` : '=0'), origen, { meses: proyMeses })

  const bDecl = bloqueProyectado(CONCEPTOS_CADENA.filter((c) => c.de === 'declarado'))
  const fSubF931 = subtotal(ROTULOS_CARGAS.f931, bDecl,
    'Los seis conceptos de la DDJJ. Es la línea "Nómina · Cargas sociales" del cash flow, y el Libro la lee por CARGAS_MES_F931.')
  const bGrem = bloqueProyectado(CONCEPTOS_CADENA.filter((c) => c.de !== 'declarado'))
  const fSubGremiales = subtotal(ROTULOS_CARGAS.gremiales, bGrem,
    'Lo que NO declara la DDJJ y se paga aparte. Es la línea "Nómina · Gremiales" del cash flow, y el Libro la lee por CARGAS_MES_GREMIALES.')
  const fProyTot = G.mensual(rotuloTotal('Total devengado en el mes'), (m) => `=${cm(m)}${fSubF931}+${cm(m)}${fSubGremiales}`,
    'Lo que la nómina de ESE mes genera de cargas. Todavía no es lo que sale de la caja: eso es la sección 5.', { meses: proyMeses })
  // ═══ LA FECHA EN QUE ESA PLATA SALE — LA FILA QUE FALTABA (06/08) ═══
  //
  // La pestaña decía "el F931 vence al mes siguiente" y nunca decía QUÉ DÍA. Sin esa fila, el Libro
  // Canónico no podía leer la cadena: un movimiento sin fecha no entra en ningún tramo del calendario.
  // El día vive en Parámetros (medido sobre los pagos reales, declarado "a verificar"), no adentro de
  // esta fórmula, y DICIEMBRE SE RESUELVE SOLO: DATE(2026;13;10) es el 10/01/2027, que es exactamente
  // la plata que hasta hoy no levantaba nadie.
  //
  // Y DICIEMBRE SE ESCRIBE CON SU AÑO, NO COMO "MES 13". `DATE(2026;13;10)` da el mismo día, pero la
  // celda que uno abre para entender de dónde sale la plata tiene que decir 2027 — es la misma regla
  // que Jornales ya tiene escrita para el retiro de diciembre (defecto B7 de esa pestaña).
  const fFechaSalida = G.mensual(ROTULOS_CARGAS.fechas,
    (m) => `=DATE(${m === 12 ? anio + 1 : anio};${m === 12 ? 1 : m + 1};MAX(1;N(${RANGO_DIA_PAGO_F931})))`,
    `El devengado de ESTE mes sale al siguiente, el día que dice ${RANGO_DIA_PAGO_F931} en Parámetros. El de diciembre cae en enero del año que viene: por eso la última celda dice ${anio + 1}.`,
    { meses: proyMeses, totaliza: false })
  if (sinBase.length) {
    G.push([`${ALERTA} ${sinBase.length} concepto(s) sin base para proyectar`, ...Array(13).fill(VACIO),
      `${sinBase.join(', ')} — no aparecen en las secciones 1 ni 2, así que no se proyectan. El total de arriba está incompleto en esa medida.`])
  }
  G.push()
  return { proyMeses, fRelacion, fRemProy, fDot, fPlantel, fAntig, fSubF931, fSubGremiales, fProyTot, fFechaSalida }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · CUÁNDO SALE DE LA CAJA — el F931 vence al mes siguiente
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloqueCaja(G, { anio, desdeProy, proyMeses, fDeclTot, fProyTot, C }) {
  G.push([seccion(5, 'Cuándo sale de la caja — el F931 vence al mes siguiente')])
  G.cabecera()
  G.mensual('Cargas que salen en el mes', (m) => (m === desdeProy
    ? `=${cm(6)}${fDeclTot}` : `=${cm(m - 1)}${fProyTot}`),
  'El devengado del mes ANTERIOR. La proyección vieja ponía la carga de julio en julio: en un cuadro de caja eso corre unos $9M de mes. Ésta es la fila que tiene que mirar el cash flow.', { meses: proyMeses })
  // NO UN NÚMERO PEGADO: UNA FÓRMULA A LA FUENTE ÚNICA. Antes esta fila escribía el resultado de
  // `ps.reduce(...)` calculado en JS — un número pegado que el censo marcaba con razón (H56…K56). Las
  // cuotas que vencen cada mes YA viven, sumadas, en el total de la sección 7: esta fila las
  // referencia en vez de recalcularlas por afuera. Se llena por backfill, cuando ya se sabe en qué
  // fila quedó ese total (mismo patrón que el hero).
  const fCuotasVencen = G.mensual('Cuotas de planes de pago que vencen', () => VACIO,
    'Sección 7: el total de cuotas del mes, referenciado — no recalculado. Van aparte porque son deuda vieja financiada, no la carga del mes.', { meses: proyMeses })
  // EL CONTRASTE QUE FALTABA: qué tiene cargado Compras para esos meses. No es otra proyección —es
  // lo que una persona previó a mano— y por eso vale como control: si la proyección medida y lo
  // previsto se separan mucho, uno de los dos está mal y conviene saberlo antes y no en el mes.
  const fPrevisto = G.mensual('Previsto en Compras para ese mes', (m) =>
    `=IFERROR(SUMIFS(${rango(C.total)};${rango(C.cliente)};'Parámetros'!$A$35;${rango(C.fecha)};">"&TODAY();${rango(C.fecha)};"<="&EOMONTH(DATE(${anio};${m};1);0));0)-IFERROR(SUMIFS(${rango(C.total)};${rango(C.cliente)};'Parámetros'!$A$35;${rango(C.fecha)};">"&TODAY();${rango(C.fecha)};"<"&DATE(${anio};${m};1));0)`,
  'Los pagos de F931 que Compras tiene cargados con fecha futura. Es lo que alguien previó, no lo que salió.', { meses: proyMeses })
  // La comparación arranca DESPUÉS del mes en curso: el mes corriente ya tiene su F931 pagado, así
  // que "previsto de acá en adelante" da cero y restarlo contra el devengado inventaría un desvío de
  // doce millones que no existe.
  G.mensual(sub('diferencia contra lo proyectado acá'), (m) => `=${cm(m)}${fPrevisto}-${cm(m - 1)}${fProyTot}`,
    'Si esta fila se aleja de cero, la previsión cargada a mano y la proyección medida no coinciden.',
    { meses: proyMeses.filter((m) => m > desdeProy) })
  // ═══ EL AVISO VA EN LA CELDA, NO EN LA COLUMNA DE PROSA (06/08 — defecto B11) ═══
  //
  // Estas tres filas escribían su explicación en la columna O… y `vaciarColumnaDeProsa` la borra en
  // la misma corrida, por decisión del dueño ("quitá las notas, son confusas"). Resultado: tres
  // avisos con el ⚠ puesto y sin una palabra al lado. Un aviso mudo es peor que ninguno: ocupa el
  // lugar de la explicación y hace creer que se dijo algo. El texto entero va a la columna A, que es
  // ancha, derrama a la derecha sobre celdas vacías y no la vacía nadie.
  const pie = G.push([`${ALERTA} No contempla SAC ni vacaciones (sección 6), ni altas de personal que no estén en los jornales cargados.`])
  G.push()
  return { fCuotasVencen, pies: [pie] }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · SAC Y VACACIONES — lo devengado que todavía no se pagó
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloqueSac(G, { anio, C, fRem, fRemProy }) {
  G.push([seccion(6, 'SAC y vacaciones — lo devengado que todavía no se pagó')])
  G.cabecera()
  // ═══ PAGADO ES PAGADO: SÓLO HASTA HOY, ACÁ TAMBIÉN (06/08) ═══
  //
  // La sección 2 aprendió esto el 23/07 y esta fila se quedó afuera: filtraba por fecha de factura SIN
  // tope. En Compras hay dos filas de SAC con fecha 30/12 y estado "Proyectado" ($7.000.000 y
  // $1.500.000) —el aguinaldo de diciembre que todavía no existe— y esta fila las contaba como
  // PAGADAS. Resultado: la provisión acumulada terminaba el año en −$4.914.913, o sea la pestaña
  // afirmando que se pagó más aguinaldo del que se devengó. El mismo cuadro que la sección 2 vino a
  // arreglar, un renglón más abajo.
  const fSacPag = G.mensual('SAC pagado (real, de Compras)', (m) =>
    `=SUMPRODUCT((LOWER(${rango(C.proveedor)})="sac")*(YEAR(${rango(C.fechaFactura)})=${anio})*(MONTH(${rango(C.fechaFactura)})=${m})*(N(${rango(C.fechaFactura)})<=TODAY())*IF(ISNUMBER(${rango(C.total)});${rango(C.total)};0))`,
  'Compras · proveedor "SAC", por fecha de factura y sólo hasta hoy: lo cargado con fecha futura es previsión, no pago.')
  // ═══ EL SAC SE DEVENGA LOS DOCE MESES (06/08 — defecto B10) ═══
  //
  // Decía `=B$20/12`: un doceavo de la remuneración DECLARADA, y las DDJJ llegan hasta junio. De
  // julio en adelante la fila quedaba vacía, así que el devengado se cortaba y el pagado seguía: la
  // provisión acumulada terminaba diciembre en −$10.308.830. Un aguinaldo pagado contra un devengado
  // que dejó de devengarse no es un signo raro, es la pestaña afirmando que la empresa se debe plata
  // a sí misma. La cura es una sola: la remuneración del mes es la DECLARADA si existe, y si no la
  // PROYECTADA — que es exactamente la cadena que el resto de la pestaña ya usa.
  const remDelMes = (m) => `IF(N(${cm(m)}$${fRem})>0;${cm(m)}$${fRem};N(${cm(m)}$${fRemProy}))`
  const fSacDev = G.mensual('SAC devengado (1/12 de la remuneración)', (m) => `=IFERROR(${remDelMes(m)}/12;"")`,
    'Un doceavo de la remuneración de CADA mes: declarada mientras hay DDJJ, proyectada después. Antes se cortaba donde se cortan las DDJJ y la provisión acumulada terminaba el año en negativo.')
  G.mensual('Provisión acumulada (devengado − pagado)', (m) => `=SUM($B${fSacDev}:${cm(m)}${fSacDev})-SUM($B${fSacPag}:${cm(m)}${fSacPag})`,
    'Acumulado, no del mes: es cuánto se debe de aguinaldo a esta altura del año. Si termina en negativo, el devengado dejó de devengarse antes que el pagado.', { totaliza: false })
  // ═══ VACACIONES: LA ANTIGÜEDAD SÍ ESTÁ, LO QUE FALTA ES LA ESCALA ═══
  //
  // Acá decía "falta la antigüedad por legajo" y era FALSO: la columna C del espejo _J_OBREROS trae
  // la fecha de ingreso de cada persona (26/6/23, 12/8/24, 26/5/25…). El dato estaba en la misma
  // fuente que ya leemos todos los días.
  //
  // Lo que falta es otra cosa, y es normativa: los DÍAS que corresponden por tramo de antigüedad.
  // Eso no se cita de memoria (la skill laboral lo prohíbe: los valores se verifican, los institutos
  // se nombran). Va a una celda de Parámetros que confirma el contador, y la provisión se calcula
  // sola contra las fechas de ingreso reales.
  // ═══ MENOS TEXTO, LA MISMA ADVERTENCIA (06/08) ═══
  //
  // El estándar del dueño para esta pestaña es "poco texto, aire, importes protagonistas". Estas dos
  // líneas y las de las secciones 5 y 7 eran párrafos de 270 a 330 caracteres cruzando la página
  // entera al mismo peso tipográfico que los importes: cuatro muros de letra chica que le ganan el ojo
  // a los números. Se condensan sin perder ni una limitación —una limitación borrada es una mentira
  // por omisión— y la piel las dibuja como nota al pie: apagadas, 9 puntos, sin regla.
  const pieVac = G.push([`${ALERTA} Vacaciones — devengan mes a mes y no están provisionadas: falta la escala de días por antigüedad, que confirma el contador. No se inventa.`])
  // ═══ FONDO DE CESE LABORAL: ESTÁ, PERO NO POR DONDE UNO LO BUSCA ═══
  //
  // En la construcción NO existe la indemnización por antigüedad de la LCT: rige la Ley 22.250 y el
  // costo de la desvinculación se va pagando MES A MES al Fondo de Cese. Por eso NO corresponde
  // provisionar indemnizaciones al estilo del régimen común — el pasivo explosivo del despido no
  // existe si los aportes están al día.
  //
  // Y no está en el F931: los seis conceptos que declara la DDJJ son Seguridad Social (301/351),
  // Obra Social (302/352), ART (312) y Seguro de Vida (028). El FCL entra por otro lado, desde lo
  // efectivamente pagado en Compras (ver CONCEPTOS_PROY, base 'pagado'). O sea que su devengado no
  // se controla contra una declaración: lo único que se sabe es lo que salió de la caja.
  //
  // LA PREGUNTA QUE IMPORTA NO ES CUÁNTO, ES SI ESTÁ AL DÍA. Un Fondo de Cese atrasado es
  // incumplimiento y habilita reclamos, y este cuadro no lo puede contestar solo.
  const pieFcl = G.push([`${ALERTA} Fondo de Cese (Ley 22.250) — no lo declara la DDJJ: su devengado no se controla contra nada, sólo se sabe lo que salió de la caja. ${A_VERIFICAR}: la alícuota, y que los aportes estén al día.`])
  G.push()
  return { pies: [pieVac, pieFcl] }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 7 · PLANES DE PAGO DE DEUDA PREVISIONAL — las cuotas, mes por mes
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloquePlanes(G, { ps, C }) {
  G.push([seccion(7, 'Planes de pago de deuda previsional — las cuotas, mes por mes')])
  G.cabecera()
  const q0 = G.n() + 1
  for (const p of ps) {
    // RÉPLICA, NO CÁLCULO PEGADO. Cada cuota es un renglón cargado en Compras (rubro "Deuda
    // previsional (planes de pago)"), agrupado por plan y por mes desde su espejo en Supabase. NO se
    // reconstruye con un SUMIFS por el texto del detalle: los planes se distinguen sólo por rótulo
    // ("Dic 25", "Enero 26", "W303094") —lo que este generador prohíbe casar por rótulo— y la fecha
    // de caja de Compras viene mezclada serial/texto, así que una fórmula daría un número DISTINTO al
    // real. La leyenda "réplica … cargado en Compras" DECLARA el origen: el censo la reconoce y no la
    // cuenta como violación, exactamente como con las DDJJ del _F931_RAW.
    G.mensual(p.nombre, (m) => (p.porMes[m] ? p.porMes[m] : VACIO),
      `Réplica del plan cargado en Compras · ${p.n} cuota(s) · ${p.pagadas} pagada(s) · saldo ${Math.round(p.saldo).toLocaleString('es-AR')} · próxima ${ar(p.proxima) || '—'}`)
  }
  const q1 = G.n()
  const fCuotasTot = G.mensual(rotuloTotal('Total de cuotas del año'), (m) => `=SUM(${cm(m)}${q0}:${cm(m)}${q1})`, 'Suma de los planes de arriba.')
  const fCtrl = G.push([rotuloTotal('Control contra Compras'), `=SUMIF(Compras!$${C.rubro}$4:$${C.rubro};"${RUBRO_PLANES}";${rango(C.total)})`,
    ...Array(11).fill(VACIO), VACIO, 'El total del rubro en Compras, calculado por otro camino.'])
  // EL CONTROL COMPARA LO MISMO CONTRA LO MISMO. La primera versión restaba "cuotas del año" MÁS
  // "saldo pendiente", y una cuota pendiente de agosto está en los dos: se contaba dos veces y la
  // diferencia daba −$473.767 sin que nada estuviera mal. La identidad correcta es simple: el total
  // del rubro en Compras tiene que ser la suma de TODAS las cuotas cargadas de todos los planes.
  // ═══ UN CONTROL NO SE RESTA CONTRA UNA CONSTANTE (06/08) ═══
  //
  // Acá decía `=$B77-16536820`: el segundo término era el total de las cuotas calculado en JavaScript
  // el día de la corrida, estampado en la fórmula. Un control así SIEMPRE da cero el día que se
  // escribe —los dos lados salen de la misma lectura— y deja de medir apenas alguien agrega una cuota
  // en Compras: la constante se queda quieta y el "tiene que ser $0" empieza a mentir en la dirección
  // exacta del error que vino a cazar. Ahora son las DOS celdas vivas: el total del rubro en Compras
  // contra el total de la tabla de planes. Y si un plan tiene cuotas de 2027, esta resta las denuncia
  // en vez de taparlas, porque la tabla sólo llega a diciembre.
  // ═══ UN CONTROL QUE DA $0 TIENE QUE DECIR $0 (06/08) ═══
  //
  // El formato de moneda de la pestaña dibuja el cero como "—" (`"$"#,##0;[Red]-"$"#,##0;"—"`), que
  // para una fila de importes es correcto: un mes sin movimiento no debe gritar "$0". Pero acá el cero
  // ES la respuesta, y salía como el mismo guion que significa "no hay dato". El único control de
  // integridad de la pestaña se leía como una celda vacía. La fila se declara `control` y la piel le
  // pone su propio formato: verde "✓ $0" cuando cierra, el número en rojo cuando no.
  const fControl = G.push([rotuloTotal('Diferencia — tiene que ser $0'), `=$B$${fCtrl}-$N$${fCuotasTot}`,
    ...Array(11).fill(VACIO), VACIO, `Las dos celdas vivas: el total del rubro en Compras menos el total de esta tabla (${ps.reduce((s, p) => s + p.n, 0)} cuota(s) de ${ps.length} plan(es)). Si no da cero, hay cuotas del rubro que esta tabla no ve — por ejemplo, de otro año.`])
  const pie = G.push([`${ALERTA} Falta el plan original de ARCA: en Compras están las cuotas cargadas, no de cuántas es cada plan, así que el saldo es lo previsto en la planilla.`])
  return { fCuotasTot, fControl, pies: [pie] }
}
