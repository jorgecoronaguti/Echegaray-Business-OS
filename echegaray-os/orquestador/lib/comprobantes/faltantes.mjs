// ¿QUÉ LE FALTA A ESTE COMPROBANTE PARA PODER CARGARSE? — UNA definición, dos POLÍTICAS.
//
// ═══ EL DEFECTO QUE ARREGLA (03/08) ═══
//
// La misma pregunta se contestaba en dos lugares distintos y con dos criterios distintos:
//   · `validar()` en `lib/carga-comprobantes.mjs` (el cargador de Claude Code) exigía fecha,
//     proveedor e importe, y escribía la fila igual con Obra/Unidad/Detalle vacías;
//   · `preguntasDe()` en `lib/comprobantes/fajo.mjs` (el bot de Mattermost) exigía además obra y
//     número, y no dejaba cargar sin obra.
//
// El resultado no era "dos políticas": era que el bot revisaba el proveedor y el tipo con reglas que
// el cargador no tenía, el cargador revisaba el importe con una regla que el bot no tenía, y ninguna
// de las dos caras sabía lo que revisaba la otra. Un comprobante sin proveedor legible pasaba las
// cinco preguntas del bot y recién moría dentro del cargador, con un mensaje que el dueño no veía.
//
// ═══ LA OBRA: POR QUÉ DIFERÍA Y QUÉ DECIDIÓ EL DUEÑO (03/08/2026) ═══
//
// La diferencia existía por una razón real: una fila sin obra entra al Flujo de Caja con el rubro sin
// clasificar —"compras sin obra asignada" es un problema que el dueño mismo listó—, así que el bot la
// exigía y bloqueaba; el cargador por línea de comandos, en cambio, escribía la fila igual y dejaba
// que él completara la imputación después en el Sheet, que es como viene trabajando.
//
// **DECIDIDO (03/08/2026): el bot carga igual con la obra vacía, alineado con el cargador.** Bloquear
// costaba más que el dato que protegía: el comprobante quedaba sin cargar en ningún lado —ni en el
// Sheet, ni con obra— y el jefe abandonaba el flujo. Una fila cargada sin obra es un dato incompleto
// que se completa en un minuto; una foto que nunca llegó a Compras es un gasto perdido.
//
// LO QUE NO CAMBIA: **la obra se sigue OFRECIENDO.** El desplegable con las obras del historial
// (`PREGUNTA_OBRA` → `bloqueObra`/`ofertasDe` en `mensaje.mjs`, botones en `fajo.mjs`) aparece igual,
// con su conteo y su sugerida. Lo único que cambió es que no BLOQUEA: si el jefe no elige, se carga
// con la obra vacía y el mensaje lo dice con todas las letras. Ofrecer y exigir son dos cosas
// distintas, y esta política decide sólo la segunda.
//
// Lo que NO puede diferir es la LÓGICA. Por eso la diferencia vive en un objeto de política
// (`POLITICA.CARGADOR` vs `POLITICA.CHAT`) y no en dos funciones: cuando el dueño decidió, se cambió
// una bandera y las dos caras quedaron iguales sin tocar una línea de código de decisión.
//
// NÚCLEO PURO: no lee el Sheet, no consulta la base, no llama a ningún modelo.

import { aFechaAR, aNumero, normalizar, tipoComprobante } from '../carga-comprobantes.mjs'
import { identidadDelComprobante, fueraDeEscala, pesos, FACTOR_FUERA_DE_ESCALA } from './aritmetica.mjs'
import { dudasDeLectura } from './plausibilidad.mjs'

/** Por qué un comprobante no está listo. El código es el contrato; los textos son presentación. */
export const MOTIVO = Object.freeze({
  PROVEEDOR_NUEVO: 'proveedor_nuevo',
  DUPLICADO: 'duplicado',
  OBRA: 'obra',
  PROVEEDOR: 'proveedor',
  IMPORTE: 'importe',
  TOTAL: 'total',
  FECHA: 'fecha',
  TIPO: 'tipo',
  NUMERO: 'numero',
  ARITMETICA: 'aritmetica',
  ESCALA: 'escala',
  // Los dos del 04/08: un dato que se LEYÓ pero no puede ser cierto. Son distintos de FECHA (que es
  // el hueco) a propósito — el mensaje tiene que poder decir "leí esto y no puede ser", que es una
  // información que el dueño necesita para entender por qué le estoy preguntando algo que el papel sí
  // tiene impreso.
  FECHA_IMPOSIBLE: 'fecha_imposible',
  IVA_IMPOSIBLE: 'iva_imposible',
  // El 21/08: dos presupuestos de CON-SEC encaminados a carga como si fueran facturas.
  NO_ES_FACTURA: 'no_es_factura',
})

/**
 * Cómo se nombra cada faltante en una frase corta. Es lo que permite que el titular diga
 * "sólo me falta la fecha" en vez de "me falta un dato": una pregunta precisa se contesta en un
 * segundo y una genérica obliga a leer todo el mensaje para adivinar qué se está pidiendo.
 */
export const ROTULO = Object.freeze({
  [MOTIVO.PROVEEDOR_NUEVO]: 'saber quién es el proveedor',
  [MOTIVO.DUPLICADO]: 'saber si ya está cargado',
  [MOTIVO.OBRA]: 'la obra',
  [MOTIVO.PROVEEDOR]: 'el proveedor',
  [MOTIVO.IMPORTE]: 'el importe',
  [MOTIVO.TOTAL]: 'el total',
  [MOTIVO.FECHA]: 'la fecha',
  [MOTIVO.FECHA_IMPOSIBLE]: 'la fecha',
  [MOTIVO.IVA_IMPOSIBLE]: 'el IVA',
  [MOTIVO.TIPO]: 'el tipo de comprobante',
  [MOTIVO.NUMERO]: 'el número',
  [MOTIVO.ARITMETICA]: 'que los importes cierren',
  [MOTIVO.ESCALA]: 'confirmar el total',
  [MOTIVO.NO_ES_FACTURA]: 'confirmar que sea una factura',
})

/**
 * La pregunta de la obra, como constante y no como literal repetido: `mensaje.mjs` la reemplaza por
 * el bloque con las opciones del historial y necesita reconocerla sin acoplarse a una redacción.
 *
 * Desde el 03/08/2026 la obra ya NO es un faltante (ninguna política la exige), así que esta pregunta
 * no sale de `faltantesDe`. La constante sigue viva porque el bloque que la ofrece —con las opciones
 * del historial y los botones— sigue existiendo: `mensaje.mjs` la usa para armarlo.
 */
export const PREGUNTA_OBRA = 'no dice a qué obra va — ¿cuál es?'

/**
 * Las dos políticas vigentes. Lo que cambia es QUÉ se exige, nunca CÓMO se evalúa.
 *
 * Las tres diferencias que quedan responden al CANAL, no a una decisión de negocio pendiente: el chat
 * puede preguntar y esperar, la línea de comandos no tiene a quién preguntarle en el medio de una
 * corrida. `exigirObra` era la única de negocio y ya está decidida: no se exige en ninguna de las dos.
 */
/**
 * ¿UNA FILA SIN PROVEEDOR ENTRA IGUAL? — la decisión del 14/08, y dónde está la línea.
 *
 * ═══ EL PEDIDO DEL DUEÑO, TEXTUAL ═══
 *
 * «me tiene q poder cargar todas las filas porque no puedo estar revisando cada comprobante». Y:
 * «no se q comprobante quedo afuera porque no estoy revisando todo el tiempo, son muchos». Una fila
 * que falta le cuesta MÁS que una fila incompleta: la incompleta se ve en Compras y se completa en
 * diez segundos; la que falta no la ve nadie y el gasto no existe para el Flujo de Fondos.
 *
 * ═══ DÓNDE ESTÁ LA LÍNEA, Y POR QUÉ AHÍ ═══
 *
 * **Una celda VACÍA se completa; un número EQUIVOCADO se propaga.** Por eso esta puerta se abre sólo
 * para lo que deja una celda en blanco —el proveedor que no está en el desplegable, la obra, el
 * detalle— y NO para nada que escriba un dato dudoso: un total fuera de escala, una aritmética que
 * no cierra, una fecha o un IVA imposibles y un duplicado probable siguen frenando exactamente igual.
 * Ahí no hay una celda para completar después: hay plata mal cargada que se propaga por fórmula a
 * cuatro pestañas y nadie la revisa.
 *
 * ═══ Y POR QUÉ HACE FALTA UNA IDENTIDAD FUERTE ═══
 *
 * Sin proveedor, la clave de idempotencia se degrada a `p:<nombre>` — y sin nombre no hay clave
 * ninguna. Cargar sin clave es cargar sin barrera de duplicados, que es peor que no cargar. Así que
 * la fila entra sin proveedor SÓLO si el CUIT (once dígitos) y el número la identifican solos. Con
 * eso la clave sigue siendo `c:` y fuerte.
 *
 * EL NOMBRE LEÍDO NO SE PIERDE: viaja transcripto al concepto (`aFajoJson`), y el mensaje nombra la
 * FILA y lo que le falta. Cargar y declarar es distinto de cargar en silencio, que es lo que el dueño
 * rechazó el 04/08.
 *
 * Se puede volver atrás sin desplegar: `ORQ_COMPROBANTES_EXIGIR_PROVEEDOR=1`.
 */
export const EXIGIR_PROVEEDOR = String(process.env.ORQ_COMPROBANTES_EXIGIR_PROVEEDOR ?? '') === '1'

/**
 * ¿Este comprobante se identifica solo, sin depender del nombre del proveedor?
 * CUIT completo + número: es exactamente lo que hace que `claveComprobante` devuelva una clave `c:`.
 */
export function identidadFuerte(c = {}) {
  return String(c?.cuit ?? '').replace(/\D/g, '').length === 11 && Boolean(String(c?.numero ?? '').trim())
}

export const POLITICA = Object.freeze({
  // Claude Code: escribe la fila y el dueño completa la imputación en el Sheet.
  CARGADOR: Object.freeze({
    nombre: 'cargador',
    exigirObra: false,
    exigirNumero: false,
    exigirTotal: false,
    exigirProveedorConocido: false,
    // ═══ POR QUÉ LA PLAUSIBILIDAD SÍ ES UNA DIFERENCIA DE CANAL (04/08) ═══
    //
    // El chat muestra lo que leyó UNA MÁQUINA y que nadie miró: ahí una fecha de 2003 es, con
    // certeza, un año mal leído. El fajo que recibe la línea de comandos lo arma una persona (o
    // Claude Code) con el papel delante, y su ventana legítima de fechas incluye comprobantes viejos
    // que se están regularizando — bloquearlos convertiría el control en un muro para el único caso
    // en que la fecha rara es de verdad.
    //
    // LO QUE NO DEPENDE DEL CANAL sigue sin depender: la identidad aritmética opina en las dos, y
    // ahí no hay excepción posible porque un importe que no cierra cuesta lo mismo entre por donde
    // entre. Acá la diferencia no es cuánto cuesta el error: es cuánta confianza merece la fuente.
    verificarPlausibilidad: false,
  }),
  // El bot: tiene botones, así que lo que falta se pregunta antes de escribir nada.
  CHAT: Object.freeze({
    nombre: 'chat',
    // DECIDIDO 03/08/2026 — ver el encabezado. La obra se ofrece con todo el historial adelante, pero
    // no bloquea: sin elección se carga con la obra vacía y el mensaje lo dice.
    exigirObra: false,
    exigirNumero: true,
    // El fajo que viaja al cargador NO lleva el neto (`aFajoJson`): la columna M se deriva de
    // Total − IVA. Sin total, del otro lado no hay con qué escribir la fila.
    exigirTotal: true,
    exigirProveedorConocido: true,
    // Un dato leído que no puede ser cierto se declara ilegible y se pregunta. Ver `plausibilidad.mjs`.
    verificarPlausibilidad: true,
  }),
})

/**
 * Todo lo que le falta a un comprobante, en un solo lugar.
 *
 * El DUPLICADO y el YA CARGADO son parte de la respuesta y no dependen de la política: un gasto
 * contado dos veces en el Flujo de Fondos cuesta lo mismo entre por donde entre.
 *
 * @param {{comprobante?:object, proveedorNuevo?:boolean, posibleDuplicado?:object,
 *          duplicadoResuelto?:string|null, yaCargado?:object}} item
 * @param {object} politica  una de `POLITICA`
 * @param {{ahora?:Date|string}} [o]  el reloj contra el que se juzga la fecha; por defecto el momento
 *   en que se leyó la foto (`item.leidoEn`) y, si no viaja, el de la máquina.
 * @returns {Array<{codigo:string, texto:string, pregunta:string}>}
 */
export function faltantesDe(item = {}, politica = POLITICA.CARGADOR, { ahora } = {}) {
  // ═══ A LO QUE YA ESTÁ EN COMPRAS NO LE FALTA NADA (05/08) ═══
  //
  // El tique de Barcelo 00113-00014288 se mandó TRES veces y ya estaba en la fila 822. El bot lo
  // detectó —`yaCargado` estaba puesto— y AUN ASÍ contestó pidiendo la fecha, el IVA y mandando a
  // tocar «Corregir», porque el mensaje arma sus preguntas con `preguntasDe` → `faltantesDe`, y esta
  // función miraba el comprobante sin preguntarse si hacía falta cargarlo.
  //
  // Es la peor forma de contestar que existe para ese caso: la persona vuelve a mirar el papel, lo
  // corrige, y todo ese trabajo era para una fila que ya estaba escrita. Peor todavía, el mensaje
  // deja la duda de si se cargó o no.
  //
  // «Qué le falta para poder cargarse» es una pregunta que NO TIENE SENTIDO sobre algo que no se va
  // a cargar. `puedeCargarse` ya lo sabía y lo chequeaba por su cuenta —por eso la carga nunca se
  // duplicó—; lo que faltaba era que lo supiera también el que redacta las preguntas. Se contesta
  // acá, una sola vez, para las dos caras.
  //
  // NO SE PIERDE NINGÚN CONTROL: un `yaCargado` es la fila leída en el DESTINO (`marcarEnCompras`),
  // no una anotación propia — el registro que no se puede verificar ya se descarta antes de llegar
  // acá. Y un PROBABLE duplicado sin contestar no entra por este camino: ése sigue preguntándose.
  if (item.yaCargado || item.duplicadoResuelto === 'mismo') return []
  const c = item.comprobante ?? {}
  const p = politica ?? POLITICA.CARGADOR
  const out = []
  const falta = (codigo, texto, pregunta) => out.push({ codigo, texto, pregunta: pregunta ?? texto })

  // ═══ UN PRESUPUESTO NO ES UN GASTO (21/08) ═══
  //
  // Cuando la visión declara que el papel es un presupuesto/remito/nota de pedido, no hay nada que
  // completar después: la fila entera sería un gasto que todavía no existe. Frena en TODAS las
  // políticas —el campo sólo existe cuando un modelo leyó el papel— y la salida es Descartar, o
  // Corregir si la lectura se equivocó de clase de papel.
  if (c.esPresupuestoORemito) {
    falta(MOTIVO.NO_ES_FACTURA, 'es un presupuesto/remito, no una factura',
      'esto parece un **presupuesto o remito**, no una factura: todavía no es un gasto y no se carga '
      + 'a Compras. Si me equivoqué, tocá **Corregir** y contestá SI en «¿Es una factura de verdad?»; '
      + 'si no, **Descartar**.')
  }

  // UN PROVEEDOR QUE NO ESTÁ EN EL DESPLEGABLE YA NO FRENA LA FILA cuando el CUIT y el número la
  // identifican solos: entra con la celda E vacía, con el nombre leído transcripto en el concepto, y
  // el mensaje dice la fila y qué le falta. Ver `EXIGIR_PROVEEDOR` arriba.
  if (p.exigirProveedorConocido && item.proveedorNuevo && (EXIGIR_PROVEEDOR || !identidadFuerte(c))) {
    const quien = c.proveedor ?? '(ilegible)'
    // ═══ UNA PREGUNTA QUE NO SE PUEDE CONTESTAR NO ES UNA PREGUNTA (04/08) ═══
    //
    // Decía «¿lo agrego?» y NO HAY forma de contestar que sí: el desplegable de la columna es
    // estricto y sólo lo extiende una persona en el Sheet. El dueño leía una oferta, no tenía con
    // qué aceptarla, y el comprobante quedaba trabado sin que nada dijera cómo destrabarlo. Ahora la
    // frase nombra las DOS salidas reales, que además son las dos que existen de verdad.
    falta(MOTIVO.PROVEEDOR_NUEVO, `proveedor fuera del desplegable: "${quien}"`,
      `**${quien}** no está en el desplegable de Compras, así que no puedo elegirlo. Tocá **Corregir** `
      + `y escribí el nombre tal como figura en la lista, o agregalo al desplegable de la columna y `
      + `volvé a mandar la foto.`)
  }
  // UN PROBABLE DUPLICADO ES UNA PREGUNTA, NO UNA DECISIÓN. Ni cargar ni descartar solo: mismo
  // proveedor, mismo día y mismo importe con otro número puede ser el mismo comprobante con un
  // dígito mal leído —lo que ya pasó— o dos compras distintas. Las dos salidas son caras.
  if (item.posibleDuplicado && !item.duplicadoResuelto) {
    const fila = item.posibleDuplicado.fila ?? '?'
    falta(MOTIVO.DUPLICADO, `puede que ya esté cargado en la fila ${fila}`,
      `puede que ya esté cargado en la **fila ${fila}** — ¿es el mismo?`)
  }
  if (p.exigirObra && !c.obra) falta(MOTIVO.OBRA, 'sin obra imputada', PREGUNTA_OBRA)
  // SIN NOMBRE PERO CON CUIT Y NÚMERO, LA FILA ENTRA. El proveedor se completa en Compras eligiéndolo
  // del desplegable; el gasto, en cambio, o entra ahora o no entra nunca. Sin identidad fuerte sí
  // frena: sin nombre y sin CUIT no hay clave, y sin clave no hay barrera de duplicados.
  if (!normalizar(c.proveedor) && (EXIGIR_PROVEEDOR || !identidadFuerte(c))) {
    falta(MOTIVO.PROVEEDOR, 'sin proveedor', 'no pude leer el proveedor')
  }
  if (aNumero(c.neto) == null && aNumero(c.total) == null) {
    falta(MOTIVO.IMPORTE, 'sin importe numérico', 'no pude leer el total')
  } else if (p.exigirTotal && aNumero(c.total) == null) {
    falta(MOTIVO.TOTAL, 'sin total (sólo el neto)', 'no pude leer el total')
  }
  // ═══ UN IMPORTE QUE NO CIERRA NO SE ESCRIBE (04/08) ═══
  //
  // Es el control que faltaba el día que entraron $201M falsos al Flujo de Caja. La identidad
  // —neto + IVA + otros tributos = total— la mira `vision.mjs` ANTES, y por eso todo comprobante que
  // llega hasta acá sin cerrar ya tuvo su segunda lectura con el modelo grande: no es una duda que se
  // pueda despejar insistiendo. La única salida honesta es que una persona mire el papel.
  //
  // NO DEPENDE DE LA POLÍTICA. Cargar un importe que no cierra cuesta lo mismo entre por donde entre;
  // la diferencia entre el chat y la línea de comandos es a quién se le puede preguntar, no si el
  // número está bien. Del lado del cargador el neto no viaja (`aFajoJson` lo omite a propósito), así
  // que allá esto simplemente no es verificable y no opina — que es lo correcto, no una excepción.
  const ar = identidadDelComprobante({ neto: c.neto, iva: c.iva, otros: c.otrosTributos, total: c.total })
  if (ar.verificable && !ar.cierra) {
    falta(MOTIVO.ARITMETICA,
      `los importes no cierran: suman ${pesos(ar.suma)} y el total dice ${pesos(ar.total)}`,
      `los importes no cierran — neto + IVA + otros tributos dan **${pesos(ar.suma)}** y el total dice **${pesos(ar.total)}** (${pesos(Math.abs(ar.diferencia))} de diferencia). Tocá **Corregir** y arreglá el que esté mal leído.`)
  }

  // ═══ Y UNO QUE SE SALE DE ESCALA, TAMPOCO ═══
  //
  // `item.escala` es la evidencia —cuántos comprobantes de ESE proveedor se conocen y cuál fue el
  // mayor— que arma quien leyó la pestaña Compras. Acá sólo se compara: guardar el veredicto en vez
  // de la evidencia haría que corregir el total no volviera a evaluarlo, y el control quedaría
  // opinando sobre un número que ya nadie usa.
  //
  // Un total TIPEADO POR UNA PERSONA no se cuestiona: `totalTipeado` lo pone el formulario de
  // Corregir. Alguien miró el papel y escribió el número; seguir preguntando sería un callejón sin
  // salida para toda compra grande de verdad.
  // Un total que salió del LIBRO FISCAL no se compara contra la historia del proveedor: la escala
  // existe para agarrar una coma mal leída, y ahí no hay nada leído. Misma salida que `totalTipeado`.
  if (!c.totalTipeado && c.importesVia !== 'arca') {
    const esc = fueraDeEscala(c.total, item.escala)
    if (esc.sospechoso) {
      falta(MOTIVO.ESCALA,
        `${pesos(c.total)} es ${esc.factor}× el máximo histórico de este proveedor (${pesos(esc.max)} en ${esc.n} comprobantes)`,
        `**${pesos(c.total)}** es ${esc.factor}× lo más grande que ${c.proveedor ?? 'este proveedor'} nos facturó nunca (${pesos(esc.max)}, sobre ${esc.n} comprobantes). Más de ${FACTOR_FUERA_DE_ESCALA}× es casi siempre una coma mal leída — confirmalo con **Corregir**.`)
    }
  }

  if (!aFechaAR(c.fecha)) falta(MOTIVO.FECHA, 'fecha ilegible o ausente', 'no pude leer la fecha')

  // ═══ UN DATO QUE NO PUEDE SER CIERTO NO ES UN DATO LEÍDO (04/08) ═══
  //
  // Los dos casos del comprobante de Barcelo: `Fecha 05/12/2003` e `IVA $0,01` sobre un neto de
  // $5.223,35. Los dos se MOSTRARON como si fueran lo que decía el papel, y los dos son imposibles
  // mirando un solo campo — no hacía falta compararlos con nada, sólo preguntarles si pueden existir.
  //
  // Se declaran como faltantes y no como notas al pie porque la consecuencia tiene que ser real: un
  // comprobante con la fecha ilegible NO se escribe, igual que uno sin fecha. La diferencia con
  // `MOTIVO.FECHA` es sólo que acá se puede decir QUÉ se leyó, y eso ahorra la mitad de la pregunta.
  //
  // Nunca se corrige el valor: no se redondea el IVA a la alícuota más cercana ni se cambia el año
  // por el actual. Eso sería fabricar exactamente el dato que no se pudo leer.
  if (p.verificarPlausibilidad) {
    const d = dudasDeLectura(item, { ahora })
    if (d.fecha) {
      falta(MOTIVO.FECHA_IMPOSIBLE,
        `fecha imposible: leí ${d.fecha.leida} (${d.fecha.motivo})`,
        `**no pude leer la fecha**: lo que leí es **${d.fecha.leida}** y no puede ser — ${d.fecha.motivo}. Tocá **Corregir** y ponela.`)
    }
    if (d.iva) {
      falta(MOTIVO.IVA_IMPOSIBLE,
        `IVA imposible: leí ${pesos(d.iva.iva)} sobre un neto de ${pesos(d.iva.neto)} (${d.iva.motivo})`,
        `**no pude leer el IVA**: leí **${pesos(d.iva.iva)}** sobre un neto de **${pesos(d.iva.neto)}** y ${d.iva.motivo}. Tocá **Corregir** y ponelo — si el comprobante no discrimina IVA, escribí 0.`)

    }
  }

  if (c.tipo && !tipoComprobante(c.tipo)) {
    falta(MOTIVO.TIPO, `tipo de comprobante no reconocido: "${c.tipo}"`,
      `no reconozco el tipo de comprobante "${c.tipo}"`)
  }
  if (p.exigirNumero && !c.numero) falta(MOTIVO.NUMERO, 'sin número de comprobante', 'no pude leer el número de comprobante')
  return out
}

/**
 * ¿Este comprobante se puede escribir sin preguntarle nada a nadie?
 *
 * `yaCargado` es CERTEZA de que la fila ya está en Compras y no lo levanta ninguna política: por eso
 * se chequea acá y no en `faltantesDe`. `duplicadoResuelto:'mismo'` es el dueño diciendo que ya
 * estaba — tampoco se carga, aunque no le falte ningún dato.
 */
export function puedeCargarse(item = {}, politica = POLITICA.CARGADOR, o = {}) {
  if (item.yaCargado) return false
  if (item.duplicadoResuelto === 'mismo') return false
  return faltantesDe(item, politica, o).length === 0
}

/**
 * Los problemas que impiden cargar un comprobante suelto, en la política del cargador.
 * Vacío = cargable. Es la forma en que lo consume `scripts/cargar-comprobantes-compras.mjs`.
 */
export function validar(c = {}) {
  return faltantesDe({ comprobante: c }, POLITICA.CARGADOR).map((f) => f.texto)
}
