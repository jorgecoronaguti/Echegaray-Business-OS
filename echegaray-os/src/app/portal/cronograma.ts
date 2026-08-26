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
  /** Del contrato, lo que todavía no entró al cronograma. `null` si la obra no tiene contrato cargado. */
  faltaCertificar: number | null
  contrato: number | null
  /**
   * Cuántos pagos quedaron FUERA de las sumas de arriba: los que no tienen monto y los que están en
   * otra moneda. Se cuentan juntos porque para el total son lo mismo —no entran— pero la pantalla
   * no puede decir «sin monto cargado» de una línea en dólares que sí lo tiene.
   */
  sinMonto: number
}

/**
 * NÚCLEO PURO: los totales de la obra.
 *
 * `faltaCertificar` = contrato − lo que ya está en el cronograma (pagado + pendiente). El fondo de
 * reparo no entra: es una retención sobre lo certificado, no una certificación más — contarlo haría
 * que «falta certificar» bajara por retener plata.
 */
export function resumenDeCobro(pagos: Pago[], contrato: number | null, hoyISO: string): ResumenCobro {
  let vencido = 0, pendiente = 0, pagado = 0, sinMonto = 0
  // CUÁNTAS LÍNEAS EN PESOS ALIMENTARON CADA TOTAL. Sin esto, un cliente cuyo cronograma está entero
  // en dólares —Quattropani— leía «Pendiente $ 0» teniendo nueve certificados por delante. Cero es
  // una afirmación: dice que no debe nada. Lo que corresponde decir ahí es que no hay nada EN PESOS,
  // y eso se escribe con ausencia, no con un cero.
  let nPendiente = 0, nPagado = 0
  for (const p of pagos) {
    // LAS MONEDAS NO SE SUMAN. Una línea en dólares metida en un total en pesos lo arruina sin dar
    // error; se cuenta como «sin monto» para que la pantalla diga que no está en la suma.
    if (p.moneda !== 'ARS') { sinMonto++; continue }
    if (p.monto == null) { sinMonto++; continue }
    if (p.fechaPago) { pagado += p.monto; nPagado++; continue }
    if (p.tipo === 'fondo_reparo') continue
    pendiente += p.monto
    nPendiente++
    if (estadoDePago(p, hoyISO) === 'vencido') vencido += p.monto
  }
  return {
    hayPlan: pagos.length > 0,
    vencido: nPendiente ? vencido : null,
    pendiente: nPendiente ? pendiente : null,
    pagado: nPagado ? pagado : null,
    sinMonto, contrato,
    // Sin plan cargado, «falta certificar» sería el contrato entero — cierto por aritmética y falso
    // como afirmación: no es que no se certificó nada, es que no cargamos el plan.
    // NUNCA UN NEGATIVO. «Falta certificar −$40 M» no significa nada para el cliente: significa que
    // el cronograma cargado supera al contrato —porque incluye algo que el contrato no cuenta, como
    // los materiales de Quattropani, o porque el contrato está en otra moneda—. Se devuelve null y
    // la pantalla dice «sin cargar» en vez de publicar un número imposible.
    faltaCertificar: (() => {
      if (contrato == null || pagos.length === 0) return null
      // Con todo el cronograma en otra moneda no hay resto que calcular: `null`, no el contrato entero.
      if (!nPagado && !nPendiente) return null
      const resto = contrato - (pagado + pendiente)
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

/** dd/mm. `null` es «sin fecha», nunca una fecha inventada ni un guion suelto. */
export function diaMes(iso: string | null): string {
  if (!iso) return 'sin fecha'
  const [, m, d] = soloDia(iso).split('-')
  return `${d}/${m}`
}

export const ROTULO_ESTADO: Record<EstadoPago, string> = {
  pagado: 'pagado',
  vencido: 'vencido',
  proximo: 'próximo',
  programado: 'programado',
  sin_factura: 'sin factura',
}
