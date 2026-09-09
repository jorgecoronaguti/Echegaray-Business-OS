// LOS CUATRO CUADROS DE "CARGAS SOCIALES" — cada uno con su dueño, todos sobre la misma grilla.
//
// ═══ ERAN SIETE Y EL DUEÑO LOS BAJÓ A CUATRO (09/09/2026) ═══
//
// La pestaña contestaba la misma pregunta —el costo de la nómina— de siete maneras, y tres de esos
// cuadros no decidían nada:
//
//   · «Al día con el F931» (3) NO era un control: era un HALLAZGO. Daba −$14.538.743 en rojo todos
//     los meses y siempre por lo mismo —febrero −$2.587.890 y julio −$11.950.854, los dos períodos
//     (enero-26 y junio-26) que están FINANCIADOS en planes de pago y cuyas cuotas viven en el
//     cuadro 4—. Un rojo estructural que no puede volverse verde deja de mirarse, y arrastra con él
//     a los controles que sí pueden dar rojo.
//   · «Cuándo sale de la caja» (5) era la continuación de la proyección: sus filas se fusionaron
//     con ella. La única que se fue es «diferencia contra lo proyectado acá», que comparaba «lo
//     previsto en Compras» —que sólo trae las cuotas de planes— contra el devengado total: la resta
//     no podía dar cero por construcción.
//   · «SAC y vacaciones» (6) es DEVENGADO en un archivo PERCIBIDO, y el Libro no lee una sola de sus
//     filas (ver `rangosDeCargas`). Lo que ahí se calculaba sigue vivo en
//     `lib/vacaciones-construccion.mjs` y en `lib/desvinculacion-22250.mjs`, sin consumidor por
//     ahora — y eso hay que decirlo, porque con el cuadro se fue el único lugar donde el Fondo de
//     Cese devengado (DDJJ de UOCRA) estaba al lado de lo efectivamente pagado.
//
// Cada bloque escribe sus filas y DEVUELVE en qué fila quedó cada total: el que viene abajo lo
// referencia en vez de recalcularlo por otro camino.

import { seccion, total as rotuloTotal } from './patron-pestana.mjs'
import { rango } from './compras-columnas.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { celdaF931, celdaCabecera, PESTAÑA as RAW } from '../scripts/f931-sheet.mjs'
import {
  CONCEPTOS_CADENA, RANGO_DIA_PAGO_F931, RANGO_PROPORCION_PRIMER_ANIO,
  proyeccionDeConcepto, jornalesDelMes,
} from './cargas-cadena.mjs'
import { ROTULOS_CARGAS, RUBRO_PLANES, RUBRO_CARGAS, RUBRO_GREMIALES } from './libro-extractores-cargas.mjs'
import { MES, cm, REALES, MESES_REALES, SIN_DDJJ } from './cargas-grilla.mjs'
import { notaSupuesto } from './proyeccion-convenio.mjs'
import { ALERTA } from './glifos.mjs'
// `vacaciones-construccion.mjs` y `jornada-uocra.mjs` ya NO se importan acá: eran de la sección 6,
// que se retiró. Los dos módulos siguen existiendo con sus tests y hoy no tienen consumidor — la
// provisión de vacaciones y el Fondo de Cese devengado son DEVENGADO, y esta pestaña es percibida.
// Quien los reponga tiene que hacerlo donde vive el devengado, no acá.

const ar = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '')

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · DECLARADO EN EL F931
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloqueDeclarado(G, { anio, periodos, conceptos }) {
  G.push([seccion(1, 'Declarado en el F931')])
  G.cabecera()
  const per = (m) => `${anio}-${String(m).padStart(2, '0')}`
  const d0 = G.n() + 1
  const filaDecl = {}
  for (const c of conceptos) {
    filaDecl[c.codigo] = G.mensual(c.rotulo, (m) => (periodos.includes(per(m)) ? celdaF931(per(m), c.codigo) : VACIO),
      `Código ${c.codigo} de la DDJJ · ${RAW}`)
  }
  const d1 = G.n()
  // UN MES SIN DDJJ NO ES UN CERO (07/09): el SUM sobre vacías daba 0 y se leía «declaró cero».
  //
  // ═══ Y TAMPOCO ES UNA PALABRA ADENTRO DEL IMPORTE (09/09/2026) ═══
  //
  // El generador parchea después estas celdas con la proyección de la cadena (ver `grilla()`), y
  // hasta hoy las escribía como TEXTO: «≈ $8.717.159 proy.». Un importe que es una frase no se
  // ordena, no se suma y no se compara con el de al lado. La distinción entre lo declarado y lo
  // proyectado la hace ahora el FORMATO —gris e itálica, ver `proyectadas` en cargas-piel—, que es
  // como la hace cualquier modelo financiero serio. `SIN_DDJJ` queda como fallback del bloque: si el
  // generador no llegara a parchear, el renglón dice la ausencia en vez de quedarse mudo.
  //
  // EL TOTAL DEL AÑO SE VA, Y ES A PROPÓSITO. Con cuatro meses proyectados adentro de la fila, un
  // `SUM(B:M)` daría $100.057.714 — declarado más proyectado en una sola cifra, que es exactamente
  // el titular «Costo laboral del año — devengado» que el dueño mandó sacar por mezclar dos ventanas
  // de tiempo. No se reemplaza por un SUM parcial: un total que no es la suma de lo que se ve al lado
  // es un control que miente.
  const fDeclTot = G.mensual(rotuloTotal('Total declarado'),
    (m) => (periodos.includes(per(m)) ? `=SUM(${cm(m)}${d0}:${cm(m)}${d1})` : SIN_DDJJ),
    'Suma de los conceptos. Los meses sin DDJJ los completa la proyección, en gris.',
    { totaliza: false })
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
  G.push([seccion(2, 'Pagado')])
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
    // EL RÓTULO DEJÓ DE EXPLICAR (09/09): decía «ART · ya incluida en el F931, no se paga aparte».
    // Que no se pague aparte lo dice su POSICIÓN —debajo del total y fuera del rango que ese total
    // suma—; el renglón sólo tiene que nombrar lo que muestra.
    // Y EL «·» TAMBIÉN SE FUE (09/09): decía `· ART (dentro del F931)`. El paréntesis volvía a
    // explicar lo mismo que el rótulo viejo, y el sub-ítem sugería que la fila cuelga de la de
    // arriba cuando lo que dice es dónde NO está sumada. Eso lo dice su posición: debajo del total y
    // fuera del rango que ese total suma. Es una fila normal y se llama ART.
    fArtPag = G.mensual('ART',
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
// 3 · PROYECCIÓN Y SALIDA DE CAJA
//
// Era la sección 4 y la 5, y eran la misma: una medía lo que la nómina va a generar y la otra CUÁNDO
// esa misma plata sale. Partirlas obligaba a leer dos cuadros con el mismo encabezado de meses para
// seguir un solo número, y el segundo repetía el primero corrido un mes.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloqueProyeccion(G, {
  // SIN `C`: la proyección dejó de leer Compras el 09/09 — la única fila que lo hacía era «Previsto
  // en Compras para ese mes», que repetía las cuotas del cuadro 4. Un parámetro que ya nadie usa se
  // saca: dejarlo invita a que la próxima fila que necesite Compras nazca acá en vez de en su cuadro.
  anio, desdeProy, filaDecl, filaPag, fRem, fEmp, fDeclTot,
  // CON QUÉ BASE QUEDÓ VALUADA LA MASA QUE ESTA PESTAÑA MULTIPLICA. No se decide acá —se lee de lo que
  // Jornales publicó, ver `baseDeJornales`— porque la decisión ya vive en un solo lugar. Sin señal, la
  // glosa lo dice en vez de afirmar un supuesto que puede no estar adentro del número.
  baseJornales = null,
}) {
  G.push([seccion(3, `Proyección ${MES[desdeProy]}–dic y salida de caja`)])
  G.cabecera()
  const proyMeses = Array.from({ length: 12 - desdeProy + 1 }, (_, i) => desdeProy + i)
  const fRelacion = G.mensual('Remuneración declarada ÷ jornales netos', (m) => (m === desdeProy
    ? `=IFERROR(SUM(${REALES(fRem, desdeProy)})/(${MESES_REALES(desdeProy).map((x) => jornalesDelMes(`DATE(${anio};${x};1)`)).join('+')});"")` : VACIO),
  `Medido sobre los ${desdeProy - 1} meses que tienen las dos cifras. Lo declarado en F931 no es el neto pagado en mano: esta relación traduce una en otra.`, { meses: proyMeses, totaliza: false })
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
  const fDot = G.mensual('Dotación proyectada', () => `=IFERROR(INDEX(${REALES(fEmp, desdeProy)};COUNT(${REALES(fEmp, desdeProy)}));"")`,
    'El ÚLTIMO mes con DDJJ, no el promedio: un promedio no fue cierto ningún mes y acá multiplica costos por persona.', { meses: proyMeses, totaliza: false })
  // ═══ LAS DOS FILAS DE «·» QUE ESTABAN ACÁ SE FUERON (09/09/2026) ═══
  //
  // Eran `   · control: plantel de la última quincena  15  ▲` y `   · en su primer año de antigüedad
  // 66,7%`. El dueño: *«minimalismo extremo, sin aclaraciones ni explicaciones de nada»*, y las dos
  // eran justo eso — un porcentaje y un conteo de personas sueltos en el medio de doce columnas de
  // pesos, con un veredicto en glifo al lado. Ninguna de las dos es un importe del cuadro:
  //
  //   · la ANTIGÜEDAD es una ENTRADA de la fórmula de FCL y se mudó a «Parámetros» con su rango con
  //     nombre (`CARGAS_PROPORCION_PRIMER_ANIO`, ver `parametrosDeCargas`), que es donde viven las
  //     entradas desde que Jornales hizo lo mismo con la jornada;
  //   · el CONTROL de plantel no se apagó: pasó a `divergenciaDePlantel`, se prueba con un test que
  //     puede darlo rojo, y su veredicto sale por el log de la corrida — donde lo ve quien puede
  //     corregir el dato, y no como un triangulito que nadie mira.
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
        // El rango real llega YA atado al mes desde el que se proyecta: la cadena mide sus cinco
        // alícuotas sobre él y no tiene por qué saber cuántos meses hay declarados.
        filaOrigen: origen, fRem, fEmp, reales: (fila) => REALES(fila, desdeProy), colMes: cm, fRemProy, fDot,
        celdaProporcion: RANGO_PROPORCION_PRIMER_ANIO,
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
    'Lo que la nómina de ESE mes genera de cargas. Todavía no es lo que sale de la caja: eso son las tres filas de abajo.', { meses: proyMeses })
  // ═══ LA FECHA EN QUE ESA PLATA SALE — LA FILA QUE FALTABA (06/08) ═══
  //
  // La pestaña decía "el F931 vence al mes siguiente" y nunca decía QUÉ DÍA. Sin esa fila, el Libro
  // Canónico no podía leer la cadena: un movimiento sin fecha no entra en ningún tramo del calendario.
  // El día vive en Parámetros (medido sobre los pagos reales, declarado "a verificar"), no adentro de
  // esta fórmula, y DICIEMBRE SE RESUELVE SOLO: DATE(2026;13;10) es el 10/01/2027, que es exactamente
  // la plata que hasta hoy no levantaba nadie. DESDE EL 08/09 CUBRE LOS DOCE MESES: el Libro lee también
  // el «Total declarado» (CARGAS_MES_F931_DECLARADO) y un F931 declarado sin fecha no entra al calendario.
  //
  // Y DICIEMBRE SE ESCRIBE CON SU AÑO, NO COMO "MES 13": la celda que uno abre para entender de dónde
  // sale la plata tiene que decir 2027 — la misma regla del retiro de diciembre en Jornales (defecto B7).
  const fFechaSalida = G.mensual(ROTULOS_CARGAS.fechas,
    (m) => `=DATE(${m === 12 ? anio + 1 : anio};${m === 12 ? 1 : m + 1};MAX(1;N(${RANGO_DIA_PAGO_F931})))`,
    `El devengado de ESTE mes sale al siguiente, el día que dice ${RANGO_DIA_PAGO_F931} en Parámetros. El de diciembre cae en enero del año que viene: por eso la última celda dice ${anio + 1}.`,
    { totaliza: false })
  // ── LO QUE ERA LA SECCIÓN 5: la misma plata, ubicada en el mes en que sale ────────────────────
  G.mensual('Cargas que salen en el mes', (m) => (m === desdeProy
    ? `=${cm(desdeProy - 1)}${fDeclTot}` : `=${cm(m - 1)}${fProyTot}`),
  'El devengado del mes ANTERIOR. La proyección vieja ponía la carga de julio en julio: en un cuadro de caja eso corre unos $9M de mes.', { meses: proyMeses })
  // ═══ LAS DOS FILAS DE CUOTAS SE FUERON DE ACÁ — EL CUADRO 4 ES SU ÚNICO DUEÑO (09/09/2026) ═══
  //
  // El dueño: *«siguen duplicando cosas Cargas Sociales e Impuestos y Financieros»*. Eran
  // «Cuotas de planes de pago que vencen» y «Previsto en Compras para ese mes», y en el archivo vivo
  // publicaban EL MISMO VECTOR que el cuadro 4 — sep $2.494.876 · oct $2.494.876 · nov $0 · dic $0—:
  //
  //   · la primera era literalmente `=J58`, la fila «⇒ Total de cuotas del año» del cuadro 4 copiada
  //     dentro del cuadro 3. Referenciar no evita duplicar: evita que los dos números se separen.
  //     El mismo importe escrito dos veces en la misma pestaña sigue leyéndose como dos obligaciones
  //     —el ojo suma para abajo—, y una cuota contada dos veces son $2,5M de caja que no existen.
  //   · la segunda traía de Compras los pagos futuros del F931, que hoy son EXACTAMENTE esas cuotas:
  //     un tercer renglón con el mismo número, ahora por un tercer camino. Era el resto del cuadro de
  //     contraste cuya fila de «diferencia» ya se había retirado por no poder dar cero; sin esa resta
  //     el renglón no decidía nada y sólo repetía.
  //
  // Lo que NO se cambió: «Cargas que salen en el mes» no sumaba las cuotas antes y sigue sin
  // sumarlas. Es el devengado de la nómina del mes anterior; las cuotas de planes son deuda de
  // períodos viejos y salen por su propio cuadro. Sumarlas acá habría sido inventar una fila nueva
  // en la corrección de una duplicación.
  // EL HALLAZGO SALE POR LA CORRIDA, NO POR UN RENGLÓN (09/09/2026). Era una fila con «▲ N
  // concepto(s) sin base para proyectar» al pie del cuadro: un glifo y una frase en el medio de la
  // grilla, que es lo que el dueño mandó sacar. Que falte una fila de la proyección tiene que verse
  // igual —el subtotal la suma— así que viaja en `sinBase` hasta `avisos` y se imprime en el log,
  // donde lo lee quien puede agregar el concepto que falta.
  G.push()
  return { proyMeses, fRelacion, fRemProy, fDot, fSubF931, fSubGremiales, fProyTot, fFechaSalida, sinBase }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · PLANES DE PAGO DE DEUDA PREVISIONAL
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export function bloquePlanes(G, { ps, C }) {
  G.push([seccion(4, 'Planes de pago de deuda previsional')])
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
  const fCuotasTot = G.mensual(ROTULOS_CARGAS.planes, (m) => `=SUM(${cm(m)}${q0}:${cm(m)}${q1})`,
    'Suma de los planes de arriba. Es lo que «Impuestos y Financieros» lee por CARGAS_MES_PLANES: el cuadro vive acá, una sola vez.')
  // ═══ LO QUE FALTA PAGAR BAJÓ DEL TITULAR A SU CUADRO (09/09/2026) ═══
  //
  // Era una línea del hero, al lado de REAL · COMPROMETIDO · PROYECTADO, con una aclaración escrita
  // en la celda de al lado («financia parte de lo comprometido; incluye deuda de 2025»). El titular
  // pasó a contestar dos preguntas y sólo dos; este número es el saldo de ESTE cuadro y vive acá.
  //
  // El criterio es de HECHO y no de posición: lo que falta pagar es lo que la planilla no marcó
  // «Pagado», venza cuando venza. Con `> MONTH(TODAY())` el mes en curso se perdía entero — al 06/08
  // dejaba afuera $2.968.643 de cuotas de agosto, una con vencimiento el 16.
  const fSinPagar = G.push([ROTULOS_CARGAS.planesSinPagar,
    `=SUMIFS(${rango(C.total)};Compras!$${C.rubro}$4:$${C.rubro};"${RUBRO_PLANES}";${rango(C.estado)};"<>Pagado")`,
    ...Array(11).fill(VACIO), VACIO,
    `Compras · rubro "${RUBRO_PLANES}", todas las cuotas que la planilla NO marcó "Pagado" — incluidas las vencidas sin pagar y las de otros años, que esta tabla no llega a mostrar.`])
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
  // ═══ EL RÓTULO DEJÓ DE INSTRUIR Y EL VEREDICTO DEJÓ DE SER UN GLIFO (09/09/2026) ═══
  //
  // Decía «⇒ Diferencia — tiene que ser $0» y la piel dibujaba el cero como «✓ $0». Las dos cosas
  // son la misma: explicarle al lector qué significa el número en vez de dejar que el número hable.
  // Ahora la fila se llama «Diferencia» y el cero se dibuja «$0» en tinta normal; cuando NO cierra,
  // el importe sale en rojo. Rojo o no rojo es la respuesta, y no gasta una palabra.
  const fControl = G.push([rotuloTotal('Diferencia'), `=$B$${fCtrl}-$N$${fCuotasTot}`,
    ...Array(11).fill(VACIO), VACIO, `Las dos celdas vivas: el total del rubro en Compras menos el total de esta tabla (${ps.reduce((s, p) => s + p.n, 0)} cuota(s) de ${ps.length} plan(es)). Si no da cero, hay cuotas del rubro que esta tabla no ve — por ejemplo, de otro año.`])
  // HALLAZGO: en Compras están las cuotas cargadas, no de cuántas es cada plan, así que el saldo es
  // lo previsto en la planilla. Se resuelve consiguiendo el plan; no se anota al pie del cuadro.
  const aviso = `${ALERTA} Falta el plan original de ARCA: el saldo de los planes es lo previsto en la planilla`
  // LAS FILAS DE CUOTAS SE DECLARAN COMO MONEDA. Son la ÚNICA réplica de la pestaña —números
  // escritos, no fórmulas— y en el archivo vivo se leían crudas: «473767,08» en seis meses y
  // «2842602,48» en el total del plan de enero. El barrido de moneda de la piel las cubre, y aun así
  // no llegaron: la declaración explícita va DESPUÉS del barrido y el último request gana. Por qué el
  // barrido no alcanzó no se pudo medir sin escribir la pestaña, así que esto se declara como lo que
  // es —un cinturón además de los tirantes— y no como el diagnóstico.
  return { fCuotasTot, fControl, fSinPagar, moneda: [[q0, q1]], pies: [], avisos: [aviso] }
}
