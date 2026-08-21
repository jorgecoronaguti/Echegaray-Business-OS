// LA PESTAÑA «SUBCONTRATISTAS», ARMADA CON FÓRMULAS Y NO CON RESULTADOS.
//
// Regla de oro 5 del dueño: *nunca un número pegado*. Acá se cumple literalmente — la única cosa
// que esta pestaña guarda es el NOMBRE y el RUBRO de cada uno, que son la decisión; todo lo demás
// (cuántos comprobantes, desde cuándo, cuánto, cuánto sin factura, en qué obras) lo calcula el
// Sheet contra «Compras» cada vez que se abre. Un comprobante nuevo de Tello aparece solo.
//
// Fórmulas en INGLÉS y con `;`, que es como habla un Sheet es_AR por API. Rangos CERRADOS
// (4:2000), nunca `E:E`. Ver `.claude/rules/sheets.md`.
import { GRUPOS, ALIAS_PROBABLE } from './padron.mjs'

const V = () => []
// El alto de «Compras» con margen: hoy llega a la fila 881.
const R = (col) => `Compras!$${col}$4:$${col}$2000`

/** Las fórmulas de una fila del cuadro, dado el número de fila donde va a caer. */
function fila(nombre, rubro, f) {
  const nom = `$A${f}`
  return [
    nombre, rubro,
    `=COUNTIF(${R('E')};${nom})`,
    `=IFERROR(MIN(FILTER(${R('C')};${R('E')}=${nom}));"")`,
    `=IFERROR(MAX(FILTER(${R('C')};${R('E')}=${nom}));"")`,
    `=SUMIF(${R('E')};${nom};${R('O')})`,
    `=F${f}-H${f}`,
    // Sin comprobante = sin número de comprobante cargado. Es el dato que hay, y dice lo que dice.
    `=SUMIFS(${R('O')};${R('E')};${nom};${R('H')};"")`,
    `=IFERROR(TEXTJOIN(", ";1;UNIQUE(FILTER(${R('K')};(${R('E')}=${nom})*(${R('K')}<>""))));"")`,
  ]
}

const ENCABEZADO = ['Subcontratista', 'Rubro para el que fue contratado', 'Comprob.',
  'Primer trabajo', 'Último trabajo', 'Total contratado', 'Con comprobante', 'Sin comprobante', 'Obras / destinos']

/** Devuelve { filas, formatos } — formatos son los rangos que hay que pintar como fecha o moneda. */
export function construir() {
  const f = []
  const fechas = []
  const monedas = []
  const porcentajes = []

  f.push(['SUBCONTRATISTAS — LOS TRABAJOS PUNTUALES: QUIÉN LOS HIZO Y CUÁNTO LLEVAMOS'])
  f.push(['Nombres sueltos que aparecen como proveedores en «Compras». Esta pestaña no guarda un solo monto: todos se calculan contra «Compras» por fórmula.'])
  f.push(V())

  f.push(['1 · LO QUE SE DECIDE'])
  f.push(['Subcontratistas', 'Total contratado', 'Sin comprobante fiscal', 'Proporción sin comprobante'])
  const fTitular = f.length + 1
  f.push([null, null, null, null]) // se completa abajo, cuando se sabe dónde cayó el cuadro
  f.push(V())

  const bloques = []
  GRUPOS.forEach((g, i) => {
    f.push([`${i + 2} · ${g.titulo}`])
    f.push(ENCABEZADO)
    const f0 = f.length + 1
    g.filas.forEach(([nombre, rubro], j) => f.push(fila(nombre, rubro, f0 + j)))
    const f1 = f0 + g.filas.length - 1
    f.push(['TOTAL', '', `=SUM(C${f0}:C${f1})`, '', '', `=SUM(F${f0}:F${f1})`, `=SUM(G${f0}:G${f1})`, `=SUM(H${f0}:H${f1})`])
    fechas.push(`D${f0}:E${f1}`)
    monedas.push(`F${f0}:H${f1 + 1}`)
    bloques.push({ clave: g.clave, f0, f1, total: f.length })
    f.push(V())
  })

  const sub = bloques.find((b) => b.clave === 'sub')
  f[fTitular - 1] = [
    `=COUNTA(A${sub.f0}:A${sub.f1})`,
    `=F${sub.total}`,
    `=H${sub.total}`,
    `=IF(B${fTitular}=0;"";C${fTitular}/B${fTitular})`,
  ]
  monedas.push(`B${fTitular}:C${fTitular}`)
  porcentajes.push(`D${fTitular}:D${fTitular}`)

  f.push(['CÓMO SE LEE ESTE CUADRO'])
  f.push(['· «Sin comprobante» es la suma de los comprobantes cargados SIN número de comprobante. En «Compras» esos figuran con Tipo N/A y Tipo de pago Efectivo.'])
  f.push(['· Los tres bloques están separados a propósito: si los honorarios del ingeniero y los ladrillones entran en el mismo total, «cuánto llevamos con subcontratistas» queda mal y nadie se entera.'])
  f.push(['· Quién es subcontratista es un JUICIO, no un campo de «Compras»: ninguna columna lo dice y no hay CUIT cargado para ninguno. El criterio vive en orquestador/lib/subcontratistas/padron.mjs y se discute línea por línea.'])
  f.push(V())
  f.push(['LO QUE NO ESTÁ CONFIRMADO'])
  for (const a of ALIAS_PROBABLE) {
    f.push([`«${a.enCompras}» y el legajo «${a.enLegajos}» parecen la misma persona.`,
      `${a.confianza}. Cobró como proveedor hasta el 03/08/2026 y tiene alta de AFIP el 05/08 con baja el 12/08.`])
  }
  f.push(V())
  f.push(['Generado por', 'orquestador/scripts/pestana-subcontratistas.mjs', 'Echegaray Business OS'])

  return { filas: f, fechas, monedas, porcentajes, bloques }
}
