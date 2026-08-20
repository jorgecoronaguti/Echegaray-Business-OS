// EL FOOTPRINT: DÓNDE ESTUVE, AUNQUE HOY NO ESCRIBA NADA AHÍ — la cuarta evidencia de propiedad.
//
// ═══ POR QUÉ EXISTE (14/08) ═══
//
// El dueño, sobre "Jornales por Quincena": *"palabras en columnas que no corresponden"*. Lo corrigió a
// mano tres veces y volvió tres veces. Es siempre el mismo hecho: cuando un cuadro cambia de alto, la
// fila que el layout nuevo ya no usa se queda con lo que el layout anterior tenía ahí.
//
// Y el generador SÍ pide limpiarla —`cola-de-rango` extiende la grilla con el centinela `VACIO`, que
// significa "esta celda es mía y va vacía"—. Lo que le falta es la PRUEBA de que esa celda es suya, y
// la prueba se destruía sola:
//
//   1. una celda escrita con `VACIO` no tiene contenido, así que `huellasDeEscritura` no sella nada;
//   2. el barrido de `guardarHuellas` borra las huellas viejas de la ventana escrita — incluida la de
//      esa celda, que es justo la que probaba que la escribí yo;
//   3. la corrida siguiente ve una celda OCUPADA (el residuo sigue publicado) y SIN huella: la firma
//      exacta de "nunca fue mía y tiene algo tuyo" → se conserva. Para siempre, y en cada corrida.
//
// Las tres evidencias que ya existían prueban que una celda es MÍA HOY. Ésta prueba algo distinto y es
// la que faltaba: **que la celda estuvo adentro de mi footprint y el layout de hoy ya no la ocupa.**
// El registro no se destruye cuando dejo de escribir contenido ahí: se MARCA como abandonada,
// conservando la última forma que dejé escrita. Esa forma es lo que después separa mi residuo de una
// nota del dueño en la misma coordenada.
//
//     footprint + hoy tiene MI forma        →  residuo mío       →  se limpia
//     footprint + hoy tiene OTRA forma      →  escribiste encima →  se conserva
//     sin footprint                         →  nunca estuve ahí  →  no se toca JAMÁS
//
// La tercera línea es la que hace que esto no sea un permiso de borrado por rectángulo: adentro del
// mismo rectángulo conviven celdas mías abandonadas y celdas del dueño, y sólo las primeras tienen
// registro. EL LADO PARA EQUIVOCARSE ES CONSERVAR: sin registro, sin forma sellada o ante la duda, la
// celda se queda como está.

import { query } from './db.mjs'
import { claveCelda, formaComparable, formaDe } from './huella-forma.mjs'

/**
 * NÚCLEO PURO: parte el mapa sellado en las dos preguntas que responde.
 *
 *   · `activas`   — celdas que ocupo HOY con contenido: las evidencias 1 a 3.
 *   · `footprint` — celdas que ocupé y ya no: la cuarta.
 *
 * Se parten y no se mezclan porque una entrada abandonada NO puede contestar "¿esta celda es mía
 * hoy?": si contestara que sí, una celda que YO mismo limpié y hoy está vacía se leería como
 * "huella propia + celda vacía" y quedaría anotada como borrada por el dueño — una marca que no se
 * revisa nunca más y que dejaría al generador sin poder volver a escribir esa fila el día que el
 * cuadro vuelva a ocuparla.
 */
export function partirPorFootprint(huellas = new Map()) {
  const activas = new Map()
  const footprint = new Map()
  for (const [k, h] of huellas) (h?.abandonada ? footprint : activas).set(k, h)
  return { activas, footprint }
}

/**
 * NÚCLEO PURO: ¿lo que hay HOY en esta celda es el residuo que dejé yo?
 *
 * Devuelve `null` cuando no hay nada que probar —no está en el footprint, o el registro no guarda una
 * forma con la que comparar—, y en ese caso la celda no se toca. Nunca decide por la posición sola:
 * la forma sellada es la mitad obligatoria de la prueba, la misma exigencia que ya hace `aplicarHuella`
 * para limpiar una celda propia.
 *
 * @returns {null | {veredicto: 'residuo'|'editada', forma: string}}
 */
export function veredictoDeFootprint(footprint = new Map(), fila, col, hoy) {
  const p = footprint.get(claveCelda(fila, col))
  const forma = formaComparable(p?.forma)
  if (!p || !forma) return null
  return { veredicto: formaComparable(formaDe(hoy)) === forma ? 'residuo' : 'editada', forma: p.forma }
}

/**
 * PERSISTENCIA: marca las celdas que este generador dejó de ocupar, conservando la forma sellada.
 *
 * Es un upsert y no un insert porque la celda puede venir de una huella viva (el caso normal: hoy
 * dejé de escribirla) o de un footprint anterior que se vuelve a confirmar. `abandonada_en` se pone
 * una sola vez —`coalesce`— para que la fecha diga cuándo dejé la celda, no cuándo la miré de nuevo.
 *
 * `escrito_en` sí se refresca con el sello de la corrida: sin eso el barrido de `guardarHuellas` se
 * llevaría la marca en la misma transacción que la crea.
 *
 * Sin forma no se marca nada: un registro sin forma no puede probar nada después y sólo serviría para
 * borrar por posición, que es exactamente lo que este archivo NO hace.
 */
export async function marcarAbandonadas(fileId, pestana, celdas = [], sello = new Date()) {
  let marcadas = 0
  for (const c of celdas) {
    if (!c || !String(c.forma ?? '').trim()) continue
    const fila = c.fila
    const col = c.col
    await query(
      `insert into public.sheet_huella_celda (file_id, pestana, fila, col, forma, huella, abandonada_en, escrito_en)
       values ($1,$2,$3,$4,$5,$6,now(),$7)
       on conflict (file_id, pestana, fila, col)
       do update set abandonada_en = coalesce(public.sheet_huella_celda.abandonada_en, now()),
                     forma = excluded.forma, escrito_en = excluded.escrito_en`,
      [fileId, pestana, fila, col, c.forma, c.huella ?? '', sello],
    )
    marcadas++
    // La pestaña se corrió de lugar: la marca vieja quedaría apuntando a una celda que ya no es ésa.
    // Es el mismo tratamiento que reciben las supresiones, y por la misma razón.
    if (c.filaMapa !== undefined && c.filaMapa !== fila) {
      await query('delete from public.sheet_huella_celda where file_id = $1 and pestana = $2 and fila = $3 and col = $4',
        [fileId, pestana, c.filaMapa, col])
    }
  }
  return marcadas
}
