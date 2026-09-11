// EL BLOQUE «PAGADO» DE «CARGAS SOCIALES» — ¿cuánto salió efectivamente de la caja?
//
// ═══ POR QUÉ VIVE EN SU PROPIO ARCHIVO (11/09/2026) ═══
//
// Salió de `cargas-bloques.mjs` el día que ese archivo pasó las 500 líneas, que es el techo del repo y
// la razón por la que el generador se partió en bloques en primer lugar. Pero la mudanza no es sólo de
// tamaño: este bloque dejó de leer la pestaña Compras y pasó a leer el Libro Canónico, así que ya no
// comparte fuente con sus vecinos —el declarado sale de las DDJJ, la proyección de la cadena— y tiene
// una sola dependencia nueva que conviene ver aislada: `libro-sumas.mjs`.
//
// ═══ QUÉ CAMBIÓ DE FONDO, Y NO ES LA DIRECCIÓN DE UN RANGO ═══
//
// «Pagado» era lo que una persona marcó en la columna Estado de Compras. Ahora es lo que el banco
// muestra: el F931 apareado al centavo contra la DDJJ declarada, el pago gremial apareado contra la
// boleta de su organismo, la cuota de plan contra su importe observado. El dueño ordenó vaciar de
// Compras todo lo que no sea Civil/Estructura/Mantenimiento y esta sección se habría ido a CERO sin dar
// un solo error; de paso, el testigo mejoró.
//
// Todo lo de acá es PURO: devuelve texto de fórmulas en locale es-AR. No lee el Sheet, no escribe.

import { seccion, total as rotuloTotal } from './patron-pestana.mjs'
import { formulaLibro, terminoLibro } from './libro-sumas.mjs'
import { RUBRO_PLANES, RUBRO_CARGAS, RUBRO_GREMIALES } from './libro-extractores-cargas.mjs'
import { cm } from './cargas-grilla.mjs'

/**
 * CADA FILA DEL DESGLOSE GREMIAL Y LOS NOMBRES CON LOS QUE EL LIBRO LLAMA A ESE ACREEDOR.
 *
 * Se exporta porque `scripts/libro-simular-sin-compras.mjs` calcula con ESTA lista lo que cada celda va
 * a mostrar antes y después del vaciado. Copiada allá, el control mediría otra cosa que la celda.
 *
 * Dos nombres donde el organismo se llama distinto según quién probó el pago: «Fondo de Cese» cuando lo
 * prueba el banco (así lo rotula `cargas-pagos-banco.mjs`), «FCL» cuando la fila viene de Compras.
 */
export const ORGANISMOS_GREMIALES = Object.freeze([
  Object.freeze(['FCL', Object.freeze(['Fondo de Cese', 'FCL'])]),
  Object.freeze(['UOCRA', Object.freeze(['UOCRA'])]),
  Object.freeze(['IERIC', Object.freeze(['IERIC'])]),
  Object.freeze(['FODECO', Object.freeze(['FODECO'])]),
])

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · PAGADO — ¿cuánto salió efectivamente de la caja?
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// `C` (las columnas de Compras) YA NO ES UN PARÁMETRO: este bloque dejó de leer esa pestaña el
// 11/09/2026. Los llamadores pueden seguir pasándolo —no molesta— pero que no figure acá es la señal de
// que nadie lo usa: un parámetro que nadie lee es la primera mentira de una firma.
export function bloquePagado(G, { anio, fArtDecl = 0, fDeclTot = 0 }) {
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
  // ═══ LA FUENTE DE «PAGADO» PASÓ DE COMPRAS AL LIBRO (11/09/2026, orden del dueño) ═══
  //
  // Todo este bloque era `SUMIFS` sobre Compras: «Cliente/Asignación» + rubro + estado «Pagado». El
  // dueño ordenó vaciar de Compras todo lo que no sea Civil/Estructura/Mantenimiento, y la sección que
  // contesta «¿cuánto salió efectivamente de la caja?» se habría ido a CERO sin dar un solo error.
  //
  // Ahora cada fila lee `_MOVIMIENTOS` con estado REAL. No es sólo un cambio de dirección: es un cambio
  // de TESTIGO. «Pagado» dejó de ser lo que alguien marcó en una columna y pasó a ser lo que el banco
  // muestra — el F931 apareado al centavo contra la DDJJ declarada, el pago gremial apareado contra su
  // boleta, la cuota de plan contra su importe observado. Mientras una fila siga viva en Compras el
  // libro la toma de ahí (dedupe transicional de `libro-extractores-banco-obligaciones.mjs`), así que
  // estas celdas dan el MISMO número antes y después del vaciado.
  //
  // Y SE GANA LO QUE EL COMENTARIO DE ARRIBA PEDÍA: el tope de «hasta hoy» y la exclusión de lo no
  // pagado ya no hay que escribirlos con dos condiciones cada uno. Un movimiento REAL es, por
  // definición del libro, plata que ya salió y que tiene respaldo. El tope de TODAY() se conserva igual
  // para que el mes en curso no muestre un REAL con fecha futura si alguna fuente lo produjera.
  const ventana = (m) => ({
    desde: `DATE(${anio};${m};1)`,
    hasta: `MIN(EOMONTH(DATE(${anio};${m};1);0)+1;TODAY()+1)`,
  })
  const pagado = (rubros, contrapartes) => (m) => formulaLibro({
    ...ventana(m), rubros, contrapartes, estados: ['REAL'], signo: -1, medida: 'magnitud',
  })
  const p0 = G.n() + 1
  const filaPag = {}
  filaPag.F931 = G.mensual('F931', pagado([RUBRO_CARGAS]),
    `Libro \`_MOVIMIENTOS\`, rubro "${RUBRO_CARGAS}" con estado REAL, por mes. El pago lo prueba el débito de ARCA apareado contra la DDJJ declarada; mientras la fila siga en Compras, el libro la toma de ahí.`)
  filaPag.plan = G.mensual('Deuda previsional en cuotas', pagado([RUBRO_PLANES]),
    `Libro \`_MOVIMIENTOS\`, rubro "${RUBRO_PLANES}" con estado REAL. El rubro ya la separa del F931 corriente: no hace falta el criterio por cliente + detalle que usaba Compras.`)
  // ═══ EL DESGLOSE POR ORGANISMO SOBREVIVE PORQUE EL LIBRO SABE QUIÉN COBRÓ ═══
  //
  // `cargas-pagos-banco.mjs` aparea cada débito contra la boleta de SU organismo y el libro guarda ese
  // nombre en la contraparte. Se pasan DOS nombres donde el organismo se llama distinto según quién
  // probó el pago: «Fondo de Cese» cuando lo prueba el banco, «FCL» cuando la fila viene de Compras.
  // Un nombre que falte NO da error —devuelve de menos— y por eso abajo va la fila de control.
  for (const [r, contrapartes] of ORGANISMOS_GREMIALES) {
    filaPag[r] = G.mensual(r, pagado([RUBRO_GREMIALES], contrapartes),
      `Libro \`_MOVIMIENTOS\`, rubro "${RUBRO_GREMIALES}" con estado REAL y contraparte ${contrapartes.map((x) => `"${x}"`).join(' o ')}.`)
  }
  const p1 = G.n()
  const fPagTot = G.mensual(rotuloTotal('Total pagado'), (m) => `=SUM(${cm(m)}${p0}:${cm(m)}${p1})`, 'Suma de los conceptos de arriba.')
  // ═══ EL CONTROL QUE EL DESGLOSE NECESITA (11/09/2026) ═══
  //
  // Las cuatro filas de gremiales se reparten el rubro por CONTRAPARTE, y una contraparte que el libro
  // escriba con un nombre que no está en la lista no produce un error: produce una fila de menos. Este
  // renglón resta el rubro ENTERO contra la suma de las cuatro, así que un organismo sin clasificar
  // aparece acá con su plata en vez de desaparecer en silencio. Tiene que dar cero.
  G.mensual(rotuloTotal('Control · gremiales sin clasificar'), (m) => {
    const todo = terminoLibro({ ...ventana(m), rubros: [RUBRO_GREMIALES], estados: ['REAL'], signo: -1, medida: 'magnitud' })
    const cuatro = ORGANISMOS_GREMIALES.map(([r]) => `${cm(m)}${filaPag[r]}`).join('+')
    return `=${todo}-(${cuatro})`
  }, `Tiene que dar $0. Es el rubro "${RUBRO_GREMIALES}" REAL del libro menos las cuatro filas de arriba: si da algo, el libro está nombrando a un acreedor con un nombre que el desglose no conoce.`)
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
