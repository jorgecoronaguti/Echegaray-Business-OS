// EL PRESUPUESTO, DIBUJADO CON LAS COORDENADAS DEL ORIGINAL.
//
// Todo va posicionado en absoluto y en PUNTOS, con el mismo origen que el PDF (y desde abajo),
// para que las coordenadas de `formato-echegaray.mjs` se lean igual acá que en el documento del
// que salieron. Nada de flujo ni de layouts automáticos: un formulario que la empresa ya usa no
// se re-diseña, se reproduce.
import { PAGINA, COLOR, GEO, pesos } from './formato-echegaray.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Carlito tiene las MÉTRICAS de Calibri, que es la fuente del original: mismos anchos, mismos
// saltos de línea. Sustituir por Arial correría todas las columnas.
const FAMILIA = "'Carlito','Calibri',sans-serif"

/** Texto anclado por su línea de base, como lo ancla el PDF. */
function txt(x, base, tam, contenido, { peso = 400, estilo = 'normal', color = '#000', derecha = null } = {}) {
  const abajo = base - 0.25 * tam // el descendente de Carlito: 0,25 em bajo la base
  const pos = derecha == null
    ? `left:${x}pt`
    : `left:0;width:${derecha}pt;text-align:right`
  return `<div style="position:absolute;${pos};bottom:${abajo}pt;font-size:${tam}pt;line-height:1;`
    + `font-weight:${peso};font-style:${estilo};color:${color};white-space:pre">${esc(contenido)}</div>`
}

function caja(x0, y0, x1, y1, color) {
  return `<div style="position:absolute;left:${x0}pt;bottom:${y0}pt;width:${x1 - x0}pt;height:${y1 - y0}pt;background:${color}"></div>`
}

function punteada(x0, x1, y0, alto) {
  // El original usa un patrón de puntos; se reproduce con un degradado repetido, que imprime igual.
  return `<div style="position:absolute;left:${x0}pt;bottom:${y0}pt;width:${x1 - x0}pt;height:${alto}pt;`
    + `background-image:repeating-linear-gradient(to right,${COLOR.punteado} 0 0.55pt,transparent 0.55pt 1.5pt)"></div>`
}

/** Una imagen recortada: el recorte es la ventana; la caja, dónde cae la imagen dentro de ella. */
function imagen(uri, { recorte, caja: c }) {
  const w = recorte.x1 - recorte.x0
  const h = recorte.y1 - recorte.y0
  return `<div style="position:absolute;left:${recorte.x0}pt;bottom:${recorte.y0}pt;width:${w}pt;height:${h}pt;overflow:hidden">`
    + `<img src="${uri}" style="position:absolute;left:${c.x - recorte.x0}pt;bottom:${c.y - recorte.y0}pt;width:${c.w}pt;height:${c.h}pt">`
    + '</div>'
}

/**
 * @param p.cliente / p.planta / p.req / p.titulo / p.formaPago / p.notas[] / p.fecha (texto) / p.serie
 * @param p.cuadro  el resultado de `cuadrar()`
 * @param p.img     { logo, cliente, firma } como data: URI
 */
export function presupuestoHtml(p) {
  const g = GEO
  const P = []

  P.push(caja(g.reglaSuperior.x0, g.reglaSuperior.y0, g.reglaSuperior.x1, g.reglaSuperior.y1, COLOR.regla))
  for (const l of g.logo) P.push(imagen(p.img.logo, l))
  if (p.img.cliente) P.push(imagen(p.img.cliente, g.logoCliente))

  P.push(txt(g.cliente.x, g.cliente.y, g.cliente.tam, p.cliente))
  P.push(txt(0, g.req.y, g.req.tam, `REQ: ${p.req}`, { peso: 700, derecha: g.req.derecha }))
  P.push(txt(g.planta.x, g.planta.y, g.planta.tam, p.planta))
  P.push(txt(g.titulo.x, g.titulo.y, g.titulo.tam, p.titulo))

  P.push(caja(g.banda.x0, g.banda.y0, g.banda.x1, g.banda.y1, COLOR.bandaEncabezado))
  P.push(caja(g.franja.x0, g.franja.y0, g.franja.x1, g.franja.y1, COLOR.amarillo))
  const B = { peso: 700, color: '#fff' }
  P.push(txt(g.col.tarea.x, g.encabezado.y, g.encabezado.tam, 'TAREA', B))
  P.push(txt(g.col.un.x, g.encabezado.y, g.encabezado.tam, 'UN', B))
  P.push(txt(g.col.cant.x, g.encabezado.y, g.encabezado.tam, 'Cant', B))
  P.push(txt(g.col.unitario.x, g.encabezado.y, g.encabezado.tam, 'Precio Unicario', B))
  P.push(txt(g.col.subtotal.x, g.encabezado.y, g.encabezado.tam, 'Sub Total', B))

  // La punteada que corona la primera fila, sobre el borde de la franja amarilla.
  P.push(punteada(g.banda.x0, g.banda.x1, g.filaTope, g.fila.punteado))

  const { fila } = g
  let ultimaPunteada = 0
  p.cuadro.filas.forEach((f, i) => {
    const base = fila.primeraBase - i * fila.paso
    P.push(txt(g.col.tarea.xDato, base, fila.tam, f.tarea))
    P.push(txt(g.col.un.xDato, base, fila.tam, f.unidad))
    P.push(txt(g.col.cant.xDato, base, fila.tam, String(f.cantidad)))
    P.push(txt(g.col.unitario.signo, base, fila.tamMoneda, '$'))
    P.push(txt(0, base, fila.tamMoneda, pesos(f.unitario), { derecha: g.col.unitario.derecha }))
    P.push(txt(g.col.subtotal.signo, base, fila.tamMoneda, '$'))
    P.push(txt(0, base, fila.tamMoneda, pesos(f.subtotal), { derecha: g.col.subtotal.derecha }))
    ultimaPunteada = g.filaTope - (i + 1) * fila.paso - fila.punteado
    P.push(punteada(g.banda.x0, g.banda.x1, ultimaPunteada, fila.punteado))
  })

  const T = g.totales
  const baseSub = ultimaPunteada - T.desdeUltimaPunteada
  const lineas = [['SUB TOTAL', p.cuadro.subtotal], ['IVA', p.cuadro.iva], ['TOTAL', p.cuadro.total]]
  lineas.forEach(([et, val], i) => {
    const base = baseSub - i * T.paso
    P.push(txt(T.xEtiqueta, base, T.tam, et, { peso: 700 }))
    P.push(txt(T.signo, base, T.tam, '$', { peso: 700 }))
    P.push(txt(0, base, T.tam, pesos(val), { peso: 700, derecha: T.derecha }))
  })

  const baseTotal = baseSub - 2 * T.paso
  const pie = g.pie
  const italica = { estilo: 'italic' }
  const rotulo = { peso: 700, estilo: 'italic' }
  ;[pie.nota1, pie.nota2, pie.nota3].forEach((d, i) => {
    P.push(txt(pie.xNota, baseTotal - d, pie.tamNota, `Nota ${i + 1}:`, rotulo))
    P.push(txt(pie.xValorNota, baseTotal - d, pie.tamNota, p.notas[i] ?? '-', italica))
  })
  P.push(txt(pie.xNota, baseTotal - pie.formaPago, pie.tamNota, 'Forma de Pago:', rotulo))
  P.push(txt(pie.xValorPago, baseTotal - pie.formaPago, pie.tamNota, p.formaPago, italica))
  P.push(txt(pie.xNota, baseTotal - pie.plazo, pie.tamNota, 'Plazo de Entrega:', rotulo))
  P.push(txt(pie.xValorPlazo, baseTotal - pie.plazo, pie.tamNota, p.plazoEntrega, italica))
  P.push(txt(0, baseTotal - pie.fecha, pie.tamFecha, p.fecha, { derecha: pie.derechaFecha }))

  if (p.img.firma) {
    const f = g.firma
    // El bloque de la firma baja lo mismo que bajó TOTAL, más el renglón del plazo de entrega.
    const dy = baseTotal - 493.8 - pie.corrimientoPorPlazo
    P.push(imagen(p.img.firma, {
      recorte: { ...f.recorte, y0: f.recorte.y0 + dy, y1: f.recorte.y1 + dy },
      caja: { ...f.caja, y: f.caja.y + dy },
    }))
  }
  P.push(txt(0, baseTotal - pie.serie, pie.tamSerie, `SERIE: ${p.serie}`, { derecha: pie.derechaSerie }))
  P.push(txt(g.pagina.x, g.pagina.y, g.pagina.tam, 'Pág.1'))

  return `<!doctype html><meta charset="utf-8"><style>
  @page { size: ${PAGINA.ancho}pt ${PAGINA.alto}pt; margin: 0 }
  html,body { margin:0; padding:0 }
  body { width:${PAGINA.ancho}pt; height:${PAGINA.alto}pt; position:relative;
         font-family:${FAMILIA}; color:#000; -webkit-print-color-adjust:exact; print-color-adjust:exact }
  </style><body>${P.join('\n')}</body>`
}
