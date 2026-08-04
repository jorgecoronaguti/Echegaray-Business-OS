// LA DEUDA AGRUPADA POR PROVEEDOR — UN RENGLÓN CON EL TOTAL, Y SUS FACTURAS DEBAJO.
//
// Es lo que promete la fila 2 de la pestaña: "la deuda agrupada por proveedor (con el +/- para abrir
// sus facturas)". El diseño viejo lo armaba materializando la fila-cabecera de cada proveedor DESDE
// JS, con su nombre escrito como texto. Eso trae el defecto que el dueño reportó textual: "no se
// actualiza sola, y me deja huecos cuando se va uno que fue pagado" — al pagarle, la fila quedaba
// escrita y vacía, un hueco en el medio del cuadro.
//
// Acá el bloque entero es UN SOLO DERRAME. No hay ninguna fila materializada: si a un proveedor se le
// paga, su cabecera y sus facturas desaparecen y el cuadro se cierra solo, sin dejar nada.
//
// ═══ LO QUE NO PUEDE SER 100% VIVO, Y HAY QUE DECIRLO ═══
//
// El `+/-` de Sheets (rowGroups) es una propiedad de la HOJA con índices de fila fijos, no algo que
// una fórmula pueda emitir. Los DATOS se actualizan solos; los grupos hay que re-aplicarlos cuando
// cambia la composición. Por eso `rangosDeGrupo()` los calcula y el script los reescribe: mientras
// tanto el cuadro está bien, sólo el +/- puede quedar corrido hasta la próxima corrida.

/** Las columnas de Compras, por su letra. El origen se ancla a la GRILLA, no a la última fila. */
export const COL = Object.freeze({
  categoria: 'B', proveedor: 'E', comprobante: 'H', obra: 'J', tipoPago: 'P',
  proximoPago: 'Q', estado: 'X', comercial: 'AJ', saldo: 'AL',
})

/** Los rótulos del cuadro, en el orden del dueño. */
export const ROTULOS = Object.freeze([
  'Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra', 'Tipo de Pago', 'Categoría',
])

const rango = (letra, desde = 4) => `Compras!$${letra}$${desde}:$${letra}`

/**
 * LA FÓRMULA DEL BLOQUE ENTERO.
 *
 * Se arma con HSTACK/VSTACK en vez de literales `{ }` a propósito: en un archivo es-AR el separador
 * de columnas de un literal es `\` y el de filas `;`, y un solo carácter equivocado ahí no da error
 * — devuelve la tabla transpuesta. Con funciones no hay separador que confundir.
 *
 * El orden: proveedor con más deuda arriba; adentro, sus facturas por fecha de pago.
 *
 * @param {{desde?:number}} [o]
 * @returns {string} la fórmula, sin el `=`
 */
export function formulaBloqueAgrupado({ desde = 4 } = {}) {
  const c = (k) => rango(COL[k], desde)
  // Las siete columnas del cuadro, en el orden de los rótulos.
  const datos = `HSTACK(${c('proveedor')};${c('proximoPago')};${c('comprobante')};`
    + `${c('saldo')};${c('obra')};${c('tipoPago')};${c('categoria')})`
  return `IFERROR(LET(`
    + `d;FILTER(${datos};${c('estado')}="Pendiente";${c('comercial')}=1;${c('proveedor')}<>"");`
    + `n;UNIQUE(CHOOSECOLS(d;1));`
    + `t;MAP(n;LAMBDA(x;SUM(FILTER(CHOOSECOLS(d;4);CHOOSECOLS(d;1)=x))));`
    // Proveedores ordenados por deuda, de mayor a menor.
    + `p;CHOOSECOLS(SORT(HSTACK(n;t);2;FALSE);1);`
    + `REDUCE(;SEQUENCE(ROWS(p));LAMBDA(acc;i;LET(`
    + `x;INDEX(p;i);`
    // Las facturas de ESE proveedor, ordenadas por próximo pago.
    + `f;SORT(FILTER(d;CHOOSECOLS(d;1)=x);2;TRUE);`
    // La cabecera: nombre, total, y cuántas facturas son. Sin filas fijas: si no hay deuda, no hay
    // proveedor en `n`, y esta cabecera no existe — no queda un renglón vacío.
    + `cab;HSTACK(x;"";IF(ROWS(f)=1;"1 factura";ROWS(f)&" facturas");SUM(CHOOSECOLS(f;4));"";"";"");`
    // EL DETALLE REPITE EL NOMBRE, INDENTADO. Podría ir vacío —su cabecera está justo arriba— pero
    // una celda en blanco en el medio del cuadro es exactamente lo que el dueño reportó tres veces
    // como "faltan proveedores". La jerarquía se lee por la indentación y la negrita, no por el
    // hueco. Ninguna fila de detalle queda sin nombre.
    + `det;HSTACK(BYROW(CHOOSECOLS(f;1);LAMBDA(v;"     "&v));CHOOSECOLS(f;2);CHOOSECOLS(f;3);`
    + `CHOOSECOLS(f;4);CHOOSECOLS(f;5);CHOOSECOLS(f;6);CHOOSECOLS(f;7));`
    + `IF(i=1;VSTACK(cab;det);VSTACK(acc;cab;det))`
    + `)))`
    + `);"")`
}

/**
 * LOS RANGOS DEL `+/-`, calculados de los mismos datos que ve la fórmula.
 *
 * Un grupo por proveedor, sobre SUS filas de detalle (no sobre la cabecera: si la cabecera entrara,
 * al colapsar se escondería el proveedor entero y el cuadro quedaría en blanco).
 *
 * @param {Array<{proveedor:string}>} filas  las facturas pendientes, YA ordenadas como la fórmula
 * @param {number} filaAncla  la fila (base 1) donde arranca el derrame
 * @returns {Array<{proveedor:string, desde:number, hasta:number}>} filas base 1, inclusivas
 */
export function rangosDeGrupo(filas = [], filaAncla = 1) {
  const grupos = []
  let fila = filaAncla
  let actual = null
  for (const f of filas) {
    const p = String(f?.proveedor ?? '').trim()
    if (p !== actual) {
      actual = p
      fila += 1 // la cabecera del proveedor
      grupos.push({ proveedor: p, desde: fila, hasta: fila - 1 })
    }
    grupos[grupos.length - 1].hasta = fila
    fila += 1
  }
  // Un proveedor con UNA sola factura no necesita +/-: agrupar una fila sola es ruido.
  return grupos.filter((g) => g.hasta >= g.desde + 1)
}

/**
 * El orden en el que la fórmula emite las facturas: proveedor por deuda descendente, y adentro por
 * próximo pago ascendente. Existe para que `rangosDeGrupo` reciba EXACTAMENTE el mismo orden que va
 * a haber en la pestaña — si el JS ordenara distinto que la fórmula, el `+/-` agruparía filas de
 * otro proveedor y nadie lo notaría hasta plegarlo.
 *
 * @param {Array<{proveedor:string, proximoPago:*, saldo:number}>} filas
 */
export function mismoOrdenQueLaFormula(filas = []) {
  const total = new Map()
  for (const f of filas) {
    const p = String(f?.proveedor ?? '').trim()
    total.set(p, (total.get(p) ?? 0) + (Number(f?.saldo) || 0))
  }
  const clave = (v) => (typeof v === 'number' && v > 0 ? v : Number.POSITIVE_INFINITY)
  return [...filas].sort((a, b) => {
    const pa = String(a?.proveedor ?? '').trim()
    const pb = String(b?.proveedor ?? '').trim()
    if (pa !== pb) return (total.get(pb) ?? 0) - (total.get(pa) ?? 0)
    return clave(a?.proximoPago) - clave(b?.proximoPago)
  })
}

/** Cuántas filas ocupa el bloque: una cabecera por proveedor más una por factura. */
export function altoDelBloque(filas = []) {
  const provs = new Set(filas.map((f) => String(f?.proveedor ?? '').trim()))
  return provs.size + filas.length
}
