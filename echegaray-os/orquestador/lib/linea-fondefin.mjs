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

/** El factor del Reglamento: 60% de la Badlar. No es una estimación, es la letra del ROP. */
export const FACTOR_BADLAR = 0.6

/**
 * La Badlar tomada como referencia, CON SU FECHA. Es un dato con fecha de vencimiento: se mueve todos
 * los días hábiles. Fuente oficial (no un portal que la republica).
 */
export const BADLAR_REFERENCIA = {
  valor: 0.228125, // 22,8125% TNA
  fecha: '2026-08-11',
  fuente: 'BCRA — API de estadísticas monetarias v4.0, idVariable 7 "Tasa de interés BADLAR de bancos privados", consultada 13/08/2026',
  // El rango de las últimas tres semanas, para que nadie confunda la foto con la película.
  rango_3_semanas: { min: 0.20875, max: 0.228125, desde: '2026-07-27', hasta: '2026-08-11' },
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
 * `iva_sobre_intereses: null` A PROPÓSITO y es la pregunta más cara de la lista: Fiduciaria San Juan
 * SAPEM no es una entidad de la Ley 21.526, así que el IVA sobre los intereses NO es el 10,5% de
 * banco. El ROP no dice nada. Si son 21%, el costo efectivo sube ~2,9 puntos sobre la TNA.
 */
export const CONDICION_FONDEFIN = {
  clave: 'fondefin-bienes-de-capital',
  entidad: 'Fiduciaria San Juan SAPEM',
  producto: 'FONDEFIN — Línea Bienes de Capital (MiPyME Micro y Pequeña)',
  tipo_financiacion: 'prestamo',
  moneda: 'ARS',
  // El Reglamento es el de mayo 2026 ("ROP ... FONDEFIN 05-2026"), sin fecha de caducidad publicada.
  // La vigencia arranca ahí y no en la fecha de carga: así re-correr la semilla ACTUALIZA esta fila
  // (la Badlar cambia) en vez de crear una fila nueva por día.
  vigencia_desde: '2026-05-01',
  vigencia_hasta: null,
  // 60% × Badlar 22,8125% del 11/08/2026 = 13,6875% TNA. El ROP la llama "tasa de interés
  // compensatorio" sobre saldos y la Badlar del BCRA se publica como nominal anual: es TNA, no TEA.
  tna: tnaFondefin(BADLAR_REFERENCIA.valor),
  tea: null, // no publicada; derivarla exigiría fijar la convención de capitalización, que el ROP no da
  cft: null, // ver arriba: no publicado y NO derivable con lo que hay
  iva_sobre_intereses: null, // ver arriba: el ROP no lo trata y no es una entidad financiera
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
    'TASA: el ROP no fija un número, fija una FÓRMULA — "60% de la Tasa Badlar en Pesos para Bancos Privados publicada por el BCRA vigente a la fecha del acta de Comité Ejecutivo que apruebe la solicitud". La TNA cargada (13,6875%) es 60% × Badlar 22,8125% del 11/08/2026: es una FOTO, no la tasa del crédito. La Badlar osciló entre 20,875% y 22,8125% en las últimas 3 semanas → la misma línea sale entre 12,53% y 13,69% según el día en que el Comité firme el acta. Recalcular con tnaFondefin(badlar) antes de usar este número para decidir.',
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
    'IVA sobre intereses — el ROP no lo trata; Fiduciaria SAPEM no es entidad de la Ley 21.526, así que no se puede asumir el 10,5% bancario',
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
    '¿Los intereses llevan IVA? ¿Al 21% o al 10,5%? — si son 21%, el costo efectivo sube ~2,9 puntos',
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

/** La fila lista para `registrarCondicion`, sin los campos que no son columnas. */
export function filaParaLaTabla(cond = CONDICION_FONDEFIN) {
  const fila = { ...cond }
  for (const k of NO_SON_COLUMNAS) delete fila[k]
  return fila
}
