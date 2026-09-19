// EL DOCUMENTO IMPRESO — HTML de una carilla, sin una sola decisión de negocio adentro.
//
// ═══ POR QUÉ HTML Y NO UN PDF DIBUJADO A MANO ═══
//
// El repo tiene `pdf-lib`, pero sólo sabe partir PDF ajenos: dibujar una tabla con él es escribir
// un motor de maquetado a mano (saltos de línea, anchos, cortes de página) y descubrir el primer
// desborde cuando el documento ya está en la casilla del cliente. Chromium ya resuelve todo eso y
// está instalado para los tests de navegador. Se paga un proceso de más y se gana que el corte de
// página lo decida el motor que lo sabe hacer.
//
// ═══ ESTE ARCHIVO NO DECIDE NADA ═══
//
// Recibe el modelo de `estado-de-cuenta.mjs` y lo escribe. No suma, no compara, no elige qué
// mostrar: si un número no está en el modelo, no se imprime. Por eso es puro y por eso se puede
// probar sin abrir un navegador — el HTML es una cadena de texto que un test lee.
//
// ═══ LA BANDA QUE IMPIDE MANDARLO ═══
//
// Cuando el modelo trae `controles`, el documento sale con una banda roja de CONTROL INTERNO. No es
// decorativa: es la razón por la que este generador existe. El 24/08/2026 la pestaña tenía
// $17.553.946 del contrato de Pisos sin ninguna fila con fecha, y un estado de cuenta prolijo se lo
// habría contado al cliente como si su deuda fuera menor.

import { dolares, fechaAR, pesos } from './estado-de-cuenta.mjs'
import { cotizacionDeObra } from './estado-de-cuenta-contratos.mjs'

/** Los dos colores del logo, medidos sobre el archivo real. */
export const MARCA = Object.freeze({ grafito: '#30302F', amarillo: '#FDC900', regla: '#D8D6D2' })

/** El pie que declara que esto todavía no lo revisó nadie. Se imprime siempre, sin excepción. */
export const PIE = 'Preparado por el OS · pendiente de revisión y envío por Dirección'
/** Quién firma el documento. */
export const FIRMA = 'Administración · Echegaray Construcciones SAS'

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Un importe que puede no existir. Vacío se imprime "—", nunca "$ 0". */
const $ = (n) => (Number.isFinite(n) ? pesos(n) : '—')

const celdas = (xs, tag = 'td') => xs.map((x) => `<${tag}>${x}</${tag}>`).join('')
const fila = (xs, clase = '') => `<tr${clase ? ` class="${clase}"` : ''}>${celdas(xs)}</tr>`

/** Un bloque con su número y su título, como los diez de la hoja. */
const bloque = (n, titulo, cuerpo, clase = '') =>
  `<section class="b ${clase}"><h2><span class="n">${n}</span>${esc(titulo)}</h2>${cuerpo}</section>`

/** Una lista de definiciones — el formato de los bloques que son texto y no tabla. */
const definiciones = (pares) => `<dl>${pares
  .filter(([, v]) => v !== null && v !== undefined && v !== '')
  .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`

/** ENCABEZADO: quién, qué obras, a qué fecha y por qué período. */
function encabezado(m, logo) {
  const obras = m.obras.map((o) => o.nombre).join(' · ') || '—'
  return `<header>
    <div class="marca">${logo ? `<img src="${logo}" alt="Echegaray Construcciones">` : ''}</div>
    <div class="titulo">
      <h1>Estado de cuenta y calendario de cobros</h1>
      <p class="corte">Al ${esc(fechaAR(m.corte))}</p>
    </div>
  </header>
  <div class="ident">
    ${definiciones([
      ['Cliente', m.identidad.nombre ?? m.cliente],
      ['CUIT', m.identidad.cuit ?? 'a confirmar por Administración'],
      ['Obra(s)', obras],
      ['Período cubierto', `${fechaAR(m.periodo.desde)} — ${fechaAR(m.periodo.hasta)}`],
    ])}
  </div>`
}

/** BLOQUE 2 · el contrato o la cotización que rige, con el documento que hay que poder abrir. */
function contrato(m) {
  const c = m.contrato
  const pares = [
    ['Documento', c.documento],
    ['Fecha', c.fecha],
    ['Moneda', c.moneda === 'USD' ? 'Dólares estadounidenses' : 'Pesos argentinos'],
    ['Precio', c.precioDeclarado],
    ['Alcance', c.alcance],
    ['Forma de pago', c.formaPago],
    ['Plazo', c.plazo],
  ]
  const porObra = (c.porObra ?? []).length > 0
    ? `<table class="chica"><thead>${celdas(['Obra', 'Cotización', 'Fecha', 'Forma de pago pactada', 'Plazo'], 'th')}</thead><tbody>${
      m.obras.map((o) => {
        const q = cotizacionDeObra(c, o.rotulo)
        return fila([esc(o.nombre), esc(q?.documento ?? '—'), esc(q?.fecha ?? '—'),
          esc(q?.formaPago ?? '—'), esc(q?.plazo ?? '—')])
      }).join('')}</tbody></table>`
    : ''
  return bloque(2, 'Contrato de referencia',
    definiciones(pares) + porObra + `<p class="fuente">${esc(c.fuente)}</p>`)
}

/** BLOQUE 3 · el avance, transcripto de OBRAS cuadro 3. El documento no lo recalcula. */
function avance(m) {
  if (m.obras.length === 0) return bloque(3, 'Avance por obra', '<p class="vacio">Sin obras publicadas para este cliente.</p>')
  const filas = m.obras.map((o) => fila([
    `<strong>${esc(o.nombre)}</strong><span class="sub">${esc(o.plazo)}</span>`,
    esc(o.porcentajeCertificado), $(o.certificado), $(o.cobrado), $(o.porCobrar), $(o.contratado),
  ]))
  const t = (campo) => m.obras.reduce((a, o) => a + (o[campo] ?? 0), 0)
  return bloque(3, 'Avance por obra', `<table><thead>${
    celdas(['Obra', '% cert.', 'Certificado (neto)', 'Cobrado', 'Por cobrar', 'Contratado'], 'th')
  }</thead><tbody>${filas.join('')}</tbody><tfoot>${
    fila(['Total', '', $(t('certificado')), $(t('cobrado')), $(t('porCobrar')), $(t('contratado'))])
  }</tfoot></table>`)
}

/** BLOQUE 4 · cada cobro del período, con su comprobante y su moneda. */
function movimientos(m) {
  if (m.movimientos.length === 0) return bloque(4, 'Movimientos del período', '<p class="vacio">Sin cobros registrados en el período.</p>')
  const filas = m.movimientos.map((x) => fila([
    esc(fechaAR(x.fechaCobro)), esc(x.comprobante || '—'), esc(x.concepto), esc(x.forma),
    // EL BILLETE SE MUESTRA EN DÓLARES Y CON EL DÓLAR DE SU FACTURA AL LADO. Revaluarlo al de hoy
    // le cambiaría el importe a una factura que el cliente ya pagó.
    x.moneda === 'USD'
      ? `${esc(dolares(x.total))} billete${x.tcFactura ? `<span class="sub">a TC ${esc(x.tcFactura.toLocaleString('es-AR'))} · ${esc(pesos(x.pesosAlTcFactura))}</span>` : ''}`
      : $(x.total),
  ]))
  const pendienteDeValuar = m.cobradoSinValuar > 0
    ? `<p class="nota">Además, ${esc(dolares(m.cobradoSinValuar))} cobrados en dólares sin tipo de cambio declarado.</p>`
    : ''
  return bloque(4, 'Movimientos del período', `<table><thead>${
    celdas(['Fecha de cobro', 'Comprobante', 'Concepto', 'Forma', 'Importe'], 'th')
  }</thead><tbody>${filas.join('')}</tbody><tfoot>${
    fila(['Total cobrado en el período', '', '', '', $(m.cobradoDelPeriodo)])
  }</tfoot></table>${pendienteDeValuar}`)
}

/** BLOQUE 5 · el aging: si algo está vencido, en qué banda cae. */
function aging(m) {
  const b = m.aging.bandas
  const cols = [['Por vencer', b['Por vencer']], ['1–30 días', b['1–30']], ['31–60', b['31–60']],
    ['61–90', b['61–90']], ['+90', b['+90']]]
  if (m.aging.sinFecha > 0) cols.push(['Sin fecha de cobro', m.aging.sinFecha])
  return bloque(5, 'Antigüedad del saldo', `<table class="aging"><thead>${
    celdas([...cols.map(([k]) => esc(k)), 'Saldo total'], 'th')
  }</thead><tbody>${
    fila([...cols.map(([, v]) => $(v)), `<strong>${$(m.aging.total)}</strong>`])
  }</tbody></table>`)
}

/** BLOQUE 6 · los vencimientos que vienen — el calendario que el cliente tiene que poder agendar. */
function vencimientos(m) {
  if (m.vencimientos.length === 0) return bloque(6, 'Próximos vencimientos', '<p class="vacio">Sin vencimientos pendientes.</p>')
  const eq = m.equivalencia
  const filas = m.vencimientos.map((v) => fila([
    esc(fechaAR(v.fechaCobro)) + (v.fechaEstimada ? '<span class="sub">fecha estimada, a confirmar</span>' : ''),
    esc(v.concepto),
    esc(v.forma),
    // La equivalencia en dólares sólo aparece si el contrato está en dólares Y la fila declara de
    // qué certificación se trata. Nunca se estima una equivalencia para "quedar completos".
    eq && /certificaci/i.test(v.concepto) ? esc(dolares(eq.usdPorCuota)) + (v.iva ? ' + IVA' : '') : '',
    $(v.total),
  ], v.vencido ? 'vencido' : ''))
  return bloque(6, 'Próximos vencimientos', `<table><thead>${
    celdas(['Fecha de cobro', 'Concepto', 'Medio', 'Equivalencia', 'Importe'], 'th')
  }</thead><tbody>${filas.join('')}</tbody><tfoot>${
    fila(['Total pendiente', '', '', '', $(m.aging.total)])
  }</tfoot></table>`)
}

/** BLOQUE 7 · cómo se convierte el precio en plata el día del pago. */
function valuacion(m) {
  const eq = m.equivalencia
  const partes = [`<p>${esc(m.contrato.valuacion ?? 'Precios en pesos, sin ajuste pactado.')}</p>`]
  if (eq) {
    partes.push(definiciones([
      ['Contrato', `${dolares(eq.usdTotal)} + IVA`],
      ['Saldo por certificar', `${dolares(eq.usdSaldo)} + IVA en ${eq.cuotas} certificaciones quincenales`],
      ['Cada certificación', `${dolares(eq.usdPorCuota)} + IVA`],
      // LOS DOS DÓLARES SE DICEN JUNTOS. El de las filas explica el peso que el cliente ve; el del
      // día explica por qué ese peso no es el definitivo. Callar cualquiera de los dos deja el
      // documento afirmando un importe que después va a cambiar sin aviso.
      ['Tipo de cambio de referencia del calendario', eq.tcImplicito ? `$ ${eq.tcImplicito.toLocaleString('es-AR')}` : null],
      ['Tipo de cambio al ' + fechaAR(m.corte), m.tipoCambio.valor ? `$ ${m.tipoCambio.valor.toLocaleString('es-AR')}` : null],
    ]))
    partes.push('<p class="nota">Los importes en pesos del calendario son de referencia: el importe '
      + 'definitivo de cada certificación se fija el día del pago.</p>')
  }
  return bloque(7, 'Regla de valuación', partes.join(''))
}

/** BLOQUE 8 · dónde se transfiere. Sin CBU en la fuente, el bloque lo dice y no inventa uno. */
function medioDePago(m) {
  const c = m.cuenta ?? {}
  return bloque(8, 'Medio de pago', definiciones([
    ['Titular', c.titular ?? 'Echegaray Construcciones SAS'],
    ['CUIT', c.cuit ?? '30-71630464-3'],
    ['Banco / cuenta', c.cuenta ?? 'a confirmar por Administración'],
    ['CBU', c.cbu ?? 'a confirmar por Administración'],
    ['Alias', c.alias ?? 'a confirmar por Administración'],
    ['Pagos en efectivo', 'Se entregan contra recibo firmado por Administración.'],
  ]))
}

/** BLOQUE 9 · lo que el contrato dice que pasa si no se paga. Y nada más que eso. */
const atraso = (m) => bloque(9, 'Condiciones ante atraso', `<p>${esc(m.contrato.anteAtraso)}</p>`)

/** BLOQUE 10 · quién lo emite, quién lo firma y que todavía no lo revisó nadie. */
const firma = () => `<footer>
  <div class="firma"><span class="linea"></span><p>${esc(FIRMA)}</p>
    <p class="sub">Calvento Este 217 · San Juan · 264-4544550 · rodrigo@ecsas.com.ar</p></div>
  <p class="pie">${esc(PIE)}</p>
</footer>`

/** LA BANDA QUE FRENA EL ENVÍO. Sólo aparece si hay algo que resolver — y entonces aparece arriba. */
const bandaDeControl = (m) => (m.controles.length === 0 ? '' : `<div class="control">
  <strong>CONTROL INTERNO — no enviar con esta nota</strong>
  <ul>${m.controles.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
</div>`)

const CSS = `
  @page { size: A4; margin: 12mm 13mm 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 8pt/1.35 "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: ${MARCA.grafito}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; align-items: flex-end; justify-content: space-between;
    border-bottom: 2.5pt solid ${MARCA.amarillo}; padding-bottom: 5pt; }
  header img { height: 34px; display: block; }
  .titulo { text-align: right; }
  h1 { font-size: 13pt; margin: 0; font-weight: 600; letter-spacing: .2pt; }
  .corte { margin: 1pt 0 0; font-size: 8pt; color: #6C6A66; }
  .ident { margin: 6pt 0 2pt; }
  .ident dl { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 1pt 6pt; margin: 0; }
  .b { margin-top: 7pt; break-inside: avoid; }
  h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .7pt; font-weight: 700;
    margin: 0 0 3pt; padding-bottom: 2pt; border-bottom: .6pt solid ${MARCA.regla}; }
  h2 .n { display: inline-block; min-width: 13pt; color: ${MARCA.grafito};
    background: ${MARCA.amarillo}; text-align: center; margin-right: 5pt; border-radius: 1.5pt; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 1pt 6pt; margin: 0; }
  dt { color: #6C6A66; white-space: nowrap; }
  dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 2pt; }
  th { text-align: right; font-weight: 600; color: #6C6A66; font-size: 7pt; text-transform: uppercase;
    letter-spacing: .4pt; border-bottom: .6pt solid ${MARCA.regla}; padding: 2pt 3pt; }
  th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
  td { text-align: right; padding: 2pt 3pt; border-bottom: .4pt solid #EFEEEC; vertical-align: top; }
  tfoot td { border-top: .8pt solid ${MARCA.grafito}; border-bottom: none; font-weight: 700; }
  table.chica td, table.chica th { font-size: 7pt; }
  table.chica th:nth-child(n+3), table.chica td:nth-child(n+3) { text-align: left; }
  .aging td, .aging th { text-align: right; }
  .aging th:first-child, .aging td:first-child { text-align: right; }
  tr.vencido td { color: #A3341F; }
  .sub { display: block; font-size: 6.6pt; color: #8A8782; font-weight: 400; }
  .fuente { margin: 2pt 0 0; font-size: 6.6pt; color: #8A8782; word-break: break-all; }
  .nota { margin: 2pt 0 0; font-size: 7pt; color: #6C6A66; }
  .vacio { margin: 2pt 0; color: #8A8782; }
  .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12pt; }
  .dos .b { margin-top: 7pt; }
  .control { margin-top: 7pt; border: 1pt solid #A3341F; border-left: 3pt solid #A3341F;
    padding: 4pt 6pt; color: #A3341F; }
  .control ul { margin: 2pt 0 0; padding-left: 12pt; }
  footer { margin-top: 12pt; border-top: .6pt solid ${MARCA.regla}; padding-top: 5pt; }
  .firma .linea { display: block; width: 130pt; border-bottom: .6pt solid ${MARCA.grafito};
    margin-bottom: 3pt; }
  .firma p { margin: 0; font-weight: 600; }
  .firma .sub { font-weight: 400; }
  .pie { margin: 5pt 0 0; font-size: 7pt; color: #8A8782; font-style: italic; }
  .segunda { break-before: page; }
`

/**
 * NÚCLEO PURO: el modelo → el HTML de una carilla (dos cuando el cliente tiene más de una obra).
 *
 * EL SALTO DE PÁGINA NO ES ESTÉTICO: con una obra, todo entra en una carilla y el cliente ve su
 * cuenta de un vistazo. Con cuatro, el detalle de movimientos empuja el calendario abajo del pliegue
 * y lo primero que hay que leer —cuándo tiene que pagar— queda escondido. Por eso lo histórico se va
 * a la segunda hoja y la primera es siempre el estado y el calendario.
 *
 * @param {object} m el modelo de `armarEstadoDeCuenta`
 * @param {string|null} logo el logo como data URI, o null
 */
export function documentoHtml(m, logo = null) {
  const dosHojas = m.obras.length > 1
  const hoja1 = [
    bandaDeControl(m), contrato(m), avance(m), vencimientos(m), aging(m),
    `<div class="dos">${valuacion(m)}${medioDePago(m)}</div>`, atraso(m),
  ]
  const detalle = dosHojas
    ? `<div class="segunda">${movimientos(m)}</div>`
    : movimientos(m)
  const cuerpo = dosHojas
    ? [...hoja1, detalle, firma()]
    : [hoja1[0], contrato(m), avance(m), movimientos(m), vencimientos(m), aging(m),
      `<div class="dos">${valuacion(m)}${medioDePago(m)}</div>`, atraso(m), firma()]
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8">
<title>Estado de cuenta · ${esc(m.identidad.nombre ?? m.cliente)} · ${esc(fechaAR(m.corte))}</title>
<style>${CSS}</style></head><body>
${encabezado(m, logo)}
${cuerpo.join('\n')}
</body></html>`
}
