// EL FORMULARIO DE PRESUPUESTO DE ECHEGARAY, MEDIDO DEL PDF REAL.
//
// No es una interpretación del diseño: cada número de este archivo se extrajo del PDF que la
// empresa ya manda —«CAMBIO DE CORTINAS Y DEMAS.pdf»— leyendo las posiciones de su texto y los
// rectángulos de su content stream. Por eso están en PUNTOS y con dos decimales: son las
// coordenadas del documento original, no una aproximación a ojo.
//
// El origen es el de PDF: y=0 abajo, página A4 de 595×842 pt.
//
// ═══ POR QUÉ SE RECONSTRUYE Y NO SE RELLENA EL ORIGINAL ═══
//
// El PDF original es la salida de una planilla de Excel: no tiene campos de formulario ni texto
// editable en el sentido útil. Rellenarlo exigiría parchear operadores de texto adentro de un
// content stream comprimido —frágil y opaco—. Reconstruirlo con las mismas coordenadas da un
// documento que se ve igual y que además se puede auditar leyendo este archivo.

export const PAGINA = { ancho: 595, alto: 842 }

// Los colores salieron del content stream, no de una muestra de pantalla.
export const COLOR = {
  bandaEncabezado: '#676766',
  amarillo: '#fdc902',
  regla: '#000000',
  punteado: '#7f7f7f',
}

export const GEO = {
  // La regla negra bajo los logos.
  reglaSuperior: { x0: 49.47, x1: 543.2, y0: 688.74, y1: 691.65 },

  // El logo de Echegaray entra DOS VECES en el original, cada una recortada a un pedazo: el
  // isotipo y la palabra. Así estaba armado en el Excel, y así se reproduce.
  logo: [
    { recorte: { x0: 65.087, x1: 121.3214, y0: 714.9907, y1: 769.2835 }, caja: { x: -0.1980702, y: 654.1146, w: 192.8544, h: 124.6848 } },
    { recorte: { x0: 124.5746, x1: 234.255, y0: 715.7739, y1: 758.7365 }, caja: { x: 108.7726, y: 715.7739, w: 138.6622, h: 97.89368 } },
  ],
  // El isotipo del cliente, arriba a la derecha. Sin recorte: la caja es el recorte.
  logoCliente: { recorte: { x0: 441.35, x1: 519.1506, y0: 699.41, y1: 777.01 }, caja: { x: 441.35, y: 699.41, w: 77.80065, h: 77.6 } },
  // La firma escaneada, recortada igual que en el original.
  firma: { recorte: { x0: 235.8499, x1: 324.7616, y0: 229.16, y1: 321.3551 }, caja: { x: 224.1766, y: 187.1284, w: 119.5788, h: 156.5308 } },

  cliente: { x: 53.4, y: 667.4, tam: 16.5 },
  req: { derecha: 540.0, y: 667.4, tam: 8.7 },
  planta: { x: 52.4, y: 648.0, tam: 12.6 },
  titulo: { x: 52.4, y: 615.0, tam: 11.6 },

  // La banda del encabezado de la tabla y la franja amarilla de abajo.
  banda: { x0: 49.47, x1: 543.2, y0: 593.68, y1: 607.26 },
  franja: { x0: 49.47, x1: 543.2, y0: 581.07, y1: 594.65 },
  encabezado: { y: 596.6, tam: 9.7 },

  // Las columnas. `x` es el borde izquierdo del texto; `derecha`, el borde derecho de un número.
  col: {
    tarea: { x: 52.4, xDato: 63.0 },
    un: { x: 259.0, xDato: 256.1 },
    cant: { x: 302.6, xDato: 301.7 },
    unitario: { x: 339.5, signo: 345.3, derecha: 411.8 },
    subtotal: { x: 495.7, signo: 421.0, derecha: 539.8 },
  },

  // El renglón de la tabla: 10,67 pt de contenido + 0,97 pt de punteado = 11,64 de paso.
  fila: { primeraBase: 572.3, paso: 11.64, punteado: 0.97, tam: 7.8, tamMoneda: 8.7 },
  filaTope: 581.07, // el borde inferior de la franja amarilla, de donde cuelga la primera fila

  // El pie de la tabla. Las distancias son las del original, medidas contra la última punteada.
  totales: { desdeUltimaPunteada: 22.28, paso: 14.55, xEtiqueta: 291.0, signo: 420.0, derecha: 537.4, tam: 9.7 },
  // Y el bloque de abajo, medido contra la base de TOTAL.
  pie: {
    // ARCOR pide TRES cosas: precio, condición de pago y plazo de entrega. El formulario original
    // sólo trae «Forma de Pago», así que el plazo se agrega como su renglón gemelo, con el mismo
    // paso de 26,2 pt, y todo lo que va debajo baja esa misma distancia.
    nota1: 42.7, nota2: 69.9, nota3: 98.0, formaPago: 124.2, plazo: 150.4, fecha: 181.4, serie: 302.7,
    corrimientoPorPlazo: 26.2,
    xNota: 52.4, xValorNota: 84.4, xValorPago: 117.4, xValorPlazo: 127.0, tamNota: 9.7, tamFecha: 8.7, tamSerie: 7.8,
    derechaFecha: 539.9, derechaSerie: 541.3,
    firmaDesdeTotal: { y0: 264.64, y1: 172.44 },
  },
  pagina: { x: 521.9, y: 25.3, tam: 7.8 },
}

/** Importe en es-AR, sin el signo: el `$` va en su propia columna, como en el original. */
export function pesos(n) {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']
/** «San Juan, 21 de agosto de 2026», que es como lo escribe el original. */
export function fechaLarga(d) {
  return `San Juan, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

/**
 * LA ARITMÉTICA DEL CUADRO, QUE TIENE QUE CERRAR A LA VISTA.
 *
 * En los presupuestos originales hay dos renglones donde `cantidad × unitario` NO da el subtotal
 * impreso: falta exactamente $100.000 en cada uno. Nadie lo objetó, pero repetirlo a sabiendas es
 * mandar un documento que el comprador desarma con una calculadora.
 *
 * La regla acá es al revés: manda el SUBTOTAL —es el número aprobado, el que forma el total— y el
 * unitario se deriva de él. Redondeado a dos decimales, el subtotal se recalcula como
 * cantidad × unitario para que el papel multiplique bien. La diferencia contra el subtotal exacto
 * es de centavos y se devuelve, para que quien firme la vea en vez de descubrirla.
 */
export function cuadrar(items, { iva = 21 } = {}) {
  const r = (x) => Math.round(x * 100) / 100
  const filas = items.map((it) => {
    const unitario = r(it.subtotal / it.cantidad)
    return { ...it, unitario, subtotal: r(unitario * it.cantidad), subtotalExacto: it.subtotal }
  })
  const subtotal = r(filas.reduce((a, f) => a + f.subtotal, 0))
  const exacto = r(filas.reduce((a, f) => a + f.subtotalExacto, 0))
  const montoIva = r(subtotal * iva / 100)
  return { filas, subtotal, iva: montoIva, total: r(subtotal + montoIva), derivaPorRedondeo: r(subtotal - exacto) }
}
