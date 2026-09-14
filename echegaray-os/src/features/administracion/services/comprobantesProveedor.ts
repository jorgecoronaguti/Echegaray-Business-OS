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

/** Un año, o `SIN_FECHA` para las compras que la pestaña no fechó. */
export type AnioFiltro = number | typeof SIN_FECHA
export const SIN_FECHA = 'sin-fecha'

export interface FiltrosComprobantes {
  anio: AnioFiltro
  papel: FiltroPapel
  /** Lo tipeado en el buscador, recortado. `null` = sin búsqueda. */
  numero: string | null
}

const Anio = z.union([z.literal(SIN_FECHA), z.coerce.number().int().min(2000).max(2100)])
const Papel = z.enum(['todos', 'con', 'sin'])
const Numero = z.string().trim().min(1).max(60)

/**
 * LOS FILTROS SALEN DE LA URL, O SEA DE QUIEN TIPEA. Un valor que no pasa Zod vuelve al default:
 * `?anio=hola` no puede terminar en una lista vacía que parezca «no le compramos nada».
 */
export function filtrosDeURL(
  sp: Record<string, string | undefined>, anioPorDefecto: number,
): FiltrosComprobantes {
  const anio = Anio.safeParse(sp.anio)
  const papel = Papel.safeParse(sp.papel)
  const numero = Numero.safeParse(sp.n ?? '')
  return {
    anio: anio.success ? anio.data : anioPorDefecto,
    papel: papel.success ? papel.data : 'todos',
    numero: numero.success ? numero.data : null,
  }
}

/** Lo mínimo de una compra que estas reglas miran. */
export interface CompraFiltrable {
  fecha: string | null
  comprobante: string | null
  tiene_adjunto: boolean
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
    else anios.add(a)
  }
  const lista: AnioFiltro[] = [...anios].sort((x, y) => y - x)
  return sinFecha ? [...lista, SIN_FECHA] : lista
}

/** Las compras del año elegido. Es la población de los chips: el resto de los filtros recorta. */
export function delAnio<T extends { fecha: string | null }>(filas: T[], anio: AnioFiltro): T[] {
  return filas.filter((f) => anioDe(f.fecha) === anio)
}

/**
 * EL NÚMERO SE BUSCA COMO LO ESCRIBE UNA PERSONA. En la pestaña conviven `0003-00012345`,
 * `3-12345` y `A 0003 00012345`: comparar el texto crudo haría que «12345» no encuentre nada.
 * Si lo buscado trae dígitos se comparan sólo los dígitos; si no, el texto sin mayúsculas.
 */
export function coincideNumero(comprobante: string | null, buscado: string | null): boolean {
  if (!buscado) return true
  if (!comprobante) return false
  const digitos = buscado.replace(/\D/g, '')
  if (digitos) return comprobante.replace(/\D/g, '').includes(digitos)
  return comprobante.toLowerCase().includes(buscado.toLowerCase())
}

export function filtrarComprobantes<T extends CompraFiltrable>(filas: T[], f: FiltrosComprobantes): T[] {
  return filas.filter((c) => {
    if (f.papel === 'con' && !c.tiene_adjunto) return false
    if (f.papel === 'sin' && c.tiene_adjunto) return false
    return coincideNumero(c.comprobante, f.numero)
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
