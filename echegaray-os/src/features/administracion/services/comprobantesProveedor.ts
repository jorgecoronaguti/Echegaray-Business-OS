// LA SOLAPA «COMPROBANTES» DE LA FICHA DE UN PROVEEDOR — las reglas puras, sin red.
//
// Pedido del dueño, 14/09/2026: «necesito q proveedores guarde los comprobantes de cada una de las
// compras q le corresponde, asi como haces con compras».
//
// ═══ NO HAY UN SEGUNDO GUARDADO ═══
//
// El archivo de una compra vive UNA vez: `compra_adjunto` (bucket privado `comprobantes`), colgado de
// `compra_sheet.clave`. La ficha no copia nada: lista las compras del proveedor, les pone al lado el
// papel con `papelesDeCadaFila` —la MISMA función que usa Compras— y lo abre con `urlDelAdjunto`.
// Lo que se vincula desde acá aparece en Compras porque es la misma fila de la misma tabla.
//
// ═══ QUÉ SE PUEDE HACER CON UNA COMPRA SIN PAPEL ═══
//
// La web de Compras NO sube un archivo contra una compra existente: «Cargar comprobante» mete un
// comprobante NUEVO en la cola del bot (que crea su fila en la pestaña), y lo único que se hace sobre
// una compra que ya existe es VINCULAR un papel suelto (`vincularAdjunto`). Esta solapa ofrece eso
// mismo y nada más: inventar una subida directa sería un segundo circuito que el bot no conoce.

import { z } from 'zod'
import { plano } from '../../../shared/utils/busqueda.ts'
import { ESTADO } from './comprasSheet.ts'
import type { ComprobanteProveedor } from './fichaProveedor'

/** Lo que de una compra de `proveedor_compra` necesitan las cifras y el costado de la ficha. */
export interface CompraParaResumen {
  fila: number
  fecha: string | null
  comprobante: string | null
  tipo: string | null
  obra_texto: string | null
  concepto: string | null
  total: number | null
  anulada: boolean
}

/**
 * LAS CIFRAS DE LA FICHA SALEN DE LAS MISMAS FILAS QUE LA LISTA. Antes la cabecera sumaba
 * `costos_obra` y la lista era la misma lectura; al pasar la lista a `proveedor_compra`, dejar las
 * cifras en la otra fuente pondría «220 comprobantes» arriba de 225 filas.
 *
 * LAS ANULADAS NO SUMAN. Se listan —con su pastilla «Anulada»— porque existieron, pero un gasto
 * anulado no es plata que se le compró. La pestaña no guarda modalidad en la réplica: `null`.
 */
export function comoComprobantes(filas: CompraParaResumen[]): ComprobanteProveedor[] {
  return filas.filter((f) => !f.anulada).map((f) => ({
    id: String(f.fila), fecha: f.fecha, comprobante: f.comprobante, tipo: f.tipo,
    obra_texto: f.obra_texto, concepto: f.concepto, modalidad: null, total: f.total,
  }))
}

export type FiltroPapel = 'todos' | 'con' | 'sin'

/**
 * ═══ UN SOLO MECANISMO PARA LLEGAR AL DETALLE (dueño, 22/09/2026) ═══
 *
 * Cuatro pedidos del mismo día sobre esta misma pantalla —«ver ficha del proveedor» que no llevaba
 * a la ficha, un filtro Pendiente/Pagado, poder abrir cada obra y ver SUS comprobantes, y un
 * buscador que no buscaba nada— son la misma queja: DESDE LA FICHA NO SE LLEGA AL DETALLE.
 *
 * La respuesta es una sola lista —la de comprobantes de la ficha— y CINCO recortes que se combinan
 * y viajan en la URL: año · papel · estado · obra · texto. Abrir una obra no es un panel nuevo: es
 * el mismo filtro con `?obra=`, y por eso no pierde el estado que ya estaba puesto ni deja de poder
 * compartirse por chat.
 */
export type FiltroEstado = 'todos' | 'pendiente' | 'pagado'

/** Un año, `SIN_FECHA` para las compras que la pestaña no fechó, o `TODOS_LOS_ANIOS`. */
export type AnioFiltro = number | typeof SIN_FECHA | typeof TODOS_LOS_ANIOS
export const SIN_FECHA = 'sin-fecha'
/**
 * TODOS LOS AÑOS. Hace falta porque el monto que la cara «Obras» pone al lado de cada obra es
 * HISTÓRICO —suma todos sus comprobantes, de todos los años—: si al abrirla la lista siguiera
 * recortada al año en curso, el monto de arriba y la suma de abajo no cerrarían, que es exactamente
 * la clase de diferencia que esta ficha no puede producir.
 */
export const TODOS_LOS_ANIOS = 'todos'
/** La obra vacía: comprobantes que nadie imputó. No se esconden — son plata sin dueño. */
export const SIN_OBRA = 'sin-obra'

export interface FiltrosComprobantes {
  anio: AnioFiltro
  papel: FiltroPapel
  /** El estado de la columna «Estado» de la pestaña, verbatim. Nunca inferido. */
  estado: FiltroEstado
  /** El texto de la obra imputada, `SIN_OBRA`, o `null` = todas. */
  obra: string | null
  /** Lo tipeado en el buscador, recortado. `null` = sin búsqueda. */
  texto: string | null
}

const Anio = z.union([
  z.literal(SIN_FECHA), z.literal(TODOS_LOS_ANIOS), z.coerce.number().int().min(2000).max(2100),
])
const Papel = z.enum(['todos', 'con', 'sin'])
const Estado = z.enum(['todos', 'pendiente', 'pagado'])
const Texto = z.string().trim().min(1).max(200)
const Obra = z.string().trim().min(1).max(200)

/**
 * LOS FILTROS SALEN DE LA URL, O SEA DE QUIEN TIPEA. Un valor que no pasa Zod vuelve al default:
 * `?anio=hola` no puede terminar en una lista vacía que parezca «no le compramos nada».
 *
 * ═══ EL BUSCADOR LEE `q`, QUE ES LO QUE EL BUSCADOR ESCRIBE (defecto del 22/09/2026) ═══
 *
 * «el buscador de "por número" q tiene cada proveedor dentro de su ficha, está roto, no busca por
 * número, por nombre, por fecha, por nada» (dueño). El campo es `BuscadorFilo`, que tiene
 * `name="q"` y arma la URL con `urlDeBusqueda`, que SIEMPRE escribe `?q=`. Esta función leía `sp.n`:
 * el tipeo llegaba a la URL y el filtro no lo encontraba nunca. `n` se sigue aceptando para no
 * romper un enlace viejo ya compartido.
 */
export function filtrosDeURL(
  sp: Record<string, string | undefined>, anioPorDefecto: number,
): FiltrosComprobantes {
  const anio = Anio.safeParse(sp.anio)
  const papel = Papel.safeParse(sp.papel)
  const estado = Estado.safeParse(sp.estado)
  const obra = Obra.safeParse(sp.obra ?? '')
  const texto = Texto.safeParse(sp.q ?? sp.n ?? '')
  return {
    anio: anio.success ? anio.data : anioPorDefecto,
    papel: papel.success ? papel.data : 'todos',
    estado: estado.success ? estado.data : 'todos',
    obra: obra.success ? obra.data : null,
    texto: texto.success ? texto.data : null,
  }
}

/** Lo mínimo de una compra que estas reglas miran. */
export interface CompraFiltrable {
  fecha: string | null
  comprobante: string | null
  tiene_adjunto: boolean
  tipo?: string | null
  concepto?: string | null
  obra_texto?: string | null
  total?: number | null
  estado?: string | null
  anulada?: boolean
}

/** Las fechas son texto ISO: el año son los cuatro primeros caracteres, sin zona horaria. */
export function anioDe(fecha: string | null): AnioFiltro {
  const a = Number(fecha?.slice(0, 4))
  return Number.isInteger(a) && a > 0 ? a : SIN_FECHA
}

/**
 * LOS AÑOS QUE SE OFRECEN SON LOS QUE TIENEN COMPRAS, más el de hoy aunque no tenga: el default
 * tiene que poder elegirse de vuelta. «Sin fecha» va al final y sólo si existe: SIN FECHA NO ES HOY,
 * y esconderlas detrás del filtro de año las volvería invisibles.
 */
export function aniosDe(filas: { fecha: string | null }[], anioActual: number): AnioFiltro[] {
  const anios = new Set<number>([anioActual])
  let sinFecha = false
  for (const f of filas) {
    const a = anioDe(f.fecha)
    if (a === SIN_FECHA) sinFecha = true
    else if (typeof a === 'number') anios.add(a)
  }
  const lista: AnioFiltro[] = [...anios].sort((x, y) => (y as number) - (x as number))
  const cola: AnioFiltro[] = sinFecha ? [SIN_FECHA, TODOS_LOS_ANIOS] : [TODOS_LOS_ANIOS]
  return [...lista, ...cola]
}

/** Las compras del año elegido. Es la población de los chips: el resto de los filtros recorta. */
export function delAnio<T extends { fecha: string | null }>(filas: T[], anio: AnioFiltro): T[] {
  if (anio === TODOS_LOS_ANIOS) return filas
  return filas.filter((f) => anioDe(f.fecha) === anio)
}

/**
 * ═══ EL ESTADO ES EL DE LA PESTAÑA, VERBATIM — NUNCA INFERIDO (dueño, 22/09/2026) ═══
 *
 * La columna «Estado» de Compras dice `Pagado` o `Pendiente`. Lo que no dice ninguna de las dos
 * —`Proyectado`, `ELIMINADO`, o la celda vacía— NO es ni lo uno ni lo otro, y en particular
 * NO ES «Pagado»: dar por pagada una fila que la pestaña no marcó esconde deuda viva.
 *
 * Las NOTAS DE CRÉDITO (`Tipo = N C`, importe negativo) entran por acá como cualquier otra fila:
 * llevan el estado que el dueño les escribió y se cuentan por ÉL. No se las clasifica por ser NC —
 * eso sería inferir— y nunca desaparecen: restan dentro del corte al que pertenecen.
 */
export function estadoDe(estado: string | null | undefined): FiltroEstado | 'otro' {
  const t = String(estado ?? '').trim()
  if (t === ESTADO.PAGADO) return 'pagado'
  if (t === ESTADO.PENDIENTE) return 'pendiente'
  return 'otro'
}

/** La obra imputada de una fila, o `SIN_OBRA`. La misma clave con la que la cara «Obras» agrupa. */
export function obraDe(c: { obra_texto?: string | null }): string {
  const t = c.obra_texto?.trim()
  return t ? t : SIN_OBRA
}

/** ¿Esta fila cae en la obra que se está mirando? Sin tildes y sin mayúsculas, como todo el OS. */
export function coincideObra(c: { obra_texto?: string | null }, obra: string | null): boolean {
  if (!obra) return true
  if (obra === SIN_OBRA) return obraDe(c) === SIN_OBRA
  return plano(obraDe(c)) === plano(obra)
}

/**
 * EL NÚMERO SE BUSCA COMO LO ESCRIBE UNA PERSONA. En la pestaña conviven `0003-00012345`,
 * `3-12345` y `A 0003 00012345`: comparar el texto crudo haría que «12345» no encuentre nada.
 * Si lo buscado trae dígitos se comparan sólo los dígitos; si no, el texto sin mayúsculas.
 */
export function coincideNumero(comprobante: string | null, buscado: string | null): boolean {
  if (!buscado) return true
  if (!comprobante) return false
  const b = tramos(buscado)
  if (b.length === 0) return false
  const c = tramos(comprobante)
  // Los tramos buscados aparecen EN ORDEN entre los del comprobante. `6-3501` es punto de venta y
  // número, y tiene que encontrar `0006-00003501` sin que `3501-6` lo haga.
  let desde = 0
  for (const t of b) {
    const i = c.findIndex((x, j) => j >= desde && encaja(x, t))
    if (i < 0) return false
    desde = i + 1
  }
  return true
}

/** Los tramos alfanuméricos de un texto, sin tildes ni mayúsculas: `A 0003-00012345` → 3 tramos. */
const tramos = (t: string): string[] => plano(t).split(/[^0-9a-z]+/i).filter(Boolean)
/** Sin ceros a la izquierda: la gente tipea `3501` y la pestaña guarda `00003501`. */
const sinCeros = (s: string): string => s.replace(/^0+/, '') || '0'
const esNumero = (s: string): boolean => /^\d+$/.test(s)
const encaja = (enLaFila: string, buscado: string): boolean =>
  (esNumero(enLaFila) && esNumero(buscado)
    ? sinCeros(enLaFila).includes(sinCeros(buscado))
    : enLaFila.includes(buscado))

/**
 * ═══ UN SOLO CAMPO BUSCA POR TODO LO QUE LA FILA MUESTRA (dueño, 22/09/2026) ═══
 *
 * «no busca por número, por nombre, por fecha, por nada». La tabla tiene seis columnas: un buscador
 * atado a una sola obliga a adivinar cuál es la buena. Se busca sobre lo que la fila DIBUJA —fecha,
 * concepto, obra, importe, estado y número— y, si alguna encaja, la fila se muestra.
 */
export function coincideTexto(c: CompraFiltrable, buscado: string | null): boolean {
  if (!buscado) return true
  const b = plano(buscado)
  if (!b) return true
  if (coincideNumero(c.comprobante, buscado)) return true
  const textos = [c.concepto, c.obra_texto, c.tipo, c.estado, c.comprobante]
  if (textos.some((t) => t && plano(t).includes(b))) return true
  return coincideFecha(c.fecha, b) || coincideImporte(c.total ?? null, b)
}

/**
 * LA FECHA SE BUSCA COMO SE VE Y COMO SE GUARDA. En pantalla dice `09/09`; la fuente guarda
 * `2026-09-09`. Buscar `09/09`, `09/09/2026`, `9/9` o `2026-09` tiene que encontrar la misma fila.
 */
export function coincideFecha(fecha: string | null, buscado: string): boolean {
  if (!fecha) return false
  const [a, m, d] = fecha.slice(0, 10).split('-')
  if (!a || !m || !d) return false
  const formas = [fecha.slice(0, 10), `${d}/${m}/${a}`, `${d}/${m}`, `${d}/${m}/${a.slice(2)}`]
  const b = buscado.replace(/-/g, '/')
  if (formas.some((f) => f.includes(b))) return true
  // `9/9` sin el cero: se compara por número de tramo.
  const tb = tramos(b)
  if (tb.length < 2 || !tb.every(esNumero)) return false
  const tf = [d, m, a].map(sinCeros)
  return tb.map(sinCeros).every((x, i) => tf[i] === x)
}

/**
 * EL IMPORTE SE BUSCA CON O SIN PUNTOS, Y COMO ESTÁ ESCRITO EN LA PANTALLA.
 *
 * La columna dibuja `pesos()`, que REDONDEA a pesos enteros: la fila de $ 49.523,70 se lee
 * «$ 49.524». Comparar sólo contra el valor guardado dejaba que tipear lo que la fila muestra no
 * encontrara esa misma fila — el defecto más desconcertante posible en un buscador. Se compara
 * contra los dos: el guardado y el redondeado que se ve.
 */
export function coincideImporte(total: number | null, buscado: string): boolean {
  if (total === null || total === undefined) return false
  const digitos = buscado.replace(/\D/g, '')
  if (!digitos) return false
  const crudo = String(Math.abs(total)).replace(/\D/g, '')
  const comoSeVe = String(Math.round(Math.abs(total)))
  return crudo.includes(digitos) || comoSeVe.includes(digitos)
}

export function filtrarComprobantes<T extends CompraFiltrable>(filas: T[], f: FiltrosComprobantes): T[] {
  return filas.filter((c) => {
    if (f.papel === 'con' && !c.tiene_adjunto) return false
    if (f.papel === 'sin' && c.tiene_adjunto) return false
    if (f.estado !== 'todos' && estadoDe(c.estado) !== f.estado) return false
    if (!coincideObra(c, f.obra)) return false
    return coincideTexto(c, f.texto)
  })
}

/**
 * LOS CONTEOS DE LOS CHIPS SALEN DEL AÑO ENTERO, NO DE LO FILTRADO. Contarlos después del filtro
 * diría «con comprobante 0» apenas se elige «sin comprobante», que es una afirmación falsa.
 */
export function contarPapeles(filas: CompraFiltrable[]): Record<FiltroPapel, number> {
  const con = filas.filter((c) => c.tiene_adjunto).length
  return { todos: filas.length, con, sin: filas.length - con }
}

/**
 * CUÁNTOS PENDIENTES Y CUÁNTOS PAGADOS — y cuántos NO SON NINGUNO DE LOS DOS.
 *
 * `otro` no es decoración: es lo que impide que dos chips que suman menos que el total se lean como
 * si el resto se hubiera perdido. Con él la pantalla puede decir cuántas filas sólo se ven en
 * «Todos» en vez de esconderlas sin avisar.
 */
export function contarEstados(filas: CompraFiltrable[]): Record<FiltroEstado | 'otro', number> {
  const cuenta = { todos: filas.length, pendiente: 0, pagado: 0, otro: 0 }
  for (const c of filas) cuenta[estadoDe(c.estado)] += 1
  return cuenta
}

/**
 * LO QUE SUMA LO QUE SE ESTÁ VIENDO. Las ANULADAS se listan —existieron— pero no suman, igual que
 * en `comoComprobantes`: es la MISMA regla, y por eso el total de acá cierra con el monto que la
 * cara «Obras» pone al lado de cada obra. Se devuelve aparte cuántas quedaron fuera de la suma,
 * para poder decirlo en vez de dejar una diferencia sin explicar.
 */
export function totalVisible(filas: CompraFiltrable[]): { total: number; anuladas: number; sinImporte: number } {
  let total = 0
  let anuladas = 0
  let sinImporte = 0
  for (const c of filas) {
    if (c.anulada) { anuladas += 1; continue }
    if (c.total === null || c.total === undefined) { sinImporte += 1; continue }
    total += Number(c.total)
  }
  return { total, anuladas, sinImporte }
}

export type AccionDeFila = 'ver' | 'vincular' | 'sin-numero'

/**
 * QUÉ SE LE OFRECE A CADA FILA. Es la regla de `AccionesCompra`: sin CLAVE no hay identidad de la
 * cual colgar un papel —al siguiente sync el vínculo apuntaría a cualquier lado—, así que no se
 * ofrece un botón que va a rebotar. Con papel, se ve; sin papel y con clave, se vincula.
 */
export function accionDeFila(c: { clave: string | null; tiene_adjunto: boolean }): AccionDeFila {
  if (c.tiene_adjunto) return 'ver'
  return c.clave ? 'vincular' : 'sin-numero'
}
