// LA ORDEN DE COMPRA QUE RESPALDA LA OBRA, EN LA FICHA DE LA OBRA.
//
// Pedido del dueño (10/09/2026, 16:26, textual): «no veo el número de OC, no sé dónde está la OC ni
// su número una vez que entro a la obra». La OC existía en el OS —`cliente_orden`, bajada de
// Gmail— pero sólo se veía desde `/clientes` y desde la solapa Documentos: quien entraba a la obra
// para trabajar no tenía forma de saber con qué número la encargaron.
//
// ═══ POR QUÉ ESTE ARCHIVO NO VUELVE A AGRUPAR NADA ═══
//
// La clasificación (qué es OC, qué es OP, qué es un certificado de retención que lleva el número de
// SU orden de pago) y la agrupación por número canónico ya viven en
// `features/clientes/services/papelesCliente.ts`, probadas contra los 44 papeles reales de Messina.
// Repetirlas acá sería la cuarta pantalla con su propia idea de qué es una orden — y la que se
// separe en silencio va a decirle al dueño un número distinto del que dice la ficha del cliente.
// Acá sólo se ELIGE QUÉ SE DIBUJA y se arma el rótulo.
//
// ═══ UNA SOLA CONSULTA, Y NO ES DE ACÁ ═══
//
// Las filas las trae `getOrdenesDeObra` (una consulta a `cliente_orden` por `obra_id`), que la
// página ya pedía para la solapa Documentos: ahora también para el Resumen. No se agrega una
// segunda lectura, y la cerradura sigue siendo la RLS de la tabla —Dirección y Administración ven
// la cartera, el jefe de obra sólo su obra (`cliente_orden_select`, migración `20260909T1810`)—,
// nunca un filtro de esta capa.

import {
  agruparPapeles, hrefDelPapel, type Orden, type PapelCrudo,
} from '../../clientes/services/papelesCliente.ts'

/** EL TEXTO EXACTO que pidió el dueño cuando la obra no tiene ninguna OC bajada. */
export const SIN_OC = 'Sin OC registrada'

/** Y el de la obra que se factura en N: ahí la ausencia de OC NO es un faltante, es el circuito.
 *  Escribirla como faltante mandaría a alguien a buscar un papel que nadie emitió. */
export const SIN_OC_EN_N = 'Sin OC · obra en N'

/** Una línea del bloque: lo mínimo con lo que el dueño reconoce la orden sin abrir nada. */
export interface LineaOrden {
  clave: string
  /** Lo que se lee grande: «OC 2266». Sin número, «OC s/n» — una orden sin número existe igual. */
  rotulo: string
  numeroCorto: string | null
  fecha: string | null
  /** CON IVA, tal como lo dice el PDF del cliente. `null` = el PDF no lo dice; nunca estimado. */
  importe: number | null
  moneda: string | null
  /** Drive cuando el PDF está subido, el proxy del OS cuando todavía no (`hrefDelPapel`). */
  href: string
  enDrive: boolean
  /** Trazabilidad bajo demanda: de dónde salió cada dato de la línea. Va en el `title`, no en un
   *  párrafo permanente debajo del número. */
  title: string
}

export interface BloqueOrdenes {
  oc: LineaOrden[]
  op: LineaOrden[]
  /** `true` = la lectura falló. «No pude leerlas» NO se dibuja como «no hay ninguna»: un control
   *  que no pudo mirar no puede decir que no está. */
  fallo: boolean
  /** Qué escribir cuando no hay ninguna OC. Lo decide el dominio, no la pantalla. */
  vacioOC: string
}

/** El rótulo grande de una orden. `s/n` y no un hueco: la orden existe aunque el PDF no la numere. */
function rotulo(clase: 'oc' | 'op', numeroCorto: string | null): string {
  return `${clase === 'oc' ? 'OC' : 'OP'} ${numeroCorto ?? 's/n'}`
}

function lineaDe(o: Orden): LineaOrden {
  const copias = o.ids.length > 1 ? ` · ${o.ids.length} copias del mismo PDF` : ''
  return {
    clave: o.clave,
    rotulo: rotulo(o.clase, o.numeroCorto),
    numeroCorto: o.numeroCorto,
    fecha: o.fecha,
    importe: o.importe,
    moneda: o.moneda,
    href: hrefDelPapel({ driveFileId: o.driveFileId, archivoId: o.archivoId }),
    enDrive: Boolean(o.driveFileId),
    // El número CRUDO va en el title y no en pantalla: «00002-00002266» gasta el ancho de la
    // tarjeta sin decir nada que «2266» no diga, pero es lo que hay que buscar en el mail.
    title: `${o.numeroCanonico ?? 'sin número'} · cliente_orden ${o.archivoId}${copias}`
      + ` · ${o.driveFileId ? 'PDF en Drive' : 'PDF en el bucket del OS'}`,
  }
}

/**
 * LO QUE DIBUJA LA FICHA DE LA OBRA. Puro: se prueba sin base y sin navegador.
 *
 * `papeles === null` significa que la lectura falló, y eso NO es una obra sin órdenes.
 *
 * `enNegro` es la categoría B/N de la obra según `public.cobranzas`. Entra POR PARÁMETRO y no se
 * consulta acá por dos motivos, los dos medidos el 10/09/2026 contra la base viva:
 *   · `authenticated` no tiene `select` sobre `cobranzas` y ninguna vista publica la categoría
 *     (`obra_cobranza` publica cobrado/por cobrar, no B/N), así que hoy la web no la puede leer;
 *   · `cobranzas` se resuelve a obra por `norm_obra(obra_cliente) = obra_alias.alias`, y las filas
 *     N de Messina resuelven a la obra madre `messina`, no a sus obras hijas.
 * Mientras la fuente no exista, la ficha pasa `null` = NO SE SABE, y el texto es el de siempre.
 * Inventar un «obra en N» sin fuente sería fabricar un dato para tapar un faltante.
 */
export function bloqueDeOrdenes(
  papeles: readonly PapelCrudo[] | null,
  { obraId, enNegro = null }: { obraId: string; enNegro?: boolean | null },
): BloqueOrdenes {
  const vacioOC = enNegro === true ? SIN_OC_EN_N : SIN_OC
  if (papeles === null) return { oc: [], op: [], fallo: true, vacioOC }
  // Se agrupa el conjunto ENTERO que vino de la obra —facturas y retenciones incluidas— porque de
  // ellas salen los vínculos: la retención se ata a su OP por el nombre del archivo, y sin pasarlas
  // volvería a contarse como una orden de pago más. `porObra` devuelve sólo lo que quedó atribuido
  // a esta obra; una OP que el agrupador no pudo atribuir vive en la ficha del cliente, no acá.
  const { porObra } = agruparPapeles(papeles)
  const resumen = porObra.get(obraId)
  return {
    oc: (resumen?.oc ?? []).map(lineaDe),
    op: (resumen?.op ?? []).map(lineaDe),
    fallo: false,
    vacioOC,
  }
}

/**
 * LO MISMO, PARA LAS FILAS QUE YA VIENEN RECORTADAS POR LA BASE.
 *
 * `getOrdenesDeObra` consulta con `.eq('obra_id', obraId)` y no trae `obra_id` en el `select`
 * —para qué, si es el valor por el que filtró—. Reponerlo acá NO es atribuir nada: es el mismo
 * dato con el que la base ya recortó. Se hace en una función aparte y no dentro de
 * `bloqueDeOrdenes` porque esa recibe conjuntos donde `obra_id` sí distingue (los 44 papeles del
 * cliente entero), y forzarlo ahí metería en esta obra las órdenes que nadie pudo atribuir.
 */
export function bloqueDeOrdenesDeLaObra(
  papeles: readonly Omit<PapelCrudo, 'obra_id'>[] | null,
  { obraId, enNegro = null }: { obraId: string; enNegro?: boolean | null },
): BloqueOrdenes {
  const conObra = papeles?.map((p) => ({ ...p, obra_id: obraId })) ?? null
  return bloqueDeOrdenes(conObra, { obraId, enNegro })
}
