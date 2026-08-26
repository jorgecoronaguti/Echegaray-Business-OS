// LOS RECIBOS QUE ESTÁN EN DRIVE, LEÍDOS POR EL PORTAL — `public.recibo_cliente`.
//
// ═══ POR QUÉ EXISTE (26/08/2026) ═══
//
// Textual del dueño: «en la carpeta de drive hay todo un listado de recibos, tenes q agregarlos si
// no podes saber a q obra corresponde dejarlos ahi».
//
// La pantalla de Facturas mostraba SÓLO lo que tuviera `esquema_pago.factura_numero`, y ninguno de
// los 79 pagos del esquema tenía cargado un `recibo_numero`: los recibos existían como PDF en la
// carpeta del cliente y el portal no los conocía. `recibo_cliente` es el registro de ESOS ARCHIVOS.
//
// ═══ UN RECIBO Y SU FACTURA SON EL MISMO HECHO ═══
//
// Cuando el número del recibo coincide con el `recibo_numero` de un pago que ya está en pantalla, no
// se dibuja una fila más: se le cuelga la descarga a la que ya está. Dos filas para el mismo cobro
// harían que el cliente contara dos veces lo que pagó una.
//
// ═══ LO QUE NO SE HACE ═══
//
// No se rellena la obra que falta, no se convierte un `null` en «—» ni en 0, y no se publica el
// enlace de Drive: el cliente no tiene acceso a esa carpeta. La descarga pasa por `/portal/recibo/…`,
// que sirve el archivo con la credencial del OS y vuelve a comprobar el permiso.

import type { PagoConObra } from './esquema'
import { alcanzaLaObra, type AccesoDelPortal } from './permisos.ts'

/** La fila de `public.recibo_cliente` como llega de la base. */
export interface FilaRecibo {
  id: string
  obra_id: string | null
  numero: string | null
  fecha: string | null
  /** `numeric` de Postgres llega como string. NULL = el comprobante no declara importe. */
  monto: number | string | null
  moneda?: string | null
  nombre_archivo: string
  visible_portal: boolean
}

export type ReciboDelPortal = {
  id: string
  /** `null` = el recibo no dice de qué obra es. La fila se dibuja SIN renglón de obra. */
  obraId: string | null
  obraNombre: string
  numero: string | null
  fecha: string | null
  monto: number | null
  moneda: 'ARS' | 'USD'
  nombreArchivo: string
  /** `null` = este acceso no puede bajar el archivo. Ver `recibosDelPortal`. */
  descargaEn: string | null
}

/** La ruta que sirve el PDF con la credencial del OS. Se declara acá para que la pantalla y la
 *  puerta no puedan discrepar. */
export const rutaDeDescarga = (id: string): string => `/portal/recibo/${id}`

/** Copia de la policy `recibo_cliente_select`: sin `visible_portal` el cliente no lo ve. */
export const visibleAlCliente = (f: Pick<FilaRecibo, 'visible_portal'>): boolean => f.visible_portal === true

/**
 * LA CLAVE CON LA QUE UN RECIBO Y UN PAGO SE RECONOCEN.
 *
 * `10`, `Recibo 10`, `N° 010` y `REC-10` son el mismo recibo escrito por manos distintas: uno lo
 * tipeó administración en la ficha del cliente y el otro salió del nombre de un archivo de Drive.
 * Comparar los textos crudos haría que casi nunca coincidieran, y el cliente vería el mismo cobro
 * dos veces. `null` cuando no queda ningún dígito: sin número no hay a qué atarlo.
 */
export function claveDeRecibo(numero: string | null | undefined): string | null {
  const digitos = String(numero ?? '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '')
  return digitos.length ? digitos : null
}

/**
 * LOS RECIBOS QUE ESTE ACCESO PUEDE VER.
 *
 * @param alcanza el portero de obra, el mismo que filtra el esquema (`alcanzaLaObra`). Un recibo SIN
 *   obra sólo lo ve quien alcanza todas: no hay forma de afirmar que un papel sin obra le
 *   corresponda a un acceso acotado a dos obras. Falla cerrado, igual que el cronograma.
 * @param puedeVerMontos cuando es `false` NO viaja el importe Y NO viaja el enlace de descarga: el
 *   PDF está lleno de importes, y servirlo sería devolver por la puerta de atrás exactamente lo que
 *   el permiso retira. Se pone en `null`, nunca en 0.
 */
export function recibosDelPortal(
  filas: FilaRecibo[],
  nombres: Map<string, string>,
  alcanza: (obraId: string | null) => boolean,
  puedeVerMontos: boolean,
): ReciboDelPortal[] {
  return filas
    .filter((f) => visibleAlCliente(f) && alcanza(f.obra_id))
    .map((f): ReciboDelPortal => ({
      id: f.id,
      obraId: f.obra_id,
      // Sin nombre no se inventa un rótulo: la fila sale sin obra, que es lo que de verdad se sabe.
      obraNombre: (f.obra_id ? nombres.get(f.obra_id) : null) ?? '',
      numero: f.numero ?? null,
      fecha: f.fecha ?? null,
      monto: puedeVerMontos && f.monto != null && f.monto !== '' ? Number(f.monto) : null,
      moneda: f.moneda === 'USD' ? 'USD' : 'ARS',
      nombreArchivo: f.nombre_archivo,
      descargaEn: puedeVerMontos ? rutaDeDescarga(f.id) : null,
    }))
    // Por fecha descendente, y los sin fecha al final: una fecha ausente no puede empujar un recibo
    // al principio de la lista como si fuera el más nuevo.
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')
      || (a.numero ?? '').localeCompare(b.numero ?? '', 'es', { numeric: true }))
}

export type Costura = {
  /** `id` del pago → el recibo que lo documenta. */
  archivoDelPago: Map<string, ReciboDelPortal>
  /** Los que no corresponden a ninguna fila ya dibujada: van como fila propia. */
  sueltos: ReciboDelPortal[]
}

/**
 * ATAR CADA RECIBO A LA FILA QUE YA ESTÁ, O DEJARLO SOLO.
 *
 * @param filasEnPantalla los pagos que la pantalla YA dibuja (en Facturas, los que tienen número de
 *   factura). Un recibo cuyo pago no está en pantalla NO se esconde: sale como fila propia, porque
 *   esconderlo lo haría desaparecer sin que nadie lo note.
 */
export function costurarRecibos(filasEnPantalla: PagoConObra[], recibos: ReciboDelPortal[]): Costura {
  const porClave = new Map<string, PagoConObra>()
  for (const p of filasEnPantalla) {
    const clave = claveDeRecibo(p.reciboNumero)
    if (clave && !porClave.has(clave)) porClave.set(clave, p)
  }
  const archivoDelPago = new Map<string, ReciboDelPortal>()
  const sueltos: ReciboDelPortal[] = []
  for (const r of recibos) {
    const clave = claveDeRecibo(r.numero)
    const pago = clave ? porClave.get(clave) : undefined
    // Dos archivos para el mismo número: el segundo no pisa al primero, sale como fila propia. Que
    // existan dos papeles del mismo recibo es un hecho, y taparlo sería decidir cuál es el bueno.
    if (pago && !archivoDelPago.has(pago.id)) archivoDelPago.set(pago.id, r)
    else sueltos.push(r)
  }
  return { archivoDelPago, sueltos }
}

/** Lo que la puerta de descarga necesita saber de la fila. Nada más: cuanto menos viaja, menos hay
 *  que se pueda escapar. */
export interface ReciboParaLaPuerta {
  cliente_id: string
  obra_id: string | null
  visible_portal: boolean
}

/**
 * ¿ESTE ACCESO PUEDE BAJAR ESTE ARCHIVO? Las cinco condiciones, en un solo lugar y con test.
 *
 * Que la pantalla haya dibujado el enlace no autoriza nada: la URL se puede tipear. Y vive acá, en
 * una función pura, porque una puerta que sólo se puede probar levantando un servidor es una puerta
 * que en la práctica nadie prueba.
 *
 *   1. hay acceso                          4. el acceso alcanza la obra del recibo — y un recibo SIN
 *   2. el recibo es de SU cliente             obra sólo lo abre quien alcanza TODAS
 *   3. `visible_portal`                    5. `puede_ver_montos`: el PDF ES el estado de cuenta
 *                                             entero; servirlo sin ese permiso devolvería por la
 *                                             puerta de atrás lo que el permiso retira
 */
export function puedeBajarElRecibo(
  acceso: Pick<AccesoDelPortal, 'clienteId' | 'puedeVerMontos' | 'obras'> | null,
  fila: ReciboParaLaPuerta | null,
): boolean {
  if (!acceso || !fila) return false
  if (!acceso.puedeVerMontos) return false
  if (fila.cliente_id !== acceso.clienteId) return false
  if (!visibleAlCliente(fila)) return false
  return alcanzaLaObra(acceso.obras, fila.obra_id)
}

/**
 * EL ENCABEZADO `Content-Disposition` CON EL NOMBRE REAL DEL ARCHIVO.
 *
 * Los nombres traen tildes, espacios y dos puntos (`RECIBO 10 - 30:6:26.pdf`), y el navegador que no
 * los entiende guarda el archivo como `[id]` o `download`. Se mandan las dos formas: `filename` en
 * ASCII para el que no habla RFC 5987 y `filename*` en UTF-8 para el que sí. Las comillas y las
 * barras se sacan porque cortan el encabezado.
 */
export function nombreDeDescarga(nombre: string, bajar = false): string {
  const limpio = String(nombre || 'recibo.pdf').replace(/[\r\n"\\/]+/g, ' ').trim() || 'recibo.pdf'
  const ascii = limpio.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_')
  // `inline` POR DEFECTO: el cliente toca el recibo para MIRARLO. Bajarlo es la excepción y viaja en
  // `?descargar=1`. Antes siempre era `attachment` y para ver un papel había que guardarlo primero.
  return `${bajar ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(limpio)}`
}
