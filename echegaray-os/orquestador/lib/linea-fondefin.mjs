// LA LÍNEA FONDEFIN — Fiduciaria San Juan SAPEM, "Bienes de Capital".
//
// ═══ POR QUÉ EXISTE (13/08) ═══
//
// El dueño la nombró como alternativa de financiamiento y el informe de compra de rodados la ignoró
// por una razón simple: NO ESTABA CARGADA. `public.condiciones_financieras` tenía 5 filas (descubierto
// Santander, tarjeta Visa, prendario del Ford, impuesto al cheque y el UVA de Le Pont) y ninguna era
// ésta. Para el OS la línea no existía, y lo que no está en la fuente única no entra en ninguna
// comparación. Esta es la ficha, con su fuente y sus huecos declarados.
//
// ═══ LA TASA NO ES UN NÚMERO, ES UNA FÓRMULA ═══
//
// El Reglamento dice, textual: "La tasa de interés compensatorio aplicable será equivalente al 60% de
// la Tasa Badlar en Pesos para Bancos Privados publicada por el Banco Central de la República
// Argentina VIGENTE A LA FECHA DEL ACTA DE COMITÉ EJECUTIVO QUE APRUEBE LA SOLICITUD."
//
// Dos consecuencias que no se pueden tapar con un número lindo:
//  1. La TNA de hoy es una FOTO. La Badlar se movió entre 20,875% y 22,8125% en las últimas tres
//     semanas: el mismo crédito sale 12,53% o 13,69% según el día del acta. Por eso la tasa se
//     CALCULA con `tnaFondefin(badlar)` y la Badlar viaja con su fecha y su fuente — nunca hardcodeada
//     sola.
//  2. El Reglamento NO dice que se reajuste después. Se lee como tasa FIJADA al aprobar, no variable
//     durante los 48 meses. Es una diferencia de miles de millones en un escenario de tasas subiendo
//     o bajando, y el documento no la resuelve: va en `PREGUNTAS_AL_FIDUCIARIO`.
//
// ═══ LO QUE ESTA LÍNEA NO ES ═══
//
// No es capital de trabajo. Financia LA COMPRA de un bien de capital, el desembolso va DIRECTO al
// proveedor (no a la cuenta de la empresa) y una auditoría posterior puede exigir el reintegro total
// si se usó para otra cosa. Por eso entra con `limite_disponible: null` — igual que el UVA de Le Pont
// pero por otro motivo: allá era una TNA 0% nominal que habría ganado todas las comparaciones; acá es
// que el comparador ofrecería $150M para pagar sueldos, y esa plata no se puede usar para sueldos.

import { SERIE_BADLAR, SERIE_LEIDA_EL, BCRA_ID_VARIABLE, ultimaObservacion, rangoDeLaSerie } from './badlar-bcra.mjs'

/** El factor del Reglamento: 60% de la Badlar. No es una estimación, es la letra del ROP. */
export const FACTOR_BADLAR = 0.6

/**
 * La Badlar tomada como referencia, CON SU FECHA. Es un dato con fecha de vencimiento: se mueve todos
 * los días hábiles. Fuente oficial (no un portal que la republica).
 *
 * SE DERIVA DE LA SERIE, NO SE TIPEA. Antes eran tres números escritos a mano (valor, fecha, rango) y
 * un auditor encontró que ninguno tenía control: una Badlar mal cargada pero plausible dejaba los once
 * tests en verde. Ahora salen todos de `SERIE_BADLAR`, que es la respuesta cruda del BCRA. Lo que
 * queda sin cubrir —un dedazo dentro de la serie misma— sólo lo caza el canario contra la API viva.
 */
export const BADLAR_REFERENCIA = {
  valor: ultimaObservacion(SERIE_BADLAR).valor,
  fecha: ultimaObservacion(SERIE_BADLAR).fecha,
  fuente: `BCRA — API de estadísticas monetarias v4.0, idVariable ${BCRA_ID_VARIABLE} "Tasa de interés BADLAR de bancos privados", serie de ${SERIE_BADLAR.length} ruedas leída el ${SERIE_LEIDA_EL}`,
  // El rango OBSERVADO, con sus fechas y sus ruedas: para que nadie confunda la foto con la película
  // ni le ponga a una ventana de 16 días corridos el rótulo "3 semanas".
  rango_observado: rangoDeLaSerie(SERIE_BADLAR),
}

/**
 * CUÁNTO VALE LA FOTO — la ventana después de la cual la TNA calculada deja de ser una referencia.
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA (13/08, auditoría) ═══
 *
 * La fila entró con `vigencia_hasta: null` y sin ningún mecanismo de frescura. Dentro de tres meses la
 * Web iba a seguir mostrando "Fiduciaria San Juan SAPEM · TNA 13,69% · informado" y nada iba a decir
 * que ese número estaba muerto. El descubierto y la tarjeta caducan solos —de hecho ya caducaron—;
 * ésta no.
 *
 * 15 días corridos NO es un número redondo elegido por comodidad: en las 17 ruedas observadas
 * (20/07→11/08) la Badlar se movió entre 20,875% y 22,8125%, casi 2 puntos, o sea 1,16 puntos de TNA
 * FONDEFIN. Una foto más vieja que esa ventana no es una estimación peor: es una afirmación que la
 * propia serie desmiente. Pasado el plazo la línea DEJA DE ESTAR VIGENTE y `condicionesVigentes()` no
 * la devuelve — se prefiere que el comparador no la vea antes que la vea con un número inventado.
 *
 * Y se deriva de la fecha de la Badlar, no de la fecha de carga: refrescar la Badlar y re-correr la
 * semilla extiende la vigencia sola. Nadie tiene que acordarse de dos cosas.
 */
export const VALIDEZ_FOTO_DIAS = 15

const DIA_MS = 86400000
const aDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
const aIso = (d) => d.toISOString().slice(0, 10)

/**
 * NÚCLEO PURO: hasta qué día vale la fila, dada la fecha de la Badlar que la sostiene.
 * @param {string} fechaBadlar 'AAAA-MM-DD'
 * @returns {string|null} 'AAAA-MM-DD'
 */
export function vigenciaHastaDeLaFoto(fechaBadlar = BADLAR_REFERENCIA.fecha, dias = VALIDEZ_FOTO_DIAS) {
  const d = aDate(fechaBadlar)
  if (Number.isNaN(d.getTime())) return null
  return aIso(new Date(d.getTime() + dias * DIA_MS))
}

/**
 * NÚCLEO PURO: el estado de la foto a una fecha. Es lo que el canario informa y lo que un consumidor
 * puede mirar sin ir a la base.
 * @param {string|Date} hoy
 */
export function estadoDeLaFoto(hoy = new Date(), ref = BADLAR_REFERENCIA) {
  const h = aDate(typeof hoy === 'string' ? hoy : aIso(hoy))
  const f = aDate(ref.fecha)
  const vence = vigenciaHastaDeLaFoto(ref.fecha)
  const dias = Math.round((h.getTime() - f.getTime()) / DIA_MS)
  return { fecha_badlar: ref.fecha, dias_de_la_foto: dias, vence_el: vence, vencida: aIso(h) > vence }
}

/**
 * NÚCLEO PURO: la TNA compensatoria de la línea a partir de una Badlar. Devuelve `null` si no le dan
 * una Badlar válida — sin Badlar no hay tasa, y una tasa inventada es peor que una tasa faltante.
 * @param {number} badlar fracción (0.228125 = 22,8125%)
 * @returns {number|null} TNA en fracción
 */
export function tnaFondefin(badlar) {
  const b = Number(badlar)
  if (!Number.isFinite(b) || b <= 0) return null
  return FACTOR_BADLAR * b
}

/**
 * DEMORA DEL TRÁMITE — no es una nota al pie, es parte de la condición.
 *
 * Una línea que tarda un trimestre en aprobarse NO sirve para una unidad que se necesita este mes, y
 * SÍ sirve para la segunda y la tercera. El dato es del dueño (07/08/2026: "demora 4 meses en
 * terminarse el trámite al no ser organismo bancario"); el Reglamento NO publica ningún plazo de
 * resolución — sólo los 10 días corridos que tiene el postulante para contestar un requerimiento.
 */
export const DEMORA_TRAMITE_DIAS = 120

/**
 * NÚCLEO PURO: ¿llega esta línea a tiempo para una necesidad que vence en `diasHastaLaNecesidad`?
 * No decide la compra: dice si la alternativa es siquiera elegible en esa ventana de tiempo.
 * @param {number} diasHastaLaNecesidad
 */
export function llegaATiempo(diasHastaLaNecesidad) {
  const d = Number(diasHastaLaNecesidad)
  if (!Number.isFinite(d)) return { llega: null, motivo: 'no se sabe para cuándo se necesita' }
  if (d >= DEMORA_TRAMITE_DIAS) {
    return { llega: true, motivo: `el trámite demora ~${DEMORA_TRAMITE_DIAS} días y hay ${d}` }
  }
  return {
    llega: false,
    motivo: `el trámite demora ~${DEMORA_TRAMITE_DIAS} días y la necesidad vence en ${d}: sirve para la unidad SIGUIENTE, no para ésta`,
  }
}

/** El costo de ENTRADA que la línea cobra una vez y no está en la TNA (fracción del desembolso). */
export const GASTOS_OTORGAMIENTO = 0.02

// El rango observado y los formatos es-AR de los textos de la ficha. Los porcentajes y las fechas de
// `observaciones` se ARMAN con los mismos valores que la fila publica: un texto tipeado aparte
// envejece por su cuenta y termina citado como si fuera el dato (ya pasó con "las últimas 3 semanas"
// sobre una ventana de 16 días).
const RANGO = BADLAR_REFERENCIA.rango_observado
const pct = (f, dec = 2) => `${(Number(f) * 100).toFixed(dec).replace('.', ',')}%`
const enAr = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/')

/**
 * EL IVA SOBRE LOS INTERESES — 10,5%, y la fuente es EL DUEÑO, no el Reglamento.
 *
 * ═══ null → 21% → 10,5%: LAS TRES ETAPAS, PORQUE NINGUNA SE BORRA ═══
 *
 * Entró en `null` a propósito y no por descuido: el ROP no menciona el IVA, y `costoEfectivo` trata un
 * IVA desconocido como DATO FALTANTE, no como exención — un 0 ahí afirmaba una exención que nadie
 * había declarado. La pregunta quedó abierta en las dos líneas del organismo.
 *
 * El 13/08/2026 el dueño la contestó por primera vez, textual: "iva 21". Se cargó 0,21 con ese origen.
 * MÁS TARDE EL MISMO DÍA la corrigió, textual: "el iva es del 10,5% en el informe de compra de
 * rodados". Manda lo último y lo más específico: 0,105. La declaración del 21% no se borra —vive en
 * `ORIGEN_DEL_IVA.corregido_desde` y en el historial de la rama fix/iva-fondefin-21— porque si mañana
 * aparece un papel que dice 21% hay que poder ver que esto SE DECIDIÓ, no que se perdió.
 *
 * ═══ LO QUE ESTE NÚMERO NO ES ═══
 *
 * NO es una alícuota verificada contra la norma. Al revés: el encuadre que la habilitaría está en duda
 * y así quedó anotado antes de esta corrección. La alícuota reducida del 10,5% sobre intereses es el
 * beneficio de los préstamos otorgados por entidades regidas por la LEY 21.526 (entidades
 * financieras), y Fiduciaria San Juan SAPEM no figura como una de ellas — por eso el 10,5% no se
 * había asumido solo. El dueño lo declara igual y su declaración manda sobre el criterio del OS, pero
 * el hueco queda abierto y con nombre: CONFIRMAR CON EL ESTUDIO CONTABLE si el mutuo de Fiduciaria
 * SAPEM encuadra bajo la Ley 21.526 a efectos del art. 28 de la Ley de IVA. Si no encuadra, el número
 * vuelve a 21% y el costo sube ~1,44 puntos de TNA.
 *
 * Por eso `verificado_contra_la_norma: false`, la fila sigue en `informado`, y el origen viaja escrito
 * en `observaciones` hasta Postgres y la Web: el que la mire tiene que poder ver de dónde salió el
 * 10,5 antes de usarlo para una decisión fiscal.
 *
 * VIVE ACÁ Y SE IMPORTA: las dos líneas del organismo (Bienes de Capital y Capital de Trabajo) y el
 * informe de rodados usan el MISMO valor. Escribirlo dos veces habilita que dentro de un mes una diga
 * 21 y la otra 10,5 — que es exactamente lo que casi pasa hoy.
 */
export const IVA_SOBRE_INTERESES = 0.105

/**
 * De dónde salió el 10,5%. Un número sin padre en una tabla de decisión no se puede auditar, y una
 * corrección sin rastro es indistinguible de un dedazo.
 */
export const ORIGEN_DEL_IVA = {
  valor: IVA_SOBRE_INTERESES,
  origen: 'el dueño de Echegaray Construcciones',
  fecha: '2026-08-13',
  textual: 'el iva es del 10,5% en el informe de compra de rodados',
  verificado_contra_la_norma: false,
  /** La declaración anterior, del mismo día. No es historia de color: es lo que hace auditable el 10,5. */
  corregido_desde: {
    valor: 0.21,
    fecha: '2026-08-13',
    textual: 'iva 21',
  },
  /** El hueco que este número deja abierto. Se pregunta, no se estima. */
  a_confirmar:
    'si el mutuo de Fiduciaria San Juan SAPEM encuadra bajo la Ley 21.526 a efectos de la alícuota reducida de IVA sobre intereses — consultar al estudio contable. Si no encuadra, la alícuota vuelve al 21% general.',
}

/**
 * El texto que lleva el origen del IVA hasta Postgres y la Web. Se ARMA con el valor que la fila
 * publica —no se tipea aparte— porque un texto suelto envejece por su cuenta y termina citado como si
 * fuera el dato. Lo comparten las dos líneas: una sola redacción, un solo origen.
 */
export const OBSERVACION_IVA = [
  `IVA SOBRE INTERESES: ${pct(IVA_SOBRE_INTERESES, 1)}, y la FUENTE ES EL DUEÑO, no el reglamento —`,
  `dijo textual "${ORIGEN_DEL_IVA.textual}" el ${enAr(ORIGEN_DEL_IVA.fecha)}.`,
  `CORRIGE una declaración anterior del mismo ${enAr(ORIGEN_DEL_IVA.corregido_desde.fecha)} que fijaba ${pct(ORIGEN_DEL_IVA.corregido_desde.valor, 0)} ("${ORIGEN_DEL_IVA.corregido_desde.textual}"): manda lo último y lo más específico, y la anterior se deja escrita para que la corrección sea auditable.`,
  'El ROP no trata el IVA en ninguno de sus puntos.',
  `NO está verificada contra la norma y el criterio fiscal apunta en contra: la alícuota reducida de ${pct(IVA_SOBRE_INTERESES, 1)} sobre intereses es la de los préstamos de entidades regidas por la Ley 21.526 y Fiduciaria San Juan SAPEM no figura como una de ellas. PENDIENTE: ${ORIGEN_DEL_IVA.a_confirmar}`,
  'LO QUE SIGUE SIN SABERSE es si la Fiduciaria factura además alguna PERCEPCIÓN de IVA sobre esos intereses: el descubierto del Santander lleva 10,5% + 1,5% de percepción = 12%, y acá se cargó el IVA solo.',
].join(' ')

/**
 * LA CONDICIÓN, tal como entra a `public.condiciones_financieras` vía `registrarCondicion`.
 * `clave`, `desconocido` y `preguntar` NO son columnas: se sacan antes de escribir.
 *
 * `cft: null` A PROPÓSITO. La línea publica UNA tasa (la compensatoria) y varios costos sueltos que
 * el ROP no integra en ningún costo financiero total: 2% de gastos de otorgamiento detraído del
 * desembolso, impuesto de sellos, seguro de vida sobre saldo deudor, tasación por perito, inscripción
 * de garantías. El CFT real es MAYOR que la TNA y NO se puede calcular con lo publicado. Poner la TNA
 * en la casilla del CFT sería exactamente la mentira que esta tabla existe para evitar.
 *
 * `iva_sobre_intereses` YA NO ES null: es 10,5% desde el 13/08/2026 por declaración del dueño (que ese
 * mismo día corrigió su propio 21%). Ver `IVA_SOBRE_INTERESES` para el origen, para el rastro de la
 * corrección y para lo que ese número todavía no es. El costo efectivo pasa de la TNA pelada a la
 * TNA × 1,105 — y sigue siendo un PISO, porque el campo que convierte un piso en un total es el CFT,
 * y el CFT sigue sin publicarse.
 */
export const CONDICION_FONDEFIN = {
  clave: 'fondefin-bienes-de-capital',
  entidad: 'Fiduciaria San Juan SAPEM',
  producto: 'FONDEFIN — Línea Bienes de Capital (MiPyME Micro y Pequeña)',
  tipo_financiacion: 'prestamo',
  moneda: 'ARS',
  // El Reglamento es el de mayo 2026 ("ROP ... FONDEFIN 05-2026"), sin fecha de caducidad publicada.
  // La vigencia arranca ahí y no en la fecha de carga: así re-correr la semilla ACTUALIZA esta fila
  // (la Badlar cambia) en vez de crear una fila nueva por día. El 1° del mes es una CONVENCIÓN nuestra
  // —el ROP no publica fecha de entrada en vigencia— y por eso también está dicho en `observaciones`:
  // un supuesto que sólo vive en un comentario del código no viaja a la base ni a la Web.
  vigencia_desde: '2026-05-01',
  // NO es null: la fila caduca sola con la foto de la Badlar. Ver VALIDEZ_FOTO_DIAS.
  vigencia_hasta: vigenciaHastaDeLaFoto(),
  // 60% × Badlar 22,8125% del 11/08/2026 = 13,6875% TNA. El ROP la llama "tasa de interés
  // compensatorio" sobre saldos y la Badlar del BCRA se publica como nominal anual: es TNA, no TEA.
  tna: tnaFondefin(BADLAR_REFERENCIA.valor),
  tea: null, // no publicada; derivarla exigiría fijar la convención de capitalización, que el ROP no da
  cft: null, // ver arriba: no publicado y NO derivable con lo que hay
  iva_sobre_intereses: IVA_SOBRE_INTERESES, // 10,5% — dato del dueño 13/08/2026, no del ROP
  // Las columnas `comisiones` y `gastos` son MONTOS FIJOS en pesos, no porcentajes (así las usa
  // costoEfectivo). El 2% de otorgamiento es una fracción del desembolso: meterlo acá se leería como
  // "$0,02 de comisión". Va en observaciones y en GASTOS_OTORGAMIENTO, no en una columna que miente.
  comisiones: null,
  gastos: null,
  plazo_dias: 1460, // 48 meses
  dias_minimos: null,
  limite_disponible: null, // DELIBERADO — ver el encabezado: no es capital de trabajo
  saldo_utilizado: null,
  amortizacion:
    'Hasta 48 cuotas mensuales: 6 de gracia de CAPITAL (se pagan sólo intereses compensatorios) + hasta 42 de capital e intereses. Vencen el 15 de cada mes (o el hábil siguiente), se pagan por transferencia a la cuenta del Fideicomiso. Sistema de amortización (francés/alemán) NO publicado.',
  fecha_debito: 'día 15 de cada mes (o el hábil inmediato posterior) — por transferencia, no por débito automático',
  garantias:
    'A satisfacción del Comité, deben cubrir la TOTALIDAD del financiamiento más intereses, accesorios y gastos. Opciones del ROP: (a) CHEQUES propios o de terceros, sólo si el crédito NO supera $30.000.000, con el librador en situación normal y sin rechazos; (b) HIPOTECA en 1er grado sobre inmueble en San Juan, que debe cubrir el 150% del financiamiento; (c) FIANZA/AVAL de SGR o Fondo de Garantía inscripto; (d) PRENDA en 1er grado sobre rodados, que debe cubrir el 200% del financiamiento, con póliza endosada a favor de Fiduciaria. En TODOS los casos (salvo hipoteca) se suscribe además un PAGARÉ a la vista sin protesto. La tasación la hace un perito designado por el Fiduciario y la paga el solicitante.',
  nivel_confianza: 'informado',
  fuente:
    'Reglamento de Condiciones Generales FONDEFIN 05-2026 — "ROP-MIPYME-BIENES-DE-CAPITAL-FONDEFIN-mayo-2026.pdf", publicado en fiduciariasanjuan.com/linea/bienes-de-capital, descargado y leído el 13/08/2026 · Badlar: BCRA API estadísticas monetarias v4.0 idVariable 7, valor 22,8125% del 11/08/2026, consultada 13/08/2026',
  observaciones: [
    `TASA: el ROP no fija un número, fija una FÓRMULA — "60% de la Tasa Badlar en Pesos para Bancos Privados publicada por el BCRA vigente a la fecha del acta de Comité Ejecutivo que apruebe la solicitud". La TNA cargada (${pct(tnaFondefin(BADLAR_REFERENCIA.valor), 4)}) es 60% × Badlar ${pct(BADLAR_REFERENCIA.valor, 4)} del ${enAr(BADLAR_REFERENCIA.fecha)}: es una FOTO, no la tasa del crédito. En las ${RANGO.ruedas} ruedas del ${enAr(RANGO.desde)} al ${enAr(RANGO.hasta)} la Badlar osciló entre ${pct(RANGO.min, 4)} (${enAr(RANGO.min_el)}) y ${pct(RANGO.max, 4)} (${enAr(RANGO.max_el)}) → la misma línea sale entre ${pct(tnaFondefin(RANGO.min), 2)} y ${pct(tnaFondefin(RANGO.max), 2)} según el día en que el Comité firme el acta. Recalcular con tnaFondefin(badlar) antes de usar este número para decidir.`,
    OBSERVACION_IVA,
    `CADUCIDAD DE ESTA FILA: la vigencia termina el ${enAr(vigenciaHastaDeLaFoto())} — ${VALIDEZ_FOTO_DIAS} días corridos después de la Badlar que la sostiene. NO es una fecha del reglamento: es hasta cuándo el OS se hace cargo de esta foto. Pasada esa fecha la línea deja de estar vigente y no se ofrece en ninguna comparación, hasta que alguien refresque la Badlar y re-corra la semilla. Es deliberado: una línea ausente se nota; una TNA de tres meses atrás con cara de dato oficial, no. El contraste contra el BCRA vivo lo corre scripts/canario-badlar-fondefin.mjs.`,
    'VIGENCIA_DESDE ES UNA CONVENCIÓN, NO UN DATO: el 01/05/2026 sale del código "05-2026" del nombre del reglamento ("ROP-MIPYME-BIENES-DE-CAPITAL-FONDEFIN-mayo-2026.pdf"). El ROP no publica fecha de entrada en vigencia. Se eligió el 1° del mes para que la clave única de la tabla sea estable y re-correr la semilla actualice la fila en vez de duplicarla por día.',
    'DEMORA DEL TRÁMITE: ~120 días (4 meses, dato del dueño 07/08/2026 — "al no ser organismo bancario"). El ROP NO publica ningún plazo de resolución; sólo fija 10 días corridos para que el postulante conteste un requerimiento de información. CONSECUENCIA OPERATIVA: esta línea NO sirve para una unidad que se necesita en menos de un trimestre; sí para la segunda y la tercera. Ver llegaATiempo().',
    'COSTOS QUE NO ESTÁN EN LA TNA y hacen que el CFT real sea mayor: 2% de gastos de otorgamiento detraído del total desembolsado; impuesto de sellos a cargo del tomador; seguro de vida sobre saldo deudor contratado por la Fiduciaria por cuenta del tomador; honorarios del perito tasador; costos de inscripción de las garantías; y todo impuesto o tasa sobre el crédito, deducidos del primer desembolso. El ROP no publica CFT y con esto no se puede calcular: falta el monto del seguro y de la tasación.',
    'DESEMBOLSO: va DIRECTO al proveedor por transferencia al CBU que el tomador declare, nunca a la cuenta de la empresa, y recién después de firmar el mutuo y constituir las garantías. El Fiduciario puede auditar el destino antes o después; si se aplicó a otro fin, puede exigir el reintegro inmediato del total con intereses de mora y punitorios.',
    'NO ES CAPITAL DE TRABAJO — por eso va sin limite_disponible y el comparador no la ofrece para tapar un bache de caja. Rubros expresamente NO financiables: pasivos previos, deudas financieras, deudas impositivas/laborales/previsionales, indemnizaciones, moneda extranjera, obra civil e infraestructura, inmuebles, y todo gasto no ligado a la inversión.',
    'TOPE REAL: los $150.000.000 son el techo del reglamento, NO una línea aprobada. Para responsable inscripto el monto se determina por el promedio de ventas netas de las últimas 6 DDJJ de IVA ante ARCA, se estima un margen de utilidad del 40% sobre ese promedio, y la CUOTA mensual no puede superar el 35% de ese margen, restando los compromisos financieros ya informados en el sistema crediticio. El monto que Echegaray puede pedir sale de esa cuenta, no del tope.',
    'ELEGIBILIDAD DEL RODADO: la línea SÍ financia utilitarios de trabajo, pero acotados — furgones 0km, camionetas pick up ÚNICAMENTE CABINA SIMPLE 0km, camiones de pequeño porte 0km, y camiones de mediano/gran porte 0km o usados de hasta 5 años. Una doble cabina NO califica. NO se financian gastos de entrega, patentamiento, fletes, seguros, sellos, aranceles ni formularios: eso es aporte propio.',
    'REQUISITOS DEL SOLICITANTE: MiPyME categorizada MICRO o PEQUEÑA (Certificado MiPyME vigente), radicada y operando en San Juan, con domicilio constituido en la provincia y un mínimo de 6 meses en la actividad. Sin inhibición, inhabilitación, concurso ni quiebra. Sin deuda impositiva exigible con la Provincia (certificado de cumplimiento fiscal de menos de 15 días). CONDICIÓN CREDITICIA — son DOS cosas distintas y el ROP las separa: (a) en el SISTEMA FINANCIERO debe estar en "situación normal" según informe Veraz/Nosis e informe BCRA de menos de 15 días; (b) en la CARTERA CREDITICIA DE LA PROPIA FIDUCIARIA debe estar en Situación 1 o 2 (al día, o con atrasos de hasta 60 días) de forma ininterrumpida los 6 meses previos — esto último sólo pesa si ya se tomó crédito de alguno de sus fideicomisos. Presenta además: últimas 6 DDJJ de IVA, último estado contable auditado, constancias ARCA e IIBB, documentación societaria y la de la garantía.',
    'MORA: intereses moratorios a la Tasa Activa Cartera General del Banco Nación, más punitorios del 50% de esa tasa. El contrato de mutuo es título ejecutivo.',
    'CONTACTO: Fiduciaria San Juan SAPEM, Av. Córdoba 390 (E), Capital, San Juan · 0264-4211591 · creditos@fiduciariasanjuan.com · consultas de 8:30 a 12:30. El trámite online figura como "próximamente disponible": hoy la carpeta se presenta en papel (A4) en la sede.',
  ].join(' ── '),
  /** Lo que la fuente NO publica. No se estima: se pregunta. */
  desconocido: [
    'CFT — no publicado y no derivable: faltan el monto del seguro de vida sobre saldo deudor y el de la tasación',
    'si el mutuo de Fiduciaria San Juan SAPEM encuadra bajo la Ley 21.526 — de eso depende que la alícuota declarada por el dueño (10,5%) sea la correcta o vuelva a ser la general del 21%: lo confirma el estudio contable, no el OS',
    'si además del IVA (10,5%, declaración del dueño del 13/08/2026 que corrigió su propio 21% del mismo día) la Fiduciaria factura alguna PERCEPCIÓN de IVA sobre los intereses — el ROP no lo trata y no se asume ni que la haya ni que no: son 1,5 puntos sobre intereses en el caso del banco',
    'si la tasa queda FIJA al acta de aprobación o se reajusta con la Badlar durante los 48 meses',
    'porcentaje financiable del bien / aporte propio exigido — el ROP no fija ninguno',
    'si el crédito cubre el precio del rodado con IVA o sólo el neto (el Anexo IX pide los presupuestos abiertos en neto e IVA)',
    'sistema de amortización de las cuotas (francés, alemán u otro)',
    'plazo de resolución de la solicitud — el ROP no publica ninguno',
    'costo del sellado provincial aplicable al mutuo y a la garantía',
    'si el Comité acepta el aval de Garantizar u otra SGR y con qué costo',
  ],
  /** Las preguntas concretas, en el orden en que conviene hacerlas. Cada una cambia una decisión. */
  preguntar: [
    '¿La tasa (60% de Badlar) queda FIJA a la fecha del acta de aprobación o se reajusta durante los 48 meses? — es la diferencia entre un costo cerrado y uno abierto a 4 años',
    '¿Cuánto tarda hoy, en la práctica, desde que se presenta la carpeta completa hasta el desembolso? — el dueño maneja 4 meses; el reglamento no dice nada',
    '¿Financia el 100% del valor del rodado o exige aporte propio? ¿Sobre el precio con IVA o el neto?',
    '¿Con qué garantía conviene presentarse? Con prenda sobre el rodado se exige cubrir el 200% del crédito; con cheques sólo hasta $30M; ¿aceptan aval de SGR y les sirve más?',
    '¿Una camioneta pick up 0km CABINA SIMPLE es el único formato elegible, o admiten doble cabina si la actividad lo justifica?',
    '¿Cuál es el monto máximo que la empresa puede pedir según sus últimas 6 DDJJ de IVA, con la cuota topeada al 35% del margen estimado?',
    '¿El sellado y el seguro de vida sobre saldo deudor cuánto suman? — sin eso no hay CFT',
  ],
}

/** Las columnas que NO existen en la tabla: se sacan antes de escribir. */
export const NO_SON_COLUMNAS = ['clave', 'desconocido', 'preguntar']

/**
 * La fila lista para `registrarCondicion`, sin los campos que no son columnas.
 *
 * ═══ LO QUE NO SE SABE VIAJA CON LA FILA (13/08, auditoría) ═══
 *
 * `desconocido` y `preguntar` se borraban acá y morían en el repositorio: no llegaban ni a Postgres ni
 * a la Web. Varios de esos huecos DECIDEN la operación —si exigen aporte propio, si el crédito cubre
 * el IVA del rodado, cuánto suma el sellado, si aceptan aval de SGR—, y el que mira la fila en la
 * pantalla no tenía forma de enterarse. Un límite que sólo existe en el código fuente es un límite no
 * declarado.
 *
 * Se pliegan dentro de `observaciones` porque son texto y la tabla no tiene columna para ellos.
 * Agregar dos columnas sería una migración sobre una tabla productiva para guardar prosa: no lo vale.
 */
export function filaParaLaTabla(cond = CONDICION_FONDEFIN) {
  const fila = { ...cond }
  const bloques = [fila.observaciones]
  if (cond.desconocido?.length) {
    bloques.push(`LO QUE LA FUENTE NO PUBLICA (${cond.desconocido.length}) — no se estima, se pregunta: ${cond.desconocido.join(' · ')}`)
  }
  if (cond.preguntar?.length) {
    bloques.push(`PREGUNTAS AL FIDUCIARIO (${cond.preguntar.length}), en el orden en que conviene hacerlas — cada una cambia una decisión: ${cond.preguntar.join(' · ')}`)
  }
  fila.observaciones = bloques.filter(Boolean).join(' ── ')
  for (const k of NO_SON_COLUMNAS) delete fila[k]
  return fila
}
