// A QUIÉN LE DEBO, CUÁNTO Y CUÁNDO — la regla, sin base de datos.
//
// «Necesito en la sección proveedores una tabla que me indique a quiénes les debo y cuánto y
// cuándo, discriminado» (dueño, 16/09/2026).
//
// ═══ QUÉ CUENTA COMO DEUDA, Y POR QUÉ NO SE REDEFINE ACÁ ═══
//
// Lo que se debe de una compra es `compra_sheet.saldo_pendiente` — lo declara la pestaña Compras y
// ya es un concepto del OS: `public.proveedor_deuda` (20260907T1200) lo suma por proveedor y es la
// definición canónica del TOTAL. Este módulo NO la vuelve a definir: consume el mismo campo, y el
// total que arma se COTEJA contra esa vista (`cotejoDeDeuda`). Si alguna vez discreparan, la
// pantalla lo dice en vez de publicar un segundo número.
//
// Lo que `proveedor_deuda` no puede contestar —y es exactamente lo que el dueño pidió— es el
// CUÁNDO: cuánto de esa deuda ya venció y cuánto todavía no. Eso es lo que se calcula acá.
//
// ═══ LA REGLA DEL «CUÁNDO» ES LA DEL CRM, NO UNA NUEVA ═══
//
// `costo_de_obra_filas` (20260915T2320) separa lo por vencer con `fecha_prevista > current_date`.
// Acá se usa el MISMO corte, con el mismo signo:
//
//   VENCIDO     fecha prevista ≤ hoy  → hay que pagarlo, ya pasó la fecha que se comprometió.
//   POR VENCER  fecha prevista  > hoy → está comprometido, todavía no se debe.
//   SIN FECHA   no hay fecha prevista → se debe, pero no se puede decir cuándo. NO se cuenta como
//               vencido: inventaría una urgencia que el dato no tiene (regla de oro 2).
//
// NO se usa `tramo_vencimiento` ni `estado_pago` del Sheet, que son etiquetas CONGELADAS en el
// momento en que corrió el generador: una fila con vencimiento 18/09 sigue diciendo «Vence esta
// semana» el 25/09 hasta que el Sheet se regenere. Viajan en el detalle como referencia, con su
// rótulo, y quien mire puede ver que la pestaña dice otra cosa.
//
// ═══ UNA NOTA DE CRÉDITO RESTA (22/09/2026) ═══
//
// El dueño reportó que la ficha de Corralón Progreso publicaba MÁS deuda de la que la pestaña
// Compras declara, por el importe EXACTO de sus dos notas de crédito abiertas. La causa: en el
// Sheet una NC se carga con el importe en NEGATIVO (columna P), la fórmula de `Saldo pendiente
// (OS)` la arrastra con su signo —`P − U − X` mientras el Estado sea «Pendiente»— y TODO el camino
// de la deuda cortaba en `saldo > 0`: `.gt('saldo_pendiente', 0)` en el servicio, `saldo <= 0
// continue` acá y `cs.saldo_pendiente > 0` en la vista `proveedor_deuda`. La fila negativa no se
// sumaba mal: DESAPARECÍA. El error es unidireccional y siempre en contra — la app cobra de más.
//
// El signo de una nota de crédito ya está decidido en este proyecto (`orquestador/lib/
// comprobante-arca.mjs`, 21/07/2026, y `compras-costo-de-obra.mjs`, que corta en `total !== 0`):
// la NC RESTA, la nota de DÉBITO suma. Acá se aplica el mismo criterio, no uno nuevo.
//
// Una NC NO es un vencimiento: no hay nada que pagar el martes. Por eso entra con estado propio
// `a_favor`, queda fuera de vencido / por vencer / sin fecha —que siguen diciendo cuánto hay que
// pagar y cuándo— y baja el TOTAL, que es el número que el dueño lee. El invariante que la pantalla
// puede verificar a ojo es: total = vencido + por vencer + sin fecha + a favor (a favor ≤ 0).
//
// ═══ LAS CUOTAS PARCIALES ═══
//
// En Compras una cuota suele ser su propia FILA (las 881-883 de Pedro Tello son tres cuotas con
// tres vencimientos), y ahí no hay nada que partir. Pero una fila puede además llevar un SEGUNDO
// vencimiento propio en `fecha_prevista_2` / `monto_parcial_2`: ahí el saldo se reparte entre las
// dos fechas y cada tramo entra por la suya. Medido el 16/09/2026: 10 filas usan la segunda fecha
// y las 10 están saldadas, así que hoy ninguna deuda viva se parte — la regla existe igual porque
// la columna existe y la próxima fila que la use no puede caer entera en la fecha equivocada.
//
// `monto_parcial_1` NO se usa: en la réplica trae `monto_pagado − total` (negativo) en unas filas,
// 0 en otras con saldo vivo, y en la 858 ni siquiera cierra con el pagado. Es una fórmula del Sheet,
// no un importe de cuota.
//
// ═══ LO QUE ESTE MÓDULO NO HACE ═══
//
// No lee de ningún lado (lo hace `deudaProveedoresService.ts`), no formatea plata y no decide
// colores. Recibe filas y devuelve números, para poder probar la regla sin base y sin navegador.

import { normalizarNombreProveedor } from '../../../../orquestador/lib/proveedor-identidad.mjs'

/** La fila de `compra_sheet` que la deuda necesita. Los `null` son los de la réplica. */
export interface CompraConSaldo {
  fila: number
  proveedor: string | null
  cuit: string | null
  fecha: string | null
  comprobante: string | null
  concepto: string | null
  total: number | string | null
  fecha_prevista: string | null
  fecha_prevista_2: string | null
  monto_pagado: number | string | null
  monto_parcial_2: number | string | null
  saldo_pendiente: number | string | null
  estado: string | null
  estado_pago: string | null
  tramo_vencimiento: string | null
  anulada: boolean | null
  obra_id: string | null
}

/** Quién es el proveedor detrás del texto de Compras. De `proveedor_nombre_resuelto`. */
export interface ProveedorResuelto {
  nombre_norm: string
  proveedor_id: string | null
  proveedor_nombre: string | null
  estado: string | null
}

/**
 * `a_favor` es la NOTA DE CRÉDITO: saldo NEGATIVO. No es un vencimiento —no hay nada que pagar—
 * sino plata a favor de la empresa que todavía no se aplicó contra ninguna factura. Ver la sección
 * «UNA NOTA DE CRÉDITO RESTA» de la cabecera.
 */
export type EstadoVencimiento = 'vencido' | 'por_vencer' | 'sin_fecha' | 'a_favor'

/** Un tramo de deuda con UNA fecha de vencimiento. Una fila de Compras da uno o dos. */
export interface LineaDeuda {
  /** La clave del proveedor al que pertenece — la misma que agrupa la tabla. */
  clave: string
  /** La fila de la pestaña Compras. Es la que abre `/administracion/compras?s=<fila>`. */
  fila: number
  fecha: string | null
  comprobante: string | null
  concepto: string | null
  obraId: string | null
  /** El total de la fila de Compras, no el de esta línea. */
  total: number | null
  pagado: number
  /** Lo que se debe EN ESTA LÍNEA. Al centavo. */
  saldo: number
  vence: string | null
  estado: EstadoVencimiento
  /** «1 de 2» cuando la fila se partió en dos vencimientos; `null` cuando es una sola. */
  cuota: string | null
  /** Lo que la pestaña Compras dice del vencimiento. Referencia, no fuente. */
  tramoSheet: string | null
  estadoPagoSheet: string | null
}

/** Una fila de la tabla «A quién le debo». */
export interface DeudaDeProveedor {
  clave: string
  /** `null` = el texto de Compras todavía no es nadie del maestro: no se puede abrir su ficha. */
  proveedorId: string | null
  nombre: string
  vencido: number
  porVencer: number
  sinFecha: number
  /** Las notas de crédito abiertas, en NEGATIVO. `0` = no tiene ninguna. Ya está restado del total. */
  aFavor: number
  total: number
  /** Filas de Compras distintas, no tramos: una fila partida en dos cuotas es UN comprobante. */
  comprobantes: number
  /** La fecha vencida más vieja — la que decide la urgencia. */
  masViejaVencida: string | null
  /** El próximo vencimiento que todavía no pasó. */
  proximoVencimiento: string | null
}

export interface TotalesDeuda {
  proveedores: number
  comprobantes: number
  vencido: number
  porVencer: number
  sinFecha: number
  /** Las notas de crédito abiertas de todos, en NEGATIVO. Ya está restado del total. */
  aFavor: number
  total: number
}

/** El detalle de UN proveedor, con sus tres subtotales. */
export interface DetalleDeuda {
  clave: string
  nombre: string
  proveedorId: string | null
  lineas: LineaDeuda[]
  vencido: number
  porVencer: number
  sinFecha: number
  /** Las notas de crédito abiertas de este proveedor, en NEGATIVO. Ya está restado del total. */
  aFavor: number
  total: number
}

/** Plata al centavo. La suma de floats deriva y un pie que no cierra por $0,01 se lee como un defecto. */
export const centavos = (n: number): number => Math.round(n * 100) / 100

/** Un valor de la réplica —que PostgREST sirve como texto en `numeric`— a número. Vacío ⇒ `null`. */
export function aNumero(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** El día de hoy en ISO corto, para comparar contra `fecha_prevista` sin husos de por medio. */
export const hoyISO = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Vencido, por vencer o sin fecha. `vence` e `hoy` son ISO `YYYY-MM-DD` y se comparan como TEXTO:
 * en ese formato el orden lexicográfico ES el cronológico, y sin `Date` de por medio ninguna fecha
 * se corre un día por el huso de Buenos Aires.
 */
export function estadoDeVencimiento(vence: string | null, hoy: string): EstadoVencimiento {
  if (!vence) return 'sin_fecha'
  return vence.slice(0, 10) <= hoy ? 'vencido' : 'por_vencer'
}

interface QuienDebe { clave: string; proveedorId: string | null; nombre: string }

/** La clave que agrupa: el proveedor del maestro si el texto ya está vinculado; si no, el texto normalizado. */
function claveDe(compra: CompraConSaldo, resueltos: Map<string, ProveedorResuelto>): QuienDebe | null {
  const norm = normalizarNombreProveedor(compra.proveedor ?? '') as string | null
  if (!norm) return null
  const r = resueltos.get(norm)
  // ESTADO 'vinculado' Y NADA MÁS: un texto marcado `no_es_proveedor` («SUELDOS», «ARCA») no es un
  // acreedor, y darle una fila en esta tabla inventaría a quién se le debe.
  if (r?.proveedor_id && r.estado === 'vinculado') {
    return { clave: r.proveedor_id, proveedorId: r.proveedor_id, nombre: r.proveedor_nombre ?? norm }
  }
  if (r && r.estado && r.estado !== 'vinculado') return null
  // SIN FICHA PERO CON DEUDA: la fila existe igual, con la grafía de Compras. Esconderla sería
  // publicar una deuda más chica que la real, que es el silencio que el OS prohíbe.
  return { clave: `txt:${norm}`, proveedorId: null, nombre: (compra.proveedor ?? norm).trim() }
}

/**
 * LAS LÍNEAS DE DEUDA de un lote de compras: una por vencimiento, ya clasificadas.
 *
 * Quedan afuera las anuladas y todo saldo EN CERO — una compra saldada no es una deuda de cero, y
 * una anulada no se debe. El saldo NEGATIVO sí entra: es una nota de crédito y RESTA (ver la
 * cabecera). Cortarlo acá era el defecto del 22/09/2026.
 */
export function lineasDeDeuda(
  compras: CompraConSaldo[], resueltos: Map<string, ProveedorResuelto>, hoy: string,
): LineaDeuda[] {
  const salida: LineaDeuda[] = []
  for (const c of compras) {
    if (c.anulada) continue
    const saldo = centavos(aNumero(c.saldo_pendiente) ?? 0)
    if (saldo === 0) continue
    const quien = claveDe(c, resueltos)
    if (!quien) continue
    const base = {
      clave: quien.clave, fila: c.fila, fecha: c.fecha?.slice(0, 10) ?? null,
      comprobante: c.comprobante, concepto: c.concepto, obraId: c.obra_id,
      total: aNumero(c.total), pagado: centavos(aNumero(c.monto_pagado) ?? 0),
      tramoSheet: c.tramo_vencimiento, estadoPagoSheet: c.estado_pago,
    }
    for (const t of tramosDeLaFila(c, saldo)) {
      salida.push({
        ...base, saldo: t.saldo, vence: t.vence, cuota: t.cuota,
        // UNA NOTA DE CRÉDITO NO VENCE: no hay nada que pagar, así que no puede caer en «vencido»
        // —pintaría de rojo una urgencia inexistente— ni en «por vencer». Va a su propio estado.
        estado: t.saldo < 0 ? 'a_favor' : estadoDeVencimiento(t.vence, hoy),
      })
    }
  }
  return salida
}

/** Cómo se reparte el saldo de UNA fila entre sus vencimientos. Ver la cabecera, «Las cuotas parciales». */
function tramosDeLaFila(
  c: CompraConSaldo, saldo: number,
): { saldo: number; vence: string | null; cuota: string | null }[] {
  const prev1 = c.fecha_prevista?.slice(0, 10) ?? null
  const prev2 = c.fecha_prevista_2?.slice(0, 10) ?? null
  const parcial2 = centavos(aNumero(c.monto_parcial_2) ?? 0)
  // UNA NOTA DE CRÉDITO NO SE PARTE EN CUOTAS: es un crédito entero, no un pago a plazo. Partirla
  // daría dos tramos negativos con fechas de vencimiento que no significan nada.
  if (saldo < 0) return [{ saldo, vence: prev1, cuota: null }]
  // Sin segunda fecha, o con una segunda cuota que se come el saldo entero: un solo vencimiento.
  if (!prev2 || parcial2 <= 0) return [{ saldo, vence: prev1, cuota: null }]
  if (parcial2 >= saldo) return [{ saldo, vence: prev2, cuota: null }]
  return [
    { saldo: centavos(saldo - parcial2), vence: prev1, cuota: '1 de 2' },
    { saldo: parcial2, vence: prev2, cuota: '2 de 2' },
  ]
}

/**
 * LA TABLA: una fila por proveedor con saldo, ordenada por lo VENCIDO (de mayor a menor) y después
 * por el próximo vencimiento — quien tiene plata vencida se paga antes que quien vence el mes que
 * viene, y entre dos sin nada vencido manda la fecha que llega primero.
 */
export function deudaPorProveedor(
  lineas: LineaDeuda[], resueltos: Map<string, ProveedorResuelto>, compras: CompraConSaldo[],
): DeudaDeProveedor[] {
  const nombres = nombresPorClave(compras, resueltos)
  const porClave = new Map<string, DeudaDeProveedor & { filas: Set<number> }>()
  for (const l of lineas) {
    const quien = nombres.get(l.clave)
    let d = porClave.get(l.clave)
    if (!d) {
      d = {
        clave: l.clave, proveedorId: quien?.proveedorId ?? null, nombre: quien?.nombre ?? l.clave,
        vencido: 0, porVencer: 0, sinFecha: 0, aFavor: 0, total: 0, comprobantes: 0,
        masViejaVencida: null, proximoVencimiento: null, filas: new Set<number>(),
      }
      porClave.set(l.clave, d)
    }
    if (l.estado === 'vencido') {
      d.vencido = centavos(d.vencido + l.saldo)
      if (l.vence && (!d.masViejaVencida || l.vence < d.masViejaVencida)) d.masViejaVencida = l.vence
    } else if (l.estado === 'por_vencer') {
      d.porVencer = centavos(d.porVencer + l.saldo)
      if (l.vence && (!d.proximoVencimiento || l.vence < d.proximoVencimiento)) d.proximoVencimiento = l.vence
    } else if (l.estado === 'a_favor') {
      d.aFavor = centavos(d.aFavor + l.saldo)
    } else {
      d.sinFecha = centavos(d.sinFecha + l.saldo)
    }
    d.total = centavos(d.total + l.saldo)
    d.filas.add(l.fila)
  }
  return [...porClave.values()]
    .map(({ filas, ...d }) => ({ ...d, comprobantes: filas.size }))
    // NETO EXACTAMENTE CERO ⇒ NO ES UNA FILA. Le pasa a quien tiene una nota de crédito que cancela
    // justo su factura abierta: no se le debe nada y no tiene nada a favor. Publicar «$0» ahí lo
    // pondría en la lista de a quién hay que pagarle.
    .filter((d) => d.total !== 0)
    .sort(porUrgencia)
}

/** Vencido desc → próximo vencimiento asc → total desc → nombre. El último criterio es el desempate estable. */
function porUrgencia(a: DeudaDeProveedor, b: DeudaDeProveedor): number {
  if (a.vencido !== b.vencido) return b.vencido - a.vencido
  const fa = a.proximoVencimiento, fb = b.proximoVencimiento
  // Sin próximo vencimiento va DESPUÉS del que sí lo tiene: no hay fecha que reclame la atención.
  if (fa !== fb) {
    if (!fa) return 1
    if (!fb) return -1
    return fa < fb ? -1 : 1
  }
  if (a.total !== b.total) return b.total - a.total
  return a.nombre.localeCompare(b.nombre, 'es-AR')
}

/** `clave` → cómo se llama y si tiene ficha. Se arma de las compras, que son las que traen la grafía. */
function nombresPorClave(
  compras: CompraConSaldo[], resueltos: Map<string, ProveedorResuelto>,
): Map<string, QuienDebe> {
  const m = new Map<string, QuienDebe>()
  for (const c of compras) {
    const quien = claveDe(c, resueltos)
    if (quien && !m.has(quien.clave)) m.set(quien.clave, quien)
  }
  return m
}

/** EL PIE. Se suma de las filas que se ven, no de una segunda consulta: el pie y la tabla no pueden discrepar. */
export function totalesDeuda(filas: DeudaDeProveedor[]): TotalesDeuda {
  return filas.reduce<TotalesDeuda>((a, f) => ({
    proveedores: a.proveedores + 1,
    comprobantes: a.comprobantes + f.comprobantes,
    vencido: centavos(a.vencido + f.vencido),
    porVencer: centavos(a.porVencer + f.porVencer),
    sinFecha: centavos(a.sinFecha + f.sinFecha),
    aFavor: centavos(a.aFavor + f.aFavor),
    total: centavos(a.total + f.total),
  }), { proveedores: 0, comprobantes: 0, vencido: 0, porVencer: 0, sinFecha: 0, aFavor: 0, total: 0 })
}

// A favor va ÚLTIMO: lo primero que hay que leer es qué hay que pagar y cuándo; el crédito cierra.
const ORDEN_ESTADO: Record<EstadoVencimiento, number> = {
  vencido: 0, por_vencer: 1, sin_fecha: 2, a_favor: 3,
}

function porFecha(a: LineaDeuda, b: LineaDeuda): number {
  if (a.estado !== b.estado) return ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]
  if (a.vence !== b.vence) {
    if (!a.vence) return 1
    if (!b.vence) return -1
    return a.vence < b.vence ? -1 : 1
  }
  return a.fila - b.fila
}

const sumar = (lineas: LineaDeuda[], estado: EstadoVencimiento): number =>
  centavos(lineas.filter((l) => l.estado === estado).reduce((a, l) => a + l.saldo, 0))

/**
 * EL DETALLE DE UN PROVEEDOR: sus líneas, primero lo vencido (de la fecha más vieja a la más nueva,
 * que es el orden en que hay que pagarlas) y después lo por vencer.
 */
export function detalleDeProveedor(lineas: LineaDeuda[], fila: DeudaDeProveedor): DetalleDeuda {
  const mias = lineas.filter((l) => l.clave === fila.clave).sort(porFecha)
  return {
    clave: fila.clave, nombre: fila.nombre, proveedorId: fila.proveedorId, lineas: mias,
    vencido: sumar(mias, 'vencido'), porVencer: sumar(mias, 'por_vencer'),
    sinFecha: sumar(mias, 'sin_fecha'), aFavor: sumar(mias, 'a_favor'),
    total: centavos(mias.reduce((a, l) => a + l.saldo, 0)),
  }
}

/**
 * LA CUOTA, ADELANTE — «pago 2 de 4 · Hormigonado 2.144 m² × $4.400…».
 *
 * ═══ EL DEFECTO, VISTO EN LA PANTALLA EL 16/09/2026 ═══
 *
 * Las nueve líneas de Pedro Tello se dibujaban idénticas: «SF - PISOS INDUSTRIALES / Hormigonado
 * 2.144 m² × $4.400 = $9.433.600 · a c…». Lo único que las distingue —«pago 2 de 4», «cuota 1 de
 * 6»— vive al FINAL del concepto que escribe Compras, y es justo lo que el recorte se come. Nueve
 * renglones iguales con nueve importes distintos no se pueden auditar: parecen un dato repetido.
 *
 * Es la misma trampa que ya pagó el panel de costos del CRM (15/09/2026) y se resuelve igual: el
 * tramo que identifica la cuota va PRIMERO, y el concepto entero queda en el `title`. No se inventa
 * nada ni se acorta el texto — se reordena.
 *
 * Devuelve `null` cuando el concepto no nombra una cuota: la mayoría de las compras no lo hacen.
 */
export function etiquetaDeCuota(concepto: string | null): string | null {
  return concepto?.match(/\b(cuota|pago)\s+\d+\s+de\s+\d+/i)?.[0] ?? null
}

/** El concepto con su cuota adelante, si la tiene. Sin cuota devuelve el concepto tal cual. */
export function conceptoConCuotaAdelante(concepto: string | null): string | null {
  const cuota = etiquetaDeCuota(concepto)
  if (!cuota || !concepto) return concepto
  const resto = concepto.replace(cuota, '').replace(/\s*·\s*$/, '').replace(/^\s*·\s*/, '')
    .replace(/\s*·\s*·\s*/g, ' · ').trim()
  return resto ? `${cuota} · ${resto}` : cuota
}

/**
 * EL COTEJO CONTRA LA DEFINICIÓN CANÓNICA (`public.proveedor_deuda`).
 *
 * Un control no se valida contra la información que produce: el total de esta tabla se suma de las
 * líneas, y la vista lo suma en Postgres del mismo campo por otro camino. Si no cierran al centavo,
 * hay un defecto y la pantalla lo dice — no se elige un número.
 *
 * `null` en `canonica` = la vista no trae fila para ese proveedor. NO es un descuadre: sólo publica
 * los textos ya vinculados al maestro, así que un proveedor sin ficha no tiene con qué cotejarse.
 */
export function cotejoDeDeuda(fila: DeudaDeProveedor, canonica: number | null): string | null {
  if (canonica == null) return null
  const dif = centavos(fila.total - canonica)
  if (Math.abs(dif) < 0.01) return null
  return `Esta tabla suma ${fila.total.toFixed(2)} y proveedor_deuda dice ${canonica.toFixed(2)}: `
    + `difieren en ${Math.abs(dif).toFixed(2)}.`
}
