// EL LEASING DE UN UTILITARIO 0km — la alternativa que el informe de rodados no consideró.
//
// ═══ POR QUÉ EXISTE (13/08/2026) ═══
//
// El pedido original del dueño del 07/08 decía, textual: "el valor de los utilitarios q no tienen
// precio es aprox final de 25000 dolares QUE PUEDEN SER CON LEASING". El informe de compra de rodados
// comparó FONDEFIN, el UVA del Santander, el prendario de mercado, el descubierto y (después) el BNA.
// Nunca comparó leasing. No es que el leasing se haya evaluado y descartado: no se miró.
//
// Esta ficha es una VERIFICACIÓN EXTERNA NUEVA del 13/08/2026. No recupera nada del OS: no hay en el
// sistema ninguna cotización, carpeta ni oferta de leasing. Lo que el dueño tenga hablado con una
// concesionaria no está acá y no se supone — ver `PREGUNTAR_AL_DUEÑO`.
//
// ═══ EL HALLAZGO QUE ORDENA TODO: EL LEASING NO TIENE TARIFARIO, TIENE CAMPAÑAS ═══
//
// Ningún banco argentino publica una tasa permanente de leasing de utilitarios. Lo que existe son
// CAMPAÑAS con fecha de vencimiento, atadas a una feria y a un convenio con proveedores adheridos.
// El producto permanente de BICE ("Leasing productivo — Bienes nuevos") publica plazo, porcentaje
// financiable, garantía y demora, pero NO publica tasa. La tasa aparece sólo cuando hay campaña.
//
// Y hoy HAY campaña, y vence en ocho días: BICE, Expo Transporte 2026, del 11 al 21 de agosto de 2026,
// tasa fija DESDE 19,45%. Ésa es la única tasa de leasing publicada y verificable que existe hoy para
// un utilitario. La ficha entera cuelga de una ventana que se cierra el 21/08.
//
// ═══ LO QUE HACE DECISIVO AL LEASING EN ESTE CASO, Y NO ES LA TASA ═══
//
// Es la GARANTÍA. BICE publica, textual: "no requiere de garantías adicionales (ya que el bien
// adquirido actúa como tal)". FONDEFIN exige prenda en primer grado por el 200% del financiamiento:
// por dos unidades pide $120.000.000 de cobertura, las unidades aportan $58.800.000 y FALTAN
// $61.200.000 que hoy no existen. Esa falta —no la tasa— es lo que traba el plan. El leasing la
// elimina de raíz porque el bien nunca sale del patrimonio del dador: no hay nada que prendar.
//
// ═══ LAS TRES TRAMPAS DE ESTA FICHA ═══
//
// 1. EL 19,45% ES UN PISO, NO UNA TASA. El banco escribe "desde 19,45%" e "incluye bonificación de los
//    proveedores adheridos". Si el proveedor del rodado elegido no está adherido, ese número no existe.
// 2. NO ES UN CFT. No hay CFT publicado, ni gastos, ni sellado, ni seguro. La tasa real que calcula
//    este módulo es el MEJOR CASO, y está rotulada `esPiso` en todos lados.
// 3. EL MONTO MÍNIMO PUEDE MATAR LA OPERACIÓN ANTES QUE LA TASA. Las dos campañas anteriores de la
//    misma línea publicaron un mínimo de $80.000.000 por solicitante. Dos unidades a $29,4M son
//    $58,8M; dos a USD 25.000 son $75,75M. Las dos quedan POR DEBAJO. La campaña de agosto no publica
//    el mínimo — no se afirma que lo tenga ni que no lo tenga: se pregunta antes de contar con ella.

import { tasaReal, inflacionDeTrabajo, cuadroFrances, valorPresente } from './rodados-plan.mjs'

/** La fecha en que se leyeron las páginas oficiales. Todo lo de acá abajo es la foto de ese día. */
export const LEIDO_EL = '2026-08-13'

const DIA_MS = 86400000
const MESES_ANIO = 12
const aDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
const aIso = (d) => d.toISOString().slice(0, 10)

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LA CAMPAÑA — la única tasa de leasing publicada hoy, y su fecha de muerte
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LA CAMPAÑA DE BICE, transcripta de la nota oficial del banco del 10/08/2026.
 *
 * `vence_el` NO es una convención del OS como en la ficha del BNA: es la fecha que publica el propio
 * banco. Por eso acá no hay `VALIDEZ_LECTURA_DIAS` — no hace falta inventar una caducidad cuando la
 * fuente trae la suya.
 *
 * `tna_es_piso: true` es el campo más importante del objeto: el banco escribe "desde 19,45%".
 */
export const CAMPANA_BICE = {
  entidad: 'BICE — Banco de Inversión y Comercio Exterior',
  marco: 'Expo Transporte 2026',
  tna: 0.1945,
  tna_es_piso: true,
  tasa_fija: true,
  desde_el: '2026-08-11',
  vence_el: '2026-08-21',
  publicada_el: '2026-08-10',
  cupo_total: 20_000_000_000,
  tope_por_cliente: 6_500_000_000,
  plazo_meses: 36, // "hasta 3 años"
  financia: 1, // "100% del monto total"
  anticipo: 0, // "no requiere ... un desembolso inicial por parte de los clientes"
  bienes: 'camiones, semirremolques, utilitarios, buses, minibuses y pickups, incluyendo también otros equipamientos como grúas y autoelevadores',
  garantias_adicionales: false, // "no requiere de garantías adicionales (ya que el bien adquirido actúa como tal)"
  fuente: 'BICE — bice.com.ar/bice-lanza-una-linea-de-leasing-por-20000-millones-para-impulsar-la-competitividad-del-transporte-de-carga-y-la-logistica/, publicada el 10/08/2026, leída el 13/08/2026',
}

/**
 * NÚCLEO PURO: ¿la campaña está viva a una fecha dada, y cuántos días quedan?
 *
 * Devuelve `dias_restantes` NEGATIVO cuando ya venció, en vez de cero: la diferencia entre "vence hoy"
 * y "venció hace tres semanas" cambia si vale la pena llamar al banco.
 * @param {string|Date} hoy
 */
export function estadoDeLaCampana(hoy = new Date(), campana = CAMPANA_BICE) {
  const h = aDate(typeof hoy === 'string' ? hoy : aIso(hoy))
  if (Number.isNaN(h.getTime())) return null
  const desde = aDate(campana.desde_el)
  const hasta = aDate(campana.vence_el)
  const dias = Math.round((hasta.getTime() - h.getTime()) / DIA_MS)
  return {
    desde_el: campana.desde_el,
    vence_el: campana.vence_el,
    abierta: h.getTime() >= desde.getTime() && h.getTime() <= hasta.getTime(),
    ya_venció: h.getTime() > hasta.getTime(),
    todavía_no_abrió: h.getTime() < desde.getTime(),
    dias_restantes: dias,
  }
}

/**
 * LO QUE PUBLICA EL PRODUCTO PERMANENTE de BICE, que NO es lo mismo que la campaña.
 *
 * Está separado a propósito: la campaña trae la tasa y muere el 21/08; el producto permanente NO trae
 * tasa pero trae plazo, garantía y demora, y sigue existiendo el 22/08. Mezclarlos daría una ficha
 * con la tasa de la campaña y el plazo del producto permanente — una línea que no existe en ningún
 * lado. Las diferencias son reales: 5 años contra 3, y $3.500M de tope PyME contra $6.500M.
 */
export const PRODUCTO_PERMANENTE_BICE = {
  entidad: 'BICE — Banco de Inversión y Comercio Exterior',
  producto: 'Leasing productivo — Bienes nuevos',
  tna: null, // NO PUBLICA TASA
  plazo_meses_max: 60, // "hasta 5 años dependiendo del tipo de bien"
  tope_pyme: 3_500_000_000,
  tope_gran_empresa: 6_500_000_000,
  financia: 1, // "hasta el 100% del bien"
  garantia_textual: 'La garantía es el propio bien · Usualmente no se requiere garantía adicional ya que el bien actúa como tal',
  opcion_de_compra_textual: 'Al finalizar el contrato el cliente puede ejercer la opción de compra por un valor determinado, transcurrido el 75% del plazo',
  demora_dias: 15, // "Se aprueba la operación dentro de los 15 días"
  origen_del_bien: 'Los bienes deben ser nacionales o importados nacionalizados',
  disclaimer: 'Operaciones sujetas a previo cumplimiento de requisitos comerciales, crediticios y legales',
  fuente: 'BICE — bice.com.ar/leasing-productivo-bienes-nuevos/, leída el 13/08/2026',
}

/**
 * EL MONTO MÍNIMO — el dato que puede dejar afuera a Echegaray antes de que la tasa importe.
 *
 * `publicado_en_la_campana_de_agosto: null` no es un descuido: la nota del 10/08 no lo menciona. Las
 * dos campañas anteriores de la MISMA línea sí lo publicaron, y es el mismo número en las dos. No se
 * traslada como si fuera el de agosto —eso sería mezclar ventanas— pero tampoco se ignora: es la
 * primera pregunta que hay que hacer.
 */
export const MONTO_MINIMO = {
  publicado_en_la_campana_de_agosto: null,
  anclas: [
    { monto: 80_000_000, fecha: '2026-06-03', fuente: 'BICE — campaña Agroactiva 2026: "mínimo $80 millones ... por solicitante"' },
    { monto: 80_000_000, fecha: '2026-03-16', fuente: 'BICE — campaña de leasing para flota y equipamiento logístico: "$80 millones neto de IVA o equivalente en dólares"' },
  ],
}

/**
 * NÚCLEO PURO: ¿la operación alcanza el mínimo que pidieron las campañas anteriores?
 *
 * Devuelve `alcanza: null` cuando el mínimo de la campaña vigente no está publicado — que es SIEMPRE
 * hoy. El `null` es la respuesta correcta: no se puede afirmar que entre ni que no entre. Lo que sí se
 * puede afirmar, y por eso viaja en `contra_el_ancla`, es que con el mínimo histórico NO entraría.
 * @param {number} monto lo que se quiere financiar, en pesos
 */
export function alcanzaElMinimo(monto, minimoVigente = MONTO_MINIMO.publicado_en_la_campana_de_agosto) {
  const m = Number(monto)
  if (!Number.isFinite(m) || m <= 0) return null
  const ancla = MONTO_MINIMO.anclas[0].monto
  return {
    monto: m,
    minimo_vigente: minimoVigente,
    alcanza: minimoVigente == null ? null : m >= Number(minimoVigente),
    motivo: minimoVigente == null
      ? 'la campaña de agosto de 2026 no publica monto mínimo: no se puede afirmar que la operación entre'
      : null,
    contra_el_ancla: { minimo: ancla, alcanza: m >= ancla, fecha_del_ancla: MONTO_MINIMO.anclas[0].fecha },
    faltante_contra_el_ancla: Math.max(0, ancla - m),
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// EL IVA DEL CANON — donde el leasing pierde contra la compra, al revés de lo que dice el folleto
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * QUE EL CANON ESTÁ GRAVADO ES UN HECHO VERIFICADO. CON QUÉ ALÍCUOTA, NO.
 *
 * Verificado: el Decreto Reglamentario 1038/2000, art. 9, encuadra los cánones en el punto 7 del
 * inciso e) del art. 3 de la Ley de IVA (locación de cosa mueble) y la opción de compra en el inciso
 * a) del art. 2 (venta de cosa mueble). O sea: el canon lleva IVA, y el hecho imponible se perfecciona
 * mes a mes, "al devengarse el pago o en el de su percepción, el que fuera anterior".
 *
 * NO verificado contra la norma: la alícuota. La doctrina consultada (iProfesional, AutoCorp) sostiene
 * que el canon tributa SIEMPRE al 21% general, y que la alícuota reducida del 10,5% del art. 28 de la
 * Ley de IVA aplica a la COMPRA o importación del bien de capital pero NO a los cánones. Si eso es
 * cierto, y para una pick-up o utilitario liviano que comprado directo tributaría 10,5%, el leasing
 * DUPLICA la alícuota sobre el mismo fierro — exactamente lo contrario del "beneficio impositivo" que
 * publicita el folleto del banco.
 *
 * Por eso el campo va en `null` y el 21% vive como CANDIDATO con su fuente, no como dato. La alícuota
 * la firma el estudio contable, no el OS.
 */
export const IVA_SOBRE_EL_CANON = null

/** Los dos candidatos de alícuota, con su fuente. Ninguno es "el dato": son las dos hipótesis. */
export const CANDIDATOS_IVA_CANON = [
  {
    alicuota: 0.21,
    quien_lo_sostiene: 'doctrina — iProfesional ("la alícuota será del 21% aunque el bien de capital, de adquirirse al inicio y no vía leasing, tributaría el 10,5%") y AutoCorp ("la alícuota reducida es por la compra o importación de los bienes y no para los cánones del leasing")',
    fuentes: [
      'https://www.iprofesional.com/finanzas/102304-conozca-las-diez-claves-sobre-el-leasing-y-cuales-son-las-ventajas-impositivas-que-ofrece',
      'https://autocorp.com.ar/blog/gestion-de-flotas/iva-en-camionetas-y-utilitarios-que-deben-saber-las-empresas/',
    ],
    es_el_mas_probable: true,
  },
  {
    alicuota: 0.105,
    quien_lo_sostiene: 'hipótesis contraria — el Dictamen DAT 100/02 de la DGI trata expresamente "contrato de leasing, bienes de capital, alícuota reducida". No se leyó el texto del dictamen: se sabe que el tema fue objeto de consulta, no cómo se resolvió',
    fuentes: ['https://trivia.consejo.org.ar/ficha/18259-dictamen_dat_10002.'],
    es_el_mas_probable: false,
  },
]

/**
 * EL IVA DEL CANON NO ES UN COSTO — ES UN CALENDARIO. Y por eso NO entra a la tasa.
 *
 * Para un responsable inscripto el IVA del canon es crédito fiscal computable: se recupera. Cargarlo
 * sobre la TNA como se hace con el IVA sobre intereses de FONDEFIN (10,5%) sería contarlo como costo
 * y además sobre la base equivocada — el IVA del leasing va sobre el CANON ENTERO (capital +
 * interés), no sobre el interés.
 *
 * CONSECUENCIA QUE HAY QUE DECIR EN VOZ ALTA: la comparación de tasas reales contra FONDEFIN queda
 * ASIMÉTRICA, y la asimetría favorece al leasing. FONDEFIN entra al ranking con su TNA recargada por
 * un IVA que TAMBIÉN es recuperable, y el leasing entra sin recargo. Por eso `rankingReal` devuelve
 * las dos lecturas: la del criterio del comparador vigente y la del criterio homogéneo (ambas sin
 * IVA). Con criterio homogéneo FONDEFIN sigue ganando, y eso es lo que había que verificar antes de
 * recomendar nada.
 */
export const EL_IVA_DEL_CANON_ENTRA_A_LA_TASA = false

/**
 * LO QUE BICE VENDE COMO VENTAJA Y PARA ESTA EMPRESA PUEDE SER LO CONTRARIO.
 *
 * El banco publicita "diferir el IVA durante todo el período del préstamo". Diferir un CRÉDITO fiscal
 * es una ventaja para quien está en posición de SALDO A FAVOR permanente —ahí el crédito de golpe se
 * queda trabado— y es una desventaja para quien está en posición de DÉBITO, porque el crédito que hoy
 * le bajaría el IVA a pagar recién llega en cuotas.
 *
 * INFERENCIA, no hecho: el OS registra a Echegaray en posición de IVA A PAGAR (Cuadro 4 del Flujo,
 * IVA $19,4M después de imputar retenciones sufridas). Si eso se sostiene, el diferimiento del IVA
 * NO es un beneficio para esta empresa: es una postergación de un crédito que hoy le sirve. Se
 * declara como inferencia con su base y se manda al estudio contable — no se usa para decidir.
 */
export const DIFERIMIENTO_DEL_IVA = {
  lo_que_publicita_el_banco: 'diferir el IVA durante todo el período del préstamo',
  a_quien_beneficia: 'a quien está en posición de saldo a favor permanente de IVA',
  a_quien_perjudica: 'a quien está en posición de débito: el crédito fiscal que hoy le bajaría el IVA a pagar llega en 36 cuotas',
  posicion_de_echegaray: 'DÉBITO (IVA a pagar) según el Cuadro 4 del Flujo de Fondos',
  clasificacion: 'INFERENCIA',
  resuelve: 'estudio contable',
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// EL TRATAMIENTO FISCAL — verificado contra la norma, con lo que quedó sin verificar declarado
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LO QUE SÍ SE VERIFICÓ CONTRA EL TEXTO DE LA NORMA el 13/08/2026, leyendo el texto actualizado del
 * Decreto Reglamentario 1038/2000 en argentina.gob.ar.
 *
 * Cada entrada dice el artículo. Un encuadre fiscal sin artículo es una opinión.
 */
export const TRATAMIENTO_FISCAL_VERIFICADO = [
  {
    tema: 'Ganancias — deducción del canon',
    norma: 'Decreto Reglamentario 1038/2000, art. 6',
    que_dice: 'los tomadores que afecten los bienes a la producción de ganancias gravadas "computarán como deducción el importe de los cánones imputables a cada ejercicio fiscal, hasta el momento en que ejerzan la opción de compra o finalización del contrato"',
    consecuencia: 'el canon ENTERO (capital + interés) es gasto deducible, contra una compra financiada donde sólo se deducen la amortización del bien y los intereses',
  },
  {
    tema: 'Ganancias — plazo mínimo del contrato',
    norma: 'Decreto Reglamentario 1038/2000, art. 2 (modificado por Decreto 152/2022, B.O. 29/03/2022)',
    que_dice: 'para que la operación se trate como financiera el contrato debe durar "al menos igual al CINCUENTA POR CIENTO (50%) de la vida útil del bien". Para automotores la Tabla Anexa fija 5 años de vida útil',
    consecuencia: 'el mínimo son 30 meses. Los 36 meses de la campaña de BICE lo cumplen; un contrato a 24 meses NO, y perdería el encuadre',
  },
  {
    tema: 'Ganancias — la trampa de la opción de compra barata',
    norma: 'Decreto Reglamentario 1038/2000, art. 7',
    que_dice: 'cuando el precio de la opción de compra sea INFERIOR al costo computable del bien, "la operación se tratará, respecto de ambas partes, como una venta financiada"',
    consecuencia: 'una opción de compra simbólica CONVIERTE el leasing en una compra financiada a efectos fiscales y hace desaparecer la deducción del canon entero. Es la razón por la que el valor residual no es un detalle del final: define el encuadre desde el día uno',
  },
  {
    tema: 'IVA — el canon',
    norma: 'Decreto Reglamentario 1038/2000, art. 9',
    que_dice: 'los cánones quedan "comprendidos en el punto 7 del inciso e) del artículo 3" de la Ley de IVA (locación de cosa mueble), y el hecho imponible se perfecciona "al devengarse el pago o en el de su percepción, el que fuera anterior"',
    consecuencia: 'el IVA se factura MES A MES sobre cada canon, no todo al inicio como en la compra',
  },
  {
    tema: 'IVA — la opción de compra',
    norma: 'Decreto Reglamentario 1038/2000, art. 9',
    que_dice: 'el ejercicio de la opción queda incluido en "el inciso a) del artículo 2" (venta de cosa mueble)',
    consecuencia: 'al ejercer la opción hay una segunda operación gravada, sobre el valor residual',
  },
]

/**
 * EL TOPE QUE PUEDE BORRAR TODA LA VENTAJA FISCAL DE UN PLUMAZO — y por qué probablemente no aplica.
 *
 * El art. 88 inc. l) de la Ley de Ganancias niega la deducción de amortizaciones y de alquileres
 * "incluidos los derivados de contratos de leasing" de AUTOMÓVILES, en la medida en que excedan lo que
 * correspondería a un automóvil de $20.000 netos de IVA. Ese tope es nominal, de 1998, y nunca se
 * actualizó: sobre un vehículo de $29.400.000 deja deducible menos del 0,1% del canon. Si el rodado
 * fuera un "automóvil", la ventaja fiscal del leasing —el argumento entero— se evapora. Y el mismo
 * corte se replica en el crédito fiscal de IVA (art. 12 inc. a) de la Ley de IVA).
 *
 * LA SALIDA, Y ES POR DEFINICIÓN, NO POR INTERPRETACIÓN: "automóvil" no significa "vehículo". La
 * definición que toma la ley fiscal es la de la Ley de Tránsito 24.449, art. 5: "automotores para el
 * transporte de personas de hasta ocho plazas, excluido el conductor, con cuatro o más ruedas, y los
 * de tres ruedas que excedan los mil kilogramos". Una pick-up de carga cabina simple y un furgón NO
 * transportan personas: no son automóviles y quedan fuera del tope.
 *
 * PERO EL RODADO CONCRETO NO ESTÁ CLASIFICADO. La segunda unidad del pedido —"utilitarios ... aprox
 * final de 25000 dólares"— no tiene modelo ni carrocería definidos. Si terminara siendo una doble
 * cabina de 5 plazas, la discusión se abre. Quien firma la clasificación es el estudio contable.
 */
export const TOPE_AUTOMOVILES = {
  norma: 'Ley de Impuesto a las Ganancias, art. 88 inc. l) — y su espejo en el crédito fiscal, Ley de IVA art. 12 inc. a)',
  tope: 20_000,
  tope_es_neto_de_iva: true,
  nunca_se_actualizo: true,
  alcanza_al_leasing: true, // "el alquiler de los mismos (incluidos los derivados de contratos de leasing)"
  definicion_de_automovil: 'Ley de Tránsito 24.449, art. 5: automotores para el transporte de personas de hasta ocho plazas, excluido el conductor, con cuatro o más ruedas, y los de tres ruedas que excedan los mil kilogramos',
  queda_afuera_un_utilitario_de_carga: true,
  verificado: false,
  quien_lo_firma: 'estudio contable — el OS no clasifica un rodado a efectos fiscales',
  fuentes: [
    'https://www.econlink.com.ar/gastos-automotor-impuesto-ganancias-iva',
    'https://www.argentina.gob.ar/normativa/nacional/decreto-1038-2000-64908/actualizacion',
  ],
}

/**
 * NÚCLEO PURO: ¿el tope del art. 88 inc. l) muerde? Devuelve `null` cuando no se sabe qué es el
 * vehículo — que es el estado real de la segunda unidad del pedido.
 *
 * @param {'automovil'|'utilitario_de_carga'|null} clasificacion
 * @param {number} precioNeto precio del bien neto de IVA
 */
export function topeDeDeduccion(clasificacion, precioNeto) {
  const p = Number(precioNeto)
  if (clasificacion == null) {
    return { muerde: null, motivo: 'el vehículo no está clasificado: sin carrocería definida no se sabe si es "automóvil" a efectos del art. 88 inc. l)' }
  }
  if (clasificacion === 'utilitario_de_carga') {
    return { muerde: false, motivo: 'no transporta personas: no encuadra en la definición del art. 5 de la Ley 24.449 y el canon se deduce entero', proporcion_deducible: 1 }
  }
  if (clasificacion !== 'automovil') return { muerde: null, motivo: `clasificación desconocida: "${clasificacion}"` }
  if (!Number.isFinite(p) || p <= 0) return { muerde: null, motivo: 'sin precio neto no se puede calcular la proporción deducible' }
  return {
    muerde: p > TOPE_AUTOMOVILES.tope,
    motivo: `el tope de $${TOPE_AUTOMOVILES.tope.toLocaleString('es-AR')} nunca se actualizó: sobre un bien de $${Math.round(p).toLocaleString('es-AR')} deja deducible una fracción despreciable del canon`,
    proporcion_deducible: Math.min(1, TOPE_AUTOMOVILES.tope / p),
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LA TASA REAL — Fisher, y sólo sobre lo que existe
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * EL ÚNICO LEASING DE TODO EL BARRIDO CON CFT PUBLICADO — y está VENCIDO.
 *
 * Programa "Ford Go", dador Banco Comafi (unidad TCC), letra legal de concesionario oficial con
 * vigencia declarada del 01/06/2026 al 30/06/2026. Hoy NO es una oferta: es la única medida
 * verificable de cuánto cuesta un leasing de mercado cuando el número se publica entero.
 *
 * POR QUÉ IMPORTA MÁS QUE CUALQUIER OTRA COSA DE ESTE MÓDULO: pone el 19,45% de BICE en escala. Un
 * leasing de mercado, sin subsidio ni convenio estatal, cotizaba 29,00% de TNA y **44,33% de CFT** —
 * quince puntos de TNA por encima de la campaña, y el CFT casi duplica la TNA. Ése es el orden de
 * magnitud de lo que la campaña de BICE NO publica: sus gastos, su fee de otorgamiento, su seguro.
 *
 * NO se usa para estimar el CFT de BICE. Se usa para saber cuánto puede faltar.
 */
export const ANCLA_FORD_COMAFI = {
  entidad: 'Ford Go — dador Banco Comafi (unidad TCC)',
  vigencia_declarada: { desde: '2026-06-01', hasta: '2026-06-30' },
  vigente_hoy: false,
  modelos: 'Ranger, Transit y Territory',
  variantes: [
    { cuotas: 36, estructura: '35 cánones + opción de compra', tna: 0.29, tea: 0.3318, cft_tna: 0.3726, cft: 0.4433, canon_por_millon: 41_906, opcion_de_compra_por_millon: 41_906 },
    { cuotas: 48, estructura: '47 cánones + opción de compra', tna: 0.305, tea: 0.3515, cft_tna: 0.3792, cft: 0.4525, canon_por_millon: 36_297, opcion_de_compra_por_millon: 36_297 },
  ],
  anticipo: 0, // "canon inicial $0,00"
  fee_de_otorgamiento: 0.018, // 1,8% de la suma de cánones, + IVA
  aplica_a: 'cartera comercial — personas jurídicas o personas físicas con actividad comercial',
  cuidado: 'la cuota de Ford Go incluye "canon fijo + porción variable por servicios" con seguro todo riesgo y mantenimiento preventivo: NO es comparable canon contra canon con un leasing pelado sin antes descontar los servicios',
  fuente: 'letra legal de concesionario oficial — maipuford.com.ar/legal-leasing-transit/, vigencia declarada 01/06/2026–30/06/2026, leída el 13/08/2026',
}

/**
 * EL VALOR RESIDUAL, QUE NINGÚN BANCO PUBLICA Y EL MERCADO SÍ MUESTRA.
 *
 * No existe un valor residual promedio publicado por el sector: se buscó en el informe trimestral de
 * Leasing Argentina, en la asociación y en las páginas de producto de BICE, Provincia Leasing, Comafi,
 * Macro, Galicia, San Juan e Inverlease. Lo que hay son evidencias de oferentes concretos, y todas
 * apuntan al mismo lado: residual BAJO.
 *
 * Y ESO NO ES UNA BUENA NOTICIA AUTOMÁTICA. Un residual simbólico significa que el canon amortiza casi
 * todo el bien —o sea que el residual NO es una palanca para bajar la cuota, como sí lo es en el
 * renting— y además dispara el art. 7 del Decreto 1038/2000: si la opción queda por debajo del costo
 * computable, la operación se trata como VENTA FINANCIADA y se cae la deducción del canon entero, que
 * es la ventaja fiscal por la que se elige el leasing. Con un residual de un solo canon (~4%), ese
 * riesgo no es teórico. Es la pregunta al estudio contable.
 *
 * Se descartó explícitamente el dato que aparece alto en los buscadores ("el residual supera el 40%
 * del valor del auto"): es de una nota de 2009.
 */
export const VALOR_RESIDUAL_DE_MERCADO = {
  hay_dato_sectorial_publicado: false,
  evidencias: [
    { quien: 'Ford Go / Comafi', residual: 'un (1) canon mensual', proporcion_aprox: 0.042, plazo: 36, fuente: 'maipuford.com.ar/legal-leasing-transit/ — sobre $1.000.000 financiados, canon $41.906 y opción de compra $41.906' },
    { quien: 'Ford Go / Comafi', residual: 'un (1) canon mensual', proporcion_aprox: 0.036, plazo: 48, fuente: 'ídem — canon $36.297 y opción de compra $36.297' },
    { quien: 'BBVA Argentina', residual: 'el precio de la opción de compra es cercano al 5% o 30%', proporcion_aprox: null, plazo: null, fuente: 'bbva.com.ar/empresas/productos/financiacion/leasing-financiero-operativo.html — el único rango publicado por un banco' },
    { quien: 'BICE', residual: 'un valor determinado, ejercible transcurrido el 75% del plazo', proporcion_aprox: null, plazo: null, fuente: 'bice.com.ar/leasing-productivo-bienes-nuevos/ — sin porcentaje' },
  ],
  inferencia: 'la práctica argentina de leasing financiero de rodados es canon que amortiza casi todo el bien más una opción simbólica de ~1 canon (4–5%). El residual NO baja la cuota',
  confianza: 'media-alta',
  riesgo_fiscal: 'un residual por debajo del costo computable convierte el leasing en venta financiada (art. 7 Decreto 1038/2000) y borra la deducción del canon entero',
  descartado: 'la cifra de "más del 40% del valor" que circula en buscadores proviene de una nota de La Nación de 2009: no se usa',
}

/**
 * EL PLAZO, MEDIDO SOBRE EL MERCADO REAL — no sobre el máximo que publica un folleto.
 * Informe trimestral de Leasing Argentina (la asociación del sector), Q2 2026, publicado el 12/08/2026:
 * un día antes de esta lectura. Es el dato más fresco de todo el módulo.
 */
export const MERCADO_DE_LEASING = {
  periodo: '2026-Q2',
  publicado_el: '2026-08-12',
  plazo_promedio_meses: 31,
  plazo_promedio_anterior_meses: 39, // dic-2025
  cartera_usd: 802_000_000,
  transporte_y_logistica_de_la_cartera: 0.655,
  participacion_pyme: 0.503,
  financiero_vs_operativo: { financiero: 0.93, operativo: 0.07 },
  mora_leasing: 0.035,
  mora_prendaria: 0.051,
  fuentes: [
    'https://www.infoban.com.ar/12/08/2026/el-leasing-marco-nuevo-record-tras-10-trimestres-consecutivos-de-crecimiento/',
    'https://www.ambito.com/economia/el-leasing-acelera-y-alcanza-su-mejor-nivel-casi-ocho-anos-n6310382',
  ],
  lectura: 'el plazo de mercado real está en 24–36 meses (promedio 31). Los 36 de la campaña de BICE están en el borde alto de la práctica, no son un plazo corto — y quedan a 6 meses del piso fiscal de 30',
}

/**
 * EL MATIZ QUE PUEDE DESARMAR LA VENTAJA ENTERA, Y POR ESO NO SE ESCONDE.
 *
 * BICE publica que no requiere garantías adicionales porque el bien actúa como tal. PERO una fuente
 * OFICIAL DEL ESTADO —la ficha del programa FONDAGRO en argentina.gob.ar, sobre el mismo leasing de
 * BICE— menciona entre las garantías la FIANZA DE SOCIOS O ACCIONISTAS para personas jurídicas.
 *
 * No hay prenda sobre el bien. Puede haber garantía personal sobre el patrimonio de los socios. Son
 * dos cosas distintas y la segunda no aparece en el folleto. Para una S.A. familiar la diferencia no
 * es menor: cambia quién responde si la operación se cae.
 *
 * NO se resuelve leyendo: las dos fuentes son oficiales y dicen cosas distintas. Se pregunta, y hasta
 * que se responda la ventaja de garantía queda declarada CON ESTE ASTERISCO.
 */
export const FIANZA_DE_SOCIOS = {
  lo_que_dice_el_banco: 'no requiere de garantías adicionales (ya que el bien adquirido actúa como tal) — bice.com.ar',
  lo_que_dice_el_estado: 'las garantías incluyen fianza de socios o accionistas en personas jurídicas — argentina.gob.ar/agricultura/fondagro/leasing-pymes-y-grandes-empresas-banco-bice',
  se_contradicen: true,
  resuelto: false,
  por_que_importa: 'no hay prenda sobre el bien, pero puede haber garantía PERSONAL de los socios. Es la diferencia entre arriesgar la unidad y arriesgar el patrimonio de los dueños',
  se_pregunta_a: 'el oficial de cuentas de BICE, por escrito, antes de firmar',
}

/**
 * LAS OTRAS DOS PUERTAS QUE APARECIERON EN EL BARRIDO Y NO SON LEASING.
 * Se documentan acá porque una de ellas puede ser más barata que todo lo demás, y dejarla afuera de
 * un informe de decisión de compra por no encajar en el título sería un error de alcance, no de rigor.
 */
export const OTRAS_PUERTAS = [
  {
    que: 'Banco San Juan — Leasing',
    tna: null,
    detalle: 'plazo "desde 50% vida útil del bien hasta 48 meses", hasta 100% del bien, pesos, sistema francés. Exige ser cliente con cuenta, calificación crediticia con márgenes suficientes y factura proforma del bien',
    hueco: 'la página habla de "bienes de capital" y NO dice explícitamente rodados ni utilitarios: hay que preguntarlo',
    fuente: 'bancosanjuan.com/empresas/financiacion/leasing, leída el 13/08/2026',
    por_que_importa: 'es el banco de la plaza: cercanía, y la relación ya existe',
  },
  {
    que: 'Programa provincial San Juan — línea bienes de capital en general',
    tna: 0.132,
    detalle: 'hasta $150.000.000, 48 meses, 6 meses de gracia de capital, tasa = 60% de la Badlar (≈13,2% TNA al momento del anuncio del 27/05/2026). Es un CRÉDITO, no un leasing: probablemente con prenda',
    hueco: 'NO está publicado si "bienes de capital en general" incluye rodados o utilitarios — y ése es exactamente el dato que decide',
    fuente: 'anuncio del Gobernador Orrego del 27/05/2026 · sisanjuan.gob.ar devolvió 403; datos de prensa provincial concordante (diariolaprovinciasj.com)',
    por_que_importa: 'a 13,2% de TNA nominal en pesos aplasta a cualquier leasing bancario del país, incluida la campaña de BICE. Si admite rodados, es la primera puerta a golpear — y comparte la fórmula de tasa de FONDEFIN (60% de la Badlar)',
  },
  {
    que: 'Stellantis (Fiat/Peugeot/Citroën/Jeep/RAM) + BBVA — leasing en DÓLARES',
    tna: 0.1075,
    detalle: '10,75% TNA en dólares, hasta 90% del valor, 24/36/48 meses, exclusivo personas jurídicas',
    hueco: 'EXIGE cumplir la Comunicación A 4015 del BCRA: financiación en dólares reservada a quien genera ingresos en dólares. Una constructora que factura 100% en pesos casi con seguridad NO califica — y tomar deuda en dólares sin ingresos en dólares sería asumir riesgo de tipo de cambio sobre el resultado de la obra',
    fuente: 'media.stellantis.com — comunicado del 18/07/2025, vigencia no declarada',
    por_que_importa: 'la tasa parece imbatible y no lo es: está en otra moneda y con otro riesgo. Se documenta para que nadie la traiga como opción sin el asterisco',
  },
]

/**
 * NÚCLEO PURO: la TEA que capitaliza mensualmente una TNA. Es la misma convención que usa
 * `compararFuentes` en rodados-plan cuando la entidad no publica CFT, y se replica acá para que las
 * dos columnas del ranking se puedan leer una al lado de la otra.
 *
 * BICE no publica el período de capitalización. La mensual es la convención del comparador y se
 * declara como tal: `origen: 'TEA derivada de la TNA con capitalización mensual (supuesto)'`.
 */
// EL PORTÓN NO ES `Number.isFinite(Number(tna))`: `Number(null)` es 0 y `Number('')` también, así que
// una tasa ausente entraba como 0% y salía como "TEA 0%" — una línea sin tasa publicada convertida en
// una línea gratis. Se corta ANTES de convertir.
export const teaDeLaTna = (tna) =>
  (tna == null || tna === '' || !Number.isFinite(Number(tna))
    ? null
    : (1 + Number(tna) / MESES_ANIO) ** MESES_ANIO - 1)

/**
 * NÚCLEO PURO: la tasa real de una línea de leasing por Fisher exacto, `(1+nominal)/(1+inflación)−1`.
 * NO reimplementa Fisher: importa `tasaReal` de rodados-plan.mjs, que es donde vive. Lo que agrega es
 * el portón: con `nominal` en null devuelve `null` en vez de propagar un NaN con cara de número.
 */
export function tasaRealLeasing(nominalAnual, inflacionAnual = inflacionDeTrabajo().anual) {
  if (nominalAnual == null || !Number.isFinite(Number(nominalAnual))) return null
  if (!Number.isFinite(Number(inflacionAnual))) return null
  return tasaReal(Number(nominalAnual), Number(inflacionAnual))
}

/**
 * DÓNDE QUEDA EL LEASING EN EL RANKING DE COSTO REAL.
 *
 * Devuelve DOS lecturas del leasing de BICE y las dos son necesarias:
 *
 *  · `criterio_del_comparador` — la TEA derivada de la TNA sin recargo de IVA, que es como el leasing
 *    entra al ranking existente. Comparable con FONDEFIN tal como está cargado hoy.
 *  · `criterio_homogeneo` — la misma cuenta, pero midiendo también a FONDEFIN sin su recargo de IVA.
 *    Existe porque el IVA sobre intereses de FONDEFIN también es recuperable, y el ranking vigente lo
 *    trata como costo. Sin esta segunda columna, la comparación premia al leasing por una asimetría de
 *    criterio y no por ser más barato.
 *
 * Las dos son PISO: no hay CFT publicado de ninguna de las dos líneas.
 */
export function rankingReal(inflacionAnual = inflacionDeTrabajo().anual) {
  const tea = teaDeLaTna(CAMPANA_BICE.tna)
  const teaFondefinSinIva = teaDeLaTna(FONDEFIN_PARA_COMPARAR.tna)
  return {
    leasing_bice: {
      linea: 'BICE — Leasing Expo Transporte 2026 (campaña, vence 21/08/2026)',
      base: 'TEA derivada de la TNA "desde 19,45%" con capitalización mensual (supuesto). NO hay CFT publicado',
      nominal: tea,
      tasa_real: tasaRealLeasing(tea, inflacionAnual),
      es_piso: true,
      por_que_es_piso: 'la TNA es un "desde" que incluye bonificación de proveedores adheridos, y no hay CFT, gastos de otorgamiento, sellado ni seguro publicados',
    },
    leasing_bice_permanente: {
      linea: 'BICE — Leasing productivo Bienes nuevos (producto permanente, sin campaña)',
      base: null,
      nominal: null,
      tasa_real: null,
      motivo: 'el producto permanente NO publica tasa: se cotiza caso por caso. Es lo que queda disponible después del 21/08/2026',
    },
    // EL LEASING DE MERCADO, con el ÚNICO CFT publicado que apareció en todo el barrido. Está VENCIDO
    // (junio) y por eso `vigente: false`: no es una oferta, es la vara. Y la vara dice que un leasing
    // sin convenio estatal cuesta +11% REAL, o sea que la campaña de BICE no es "el leasing": es un
    // leasing subsidiado con fecha de vencimiento.
    leasing_de_mercado_ford_comafi: {
      linea: 'Ford Go / Comafi — leasing 36 meses (CFT publicado, vigencia VENCIDA el 30/06/2026)',
      base: 'CFT 44,33%',
      nominal: ANCLA_FORD_COMAFI.variantes[0].cft,
      tasa_real: tasaRealLeasing(ANCLA_FORD_COMAFI.variantes[0].cft, inflacionAnual),
      vigente: false,
      es_piso: false, // es un CFT: por una vez, es el total
      motivo: 'no se ofrece como alternativa: la letra legal declara vigencia hasta el 30/06/2026. Entra al ranking como MEDIDA de cuánto cuesta un leasing sin convenio, para poner en escala el 19,45% de la campaña',
    },
    criterio_homogeneo: {
      nota: 'las dos líneas medidas sin recargo de IVA, porque el IVA es recuperable en ambas y cargarlo sólo en una sesga la comparación',
      leasing_bice: tasaRealLeasing(tea, inflacionAnual),
      fondefin: tasaRealLeasing(teaFondefinSinIva, inflacionAnual),
      gana: 'fondefin',
    },
  }
}

/**
 * FONDEFIN, sólo para la columna homogénea. NO es una ficha de FONDEFIN —esa vive en linea-fondefin—
 * y no se usa para nada más: es la TNA publicada, sin recargo, para poder comparar peras con peras.
 */
export const FONDEFIN_PARA_COMPARAR = { tna: 0.136875, fuente: 'linea-fondefin.mjs · 60% de la Badlar' }

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LA CUENTA EN PESOS DE HOY
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * LAS DOS REFERENCIAS DE PRECIO QUE YA ESTÁN EN EL OS. No se inventa ninguna tercera.
 * La del dueño es en dólares y se pesifica al TC oficial que ya usa el plan de rodados.
 */
export const REFERENCIAS = [
  { clave: 'dfsk-c31', detalle: 'DFSK C31 cabina simple — presupuesto real cargado en el OS', precio: 29_400_000, origen: 'rodados-plan-datos.mjs' },
  { clave: 'utilitario-usd-25k', detalle: 'utilitario sin precio cerrado — USD 25.000 al TC oficial $1.515', precio: 37_875_000, origen: 'pedido del dueño del 07/08/2026, pesificado al TC oficial $1.515' },
]

/**
 * NÚCLEO PURO: el costo de tomar un utilitario por leasing, en pesos de hoy.
 *
 * REUSA `cuadroFrances` y `valorPresente` de rodados-plan: no reimplementa ni la cuota ni el descuento.
 *
 * `iva: null` a propósito y NO es un olvido — es la decisión de `EL_IVA_DEL_CANON_ENTRA_A_LA_TASA`:
 * el IVA del canon es recuperable, no es costo, y además su alícuota no está verificada. Con `iva:
 * null` el cuadro devuelve `esPiso: true`, que es exactamente el rótulo que corresponde.
 *
 * `ahorroContraElContado` NEGATIVO significa que el leasing sale MÁS CARO que pagar al contado en
 * pesos de hoy; POSITIVO, que la tasa real negativa le gana a la inflación. Con 19,45% de TNA contra
 * 29,83% de inflación da positivo, y ése es el número que decide.
 *
 * @param {number} precioContado precio del bien
 * @param {{cuotas?:number, tna?:number, inflacionMensual?:number}} opciones
 */
export function costoEnPesosDeHoy(precioContado, {
  cuotas = CAMPANA_BICE.plazo_meses,
  tna = CAMPANA_BICE.tna,
  inflacionMensual = inflacionDeTrabajo().mensual,
} = {}) {
  const precio = Number(precioContado)
  if (!(precio > 0)) return null
  const cuadro = cuadroFrances(precio, tna, { cuotas, iva: IVA_SOBRE_EL_CANON, cftPublicado: null })
  if (!cuadro) return null
  const vp = valorPresente(cuadro.filas.map((f) => ({ k: f.k, importe: f.cuota })), inflacionMensual)
  return {
    precioContado: precio,
    financiado: precio, // el leasing financia el 100% y no exige anticipo
    anticipo: 0,
    cuotas: cuadro.cuotas,
    canonMensual: cuadro.filas[0].cuota, // francés: constante
    totalNominal: cuadro.totalPagado,
    costoFinancieroNominal: cuadro.totalPagado - precio,
    totalPesosDeHoy: vp,
    ahorroContraElContado: precio - vp,
    ivaDelCanon: null,
    esPiso: true,
    advertencia: 'PISO: la TNA es un "desde", no hay CFT publicado, y el valor residual de la opción de compra NO está publicado — no está incluido en este total',
  }
}

/** Las dos referencias corridas por el mismo motor. Lo que va al informe. */
export const costoDeCadaReferencia = (opciones = {}) =>
  REFERENCIAS.map((r) => ({ ...r, ...costoEnPesosDeHoy(r.precio, opciones) }))

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LO QUE NO PUBLICA NADIE MÁS
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * EL BARRIDO QUE DIO NEGATIVO, Y ES UN RESULTADO.
 *
 * Se buscó tasa publicada de leasing de utilitarios en la banca comercial y en las financieras de
 * marca. Ninguna publica un tarifario de leasing. Esto NO se resume como "no encontré": se declara
 * como lo que es —el leasing para utilitarios no tiene precio de lista— con el lugar donde se buscó,
 * para que nadie repita el barrido creyendo que faltó mirar.
 */
export const SIN_TASA_PUBLICADA = [
  { entidad: 'Banco Santander Argentina', ofrece_leasing: true, que_se_buscó: 'leasing PyMEs Advance y Corporativas — santander.com.ar/.../financiacion-para-la-inversion/leasing', resultado: 'tiene producto dedicado y financia "vehículos de uso comercial nuevos (pick up, utilitario, camión)", pero NO publica tasa. Las tres URLs dieron timeout desde el entorno: no se pudo leer el detalle. Es el primero al que pedirle cotización — la calificación crediticia ya existe' },
  { entidad: 'Banco de la Nación Argentina', ofrece_leasing: null, que_se_buscó: 'bna.com.ar/Empresas/Pymes/Leasing', resultado: 'la URL devuelve HTTP 500. Lo que BNA sí publica para utilitarios es un PRÉSTAMO PRENDARIO (60 meses, 100% financiable, sin tasa publicada), no leasing — ficha completa en linea-bna.mjs' },
  { entidad: 'Banco Macro', ofrece_leasing: true, que_se_buscó: 'macro.com.ar/agro/financiaciones/LP-Leasing', resultado: 'admite "Rodados" en el destino, hasta 61 MESES (el plazo máximo más largo publicado del barrido) y financia el 100% del bien MÁS el 100% del IVA — no inmoviliza el IVA. Tasa no publicada' },
  { entidad: 'Banco Galicia', ofrece_leasing: true, que_se_buscó: 'galicia.ar/empresas/financiaciones/leasing', resultado: '36 meses, 100% del bien sin desembolso inicial, canon vencido, valor residual "pactado al inicio" sin porcentaje. Tasa no publicada. La oferta dura 30 días desde la solicitud' },
  { entidad: 'BBVA Argentina', ofrece_leasing: true, que_se_buscó: 'bbva.com.ar/empresas/productos/financiacion/leasing-financiero-operativo.html', resultado: '36 meses para vehículos y el ÚNICO rango de opción de compra publicado por un banco: "cercana al 5% o 30%". Tasa no publicada' },
  { entidad: 'Banco Comafi', ofrece_leasing: true, que_se_buscó: 'comafi.com.ar — producto "Motor Leasing"', resultado: 'admite "automóviles, pick ups y utilitarios", 100% del equipo, y publica el ÚNICO dato de velocidad del barrido: "respuesta crediticia en 48 hs". Tasa y plazo no publicados. Es el dador real detrás del leasing de Ford' },
  { entidad: 'Provincia Leasing (Banco Provincia)', ofrece_leasing: true, que_se_buscó: 'provincialeasing.com.ar/leasing-sector-privado/', resultado: 'líneas a 36/48/61 meses, 100% del bien, y gestiona seguro y patentamiento dentro de la cuota. Tasa no publicada en la página de producto. Falta confirmar si opera con empresas de San Juan' },
  { entidad: 'Banco San Juan', ofrece_leasing: true, que_se_buscó: 'bancosanjuan.com/empresas/financiacion/leasing', resultado: 'hasta 48 meses, 100% del bien, sistema francés, exige cuenta, calificación y factura proforma. NO dice explícitamente si admite rodados. Tasa no publicada' },
  { entidad: 'Banco Supervielle', ofrece_leasing: true, que_se_buscó: 'supervielle.com.ar/negocios/empresas/financiacion/leasing', resultado: 'tiene el producto y no publica NINGUNA condición: ni bienes, ni plazos, ni tasa, ni montos' },
  { entidad: 'Toyota Compañía Financiera Argentina', ofrece_leasing: true, que_se_buscó: 'toyotacfa.com.ar/leasing', resultado: 'el sitio no respondió (conexión rechazada) el 13/08/2026 — NO se afirma que no publique: no se pudo leer. Vía concesionarios oficiales (indicio, no condición vigente): 100% financiable para personas jurídicas, "utilitarios hasta 1.500 kg de carga", 16 a 36 meses, tasa fija sin porcentaje. CUIDADO: la financiación "tasa 0%" que publicita Toyota es PRENDARIA, no leasing' },
  { entidad: 'Volkswagen Financial Services', ofrece_leasing: true, que_se_buscó: 'vwfs.com.ar/empresas/leasing.html', resultado: 'financia hasta el 100%, interés fijo, y al final opción de compra O DEVOLUCIÓN de las unidades. Publica los requisitos más explícitos del barrido (balances auditados, declaración de deudas financieras y de ventas, libre deuda previsional, estatuto social). Plazos y tasa no publicados' },
  { entidad: 'Renault Argentina', ofrece_leasing: false, que_se_buscó: 'renault.com.ar/legales-oportunidades.html', resultado: 'NO publica leasing. Lo que publica es prendario promocional (Kangoo 0% TNA a 24 meses con tope $13.000.000, Master 9,9% TNA a 18 cuotas con tope $25.000.000): topes demasiado bajos para una unidad 0km de hoy' },
  { entidad: 'Mercedes-Benz Compañía Financiera', ofrece_leasing: null, que_se_buscó: 'mbfonline.com.ar', resultado: 'conexión rechazada desde el entorno. Ninguna condición accesible. Relevante sólo si la unidad objetivo fuera una Sprinter o una Vito' },
  { entidad: 'Inverlease (compañía especializada)', ofrece_leasing: true, que_se_buscó: 'inverlease.com.ar', resultado: 'leasing financiero, operativo y renting de flotas: hasta 100% incluido IVA, sin garantía adicional. Plazos, tasas, anticipo y valor residual no publicados' },
  { entidad: 'BICE — producto permanente', ofrece_leasing: true, que_se_buscó: 'bice.com.ar/leasing-productivo-bienes-nuevos/', resultado: 'publica plazo, % financiable, garantía y demora, pero NO tasa' },
]

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LAS FICHAS
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const FUENTE_CAMPANA =
  'BICE — bice.com.ar/bice-lanza-una-linea-de-leasing-por-20000-millones-para-impulsar-la-competitividad-del-transporte-de-carga-y-la-logistica/ (publicada 10/08/2026, campaña vigente del 11 al 21/08/2026) · condiciones del producto en bice.com.ar/leasing-productivo-bienes-nuevos/ · antecedentes de la misma línea: bice.com.ar/agroactiva-2026-... (03/06/2026, mínimo $80M) y bice.com.ar/bice-extiende-su-campana-de-leasing-... (16/03/2026, mínimo $80M neto de IVA). Todo leído el 13/08/2026'

const FUENTE_PERMANENTE =
  'BICE — bice.com.ar/leasing-productivo-bienes-nuevos/, texto literal leído el 13/08/2026'

/**
 * LA FICHA QUE DECIDE: la campaña con tasa, con ocho días de vida.
 *
 * `tipo_financiacion: 'otro'` NO es pereza: la taxonomía de `condiciones_financieras` tiene
 * 'descubierto', 'prestamo', 'descuento_cheque', 'echeq', 'tarjeta', 'financiacion_proveedor',
 * 'pago_diferido', 'impuesto' y 'otro'. No tiene 'leasing'. Forzar 'prestamo' sería escribir en la
 * base que el bien entra al activo y que hay una deuda garantizada — que es exactamente lo que un
 * leasing NO es, y el motivo entero por el que esta ficha existe. Se carga como 'otro' y el hueco de
 * taxonomía queda declarado.
 *
 * `cft: null` con `tna` cargada: la TNA es un "desde" publicado y verificable; el CFT no existe.
 * `limite_disponible: null` la mantiene fuera del motor de tesorería: no es capital de trabajo y no
 * hay línea aprobada.
 */
export const CONDICION_LEASING_BICE_CAMPANA = {
  clave: 'bice-leasing-expo-transporte-2026',
  entidad: 'BICE — Banco de Inversión y Comercio Exterior',
  producto: 'Leasing de utilitarios y pickups — campaña Expo Transporte 2026 (VENCE EL 21/08/2026)',
  tipo_financiacion: 'otro', // la tabla no tiene 'leasing' — ver observaciones
  moneda: 'ARS',
  vigencia_desde: CAMPANA_BICE.desde_el,
  vigencia_hasta: CAMPANA_BICE.vence_el,
  tna: CAMPANA_BICE.tna,
  tea: teaDeLaTna(CAMPANA_BICE.tna),
  cft: null,
  iva_sobre_intereses: IVA_SOBRE_EL_CANON, // null: el IVA del leasing NO va sobre el interés sino sobre el canon, y es recuperable
  comisiones: null,
  gastos: null,
  plazo_dias: 1095, // "hasta 3 años"
  dias_minimos: 913, // 30 meses: el piso del art. 2 del Decreto 1038/2000 para automotores (50% de 5 años de vida útil)
  limite_disponible: null,
  saldo_utilizado: null,
  amortizacion: 'Canon mensual. El banco no publica el sistema de amortización ni el valor residual de la opción de compra ("opción de compra al final del contrato por un canon preestablecido"). El cuadro del OS se calcula por sistema francés como convención declarada, y el residual NO está incluido en ningún total.',
  fecha_debito: null,
  garantias: 'NO EXIGE GARANTÍA ADICIONAL — y es la diferencia decisiva contra FONDEFIN. Texto literal del banco: "no requiere de garantías adicionales (ya que el bien adquirido actúa como tal)". El producto permanente lo repite: "La garantía es el propio bien · Usualmente no se requiere garantía adicional ya que el bien actúa como tal". No hay prenda porque no hay nada que prendar: el bien es propiedad del dador durante todo el contrato. FONDEFIN, en cambio, exige prenda en 1er grado por el 200% del financiamiento — por dos unidades pide $120.000.000, las unidades aportan $58.800.000 y faltan $61.200.000.',
  nivel_confianza: 'informado',
  fuente: FUENTE_CAMPANA,
  observaciones: [
    'PERO LA VENTAJA DE GARANTÍA TIENE UN ASTERISCO QUE EL FOLLETO NO DICE: LA FIANZA DE SOCIOS. BICE publica que no requiere garantías adicionales. La ficha OFICIAL DEL ESTADO del mismo producto (argentina.gob.ar/agricultura/fondagro/leasing-pymes-y-grandes-empresas-banco-bice) menciona entre las garantías la FIANZA DE SOCIOS O ACCIONISTAS para personas jurídicas. Las dos fuentes son oficiales y dicen cosas distintas: no se resuelve leyendo. No hay prenda sobre el bien, pero puede haber garantía PERSONAL de los socios — que es la diferencia entre arriesgar la unidad y arriesgar el patrimonio de los dueños. Se pregunta POR ESCRITO antes de firmar, y hasta que se responda la ventaja de garantía vale con este asterisco.',
    'CUÁNTO CUESTA UN LEASING SIN CONVENIO ESTATAL: 44,33% DE CFT. Es el único CFT de leasing publicado que apareció en todo el barrido — programa Ford Go, dador Banco Comafi, letra legal de concesionario oficial con vigencia declarada del 01/06 al 30/06/2026, o sea VENCIDA. A 36 meses: TNA 29,00%, TEA 33,18%, CFT 44,33%, canon inicial $0, fee de otorgamiento 1,8% de la suma de cánones, opción de compra igual a UN canon. En tasa real Fisher eso es +11,2% POSITIVO, contra el −6,6% de la campaña de BICE. La lectura no es que Ford sea caro: es que el 19,45% de BICE es una tasa subsidiada por convenio con proveedores, con ocho días de vida, y que el CFT que BICE no publica puede estar quince puntos por encima de su TNA. Ford no se ofrece como alternativa —está vencido— sino como la vara.',
    'EL PLAZO DE 36 MESES ESTÁ EN EL BORDE ALTO DE LA PRÁCTICA, NO ES CORTO. El informe trimestral de Leasing Argentina (la asociación del sector) del Q2 2026, publicado el 12/08/2026 —un día antes de esta lectura—, mide un plazo promedio de contrato de 31 MESES, bajando desde 39 en diciembre de 2025. El mercado real trabaja entre 24 y 36 meses. Y el piso fiscal del art. 2 del Decreto 1038/2000 para automotores son 30 meses: la ventana entera entre lo que el mercado hace y lo que la ley exige es de seis meses. Un contrato a 24 meses NO califica. Datos del mismo informe que sirven de contexto: el 65,5% de la cartera de leasing del país es equipo de transporte y logística, la participación PyME pasó de 42,3% a 50,3% en un año, el 93% es leasing financiero (se compra al final, no se devuelve) y la mora del leasing (3,5%) es menor que la prendaria (5,1%).',
    'EL VALOR RESIDUAL DE MERCADO ES SIMBÓLICO — Y ESO ES UN RIESGO FISCAL, NO UNA GANGA. No existe dato sectorial publicado de valor residual en Argentina. Lo que hay son tres evidencias y todas apuntan bajo: Ford/Comafi publica opción de compra igual a UN canon (≈4,2% a 36 meses, ≈3,6% a 48), BBVA publica "cercana al 5% o 30%", y BICE no publica porcentaje. Consecuencia uno: el residual NO es una palanca para bajar la cuota como en el renting — el canon amortiza el 95% del bien. Consecuencia dos, y es la seria: por el art. 7 del Decreto 1038/2000, si el precio de la opción queda por debajo del costo computable del bien, la operación se trata como VENTA FINANCIADA y se cae la deducción del canon entero, que es la ventaja fiscal por la que se elige el leasing. Con un residual de un canon, ese riesgo no es teórico. Es la pregunta al estudio contable, y hay que hacerla ANTES de firmar, no después. (Se descartó la cifra de "más del 40% del valor" que circula en buscadores: es de una nota de 2009.)',
    'HAY UNA PUERTA EN SAN JUAN QUE PUEDE SER MÁS BARATA QUE TODO ESTO Y NO ES LEASING. El programa provincial anunciado por el Gobernador Orrego el 27/05/2026 incluye una línea de bienes de capital en general de hasta $150.000.000 a 48 meses con 6 meses de gracia de capital, a una tasa del 60% de la Badlar — ≈13,2% TNA al momento del anuncio, la MISMA fórmula de tasa que FONDEFIN. A esa tasa aplasta a cualquier leasing bancario del país, incluida esta campaña. LO QUE FALTA SABER, y es exactamente lo que decide: no está publicado si "bienes de capital en general" incluye rodados o utilitarios. Es un crédito, no un leasing, así que probablemente vuelva a aparecer la prenda. Y el Banco San Juan tiene además su propio producto de leasing (hasta 48 meses, 100% del bien, sistema francés) cuya página habla de "bienes de capital" sin decir si admite rodados. Dos llamados a la plaza local antes que a cualquier banco de Buenos Aires.',
    'LA VENTAJA DECISIVA NO ES LA TASA, ES LA GARANTÍA. El plan de rodados no está trabado por el costo del dinero: está trabado porque FONDEFIN pide prenda en primer grado cubriendo el 200% del financiamiento ($120.000.000 por dos unidades) y las unidades sólo aportan $58.800.000 — faltan $61.200.000 que hoy no existen y que habría que cubrir con otros rodados, hipoteca o aval de SGR. El leasing borra ese problema por construcción, no por generosidad: el bien nunca sale del patrimonio del dador, así que no hay nada que prendar. Textual de BICE: "no requiere de garantías adicionales (ya que el bien adquirido actúa como tal)".',
    'LA SEGUNDA RESTRICCIÓN QUE LEVANTA: LA CARROCERÍA. El reglamento de FONDEFIN financia "camionetas pick up ÚNICAMENTE CABINA SIMPLE 0km" y esa sola frase viene ordenando qué unidad se puede comprar. BICE enumera los bienes admitidos sin distinguir carrocería: "camiones, semirremolques, utilitarios, buses, minibuses y pickups, incluyendo también otros equipamientos como grúas y autoelevadores". Doble cabina, furgón y utilitario liviano entran por el texto. CUIDADO: que no lo prohíba no es que lo autorice — hay que confirmarlo con el banco, pero acá, a diferencia del BNA, la enumeración es amplia y explícita, no un silencio.',
    'LA TERCERA: LA VELOCIDAD. BICE publica "se aprueba la operación dentro de los 15 días". FONDEFIN demora ~120 días según el propio dueño. Para la unidad que se necesita en septiembre, ésa es la diferencia entre llegar y no llegar.',
    'LA CUARTA: NO EXIGE ANTICIPO. "No requiere ... un desembolso inicial por parte de los clientes" y financia el "100% del monto total". El UVA del Santander exige 33,7% de anticipo: sobre $29,4M son casi $10M de caja que la empresa no tiene libres.',
    'EL 19,45% ES UN PISO Y ESTÁ ESCRITO ASÍ EN LA FUENTE: "tasa fija desde 19,45%", "incluye bonificación de los proveedores adheridos al convenio con el banco". Si el proveedor del rodado elegido no está adherido, esa tasa no aplica. Y NO ES UN CFT: no hay CFT publicado, ni gastos de otorgamiento, ni sellado de San Juan, ni seguro. La tasa real que calcula el OS es el MEJOR CASO.',
    'LA CAMPAÑA VENCE EL 21/08/2026 — ocho días desde esta lectura. Después del 21/08 sigue existiendo el producto permanente de BICE ("Leasing productivo — Bienes nuevos", hasta 5 años, hasta 100% del bien, misma garantía, aprobación en 15 días) pero SIN TASA PUBLICADA: se cotiza caso por caso. La ventana no es del análisis: es del banco.',
    'EL MONTO MÍNIMO PUEDE DEJAR LA OPERACIÓN AFUERA ANTES QUE CUALQUIER OTRA COSA. La nota de agosto NO publica mínimo, pero las dos campañas anteriores de la MISMA línea publicaron $80.000.000 por solicitante (Agroactiva, 03/06/2026; flota y logística, 16/03/2026, "neto de IVA"). Dos unidades a $29,4M son $58,8M. Dos a USD 25.000 son $75,75M. Las DOS quedan por debajo de $80M. No se afirma que el mínimo siga vigente —eso sería mezclar ventanas— pero es la PRIMERA pregunta al banco, antes que la tasa.',
    'EL IVA DEL CANON VA AL 21% Y LA COMPRA DIRECTA DE UN UTILITARIO IRÍA AL 10,5%. Verificado contra la norma: el art. 9 del Decreto Reglamentario 1038/2000 encuadra los cánones como locación de cosa mueble (art. 3 inc. e) pto. 7 de la Ley de IVA), con hecho imponible mes a mes. NO verificado contra la norma: la alícuota. La doctrina sostiene que el canon tributa siempre al 21% y que la reducida del 10,5% aplica a la compra del bien de capital pero no a los cánones — o sea que el leasing DUPLICA la alícuota sobre el mismo fierro, al revés de lo que dice el folleto. No es un costo (es crédito fiscal recuperable para un responsable inscripto) pero sí es más IVA y más tarde. La alícuota la confirma el estudio contable, no el OS.',
    'EL "DIFERIMIENTO DEL IVA" QUE PUBLICITA EL BANCO PUEDE SER UNA DESVENTAJA PARA ESTA EMPRESA. Diferir un CRÉDITO fiscal beneficia a quien está en posición de saldo a favor permanente. Echegaray está en posición de DÉBITO (Cuadro 4 del Flujo: IVA a pagar), así que el crédito que hoy le bajaría el IVA del mes llega repartido en 36 cuotas. Es una INFERENCIA sobre la posición fiscal de la empresa, no un hecho verificado, y la resuelve el estudio contable.',
    'FISCAL — LO QUE SÍ SE VERIFICÓ CONTRA LA NORMA (Decreto Reglamentario 1038/2000, texto actualizado, leído el 13/08/2026): art. 6, el tomador "computará como deducción el importe de los cánones imputables a cada ejercicio fiscal" — el canon ENTERO es gasto deducible, contra una compra financiada donde se deducen sólo amortización e intereses. Art. 2 (modificado por Decreto 152/2022), el contrato debe durar al menos el 50% de la vida útil del bien; para automotores la vida útil es 5 años, o sea 30 meses de piso: los 36 de esta campaña lo cumplen, un contrato a 24 meses NO y perdería el encuadre. Art. 7, si el precio de la opción de compra es INFERIOR al costo computable, "la operación se tratará, respecto de ambas partes, como una venta financiada" — una opción simbólica convierte el leasing en compra financiada y hace desaparecer la deducción del canon entero.',
    'EL TOPE DEL ART. 88 INC. l) DE GANANCIAS ES EL RIESGO FISCAL QUE PUEDE BORRAR TODA LA VENTAJA. La ley niega la deducción de alquileres "incluidos los derivados de contratos de leasing" de AUTOMÓVILES en lo que exceda a un automóvil de $20.000 netos de IVA — un tope nominal de 1998 que nunca se actualizó y que sobre un bien de $29.400.000 deja deducible menos del 0,1% del canon; el mismo corte se replica en el crédito fiscal de IVA (art. 12 inc. a). LA SALIDA ES POR DEFINICIÓN: "automóvil" es, según la Ley de Tránsito 24.449 art. 5, el automotor "para el transporte de personas de hasta ocho plazas". Una pick-up de carga cabina simple o un furgón no transportan personas y quedan fuera del tope. PERO el segundo rodado del pedido —"utilitarios ... aprox final de 25000 dólares"— no tiene modelo ni carrocería definidos: si terminara siendo una doble cabina de cinco plazas, la discusión se abre. Quien clasifica el vehículo a efectos fiscales es el estudio contable.',
    'PATRIMONIALMENTE ES OTRA OPERACIÓN, NO UN CRÉDITO CON OTRO NOMBRE. Mientras no se ejerce la opción de compra el bien no es de la empresa: no entra al activo, no se amortiza, y el compromiso no figura como deuda financiera del mismo modo que un préstamo prendario. Eso libera capacidad de endeudamiento declarado frente a otros bancos —relevante justo ahora, con el descubierto del Santander como único colchón— pero también significa que la empresa NO capitaliza el bien y que, si el contrato se corta antes, no queda nada. Cómo impacta exactamente en el balance y en la calificación crediticia lo define el criterio contable aplicado, y eso lo firma el estudio, no el OS.',
    'EL VALOR RESIDUAL NO ESTÁ PUBLICADO Y NO ESTÁ INCLUIDO EN NINGÚN TOTAL DE ESTA FICHA. BICE dice sólo "opción de compra al final del contrato por un canon preestablecido", y en el producto permanente "transcurrido el 75% del plazo". No hay porcentaje. Todos los importes que calcula el OS son SIN el residual: el costo real de quedarse con la unidad es el que está acá MÁS el residual que el banco cotice. Y por el art. 7 del decreto ese número no es libre: si queda por debajo del costo computable, el encuadre fiscal entero se da vuelta.',
    'TIPO_FINANCIACION = "otro" PORQUE LA TABLA NO TIENE "leasing". La taxonomía de condiciones_financieras admite descubierto, prestamo, descuento_cheque, echeq, tarjeta, financiacion_proveedor, pago_diferido, impuesto y otro. Cargarlo como "prestamo" afirmaría en la base que el bien entra al activo y que hay una deuda garantizada — que es justo lo que un leasing no es. Se carga como "otro" hasta que la taxonomía tenga su valor propio.',
    'ESTA FICHA NO RECUPERA NADA: es una verificación externa nueva del 13/08/2026. No existe en el OS ninguna cotización, carpeta ni oferta de leasing, pese a que el dueño lo planteó el 07/08. Si hay una conversación con una concesionaria o una cotización fuera del sistema, ese papel manda sobre esta ficha.',
  ].join(' ── '),
  desconocido: [
    'CFT — no publicado. Sin CFT no hay costo total afirmable: todo lo que calcula el OS es un piso. Referencia de cuánto puede faltar: en el único leasing con CFT publicado del barrido (Ford/Comafi, junio 2026) el CFT era 44,33% contra una TNA de 29,00% — quince puntos',
    'si BICE exige FIANZA DE SOCIOS O ACCIONISTAS: el banco dice que no hay garantías adicionales y la ficha oficial de FONDAGRO dice que sí. Dos fuentes oficiales contradictorias, sin resolver',
    'valor residual como PORCENTAJE — la práctica de mercado apunta a ~1 canon (4–5%), pero BICE no publica el suyo, y por el art. 7 del Decreto 1038/2000 ese número decide si el contrato es leasing o venta financiada a efectos fiscales',
    'monto mínimo de la campaña de agosto — no publicado. Las dos campañas anteriores de la misma línea pidieron $80.000.000 y las dos referencias de precio quedan por debajo. Es lo primero que hay que preguntar',
    'valor residual / precio de la opción de compra — el banco dice "un canon preestablecido" y "transcurrido el 75% del plazo", sin porcentaje. No está incluido en ningún total',
    'alícuota de IVA del canon — que el canon está gravado está verificado (art. 9 Decreto 1038/2000); con qué alícuota, no. Candidatos: 21% general (doctrina, el más probable) y 10,5% de bienes de capital (Dictamen DAT 100/02, no leído)',
    'sistema de amortización del canon — el banco no lo publica; el cuadro del OS usa francés como convención declarada',
    'gastos de otorgamiento, impuesto de sellos de San Juan y seguros exigidos — no publicados',
    'si una constructora califica para una línea presentada en el marco de Expo Transporte y orientada al transporte de carga y la logística — el texto dice "PyME" sin restringir actividad, pero el encuadre lo define el banco',
    'requisitos formales de la campaña de agosto — las campañas anteriores exigían certificado MiPyME vigente, responsable inscripto y 2 años mínimos de actividad; la nota de agosto no los repite',
    'qué proveedores y concesionarias están adheridos al convenio (la nota habla de "más de 100 empresas proveedoras") y si entre ellos está el del rodado elegido — de eso depende que exista la bonificación que hace al 19,45%',
    'si el rodado elegido cumple el requisito de ser "nacional o importado nacionalizado" del producto permanente — el DFSK es de origen chino',
    'clasificación fiscal del segundo rodado ("utilitarios ... 25000 dólares"): sin carrocería definida no se sabe si el tope del art. 88 inc. l) muerde',
    'período de capitalización de la TNA — el banco no lo publica; la TEA del OS supone mensual, la misma convención que el comparador de rodados',
  ],
  preguntar: [
    '¿Hay monto MÍNIMO en esta campaña? Si son $80.000.000 como en junio y en marzo, una operación de $58,8M o de $75,75M no entra y toda esta ficha es teórica. Es la primera pregunta, antes que la tasa.',
    '¿Una constructora de San Juan califica, o la línea está acotada a transporte de carga y logística?',
    '¿Cuál es el valor residual / precio de la opción de compra, en porcentaje del bien? — sin eso no hay costo total, y por el art. 7 del Decreto 1038/2000 ese número decide el encuadre fiscal de todo el contrato.',
    '¿Cuál es el CFT, con gastos de otorgamiento, sellado provincial y seguros incluidos? El 19,45% es tasa, no costo.',
    '¿Qué proveedores están adheridos al convenio, y está entre ellos el del utilitario elegido? Sin adhesión no hay bonificación y el 19,45% no existe.',
    '¿Se exige FIANZA DE SOCIOS O ACCIONISTAS? La página del banco dice que no hay garantías adicionales; la ficha del programa FONDAGRO en argentina.gob.ar dice que las garantías incluyen fianza de socios en personas jurídicas. Las dos son fuentes oficiales y se contradicen: hace falta la respuesta por escrito. Es la ventaja entera — si aparece un aval personal, el leasing pierde buena parte de lo que lo hacía superior a FONDEFIN.',
    '¿Admite doble cabina y furgón, o hay restricción de carrocería como en FONDEFIN?',
    '¿Admite un rodado de origen chino ya nacionalizado?',
    '¿Cuánto demora en total desde la presentación hasta la entrega de la unidad? Publican "aprobación dentro de los 15 días": ¿eso incluye la instrumentación y el pago al proveedor?',
    '¿Qué pasa si se cancela anticipadamente, y a qué costo?',
  ],
}

/**
 * LA FICHA QUE QUEDA CUANDO LA CAMPAÑA MUERE. Entra a la tabla SIN tasa, a propósito: después del
 * 21/08 el leasing de utilitarios vuelve a no tener precio de lista, y eso también es un dato que hay
 * que poder leer desde la base sin volver a investigar.
 */
export const CONDICION_LEASING_BICE_PERMANENTE = {
  clave: 'bice-leasing-productivo-bienes-nuevos',
  entidad: 'BICE — Banco de Inversión y Comercio Exterior',
  producto: 'Leasing productivo — Bienes nuevos (producto permanente, SIN tasa publicada)',
  tipo_financiacion: 'otro',
  moneda: 'ARS',
  vigencia_desde: '2026-08-01', // CONVENCIÓN: el 1° del mes de la lectura. El banco no publica vigencia del producto permanente
  vigencia_hasta: null,
  tna: null,
  tea: null,
  cft: null,
  iva_sobre_intereses: null,
  comisiones: null,
  gastos: null,
  plazo_dias: 1825, // "hasta 5 años dependiendo del tipo de bien"
  dias_minimos: 913,
  limite_disponible: null,
  saldo_utilizado: null,
  amortizacion: 'Canon mensual. La opción de compra se puede ejercer "transcurrido el 75% del plazo", por "un valor determinado" que el banco no publica.',
  fecha_debito: null,
  garantias: 'Textual: "La garantía es el propio bien" · "Usualmente no se requiere garantía adicional ya que el bien actúa como tal". La palabra "usualmente" es del banco y hay que tomarla como lo que es: no es un compromiso, es una práctica.',
  nivel_confianza: 'informado',
  fuente: FUENTE_PERMANENTE,
  observaciones: [
    'ESTE ES EL PRODUCTO QUE SIGUE EXISTIENDO DESPUÉS DEL 21/08/2026, y NO PUBLICA TASA. Es la respuesta honesta a "cuánto cuesta un leasing de utilitario": el leasing para utilitarios no publica tasa fuera de campaña, se cotiza caso por caso. Se buscó en Santander, BNA, BBVA, Toyota CFA y en el propio BICE — ver SIN_TASA_PUBLICADA.',
    'MEJORA DOS COSAS RESPECTO DE LA CAMPAÑA: el plazo (hasta 5 años contra 3) y nada más. El tope PyME es MENOR ($3.500 millones contra $6.500 millones de la campaña), aunque para una operación de $60M ninguno de los dos topes es la restricción.',
    'MISMA GARANTÍA, MISMA VELOCIDAD: el bien es la garantía, no se pide garantía adicional, y "se aprueba la operación dentro de los 15 días".',
    'REQUISITO DE ORIGEN, textual: "Los bienes deben ser nacionales o importados nacionalizados". Un DFSK de origen chino ya nacionalizado entraría por el texto, pero hay que confirmarlo.',
    'VIGENCIA_DESDE ES UNA CONVENCIÓN, NO UN DATO: el 01/08/2026 es el 1° del mes en que se leyó la página, para que la clave única de la tabla sea estable y re-correr la semilla actualice la fila en vez de duplicarla por día.',
    'DISCLAIMER DEL BANCO, textual: "Operaciones sujetas a previo cumplimiento de requisitos comerciales, crediticios y legales".',
  ].join(' ── '),
  desconocido: [
    'TASA — no publicada. Es el dato central de esta ficha: fuera de campaña el leasing de utilitarios no tiene precio de lista',
    'CFT, gastos, sellado y seguros — no publicados',
    'valor residual / precio de la opción de compra — "un valor determinado", sin porcentaje',
    'monto mínimo — no publicado',
    'qué significa exactamente "usualmente" en "usualmente no se requiere garantía adicional": en qué casos sí la pide',
  ],
  preguntar: [
    '¿Qué tasa le cotizan hoy a Echegaray Construcciones S.A. para un utilitario 0km a 36 y a 60 meses?',
    '¿En qué casos SÍ piden garantía adicional, pese a que el bien es la garantía?',
    '¿La aprobación en 15 días corre desde la presentación de la carpeta completa o desde la solicitud?',
  ],
}

/**
 * LO QUE HAY QUE PREGUNTARLE AL DUEÑO ANTES QUE AL BANCO.
 * El leasing lo trajo él en el pedido del 07/08 y el OS no tiene ni una línea al respecto.
 */
export const PREGUNTAR_AL_DUEÑO = [
  '¿De dónde salió la idea del leasing? ¿Hay una cotización concreta de una concesionaria o de un banco que el OS no tenga cargada? Si existe, ese papel manda sobre esta ficha entera.',
  '¿Qué es exactamente el "utilitario de USD 25.000"? Sin marca, modelo y carrocería no se puede saber si el tope de deducción de automóviles del art. 88 inc. l) muerde ni si FONDEFIN lo admitiría — y es la diferencia entre deducir el canon entero y no deducir casi nada.',
  '¿Se compran las DOS unidades por la misma vía o se pueden separar? Partir la operación cambia si se alcanza un eventual mínimo de $80.000.000 y si se necesita o no la prenda de FONDEFIN.',
  '¿La empresa tiene certificado MiPyME vigente y dos años de actividad acreditables como responsable inscripto? Las campañas anteriores de esta línea lo exigían.',
]

/** Las condiciones de este módulo, en el orden en que conviene mirarlas. */
export const CONDICIONES_LEASING = [CONDICION_LEASING_BICE_CAMPANA, CONDICION_LEASING_BICE_PERMANENTE]

/** Las columnas que NO existen en la tabla: se sacan antes de escribir. */
export const NO_SON_COLUMNAS = ['clave', 'desconocido', 'preguntar']

/**
 * La fila lista para `registrarCondicion`, sin los campos que no son columnas.
 *
 * `desconocido` y `preguntar` NO se borran: se pliegan dentro de `observaciones`, porque si mueren acá
 * no llegan ni a Postgres ni a la Web, y en esta línea los huecos SON el contenido — el que mire la
 * fila tiene que ver que no hay CFT ni valor residual antes de usarla para decidir. Mismo criterio que
 * linea-fondefin y linea-bna.
 */
export function filaParaLaTabla(cond = CONDICION_LEASING_BICE_CAMPANA) {
  const fila = { ...cond }
  const bloques = [fila.observaciones]
  if (cond.desconocido?.length) {
    bloques.push(`LO QUE EL BANCO NO PUBLICA (${cond.desconocido.length}) — no se estima, se pregunta: ${cond.desconocido.join(' · ')}`)
  }
  if (cond.preguntar?.length) {
    bloques.push(`PREGUNTAS AL BANCO (${cond.preguntar.length}), en el orden en que conviene hacerlas — cada una cambia una decisión: ${cond.preguntar.join(' · ')}`)
  }
  fila.observaciones = bloques.filter(Boolean).join(' ── ')
  for (const k of NO_SON_COLUMNAS) delete fila[k]
  return fila
}

/** Las dos filas listas para la tabla. */
export const filasParaLaTabla = () => CONDICIONES_LEASING.map((c) => filaParaLaTabla(c))
