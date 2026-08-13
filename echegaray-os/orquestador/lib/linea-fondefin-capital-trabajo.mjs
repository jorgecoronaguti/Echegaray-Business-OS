// LA SEGUNDA LÍNEA FONDEFIN — Fiduciaria San Juan SAPEM, "Capital de Trabajo".
//
// ═══ POR QUÉ EXISTE (13/08) ═══
//
// Buscando la línea de Bienes de Capital apareció que el organismo tiene SIETE líneas, no una. Ésta
// prometía ser la más valiosa de todas: misma fórmula de tasa (60% de la Badlar → 13,6875% TNA con
// la Badlar del 11/08), hasta $30.000.000, 18 meses, y financia INSUMOS — que es exactamente el
// gasto que más caja consume en esta empresa. Contra el descubierto del Santander (CFT 62,78%
// verificado) son ~49 puntos de diferencia.
//
// ═══ Y ENTONCES SE LEYÓ EL REGLAMENTO ═══
//
// El punto 2.2.3 no sólo dice qué financia: dice qué NO financia, y lo primero de esa lista es la
// actividad de Echegaray. Textual:
//
//   "No se financiarán: [...] Obras Civiles de Ningún tipo, se entenderá por obras civiles toda
//    construcción, reparación, ampliación, modificación, mantenimiento o demolición de
//    infraestructura física destinada a uso público o privado, incluyendo —sin carácter limitativo—
//    edificaciones, instalaciones, urbanizaciones, obras viales, hidráulicas, sanitarias, eléctricas,
//    de comunicación, y demás trabajos de ingeniería o arquitectura que impliquen la ejecución
//    material de proyectos constructivos."
//
// Y por si quedara duda, dos renglones más abajo: "Construcción, refacción y/o compra-venta de
// inmuebles."
//
// Los rubros financiables son "Mercadería", "insumos necesarios para brindar servicio" e "insumos o
// materia prima necesarios para producción" (2.2.3). El cemento, el hierro y el hormigón que compra
// Echegaray son insumos de su producción — y su producción ES la ejecución material de proyectos
// constructivos. El destino financiable y el destino excluido son, para esta empresa, el mismo gasto.
// La exclusión es la norma específica y está redactada "sin carácter limitativo": manda ella.
//
// LECTURA DEL OS: los materiales de obra NO califican. No es un "probablemente": es la letra del
// reglamento aplicada a la actividad real de la empresa. Lo que SÍ queda abierto es que el punto 4.4
// faculta al Comité a "admitir excepciones a las condiciones impuestas en la reglamentación que a su
// juicio se encuentren debidamente justificadas" — una excepción discrecional, no un derecho, y el
// dueño la puede pedir en la misma llamada que ya tiene pendiente por la otra línea.
//
// ═══ CONSECUENCIA: NO LLEVA limite_disponible ═══
//
// El encargo planteaba la duda al revés (financia insumos → es capital de trabajo recurrente → el
// comparador debería ofrecerla para pagar materiales). La respuesta es NO, y por DOS razones
// independientes, cualquiera de las cuales alcanza sola:
//
//  1. DESTINO. Para una constructora el destino está excluido (2.2.3). Ofrecerla en el comparador
//     haría que el motor recomiende financiar materiales de obra con una línea que prohíbe
//     expresamente financiar obra civil, y el punto 4.6 habilita a exigir el REINTEGRO INMEDIATO DEL
//     TOTAL con intereses de mora y punitorios si la auditoría detecta el desvío. El costo de
//     equivocarse acá no es una tasa peor: es el crédito entero exigible de golpe.
//  2. FORMA. Aunque el Comité admitiera la excepción, el desembolso va por transferencia directa a
//     hasta 3 proveedores, en UN MISMO ACTO, "no pudiendo realizarse transferencias parciales"
//     (2.2.5), contra presupuestos o facturas proforma presentados en la carpeta (2.1.4). Nunca es
//     plata en la cuenta: no tapa un bache de caja, no paga sueldos, no paga impuestos, no paga
//     fletes ni combustible — los cuatro están además excluidos por nombre en 2.2.3.
//
// Si algún día el Comité aprueba la excepción por escrito, lo que cambia no es este archivo: cambia
// el hecho. Ahí se le pone límite, se declara la fuente de la aprobación y el test de abajo se
// actualiza con esa evidencia. Hasta entonces, límite null.

import { FACTOR_BADLAR, BADLAR_REFERENCIA, tnaFondefin, IVA_SOBRE_INTERESES, OBSERVACION_IVA } from './linea-fondefin.mjs'
import { costoEfectivo } from './condiciones-financieras.mjs'
import { TASAS } from './costo-descubierto.mjs'

// La fórmula de la tasa NO se redefine acá: es la misma del organismo y vive en linea-fondefin.mjs.
// Re-exportada para que quien use esta línea no tenga que saber en qué archivo nació. Lo mismo vale
// para el IVA sobre intereses: es el mismo organismo, es el mismo dato del dueño, y escribirlo dos
// veces habilita que dentro de un mes una línea diga 21 y la otra 10,5.
export { FACTOR_BADLAR, BADLAR_REFERENCIA, tnaFondefin, IVA_SOBRE_INTERESES }

/** El costo de ENTRADA que la línea cobra una vez y no está en la TNA (fracción del desembolso). */
export const GASTOS_OTORGAMIENTO = 0.02

/** Tope del reglamento (2.2.2). NO es una línea aprobada: el monto real sale de la capacidad de pago. */
export const MONTO_MAXIMO = 30_000_000

/** Plazo total máximo de devolución (2.2.6): 18 meses. */
export const PLAZO_MAXIMO_DIAS = 547

/**
 * LA PREGUNTA QUE DECIDE SI ESTA LÍNEA SIRVE O NO.
 *
 * No es un clasificador de destinos: es UNA lectura, la que importa, con su cita y su límite. Un
 * clasificador general fabricaría precisión que el reglamento no da.
 */
export const MATERIALES_DE_OBRA = {
  califica: false,
  motivo:
    'El ROP financia "insumos o materia prima necesarios para producción" (2.2.3) pero excluye "Obras Civiles de Ningún tipo", definidas de forma expresa y "sin carácter limitativo" como toda construcción, reparación, ampliación, modificación, mantenimiento o demolición de infraestructura, incluyendo "demás trabajos de ingeniería o arquitectura que impliquen la ejecución material de proyectos constructivos". La producción de Echegaray Construcciones ES esa ejecución material: el insumo financiable y el destino excluido son el mismo gasto, y manda la exclusión específica.',
  cita_financiable:
    'ROP Capital de Trabajo FONDEFIN 05-2026, punto 2.2.3 COMPONENTES FINANCIABLES: "Mercadería. / Adquisición de insumos necesarios para brindar servicio. / Adquisición de insumos o materia prima necesarios para producción."',
  cita_excluida:
    'ROP Capital de Trabajo FONDEFIN 05-2026, punto 2.2.3: "No se financiarán: [...] Obras Civiles de Ningún tipo, se entenderá por obras civiles toda construcción, reparación, ampliación, modificación, mantenimiento o demolición de infraestructura física destinada a uso público o privado, incluyendo —sin carácter limitativo— edificaciones, instalaciones, urbanizaciones, obras viales, hidráulicas, sanitarias, eléctricas, de comunicación, y demás trabajos de ingeniería o arquitectura que impliquen la ejecución material de proyectos constructivos." y "Construcción, refacción y/o compra-venta de inmuebles."',
  via_de_excepcion:
    'ROP punto 4.4: el Comité Ejecutivo "tendrá [...] la posibilidad de admitir excepciones a las condiciones impuestas en la reglamentación que a su juicio se encuentren debidamente justificadas". Es discrecional y por escrito, no un derecho del postulante.',
  riesgo_si_se_fuerza:
    'ROP punto 4.6: si la auditoría —previa o posterior al desembolso— verifica que el crédito se aplicó a un fin distinto del aprobado, el Fiduciario puede suspender los desembolsos, resolver el contrato y exigir "el reintegro inmediato del total de las partidas acreditadas", con intereses de mora más punitorios.',
  confianza:
    'INFERENCIA de alta confianza sobre texto citado. La Fiduciaria no lo confirmó: es lectura del OS, no respuesta del organismo. Va a la llamada pendiente.',
}

/**
 * NÚCLEO PURO: saldo promedio en descubierto que explica un cargo de interés real.
 *
 * Es la única forma honesta de saber cuánto usa la empresa el descubierto: no el límite del acuerdo
 * ($18,2M, que es lo que PODRÍA usar), sino lo que el banco efectivamente cobró. Invierte la misma
 * aritmética verificada del modelo del descubierto.
 *
 * @param {number} interes interés cobrado (sin IVA ni percepción)
 * @param {number} dias días del período liquidado
 * @param {number} tna TNA del acuerdo
 * @returns {number|null} saldo promedio en rojo, o null si los datos no alcanzan
 */
export function saldoPromedioImplicito(interes, dias, tna = TASAS.tna) {
  // `Number(null)` es 0, no NaN: sin este guardia un dato faltante devolvería "$0 de saldo promedio",
  // que es un número falso con cara de respuesta.
  if (interes == null || dias == null || tna == null) return null
  const i = Number(interes)
  const d = Number(dias)
  const t = Number(tna)
  if (![i, d, t].every(Number.isFinite) || d <= 0 || t <= 0 || i < 0) return null
  return i / ((t / TASAS.base) * d)
}

/**
 * EL USO REAL DEL DESCUBIERTO — dato duro del extracto, no el límite del acuerdo.
 *
 * El acuerdo es de $18.200.000, pero lo que la empresa usa de verdad es mucho menos, y eso cambia
 * por completo el tamaño del premio. El cargo del período 08/07→07/08 es el hecho.
 */
export const USO_REAL_DESCUBIERTO = {
  desde: '2026-07-08',
  hasta: '2026-08-07',
  dias: 31,
  interes: 134419.61,
  fuente: 'Extracto Banco Santander — cobro de interés por descubierto del período 08/07→07/08/2026',
  get saldo_promedio() { return saldoPromedioImplicito(this.interes, this.dias) },
}

/**
 * NÚCLEO PURO: cuánto se ahorraría financiando lo mismo con FONDEFIN en vez del descubierto.
 *
 * Usa el motor del OS (`costoEfectivo`) sobre las dos condiciones vivas — no reimplementa la
 * aritmética de tasas. Devuelve el ahorro CON SU SIGNO DE HONESTIDAD: el costo de FONDEFIN sigue
 * siendo un PISO, así que el ahorro calculado sigue siendo un TECHO — pero un techo MÁS BAJO desde
 * el 13/08/2026, porque el IVA del 10,5% que declaró el dueño ya entra por `costoEfectivo` y el 2% de
 * otorgamiento se suma acá. Lo que todavía falta del lado de FONDEFIN: el sellado, el seguro de vida
 * sobre saldo deudor, la tasación y una eventual percepción de IVA. Nada de eso está publicado.
 *
 * @param {object} fondefin fila de condiciones_financieras de la línea FONDEFIN
 * @param {object} descubierto fila de condiciones_financieras del acuerdo de descubierto
 * @param {{monto:number, dias:number}} need
 */
export function ahorroVsDescubierto(fondefin, descubierto, { monto = 0, dias = 0 } = {}) {
  const f = costoEfectivo(fondefin, { monto, dias })
  const d = costoEfectivo(descubierto, { monto, dias })
  if (f.costo_total == null || d.costo_total == null) {
    return { ahorro: null, falta: [...f.falta, ...d.falta], fondefin: f, descubierto: d }
  }
  // El 2% de otorgamiento sí se puede sumar: es una fracción CONOCIDA del desembolso. Se suma acá,
  // fuera de la columna `comisiones` (que es un monto en pesos y ya rompió una vez esta cuenta).
  const otorgamiento = Math.abs(Number(monto) || 0) * GASTOS_OTORGAMIENTO
  const costoFondefinConEntrada = f.costo_total + otorgamiento
  return {
    monto: Math.abs(Number(monto) || 0),
    dias: Math.max(0, Number(dias) || 0),
    costo_fondefin_piso: f.costo_total,
    gastos_otorgamiento: Math.round(otorgamiento),
    costo_fondefin_con_entrada: Math.round(costoFondefinConEntrada),
    costo_descubierto: d.costo_total,
    ahorro: Math.round(d.costo_total - costoFondefinConEntrada),
    es_techo: true,
    advertencia:
      'TECHO, no promesa: el costo de FONDEFIN ya incluye el IVA del 10,5% sobre intereses (declaración del dueño del 13/08/2026, no del ROP, y sin verificar contra la norma) y el 2% de gastos de otorgamiento, pero todavía le faltan el sellado, el seguro de vida sobre saldo deudor, la tasación y una eventual percepción de IVA. Si el encuadre bajo la Ley 21.526 no se confirma, el IVA vuelve al 21% y este ahorro baja. Y sólo se materializa si el Comité admite por excepción un destino que el punto 2.2.3 excluye.',
    fondefin: f,
    descubierto: d,
  }
}

const pct = (f) => `${(f * 100).toLocaleString('es-AR', { maximumFractionDigits: 4 })}%`

/**
 * LA CONDICIÓN, tal como entra a `public.condiciones_financieras` vía `registrarCondicion`.
 * `clave`, `desconocido` y `preguntar` NO son columnas: se sacan antes de escribir.
 *
 * ES UNA FUNCIÓN DE LA BADLAR, NO UN OBJETO CONGELADO. La diferencia importa: si la ficha fuera un
 * literal, un test que compare `ficha.tna` contra `tnaFondefin(badlar)` pasaría igual con el número
 * pegado a mano —hoy dan lo mismo— y no probaría nada. Construyéndola desde la Badlar, pegar un
 * literal rompe el test con CUALQUIER otra Badlar. Y el que necesita la tasa del día no tiene que
 * editar este archivo: llama a `condicionConBadlar(badlarDeHoy)`.
 *
 * @param {number} badlar fracción (0.228125 = 22,8125%)
 */
export function condicionConBadlar(badlar = BADLAR_REFERENCIA.valor) {
  const tna = tnaFondefin(badlar)
  return {
    ...FICHA,
    tna,
    observaciones: FICHA.observaciones.replace(
      '{TASA}',
      tna == null
        ? `sin Badlar válida no hay tasa: la fórmula es ${pct(FACTOR_BADLAR)} de la Badlar y no se puede evaluar`
        : `La TNA cargada (${pct(tna)}) es ${pct(FACTOR_BADLAR)} × Badlar ${pct(badlar)}`,
    ),
  }
}

/** Los campos que NO dependen de la Badlar. `{TASA}` lo completa `condicionConBadlar`. */
const FICHA = {
  clave: 'fondefin-capital-de-trabajo',
  entidad: 'Fiduciaria San Juan SAPEM',
  producto: 'FONDEFIN — Línea Capital de Trabajo (MiPyME Micro y Pequeña)',
  tipo_financiacion: 'prestamo',
  moneda: 'ARS',
  // Anclada al reglamento (05-2026), no a la fecha de carga: re-correr la semilla ACTUALIZA la fila
  // (la Badlar cambia) en vez de crear una fila nueva por día.
  vigencia_desde: '2026-05-01',
  vigencia_hasta: null,
  // La TNA la pone `condicionConBadlar`: no vive acá para que no se pueda pegar a mano.
  tea: null, // no publicada; derivarla exigiría fijar la capitalización, que el ROP no da
  cft: null, // no publicado y NO derivable: faltan seguro de vida, sellado y tasación
  iva_sobre_intereses: IVA_SOBRE_INTERESES, // 10,5% — dato del dueño 13/08/2026, no del ROP
  // `comisiones` y `gastos` son MONTOS EN PESOS, no porcentajes (así los usa costoEfectivo). El 2%
  // de otorgamiento es una fracción del desembolso: va en GASTOS_OTORGAMIENTO y en observaciones.
  comisiones: null,
  gastos: null,
  plazo_dias: PLAZO_MAXIMO_DIAS, // 18 meses (2.2.6)
  dias_minimos: null,
  limite_disponible: null, // DELIBERADO — ver el encabezado: destino excluido + desembolso al proveedor
  saldo_utilizado: null,
  amortizacion:
    'Hasta 18 meses en total (2.2.6): hasta 3 cuotas de GRACIA de capital (se pagan sólo intereses compensatorios), luego hasta 15 cuotas mensuales consecutivas de capital junto con los intereses. Los intereses se abonan en hasta 18 cuotas mensuales vencidas y se devengan desde cada desembolso sobre saldos pendientes (2.2.4.1). Las cuotas vencen el día 15 de cada mes o el hábil inmediato posterior, se pagan por transferencia a la cuenta del Fideicomiso y hay que remitir el comprobante por mail para que se impute. Sistema de amortización (francés/alemán) NO publicado.',
  fecha_debito: 'día 15 de cada mes (o el hábil inmediato posterior) — por transferencia, no por débito automático',
  garantias:
    'A satisfacción del Comité, deben cubrir la TOTALIDAD del financiamiento más intereses compensatorios, moratorios y punitorios, accesorios, daños y gastos (punto 3). Opciones: (a) CHEQUES propios o de terceros, con el librador en situación normal, sin rechazos ni fondos no recuperados, y la cuenta corriente con antigüedad mínima de 1 AÑO acreditada por nota del banco (3.1); (b) HIPOTECA en 1er grado sobre inmueble en San Juan — si es la ÚNICA garantía, su valor neto de realización debe cubrir el 150% del financiamiento, con planos sellados "APTO PARA HIPOTECAR" y sin bienes de origen sucesorio (3.2); (c) FIANZA de entidad financiera o compañía de seguros calificada por el Fiduciario (3.3); (d) FIANZA/AVAL de SGR o Fondo de Garantía inscripto, que hay que gestionar ANTES de presentar la solicitud (3.4); (e) PRENDA en 1er grado sobre rodados de hasta 5 años de antigüedad, cubriendo el 200% del financiamiento, con póliza endosada a favor de Fiduciaria antes del desembolso (3.5); (f) FIANZA PERSONAL, sólo COMPLEMENTARIA de otra, con codeudores solidarios de hasta 65 años (3.6). En TODOS los casos se suscribe además un PAGARÉ a la vista sin protesto (5.1) y el contrato de mutuo es TÍTULO EJECUTIVO (5). Las tasaciones las hace un perito designado por el Fiduciario y las paga el solicitante.',
  nivel_confianza: 'informado',
  fuente:
    'Reglamento de Condiciones — "Línea de Crédito de Asistencia Financiera para Capital de Trabajo FONDEFIN" 05-2026, ROP-Capital-de-trabajo-FONDEFIN-mayo-2026.pdf (34 págs.), descargado de fiduciariasanjuan.com/reglamentos y leído completo el 13/08/2026 · Badlar: BCRA API estadísticas monetarias v4.0 idVariable 7, valor 22,8125% del 11/08/2026, consultada 13/08/2026',
  observaciones: [
    'EL DESTINO EXCLUYE LA ACTIVIDAD DE LA EMPRESA — es lo primero que hay que saber de esta línea. El punto 2.2.3 financia "Mercadería", "insumos necesarios para brindar servicio" e "insumos o materia prima necesarios para producción", pero en la misma página excluye "Obras Civiles de Ningún tipo", definidas "sin carácter limitativo" como toda construcción, reparación, ampliación, modificación, mantenimiento o demolición de infraestructura, incluidos los "trabajos de ingeniería o arquitectura que impliquen la ejecución material de proyectos constructivos", y también "Construcción, refacción y/o compra-venta de inmuebles". Los materiales de obra de Echegaray caen del lado excluido. LECTURA DEL OS, no confirmación de la Fiduciaria: el punto 4.4 faculta al Comité a admitir excepciones justificadas, y eso se pregunta.',
    'TAMPOCO FINANCIA, por nombre expreso (2.2.3): combustibles; cargas sociales, aportes, sueldos y jornales; impuestos, servicios y FLETES; pasivos anteriores a la solicitud; deudas financieras, impositivas, laborales o previsionales; indemnizaciones; moneda extranjera, acciones y títulos; terrenos e inmuebles. Es decir: los cuatro usos típicos de un bache de caja de esta empresa están cerrados.',
    'TASA: el ROP no fija un número, fija una FÓRMULA — "60% de la Tasa Badlar en Pesos para Bancos Privados publicada por el BCRA vigente a la fecha del acta de Comité Ejecutivo que apruebe la solicitud" (2.2.4.1). {TASA} del 11/08/2026: es una FOTO, no la tasa del crédito. La Badlar osciló entre 20,875% y 22,8125% en las últimas 3 semanas → la misma línea sale entre 12,53% y 13,69% según el día del acta. Recalcular con tnaFondefin(badlar) antes de decidir con este número.',
    OBSERVACION_IVA,
    'MONTO: hasta $30.000.000 (2.2.2), que es el TECHO del reglamento y no una línea aprobada. Para responsable inscripto el monto sale de una cuenta: promedio de ventas netas de las últimas 6 DDJJ de IVA ante ARCA → margen estimado de utilidad del 40% sobre ese promedio → la CUOTA mensual (capital + intereses) no puede superar el 35% de ese margen, restando los compromisos financieros ya informados en el sistema crediticio.',
    'PLAZO: hasta 18 meses TOTALES (2.2.6), con hasta 3 cuotas de gracia de capital y hasta 15 de capital. Es un plazo corto para el tamaño del crédito: con $30.000.000 a 15 cuotas la amortización de capital sola es ~$2.000.000 por mes.',
    'COSTOS QUE NO ESTÁN EN LA TNA y hacen que el CFT real sea mayor: 2% de gastos de otorgamiento detraído del total desembolsado (DDJJ de conocimiento de condiciones, punto 8: "del total desembolsado se detraerá un dos por ciento (2%) en concepto de gastos de otorgamiento"); impuesto de sellos a cargo del tomador (4.7); todo impuesto, tasa o gravamen sobre el crédito, más los gastos de análisis —informes técnicos, tasaciones, verificaciones, auditorías— y los costos de inscripción de las garantías, TODOS deducidos del primer desembolso (4.8); y un seguro de vida sobre saldo deudor que la Fiduciaria PODRÁ contratar por cuenta y orden del tomador, a su exclusivo cargo (4.9). El ROP no publica CFT y con esto no se puede calcular: faltan los montos del seguro y de la tasación.',
    'DESEMBOLSO: por cuenta y orden del solicitante, mediante transferencia bancaria AL O LOS PROVEEDORES y al CBU que el tomador presente, recién después de firmar el mutuo y constituir las garantías (2.2.5). Máximo 3 proveedores, con presupuestos o facturas proforma en la carpeta (2.1.4); si son varios, las facturas se presentan en conjunto y las transferencias se hacen EN UN MISMO ACTO, "no pudiendo realizarse transferencias parciales". El proveedor debe tener al menos 6 meses en la actividad, no puede integrar el mismo grupo económico ni tener vínculo laboral o familiar directo con el solicitante. NUNCA es plata en la cuenta de la empresa.',
    'NO LLEVA limite_disponible, y no por una sola razón: (1) el destino de una constructora está excluido (2.2.3) y el punto 4.6 habilita a exigir el REINTEGRO INMEDIATO DEL TOTAL con mora y punitorios si la auditoría —previa o posterior— detecta el desvío; (2) aunque hubiera excepción, el desembolso va al proveedor en un solo acto, así que no tapa un bache de caja ni paga sueldos, impuestos o fletes. El comparador no la ofrece.',
    'REQUISITOS DEL SOLICITANTE: MiPyME categorizada MICRO o PEQUEÑA (Certificado MiPyME vigente), radicada y desarrollando en San Juan la actividad para la que pide el crédito, con domicilio constituido en la provincia y un mínimo de 6 meses en esa actividad. Sin inhibición, inhabilitación, concurso ni quiebra; sin deuda impositiva exigible con la Provincia (certificado de cumplimiento fiscal de menos de 15 días). CONDICIÓN CREDITICIA en dos planos que el ROP separa: (a) SISTEMA FINANCIERO — el 2.1.2 excluye a quien no tenga "situación UNO (1 normal)" en la Central de Deudores del BCRA a la fecha de presentación Y de aprobación, con informe Veraz/Nosis e informe BCRA de menos de 15 días; (b) CARTERA DE LA PROPIA FIDUCIARIA — Situación 1 o 2 (al día, o atrasos de hasta 60 días) de forma ininterrumpida los 6 meses previos. Documentación de persona jurídica: reglamento suscripto en todas sus páginas, últimas 6 DDJJ de IVA con acuses, último estado contable anual AUDITADO con firma legalizada más el acta de asamblea que lo aprueba, ACTA DE ASAMBLEA donde conste la intención de pedir el crédito con el monto y la garantía ofrecida, contrato social y actas de designación inscriptas, constancias ARCA e IIBB de menos de 15 días, constancia de CBU, nómina salarial con el último F931 presentado y pagado, y la documentación del o los proveedores (constancia ARCA y CBU).',
    'MORA: intereses moratorios a la Tasa Activa Cartera General del Banco Nación vigente al último día hábil del mes anterior al de la cancelación; punitorios del 50% de esa tasa (2.2.4.2). La mora es automática, sin necesidad de requerimiento. Los pagos se imputan PRIMERO a intereses y recién después a capital. El contrato de mutuo con garantía es título ejecutivo y la jurisdicción es la de los Tribunales Ordinarios Civiles de San Juan.',
    'CONTACTO: Fiduciaria San Juan SAPEM, Av. Córdoba 390 (E), Capital, San Juan · 0264-4211591 · WhatsApp 264-6137387 · creditos@fiduciariasanjuan.com · consultas de 8:30 a 12:30 (4.1). La carpeta se presenta en papel, tamaño A4 (4.2).',
  ].join(' ── '),
  /** Lo que la fuente NO publica. No se estima: se pregunta. */
  desconocido: [
    'si el Comité admite por excepción (4.4) financiar materiales destinados a obra civil — ES LA PREGUNTA QUE DECIDE SI LA LÍNEA SIRVE',
    'CFT — no publicado y no derivable: faltan el monto del seguro de vida sobre saldo deudor, el sellado y la tasación',
    'si el mutuo de Fiduciaria San Juan SAPEM encuadra bajo la Ley 21.526 — de eso depende que la alícuota declarada por el dueño (10,5%) sea la correcta o vuelva a ser la general del 21%: lo confirma el estudio contable, no el OS',
    'si además del IVA (10,5%, declaración del dueño del 13/08/2026 que corrigió su propio 21% del mismo día) la Fiduciaria factura alguna PERCEPCIÓN de IVA sobre los intereses — el ROP no lo trata y no se asume ni que la haya ni que no: son 1,5 puntos sobre intereses en el caso del banco',
    'si la tasa queda FIJA al acta de aprobación o se reajusta con la Badlar durante los 18 meses',
    'sistema de amortización de las cuotas (francés, alemán u otro)',
    'si el crédito cubre el presupuesto del proveedor con IVA o sólo el neto',
    'si se puede cancelar anticipadamente sin penalidad — el ROP menciona la cancelación anticipada al pasar (2.2.4.1) y no fija condiciones',
    'plazo de resolución de la solicitud — el ROP no publica ninguno; sólo los 10 días corridos que tiene el postulante para contestar un requerimiento (4.3)',
    'costo del sellado provincial aplicable al mutuo y a la garantía',
    'si el seguro de vida sobre saldo deudor se aplica a una persona jurídica y sobre quién se toma',
    'si se puede tomar esta línea teniendo simultáneamente la de Bienes de Capital del mismo Fideicomiso — el 2.1.2 lo deja "a criterio del Comité Ejecutivo"',
  ],
  /** Las preguntas concretas, en el orden en que conviene hacerlas. Cada una cambia una decisión. */
  preguntar: [
    'PRIMERO Y DECISIVA: una constructora que compra cemento, hierro y hormigón para ejecutar sus obras, ¿puede tomar Capital de Trabajo? El 2.2.3 financia "insumos o materia prima para producción" pero excluye "Obras Civiles de Ningún tipo". Si la respuesta es no, ¿el Comité admite la excepción del 4.4 y con qué justificación? — TODO lo demás depende de esto',
    '¿La tasa (60% de Badlar) queda FIJA a la fecha del acta de aprobación o se reajusta durante los 18 meses?',
    '¿Cuánto tarda hoy, en la práctica, desde que se presenta la carpeta completa hasta el desembolso? — el dueño maneja 4 meses para la otra línea y el reglamento no publica plazo',
    '¿Se puede tomar Capital de Trabajo y Bienes de Capital a la vez, o una traba a la otra? (2.1.2 lo deja a criterio del Comité)',
    '¿Se puede cancelar anticipadamente y con qué costo? — con plazo de 18 meses y tasa fija, importa',
    '¿El sellado y el seguro de vida sobre saldo deudor cuánto suman? — sin eso no hay CFT',
    '¿Con qué garantía conviene presentarse? Con cheques la cuenta corriente necesita 1 año de antigüedad; con prenda hay que cubrir el 200%; con hipoteca el 150%; ¿aceptan aval de SGR y les sirve más?',
    '¿Cuál es el monto máximo que la empresa puede pedir según sus últimas 6 DDJJ de IVA, con la cuota topeada al 35% del margen estimado?',
    'Las otras 5 líneas del organismo: ¿alguna financia obra civil o capital de trabajo de una constructora?',
  ],
}

/** La ficha con la Badlar de referencia — lo que se siembra hoy. */
export const CONDICION_FONDEFIN_CAPITAL_TRABAJO = condicionConBadlar(BADLAR_REFERENCIA.valor)

/** Las columnas que NO existen en la tabla: se sacan antes de escribir. */
export const NO_SON_COLUMNAS = ['clave', 'desconocido', 'preguntar']

/** La fila lista para `registrarCondicion`, sin los campos que no son columnas. */
export function filaParaLaTabla(cond = CONDICION_FONDEFIN_CAPITAL_TRABAJO) {
  const fila = { ...cond }
  for (const k of NO_SON_COLUMNAS) delete fila[k]
  return fila
}
