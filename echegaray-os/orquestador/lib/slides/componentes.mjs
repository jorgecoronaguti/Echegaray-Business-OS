// LOS SEIS CUERPOS DE LÁMINA. Cada uno recibe el contenido ya validado y el rectángulo donde
// puede dibujar, y devuelve cajas. Ninguno decide QUÉ decir; ninguno acepta que le digan CÓMO.
//
// El componente que falta es tan importante como los que están: no hay «lámina libre». Si el
// contenido no entra en ninguno de estos seis, el motor lo rechaza en vez de improvisar una
// composición nueva — que es exactamente el momento en el que una plantilla deja de serlo.
//
// PURO.

import { COLOR, GRILLA, SLACK_UNA_LINEA, TIPO } from './marca.mjs'
import { ajustarTamano, anchoTexto, medirBullets, medirTexto, repartirEnFila } from './layout.mjs'
import { bullets, imagen, rect, regla, tabla, texto } from './cajas.mjs'

const TONO = { neutro: COLOR.amarillo, positivo: COLOR.positivo, negativo: COLOR.negativo, alerta: COLOR.alerta }
const TONO_TEXTO = { neutro: COLOR.tinta, positivo: COLOR.positivo, negativo: COLOR.negativo, alerta: COLOR.alerta }

/** Texto corrido + lista de puntos. El caso más común y el más fácil de arruinar: doce bullets de
 *  tres líneas. El reparto en láminas ya pasó antes de llegar acá (ver `plantillas.mjs`). */
export function cuerpoPuntos({ lamina, x, y, ancho, alto }) {
  const cajas = []
  let cursor = y
  if (lamina.bajada) {
    const m = medirTexto(lamina.bajada, { ancho: ancho * 0.86, tamano: TIPO.subtitulo.tamano, alto: TIPO.subtitulo.alto })
    cajas.push(texto({ x, y: cursor, ancho: ancho * 0.86, alto: m.altoPt + 2, contenido: lamina.bajada, estilo: TIPO.subtitulo }))
    cursor += m.altoPt + 16
  }
  const m = medirBullets(lamina.puntos, { ancho, tamano: TIPO.bullet.tamano, alto: TIPO.bullet.alto })
  cajas.push(bullets({ x, y: cursor, ancho, alto: Math.min(m.altoPt + 6, alto - (cursor - y)), items: lamina.puntos, estilo: TIPO.bullet }))
  return cajas
}

/** Dos bloques de 6 columnas. Comparar dos cosas es la mitad de las láminas de una reunión, y
 *  ponerlas una debajo de la otra las convierte en una secuencia en vez de una comparación. */
export function cuerpoDosColumnas({ lamina, x, y, ancho, alto }) {
  const [izq, der] = repartirEnFila(2, { x, ancho, canaleta: GRILLA.canaleta * 2 })
  const cajas = []
  for (const [col, datos] of [[izq, lamina.izquierda], [der, lamina.derecha]]) {
    // La regla va 22 pt abajo del tope de la caja, no 17: el renderer baja la línea base y a 17
    // el amarillo cruzaba las letras — se leía como un tachado, no como un subrayado.
    cajas.push(texto({ x: col.x, y, ancho: col.ancho, alto: 14, contenido: datos.titulo.toUpperCase(), estilo: { ...TIPO.kicker, color: COLOR.tinta, tamano: 10 } }))
    cajas.push(regla({ x: col.x, y: y + 22, ancho: 28, grosor: 2, color: COLOR.amarillo }))
    const m = medirBullets(datos.puntos, { ancho: col.ancho, tamano: TIPO.bullet.tamano, alto: TIPO.bullet.alto })
    cajas.push(bullets({ x: col.x, y: y + 36, ancho: col.ancho, alto: Math.min(m.altoPt + 6, alto - 36), items: datos.puntos, estilo: TIPO.bullet }))
  }
  return cajas
}

/** Tarjetas de indicador. La franja de color arriba es lo único que cambia entre tarjetas: si
 *  cambiara el fondo entero, cuatro tarjetas serían cuatro carteles y ninguno se leería. */
export function cuerpoIndicadores({ lamina, x, y, ancho, alto }) {
  const cajas = []
  let cursor = y
  if (lamina.bajada) {
    const m = medirTexto(lamina.bajada, { ancho: ancho * 0.86, tamano: TIPO.subtitulo.tamano, alto: TIPO.subtitulo.alto })
    cajas.push(texto({ x, y: cursor, ancho: ancho * 0.86, alto: m.altoPt + 2, contenido: lamina.bajada, estilo: TIPO.subtitulo }))
    cursor += m.altoPt + 18
  }
  const cols = repartirEnFila(lamina.indicadores.length, { x, ancho })
  const altoTarjeta = Math.min(126, alto - (cursor - y))
  const AIRE = 14
  const ALTO_VALOR = 38
  // EL CUERPO DEL VALOR NO ES FIJO, Y NO PUEDE SERLO: cuatro tarjetas dejan 118 pt útiles y
  // «$ 84,2 M» a 30 pt mide 126 — se partía en dos líneas y se comía la nota de abajo. El tamaño
  // se calcula contra el ancho REAL de la tarjeta, que es lo único que lo determina.
  const anchoUtil = cols[0].ancho - AIRE * 2
  const tamanoValor = Math.min(...lamina.indicadores.map((ind) => ajustarTamano(ind.valor, {
    ancho: anchoUtil / SLACK_UNA_LINEA, altoDisponible: ALTO_VALOR, tamano: TIPO.kpiValor.tamano,
    alto: TIPO.kpiValor.alto, piso: 0.55, negrita: TIPO.kpiValor.negrita,
  }).tamano))
  lamina.indicadores.forEach((ind, i) => {
    const c = cols[i]
    cajas.push(rect({ x: c.x, y: cursor, ancho: c.ancho, alto: altoTarjeta, relleno: COLOR.fondo }))
    cajas.push(rect({ x: c.x, y: cursor, ancho: c.ancho, alto: 3, relleno: TONO[ind.tono] || COLOR.amarillo }))
    cajas.push(texto({ x: c.x + AIRE, y: cursor + 16, ancho: anchoUtil, alto: 22, contenido: ind.rotulo.toUpperCase(), estilo: TIPO.kpiRotulo }))
    cajas.push(texto({
      x: c.x + AIRE, y: cursor + 44, ancho: anchoUtil, alto: ALTO_VALOR, contenido: ind.valor,
      estilo: { ...TIPO.kpiValor, tamano: tamanoValor, color: TONO_TEXTO[ind.tono] || COLOR.tinta },
    }))
    if (ind.nota) cajas.push(texto({ x: c.x + AIRE, y: cursor + 86, ancho: anchoUtil, alto: altoTarjeta - 92, contenido: ind.nota, estilo: TIPO.kpiNota }))
    if (ind.origen === 'EXTERNO') {
      cajas.push(rect({ x: c.x + c.ancho - 12, y: cursor + 12, ancho: 6, alto: 6, relleno: COLOR.externo, forma: 'ELLIPSE' }))
    }
  })
  return cajas
}

/** Tabla. La cabecera en grafito y las filas separadas por una línea de 0,5: sin bordes verticales,
 *  que es lo que distingue una tabla legible de una grilla de Excel pegada en una lámina. */
export function cuerpoTabla({ lamina, x, y, ancho, alto }) {
  const n = lamina.columnas.length
  const derecha = new Set(lamina.alinear_derecha || [])
  // La primera columna es la etiqueta y lleva más aire; las numéricas se reparten lo que queda.
  const primera = Math.min(ancho * 0.34, ancho / n + 60)
  const resto = (ancho - primera) / (n - 1)
  const anchoColumnas = [primera, ...Array.from({ length: n - 1 }, () => resto)]
  const filas = lamina.filas.map((f) => Array.from({ length: n }, (_, i) => String(f[i] ?? '')))
  const altoFila = 24
  return [tabla({
    x, y, ancho, alto: Math.min((filas.length + 1) * altoFila, alto),
    columnas: lamina.columnas, filas, anchoColumnas, alinearDerecha: [...derecha],
  })]
}

/** Barras horizontales dibujadas con formas. Se descartó el gráfico nativo de Sheets embebido:
 *  ata la presentación a una planilla que después alguien mueve, y el motivo por el que existe
 *  esta lámina es que no dependa de nada. La escala arranca SIEMPRE en cero. */
export function cuerpoBarras({ lamina, x, y, ancho, alto }) {
  const cajas = []
  const anchoRotulo = Math.min(ancho * 0.32, 200)
  const anchoValor = 74
  const pista = ancho - anchoRotulo - anchoValor - 24
  const maximo = Math.max(...lamina.series.map((s) => Math.abs(s.valor)), 1)
  const altoBarra = 16
  const paso = Math.min(38, Math.max(26, Math.floor(alto / lamina.series.length)))
  lamina.series.forEach((s, i) => {
    const yb = y + i * paso
    cajas.push(texto({ x, y: yb, ancho: anchoRotulo, alto: altoBarra + 2, contenido: s.rotulo, estilo: TIPO.barraRotulo, valign: 'MIDDLE' }))
    cajas.push(rect({ x: x + anchoRotulo + 12, y: yb + 2, ancho: pista, alto: altoBarra, relleno: COLOR.fondo }))
    const largo = Math.max(2, (Math.abs(s.valor) / maximo) * pista)
    cajas.push(rect({ x: x + anchoRotulo + 12, y: yb + 2, ancho: largo, alto: altoBarra, relleno: TONO[s.tono] || COLOR.amarillo }))
    cajas.push(texto({
      x: x + ancho - anchoValor, y: yb, ancho: anchoValor, alto: altoBarra + 2,
      contenido: s.texto || String(s.valor), estilo: TIPO.barraValor, alineacion: 'END', valign: 'MIDDLE',
    }))
  })
  if (lamina.unidad) {
    cajas.push(texto({ x, y: y + lamina.series.length * paso + 4, ancho, alto: 12, contenido: `en ${lamina.unidad}`, estilo: TIPO.pie }))
  }
  return cajas
}

const ESTADO = { hecho: COLOR.positivo, en_curso: COLOR.amarillo, pendiente: COLOR.linea }

/** Línea de tiempo horizontal. Vertical se lee como otra lista más; horizontal se lee como
 *  duración, que es la única razón por la que alguien pide una línea de tiempo. */
export function cuerpoHitos({ lamina, x, y, ancho }) {
  const cajas = []
  const n = lamina.hitos.length
  const paso = ancho / n
  const yLinea = y + 46
  cajas.push(regla({ x, y: yLinea, ancho, grosor: 1.5, color: COLOR.linea }))
  lamina.hitos.forEach((h, i) => {
    const cx = x + paso * i
    const anchoCol = paso - 12
    cajas.push(texto({ x: cx, y, ancho: anchoCol, alto: 14, contenido: h.fecha.toUpperCase(), estilo: { ...TIPO.kicker, color: COLOR.suave } }))
    const m = medirTexto(h.titulo, { ancho: anchoCol, tamano: 11.5, alto: 1.25 })
    cajas.push(texto({ x: cx, y: y + 17, ancho: anchoCol, alto: m.altoPt + 2, contenido: h.titulo, estilo: { tamano: 11.5, negrita: true, alto: 1.25, color: COLOR.tinta } }))
    cajas.push(rect({ x: cx, y: yLinea - 4.25, ancho: 10, alto: 10, relleno: ESTADO[h.estado] || COLOR.linea, forma: 'ELLIPSE' }))
    if (h.detalle) {
      const d = medirTexto(h.detalle, { ancho: anchoCol, tamano: TIPO.kpiNota.tamano, alto: TIPO.kpiNota.alto })
      cajas.push(texto({ x: cx, y: yLinea + 14, ancho: anchoCol, alto: d.altoPt + 2, contenido: h.detalle, estilo: TIPO.kpiNota }))
    }
  })
  return cajas
}


/**
 * FLUJO — el proceso como una cadena de pasos, no como una lista de viñetas.
 *
 * ═══ POR QUÉ HACÍA FALTA ═══
 *
 * Un modelo de trabajo con etapas encadenadas se explicaba con `puntos`, y una lista no dice que el
 * paso 3 viene DESPUÉS del 2 ni que hay algo que valida el pase. El dueño lo dijo mirando el
 * resultado: «muchas palabras por slide, no hay imágenes que siempre sirven para facilitar
 * comprensión». Un diagrama de proceso no es decoración: es la única forma de que se vea la
 * secuencia sin leerla.
 *
 * Cada paso es una caja con su número, su nombre y —si se declara— la compuerta que hay que cumplir
 * para pasar al siguiente. Entre paso y paso, una flecha.
 */
export function cuerpoFlujo({ lamina, x, y, ancho, alto }) {
  const pasos = lamina.pasos ?? []
  const cajas = []
  const CANAL = 22
  const anchoPaso = (ancho - CANAL * (pasos.length - 1)) / pasos.length
  const altoCaja = Math.min(72, Math.max(52, alto * 0.30))
  const yPaso = y + 6

  // ═══ EL NOMBRE VA DEBAJO DE LA CAJA, NO ADENTRO ═══
  //
  // Adentro tenía 24 pt de sangría más los 14 que Slides le suma a toda caja de texto: sobre una
  // columna de 105 pt quedaban 67, y ahí «Preparación» y «Ejecución» se partían al medio por más que
  // se les bajara el cuerpo. Se vio en la lámina renderizada, tres veces seguidas, hasta entender que
  // el problema no era el tamaño sino el lugar. Afuera el nombre dispone de la columna entera, la
  // caja queda como un bloque limpio con su número, y el conjunto se lee mejor.
  pasos.forEach((p, i) => {
    const px = x + i * (anchoPaso + CANAL)
    const activo = p.destacado === true
    cajas.push(rect({ x: px, y: yPaso, ancho: anchoPaso, alto: altoCaja, relleno: activo ? COLOR.tinta : COLOR.fondo, borde: activo ? null : COLOR.linea }))
    cajas.push(rect({ x: px, y: yPaso, ancho: anchoPaso, alto: 3, relleno: COLOR.amarillo }))
    cajas.push(texto({
      x: px, y: yPaso + altoCaja / 2 - 15, ancho: anchoPaso, alto: 30,
      contenido: String(i + 1).padStart(2, '0'),
      estilo: { tamano: 22, negrita: true, alto: 1.1, color: activo ? COLOR.amarillo : COLOR.suave },
      alineacion: 'CENTER',
    }))
    if (i < pasos.length - 1) {
      cajas.push(texto({
        x: px + anchoPaso, y: yPaso + altoCaja / 2 - 9, ancho: CANAL, alto: 18,
        contenido: '→', estilo: { tamano: 13, negrita: true, alto: 1, color: COLOR.suave }, alineacion: 'CENTER',
      }))
    }
    const rotulo = String(p.titulo ?? '')
    const yNombre = yPaso + altoCaja + 12
    const t = ajustarTamano(rotulo, { ancho: anchoPaso - 8, altoDisponible: 34, tamano: 12.5, alto: 1.2, negrita: true })
    cajas.push(texto({
      x: px, y: yNombre, ancho: anchoPaso, alto: 34,
      contenido: rotulo, estilo: { tamano: t.tamano, negrita: true, alto: 1.2, color: COLOR.tinta },
    }))
    if (p.gate) {
      cajas.push(rect({ x: px, y: yNombre + 40, ancho: Math.min(anchoPaso, 40), alto: 2, relleno: COLOR.amarillo }))
      cajas.push(texto({
        x: px, y: yNombre + 48, ancho: anchoPaso, alto: 26,
        contenido: String(p.gate), estilo: { ...TIPO.kicker, tamano: 8, color: COLOR.suave },
      }))
    }
  })
  return cajas
}

/**
 * IMAGEN — una imagen que ocupa la lámina, con su epígrafe.
 *
 * `createImage` va en el lote separado del motor: si Google no puede bajar la URL, se pierde la
 * imagen y no la lámina entera. Por eso el epígrafe se dibuja igual: una lámina sin la foto pero con
 * su texto sigue diciendo algo.
 */
export function cuerpoImagen({ lamina, x, y, ancho, alto }) {
  const epigrafe = String(lamina.epigrafe ?? '')
  const altoEpigrafe = epigrafe ? 18 : 0
  const altoImagen = Math.max(60, alto - altoEpigrafe - (epigrafe ? 8 : 0))
  const cajas = [imagen({ x, y, ancho, alto: altoImagen, url: String(lamina.imagen_url ?? ''), capa: 'contenido' })]
  if (epigrafe) {
    cajas.push(texto({
      x, y: y + altoImagen + 8, ancho, alto: altoEpigrafe,
      contenido: epigrafe, estilo: { ...TIPO.pie, color: COLOR.suave },
    }))
  }
  return cajas
}

export const CUERPOS = {
  puntos: cuerpoPuntos,
  dos_columnas: cuerpoDosColumnas,
  indicadores: cuerpoIndicadores,
  tabla: cuerpoTabla,
  barras: cuerpoBarras,
  hitos: cuerpoHitos,
  flujo: cuerpoFlujo,
  imagen: cuerpoImagen,
}
