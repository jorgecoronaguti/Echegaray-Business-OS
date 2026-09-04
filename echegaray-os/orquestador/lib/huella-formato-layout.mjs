// LA HUELLA DE FORMATO DE UN LAYOUT QUE YA NO EXISTE NO ES EVIDENCIA DE NADA.
//
// ═══ EL DEFECTO MEDIDO EL 04/09/2026 ═══
//
// `huella-formato.mjs` recuerda, por RANGO A1, qué formato dejó el OS, y antes de re-aplicarlo
// compara. Si difiere, concluye «lo cambiaste vos» y no lo pisa. Es la regla correcta y hay que
// conservarla: el diseño del dueño manda.
//
// Tiene un punto ciego exacto, y es justo el peor momento posible. Cuando el GENERADOR cambia el
// layout de su pestaña —«Impuestos y Financieros» pasó de 105 filas a 68 cuando el dueño dijo «no me
// sirven del cuadro 1 al 3»— todas las huellas viejas describen filas que ya no contienen lo que
// contenían. El formato vivo de `B23:N23` es el que el layout ANTERIOR dejó ahí, no coincide con
// ninguna huella, y la guarda lo lee como diseño del dueño. Resultado medido: los 419 rangos de
// formato bloqueados de golpe, y la pestaña publicada con los importes crudos —`1419600`,
// `16475640,46`— mientras el resto del archivo sí tiene su formato de moneda.
//
// Y el bloqueo es PERMANENTE: como no se re-aplica, tampoco se re-sella, así que la corrida
// siguiente encuentra lo mismo. La única salida era borrar las huellas a mano en la base, que es un
// paso que nadie puede repetir ni auditar.
//
// ═══ POR QUÉ ESTO NO DEBILITA LA GUARDA ═══
//
// Sólo se invalidan las huellas cuando el propio GENERADOR declara que cambió el layout, y ese
// cambio está en el código, versionado y revisado. No hay ninguna entrada del dueño que pueda
// disparar la invalidación: él edita celdas y formatos, no la altura de la grilla que emite el
// generador. Después de invalidar, la primera corrida vuelve a aplicar y a sellar —el camino que el
// propio `decidirFormato` documenta como «primera pasada»— y a partir de ahí la protección vuelve a
// estar entera sobre el layout NUEVO, que es el único sobre el que puede significar algo.
//
// SE INVALIDA LA PESTAÑA ENTERA Y NO LOS RANGOS QUE SE MOVIERON, a propósito: un cambio de layout
// corre todo lo que está debajo, así que "qué rango sigue significando lo mismo" no se puede
// contestar sin reconstruir el layout anterior. Invalidar de menos deja la mitad de la pestaña
// bloqueada, que es el defecto que esto viene a cerrar.

/**
 * NÚCLEO PURO: ¿el layout cambió lo suficiente como para que las huellas dejen de significar algo?
 *
 * El criterio es el de la COLUMNA A, que es donde vive la estructura: si la lista de rótulos que el
 * generador emite no es la misma —en contenido o en posición— que la que dejó la última vez, todo lo
 * que está debajo del primer cambio se corrió, y con ello el formato de cada rango.
 *
 * Un cambio de VALORES no cuenta: los importes se mueven en cada corrida y no corren una sola fila.
 *
 * @param {any[][]} antes la pestaña tal como estaba (valores leídos)
 * @param {any[][]} ahora la grilla que el generador va a escribir
 * @returns {{cambio:boolean, motivo:string}}
 */
export function elLayoutCambio(antes = [], ahora = []) {
  // SE RECORTAN LOS RENGLONES VACÍOS DEL FINAL, DE LOS DOS LADOS (04/09/2026). La grilla termina en un
  // separador en blanco y la API no lo devuelve al leer: 68 contra 67 en cada corrida. Sin el recorte
  // este control se disparaba SIEMPRE —invalidando 363 huellas por corrida— y un control que siempre
  // da positivo no controla nada: dejaba la guarda de formato apagada de hecho, que es justo lo que
  // vino a evitar.
  const rotulos = (g) => {
    const r = (g || []).map((f) => String(f?.[0] ?? '').replace(/\s+/g, ' ').trim())
    while (r.length && !r[r.length - 1]) r.pop()
    return r
  }
  const a = rotulos(antes)
  const b = rotulos(ahora)
  if (a.length !== b.length) {
    return { cambio: true, motivo: `la pestaña pasa de ${a.length} a ${b.length} filas` }
  }
  const i = a.findIndex((x, k) => x !== b[k])
  if (i < 0) return { cambio: false, motivo: 'los rótulos están donde estaban' }
  return {
    cambio: true,
    motivo: `la fila ${i + 1} pasa de "${a[i].slice(0, 40)}" a "${b[i].slice(0, 40)}"`,
  }
}

/**
 * Borra las huellas de formato de una pestaña. Impura: toca la base.
 *
 * Devuelve cuántas borró, para poder DECIRLO — una invalidación silenciosa es indistinguible de una
 * guarda que dejó de funcionar.
 */
export async function invalidarHuellasDeFormato(query, fileId, pestana) {
  const r = await query(
    'delete from public.sheet_huella_formato where file_id = $1 and pestana = $2',
    [fileId, pestana],
  )
  return r.rowCount ?? 0
}
