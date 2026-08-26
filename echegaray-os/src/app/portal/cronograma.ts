// EL CRONOGRAMA DE PAGOS — una sola fuente para tres pantallas.
//
// ═══ LA REGLA DEL MÓDULO ═══
//
// El «próximo pago» que abre el Inicio SALE DE ACÁ. No se recalcula en la portada. Si cada pantalla
// resolviera por su cuenta cuál es el próximo, el Inicio y Pagos podrían mostrar dos pagos distintos
// el mismo día —basta un criterio de desempate distinto— y el cliente vería al portal contradecirse.
//
// ═══ NULL NUNCA ES CERO ═══
//
// Un certificado sin monto no vale cero: todavía no se midió. Un pago sin fecha no vence hoy. Por eso
// los montos y las fechas son `number | null` y las pantallas escriben «sin cargar», «sin fecha»,
// «sin factura». Reemplazar un null por 0 acá inventaría el dato que falta y encima lo sumaría.

export type TipoPago = 'anticipo' | 'certificado' | 'fondo_reparo' | 'otro'
export type EstadoPago = 'pagado' | 'vencido' | 'proximo' | 'programado' | 'sin_factura'

export type Pago = {
  id: string
  orden: number
  tipo: TipoPago
  rotulo: string
  monto: number | null
  /** El neto, sin IVA. `null` = no se cargó — que NO es cero. */
  neto: number | null
  /** El IVA. CERO cuando el cobro no lleva —un pago en efectivo sin factura— y `null` cuando no se
   *  sabe: son cosas distintas y la pantalla las escribe distinto. */
  iva: number | null
  /** Es de una obra ANTERIOR del mismo cliente. Se le muestra —lo pagó— pero no suma al contrato
   *  vigente: mezclarlos hacía que «pagado» y «falta certificar» dieran cualquier cosa. */
  historico: boolean
  /** ARS salvo que el contrato diga otra cosa. Dibujar dólares con signo peso es un error de cuatro
   *  órdenes de magnitud que el cliente ve. */
  moneda: 'ARS' | 'USD'
  fechaPrevista: string | null
  fechaPago: string | null
  facturaNumero: string | null
  reciboNumero: string | null
  devolucionEn: string | null
  devueltoEn: string | null
  /** Lo que el administrador fijó a mano. Gana sobre lo derivado. */
  estadoFijado: EstadoPago | null
}

const soloDia = (iso: string) => iso.slice(0, 10)

/**
 * NÚCLEO PURO: el estado de UN pago.
 *
 * El orden de las preguntas es el criterio, no un detalle: pagado gana sobre todo (una factura pagada
 * tarde no es «vencida»), y «sin factura» va antes que «programado» porque un pago que todavía no
 * tiene comprobante no se puede reclamar aunque tenga fecha.
 */
export function estadoDePago(p: Pago, hoyISO: string): EstadoPago {
  if (p.fechaPago) return 'pagado'
  if (p.estadoFijado) return p.estadoFijado
  if (!p.facturaNumero && !p.fechaPrevista) return 'sin_factura'
  if (!p.fechaPrevista) return 'programado'
  const hoy = soloDia(hoyISO)
  if (soloDia(p.fechaPrevista) < hoy) return 'vencido'
  return 'programado'
}

/**
 * NÚCLEO PURO: cuál es el próximo pago.
 *
 * El más cercano de los que NO están pagados y tienen fecha — vencido incluido. Un pago vencido sigue
 * siendo lo próximo que hay que pagar; saltearlo mostraría como «próximo» algo que vence después de
 * una deuda que ya venció.
 *
 * El fondo de reparo queda afuera: no se paga, se retiene y se devuelve.
 */
export function proximoPago(pagos: Pago[]): Pago | null {
  const candidatos = pagos
    .filter((p) => !p.fechaPago && p.tipo !== 'fondo_reparo' && p.fechaPrevista)
    // Desempate por `orden`: dos certificados con la misma fecha tienen que salir siempre en el
    // mismo, o el Inicio cambia de próximo pago entre dos refrescos.
    .sort((a, b) => soloDia(a.fechaPrevista!).localeCompare(soloDia(b.fechaPrevista!)) || a.orden - b.orden)
  return candidatos[0] ?? null
}

export type ResumenCobro = {
  /**
   * `null` cuando NO hay cronograma cargado. No es lo mismo que cero: cero afirma que no debe nada,
   * y sin plan cargado lo único cierto es que no sabemos. La pantalla escribe «sin cargar».
   */
  hayPlan: boolean
  /** Lo no pagado con fecha ya vencida — SUBCONJUNTO de `pendiente`, no un sumando aparte.
   *  `null` = ninguna línea EN PESOS alimentó este total: nunca es un cero fabricado. */
  vencido: number | null
  /** Todo lo no pagado del cronograma, sin el fondo de reparo. `null` = nada en pesos. */
  pendiente: number | null
  /** Lo cobrado. `null` = ninguna línea en pesos alimentó este total. */
  pagado: number | null
  /** De lo cobrado, cuánto es neto y cuánto IVA. `null` cuando no hay ninguna línea que los aporte. */
  netoPagado: number | null
  ivaPagado: number | null
  /** De lo pendiente, cuánto es neto y cuánto IVA. El contrato se pacta en neto: «U$S 63.000 más IVA». */
  netoPendiente: number | null
  ivaPendiente: number | null
  /**
   * ═══ DE CUÁNTOS COBROS SALE CADA NÚMERO (26/08/2026) ═══
   *
   * «Los filtros de la sección Pagos deben indicar qué es lo que muestra cada concepto del footer.»
   * Un total sin su conteo no se puede cruzar contra la lista de arriba: el cliente ve «$ 18 M
   * pendiente» y no sabe si son las dos filas que está mirando o las once del cronograma entero.
   * Con el conteo al lado, el pie y el listado se verifican mutuamente sin sacar la calculadora.
   */
  nPagado: number
  nPendiente: number
  /** Del contrato, lo que todavía no entró al cronograma. `null` si la obra no tiene contrato cargado. */
  faltaCertificar: number | null
  contrato: number | null
  /**
   * Cuántos pagos quedaron FUERA de las sumas de arriba POR NO TENER MONTO. Las líneas en otra
   * moneda NO se cuentan acá: tienen su propia columna en el pie y decir que «no entran» era falso
   * —a Quattropani, cuyo cronograma entero está en dólares, le avisaba que sus trece cobros
   * quedaban afuera mientras los trece estaban dibujados en la columna de al lado—.
   */
  sinMonto: number
  /** Cuántas líneas quedaron fuera POR ESTAR EN OTRA MONEDA. Lo usa la pantalla para saber si tiene
   *  que dibujar la otra columna, no para escribir una advertencia. */
  enOtraMoneda: number
}

/**
 * NÚCLEO PURO: los totales de la obra.
 *
 * ═══ LA CUENTA ES EN NETO, PORQUE EL CONTRATO ES NETO (26/08/2026) ═══
 *
 * `obra_canonica.monto_contratado` guarda el neto SIN IVA, y el pie sumaba los importes CON IVA. El
 * resultado era un pie que no cerraba en ningún cliente y que le decía al cliente que debía más de
 * lo contratado. Medido contra los datos reales:
 *
 *   Limpieza de Escombros   contrato 5.008.661   pie decía 6.060.479   neto 5.008.661   ← exacto
 *   Relevamiento            contrato   900.000   pie decía 1.089.000   neto   900.000   ← exacto
 *   Pisos 120m2             contrato 7.108.887   pie decía 8.601.752   neto 7.108.886   ← al peso
 *   Galpón 9                contrato 49.737.709  pie decía 56.469.516  neto 49.527.368  ← 0,4 %
 *
 * Los netos cierran contra el contrato; los brutos no cierran nunca, y no es un defecto de carga:
 * es que son dos magnitudes distintas. El IVA sigue publicándose —el cliente lo necesita para su
 * libro de compras— pero al lado del neto, no en su lugar. Es el mismo criterio que el dueño ya
 * fijó para el contrato en dólares: «que diga eso, 63 más IVA en el footer».
 *
 * `faltaCertificar` = contrato − lo que ya está en el cronograma, TODO en neto. El fondo de reparo
 * no entra: es una retención sobre lo certificado, no una certificación más.
 */
export function resumenDeCobro(
  pagos: Pago[],
  contrato: number | null,
  hoyISO: string,
  /** En qué moneda se hace la cuenta. Las otras quedan fuera y se cuentan en `enOtraMoneda`. */
  moneda: 'ARS' | 'USD' = 'ARS',
): ResumenCobro {
  let vencido = 0, pendiente = 0, pagado = 0, sinMonto = 0, enOtraMoneda = 0
  // Los números del pie salen de la MISMA pasada: neto e IVA de lo cobrado y de lo pendiente, para
  // que el cliente pueda cruzarlos contra su libro de IVA compras sin sacar la calculadora.
  let netoPagado = 0, ivaPagado = 0, netoPendiente = 0, ivaPendiente = 0
  // CUÁNTAS LÍNEAS DE ESTA MONEDA ALIMENTARON CADA TOTAL. Sin esto, un cliente cuyo cronograma está entero
  // en dólares —Quattropani— leía «Pendiente $ 0» teniendo nueve certificados por delante. Cero es
  // una afirmación: dice que no debe nada. Lo que corresponde decir ahí es que no hay nada EN PESOS,
  // y eso se escribe con ausencia, no con un cero.
  let nPendiente = 0, nPagado = 0
  // ═══ CERO REAL vs «NO SABEMOS» (26/08/2026) ═══
  //
  // Las dos cosas se escriben distinto y son distintas. Una obra con cobros en pesos y ninguno
  // pagado todavía tiene PAGADO $ 0 —es un hecho, no pagó nada— y el pie escribía «sin cargar»,
  // que se lee como que el dato falta. La ausencia sólo corresponde cuando NINGUNA línea de esta
  // moneda existe: ahí sí, lo único cierto es que este total no aplica.
  let enLaMoneda = 0
  for (const p of pagos) {
    // LOS DE OBRAS ANTERIORES NO ENTRAN. Son cobros de trabajo previo para el mismo cliente y el
    // contrato contra el que se comparan estos totales es el de las obras EN CURSO. Sumarlos hacía
    // que Javier Sánchez leyera «Pagado $131 M» contra $299 M contratados, con $77 M que no eran de
    // ninguna de esas obras. Tienen su propio subtotal, abajo y aparte.
    if (p.historico) continue
    // LAS MONEDAS NO SE SUMAN. Una línea en dólares metida en un total en pesos lo arruina sin dar
    // error; se cuenta aparte para que la pantalla sepa que tiene que dibujar la otra columna.
    if (p.moneda !== moneda) { enOtraMoneda++; continue }
    if (p.monto == null) { sinMonto++; continue }
    enLaMoneda++
    if (p.fechaPago) {
      pagado += p.monto
      nPagado++
      // EL NETO CAE AL TOTAL CUANDO NO ESTÁ CARGADO, y no a cero. Una fila en efectivo sin IVA
      // discriminado tiene neto = total, y tratarla como «sin neto» sacaría del pie plata que sí
      // está cobrada. Cero sería peor todavía: afirmaría que ese cobro no valió nada.
      netoPagado += p.neto ?? p.monto
      if (p.iva != null) ivaPagado += p.iva
      continue
    }
    if (p.tipo === 'fondo_reparo') continue
    pendiente += p.monto
    netoPendiente += p.neto ?? p.monto
    if (p.iva != null) ivaPendiente += p.iva
    nPendiente++
    if (estadoDePago(p, hoyISO) === 'vencido') vencido += p.monto
  }
  return {
    hayPlan: pagos.length > 0,
    netoPagado: enLaMoneda ? netoPagado : null,
    netoPendiente: enLaMoneda ? netoPendiente : null,
    ivaPagado: enLaMoneda ? ivaPagado : null,
    ivaPendiente: enLaMoneda ? ivaPendiente : null,
    nPagado, nPendiente,
    vencido: enLaMoneda ? vencido : null,
    pendiente: enLaMoneda ? pendiente : null,
    pagado: enLaMoneda ? pagado : null,
    sinMonto, enOtraMoneda, contrato,
    // Sin plan cargado, «falta certificar» sería el contrato entero — cierto por aritmética y falso
    // como afirmación: no es que no se certificó nada, es que no cargamos el plan.
    // NUNCA UN NEGATIVO. «Falta certificar −$40 M» no significa nada para el cliente: significa que
    // el cronograma cargado supera al contrato. Se devuelve null y la pantalla no publica un
    // número imposible. La resta es EN NETO, que es la moneda del contrato.
    faltaCertificar: (() => {
      if (contrato == null || pagos.length === 0) return null
      // Con todo el cronograma en otra moneda no hay resto que calcular: `null`, no el contrato entero.
      if (!enLaMoneda) return null
      const resto = contrato - (netoPagado + netoPendiente)
      return resto < 0 ? null : resto
    })(),
  }
}

/** Los próximos N que siguen — «Lo que sigue» del Inicio. Sale del mismo orden que `proximoPago`. */
export function loQueSigue(pagos: Pago[], cuantos = 2): Pago[] {
  return pagos
    .filter((p) => !p.fechaPago && p.tipo !== 'fondo_reparo' && p.fechaPrevista)
    .sort((a, b) => soloDia(a.fechaPrevista!).localeCompare(soloDia(b.fechaPrevista!)) || a.orden - b.orden)
    .slice(0, cuantos)
}

/* ── CÓMO SE ESCRIBE ─────────────────────────────────────────────────────────────────────────── */

/** Pesos sin decimales, como en las maquetas. `null` no es «$ 0»: es «sin cargar». */
export function pesos(n: number | null, moneda: 'ARS' | 'USD' = 'ARS'): string {
  if (n == null) return 'sin cargar'
  return `${moneda === 'USD' ? 'U$S' : '$'} ${Math.round(n).toLocaleString('es-AR')}`
}

/**
 * EL MISMO IMPORTE, ABREVIADO: `9034356` → `$ 9,0 M`.
 *
 * Para donde el número entero no entra —la celda del calendario en un teléfono, la pastilla de un
 * filtro— y donde igual hace falta el orden de magnitud. El exacto está siempre en el listado y en
 * el pie: esto acompaña, no reemplaza.
 */
export function corto(n: number | null, moneda: 'ARS' | 'USD' = 'ARS'): string {
  if (n == null) return ''
  const millones = `${(n / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
  // EN DÓLARES EL NÚMERO ENTERO ENTRA, así que se escribe entero: abreviar U$S 31.500 a «U$S 32k»
  // redondea 500 dólares para ahorrar tres caracteres, y el importe deja de coincidir con el del
  // pie que tiene al lado. La abreviatura existe para lo que NO entra, no por costumbre.
  if (moneda === 'USD') return Math.abs(n) < 1_000_000 ? pesos(n, 'USD') : `U$S ${millones}`
  if (Math.abs(n) < 1_000_000) return `$ ${Math.round(n / 1000).toLocaleString('es-AR')}k`
  return `$ ${millones}`
}

/** dd/mm. `null` es «sin fecha», nunca una fecha inventada ni un guion suelto. */
export function diaMes(iso: string | null): string {
  if (!iso) return 'sin fecha'
  const [, m, d] = soloDia(iso).split('-')
  return `${d}/${m}`
}

/**
 * LAS PALABRAS SON LAS DEL SHEET, no otras. El cliente y el dueño tienen que poder decir lo mismo
 * mirando pantallas distintas: la columna O de Cobranzas escribe «Pendiente», y el portal escribía
 * «programado» — la misma fila con dos nombres, en el único lugar donde los dos se cruzan.
 */
export const ROTULO_ESTADO: Record<EstadoPago, string> = {
  pagado: 'pagado',
  vencido: 'vencido',
  proximo: 'próximo',
  programado: 'pendiente',
  sin_factura: 'sin factura',
}
