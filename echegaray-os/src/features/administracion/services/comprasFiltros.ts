// LOS FILTROS COMBINABLES DE LA PESTAÑA COMPRAS. Puros, y por eso probados sin red ni pantalla.
//
// ═══ POR QUÉ SON OTRA COSA QUE LOS CHIPS ═══
//
// `comprasSheet.ts` ya tiene un filtro: los chips `todo/aPagar/sinObra/sinComprobante`. Ése es
// EXCLUYENTE y responde «¿qué me falta hacer?» — es la cola de trabajo de la pantalla. Lo que pidió
// el dueño el 07/09 es otra pregunta: *«filtros para sección compras»* — proveedor, fecha, obra,
// importe, estado de pago y vencimiento, período y categoría. Eso es BUSCAR dentro de la pestaña, y
// se combina: «lo de DUPEC en San Francisco de agosto arriba de $500.000» son cuatro criterios a la
// vez. Meterlos en la misma llave que los chips obligaría a elegir entre ver los pendientes o ver a
// un proveedor, que es justamente lo que un filtro no debe hacer.
//
// Los dos conviven: primero el chip decide la población, después los criterios la recortan.
//
// ═══ EL VOCABULARIO NO SE INVENTA: SALE DE LAS FILAS ═══
//
// `opcionesDe` construye cada desplegable con los valores que la pestaña REALMENTE tiene, no con una
// lista escrita acá. Una constante de proveedores en el front envejece el día que el dueño agrega
// uno, y una de estados mostraría opciones que no matchean nada. Medido el 07/09 sobre las 949
// filas: categoría B=849 · N=100 · estado Pagado=865 · Proyectado=39 · Pendiente=39 · ELIMINADO=6.
//
// Y NO SE TRADUCE NADA. La categoría se muestra «B» y «N» como en la pestaña: son las letras que el
// dueño escribe y lee todos los días. Ponerles un rótulo interpretado acá sería inventar una segunda
// definición de una columna que ya tiene dueño.
//
// ═══ EL VENCIMIENTO YA ESTÁ CALCULADO EN LA BASE ═══
//
// `compra_sheet.tramo_vencimiento` lo escribe el Sheet («1 · Vencido», «2 · Vence esta semana», «3 ·
// 8 a 30 días»). No se recalcula acá comparando `fecha_prevista` contra hoy: habría dos respuestas a
// «¿esto está vencido?» y se contradirían el día que el criterio del Sheet cambie. El prefijo
// numérico es su ORDEN — se usa para ordenar y se saca para mostrar.

/** Lo que un criterio necesita mirar de una fila. Subconjunto de `CompraSheet`. */
export interface Criteriable {
  proveedor: string | null
  obra_texto: string | null
  categoria: string | null
  estado: string | null
  total: number | null
  fecha: string | null
  tramo_vencimiento?: string | null
}

export interface Criterios {
  proveedor?: string
  obra?: string
  categoria?: string
  estado?: string
  /** El tramo de `tramo_vencimiento`, SIN su prefijo de orden. */
  vencimiento?: string
  /** `YYYY-MM` — el mes de la fecha de factura. */
  periodo?: string
  /** `YYYY-MM-DD`, inclusive las dos. */
  desde?: string
  hasta?: string
  /** Sobre el TOTAL de la fila, inclusive las dos. */
  min?: number
  max?: number
}

/** Las llaves con las que viajan en la URL. Cortas porque conviven con `f`, `q`, `s` y `todo`. */
export const LLAVE = {
  proveedor: 'pr', obra: 'ob', categoria: 'ct', estado: 'es',
  vencimiento: 'vn', periodo: 'pe', desde: 'd', hasta: 'h', min: 'min', max: 'max',
} as const

/** El texto de un tramo sin el «1 · » que lo ordena. `null` y vacío dan `''`. */
export function tramoVisible(tramo: string | null | undefined): string {
  return String(tramo ?? '').replace(/^\s*\d+\s*·\s*/, '').trim()
}

/** `YYYY-MM` de una fecha ISO. `''` cuando no hay fecha: nunca inventa un mes. */
export function periodoDe(fecha: string | null | undefined): string {
  const f = String(fecha ?? '').trim()
  return /^\d{4}-\d{2}/.test(f) ? f.slice(0, 7) : ''
}

/**
 * UN NÚMERO DE LA URL, O NADA.
 *
 * `undefined` y no 0 cuando no se puede leer, y ésa es toda la diferencia entre «no filtré por
 * importe» y «filtré por importe mayor a cero» — que en una pestaña con notas de crédito en negativo
 * son dos listas distintas.
 */
export function numeroDe(v: string | null | undefined): number | undefined {
  const t = String(v ?? '').trim().replace(/\./g, '').replace(',', '.')
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

type Params = Record<string, string | undefined>

/** Los criterios que trae la URL. Lo que no se entiende se ignora: nunca vacía la lista por un typo. */
export function criteriosDeURL(sp: Params): Criterios {
  const t = (k: string) => sp[k]?.trim() || undefined
  return {
    proveedor: t(LLAVE.proveedor),
    obra: t(LLAVE.obra),
    categoria: t(LLAVE.categoria),
    estado: t(LLAVE.estado),
    vencimiento: t(LLAVE.vencimiento),
    periodo: t(LLAVE.periodo),
    desde: t(LLAVE.desde),
    hasta: t(LLAVE.hasta),
    min: numeroDe(sp[LLAVE.min]),
    max: numeroDe(sp[LLAVE.max]),
  }
}

/** ¿Hay alguno puesto? Decide si la pantalla ofrece «limpiar». */
export function hayCriterios(c: Criterios): boolean {
  return Object.values(c).some((v) => v !== undefined && v !== '')
}

/** Los criterios de vuelta a la URL, para que un enlace conserve los otros al cambiar uno. */
export function aParams(c: Criterios): Record<string, string> {
  const out: Record<string, string> = {}
  const set = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== '') out[k] = String(v)
  }
  set(LLAVE.proveedor, c.proveedor); set(LLAVE.obra, c.obra)
  set(LLAVE.categoria, c.categoria); set(LLAVE.estado, c.estado)
  set(LLAVE.vencimiento, c.vencimiento); set(LLAVE.periodo, c.periodo)
  set(LLAVE.desde, c.desde); set(LLAVE.hasta, c.hasta)
  set(LLAVE.min, c.min); set(LLAVE.max, c.max)
  return out
}

/**
 * ¿ESTA FILA PASA TODOS LOS CRITERIOS PUESTOS?
 *
 * Los textos se comparan EXACTOS y sin distinguir mayúsculas, porque salen de un desplegable armado
 * con los valores de la propia pestaña: un `includes` haría que «Messina» también trajera «Messina
 * Sur» sin que nadie lo pidiera. Para buscar por texto libre ya está `q`, que es otro control.
 *
 * Un criterio contra una celda VACÍA no pasa. Filtrar por obra «San Francisco» no puede devolver las
 * filas sin obra: eso convertiría un filtro en un ruido.
 */
export function pasaCriterios(f: Criteriable, c: Criterios): boolean {
  const igual = (celda: string | null | undefined, valor: string | undefined) => {
    if (!valor) return true
    return String(celda ?? '').trim().toLowerCase() === valor.trim().toLowerCase()
  }
  if (!igual(f.proveedor, c.proveedor)) return false
  if (!igual(f.obra_texto, c.obra)) return false
  if (!igual(f.categoria, c.categoria)) return false
  if (!igual(f.estado, c.estado)) return false
  if (c.vencimiento && tramoVisible(f.tramo_vencimiento).toLowerCase() !== c.vencimiento.trim().toLowerCase()) return false
  if (c.periodo && periodoDe(f.fecha) !== c.periodo) return false
  // Las fechas se comparan como TEXTO ISO, que ordena igual que el calendario y no arrastra la zona
  // horaria: `new Date('2026-09-07')` es UTC y en Argentina se lee 06/09 a las 21:00.
  const fecha = String(f.fecha ?? '').slice(0, 10)
  if (c.desde && (!fecha || fecha < c.desde)) return false
  if (c.hasta && (!fecha || fecha > c.hasta)) return false
  // EL IMPORTE SE MIDE POR SU VALOR ABSOLUTO. Una nota de crédito de −$500.000 es un movimiento de
  // medio millón, y con el signo crudo «desde $100.000» la dejaría afuera mientras trae una compra
  // de $100.001. Quien busca por importe busca el tamaño del movimiento.
  if (c.min !== undefined || c.max !== undefined) {
    if (f.total == null) return false
    const abs = Math.abs(f.total)
    if (c.min !== undefined && abs < c.min) return false
    if (c.max !== undefined && abs > c.max) return false
  }
  return true
}

export interface Opciones {
  proveedores: string[]
  obras: string[]
  categorias: string[]
  estados: string[]
  vencimientos: string[]
  periodos: string[]
}

/**
 * LOS VALORES QUE DE VERDAD ESTÁN EN LA PESTAÑA — cada desplegable, armado con sus datos.
 *
 * Las anuladas quedan afuera de las opciones: ofrecer un proveedor que sólo aparece en filas muertas
 * manda a alguien a un filtro que devuelve una lista vacía.
 *
 * Los períodos van del más nuevo al más viejo (es como se mira una pestaña de gastos) y los tramos de
 * vencimiento por su prefijo numérico, que es el orden de urgencia que ya escribió el Sheet. El resto
 * alfabético en español, para que la tilde no mande «Ñandú» al final.
 */
export function opcionesDe(filas: Criteriable[]): Opciones {
  const vivas = filas.filter((f) => !(f as { anulada?: boolean }).anulada)
  const junta = (lee: (f: Criteriable) => string | null | undefined) => {
    const s = new Set<string>()
    for (const f of vivas) { const v = String(lee(f) ?? '').trim(); if (v) s.add(v) }
    return [...s]
  }
  const alfa = (l: string[]) => l.sort((a, b) => a.localeCompare(b, 'es'))
  const tramos = new Map<string, string>()
  for (const f of vivas) {
    const crudo = String(f.tramo_vencimiento ?? '').trim()
    const visible = tramoVisible(crudo)
    if (visible) tramos.set(visible, crudo)
  }
  return {
    proveedores: alfa(junta((f) => f.proveedor)),
    obras: alfa(junta((f) => f.obra_texto)),
    categorias: alfa(junta((f) => f.categoria)),
    estados: alfa(junta((f) => f.estado)),
    vencimientos: [...tramos.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'es'))
      .map(([visible]) => visible),
    periodos: junta((f) => periodoDe(f.fecha)).sort().reverse(),
  }
}
