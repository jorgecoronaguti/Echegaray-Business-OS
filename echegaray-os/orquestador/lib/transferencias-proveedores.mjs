// EL COMPROBANTE DE UNA TRANSFERENCIA — decidir qué es y a quién le pagamos, sin red y sin base.
//
// Pedido del dueño, 09/09/2026, textual: «quiero que ingreses a mi mail de ecsas y descargues todos
// los comprobantes de transferencias y los coloques en las carpetas correspondientes de cada
// proveedor».
//
// Acá vive lo que se puede probar con `node --test`: CLASIFICAR (¿este PDF es un comprobante de
// transferencia NUESTRA a un tercero?), EXTRAER (importe, fecha, número, CUIT y CBU de quien
// cobra) y RESOLVER el proveedor. Lo impuro —Gmail, el bucket, el insert— vive en
// `orquestador/scripts/gmail-transferencias-proveedores.mjs`.
//
// ═══ POR QUÉ SE CLASIFICA POR TEXTO Y NO POR NOMBRE DE ARCHIVO ═══
//
// Medido sobre el buzón real: el mismo comprobante del Santander llega como
// `Simple_Jose_Maria_Robles_2026-09-09.pdf`, como `Comprobante_16625885.pdf` y como
// `solicitud-nro-15476287.pdf`. Tres nombres, un solo documento. Y al revés: `Comprobante de
// pago`, `O_P_…`, `COMP DEBITO` son nombres que también usan las órdenes de pago que nos mandan
// los CLIENTES, que no son una transferencia nuestra. El nombre no distingue; el cuerpo sí.
//
// ═══ LA DIRECCIÓN DEL DINERO ES LO QUE DECIDE ═══
//
// El comprobante trae DOS partes: quien recibe y quien ordena. Si ECSAS está en «quien recibe», es
// un COBRO —no tiene nada que hacer en la ficha de un proveedor— y por eso se descarta. El único
// comprobante que entra es aquel donde ECSAS ordena y un tercero cobra.

/** El CUIT de Echegaray Construcciones SAS, sin guiones. Es el que decide la dirección del pago. */
export const CUIT_ECSAS = '30716304643'

/** 11 dígitos o `null`. `null` NO es «sin CUIT»: es «no pude leer un CUIT acá». */
export function normalizarCuit(v) {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : null
}

/** «696.502,61» → 696502.61. El punto es miles y la coma decimal: es un PDF argentino. */
export function importeArgentino(s) {
  const t = String(s ?? '').trim().replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** «09/09/2026» o «09-09-2026» → «2026-09-09». Devuelve null si no es una fecha con forma. */
export function fechaISO(s) {
  const m = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(String(s ?? '').trim())
  if (!m) return null
  const [, d, mes, a] = m
  if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null
  return `${a}-${mes}-${d}`
}

/** El texto del PDF llega con saltos y espacios dobles; los regex de abajo asumen una sola línea. */
export function aplanar(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim()
}

// Las marcas del comprobante del Santander. Se piden VARIAS y no una: el título «Comprobante de
// transferencia» falta en la mitad de los ejemplares reales (el que baja desde el detalle del
// movimiento no lo trae), así que exigirlo dejaría afuera comprobantes legítimos.
const MARCAS = [
  /comprobante de transferencia/i,
  /fecha de ejecuci[oó]n/i,
  /n[uú]mero de comprobante/i,
  /plazo de acreditaci[oó]n/i,
  /cuenta de d[eé]bito/i,
  /\bCBU\b/i,
]

/** Lo que se lee del papel. Todo puede ser `null`: un campo que no está no se inventa. */
export function extraerComprobante(texto) {
  const t = aplanar(texto)
  const num = /n[uú]mero de comprobante\s*:?\s*(\d{4,})/i.exec(t)
  // UN SOLO DECIMAL TAMBIÉN ES UN IMPORTE. Medido: `Comprobante_16301130.pdf` (02/09/2026) dice
  // «Importe $ 14.675,5» —el banco no rellena el centavo cero— y exigir dos decimales descartaba en
  // silencio un comprobante legítimo. Un descarte silencioso es peor que un error: no se ve.
  const imp = /importe\s*:?\s*\$?\s*([\d.]+,\d{1,2})/i.exec(t)
  const fec = /fecha de ejecuci[oó]n\s*:?\s*(\d{2}[/-]\d{2}[/-]\d{4})/i.exec(t)
  const cbu = /\bCBU\s*:?\s*(\d{22})\b/i.exec(t)
  const nom = /nombre o raz[oó]n social\s*:?\s*(.+?)\s+(?:CBU|CUIT|Alias)\b/i.exec(t)
  // El CUIT de quien cobra viene rotulado «CUIT o CUIL»; el de quien ordena, «CUIT» a secas. Si se
  // buscara «CUIT» sin más, el primer match sería el del propio Santander en el pie.
  const cuitDest = /CUIT o CUIL\s*:?\s*(\d{2}-?\d{8}-?\d)/i.exec(t)
  const cuits = [...t.matchAll(/(\d{2}-\d{8}-\d)/g)].map((m) => normalizarCuit(m[1])).filter(Boolean)
  return {
    numero: num ? num[1] : null,
    importe: imp ? importeArgentino(imp[1]) : null,
    fecha: fec ? fechaISO(fec[1]) : null,
    cbuDestino: cbu ? cbu[1] : null,
    nombreDestino: nom ? nom[1].trim() : null,
    cuitDestino: cuitDest ? normalizarCuit(cuitDest[1]) : null,
    ordenanteEsEcsas: cuits.includes(CUIT_ECSAS) && (!cuitDest || normalizarCuit(cuitDest[1]) !== CUIT_ECSAS),
  }
}

/**
 * ¿ES UN COMPROBANTE DE UNA TRANSFERENCIA QUE ORDENAMOS NOSOTROS?
 *
 * Devuelve `{ es, motivo }` y no un booleano: cuando dice que no, el informe tiene que poder decir
 * por qué, o cada PDF descartado es una decisión sin rastro.
 */
export function clasificarTexto(texto) {
  const t = aplanar(texto)
  if (!t) return { es: false, motivo: 'sin texto (¿escaneado?)' }
  const marcas = MARCAS.filter((r) => r.test(t)).length
  if (marcas < 4) return { es: false, motivo: `no tiene forma de comprobante (${marcas}/6 marcas)` }
  const d = extraerComprobante(t)
  if (!d.numero || d.importe == null || !d.fecha) return { es: false, motivo: 'le faltan número, importe o fecha' }
  if (d.cuitDestino && d.cuitDestino === CUIT_ECSAS) return { es: false, motivo: 'es un COBRO: ECSAS es quien recibe' }
  if (!d.ordenanteEsEcsas) return { es: false, motivo: 'ECSAS no figura como quien ordena' }
  return { es: true, motivo: 'comprobante de transferencia ordenada por ECSAS', datos: d }
}

/**
 * A QUIÉN LE PAGAMOS. Nunca por nombre parecido: el nombre del comprobante («Robles Jose Maria»)
 * y el del padrón se parecen lo suficiente como para acertar casi siempre, y «casi siempre» en una
 * carpeta de proveedores significa el contrato de uno colgado de la ficha de otro.
 *
 * Orden: CUIT del padrón → un único pago con ese importe Y esa fecha exactos. Si ninguno resuelve,
 * devuelve `null` con el motivo, y el archivo va a «sin proveedor». Adivinar está prohibido.
 *
 *  · `padron`: [{ id, cuit }] — cuit ya normalizado a 11 dígitos.
 *  · `pagos`:  [{ proveedorId, importe, fecha }] — los pagos por banco ya conocidos.
 */
export function resolverProveedor(datos, { padron = [], pagos = [] } = {}) {
  if (datos?.cuitDestino) {
    const hit = padron.filter((p) => p.cuit === datos.cuitDestino)
    if (hit.length === 1) return { proveedorId: hit[0].id, criterio: 'cuit', motivo: `CUIT ${datos.cuitDestino}` }
    if (hit.length > 1) return { proveedorId: null, criterio: null, motivo: `CUIT ${datos.cuitDestino} repetido en ${hit.length} proveedores` }
  }
  if (datos?.importe != null && datos?.fecha) {
    // Centavo a centavo y día exacto. Una tolerancia acá convertiría dos pagos parecidos en el
    // mismo pago, que es precisamente el error que este cruce existe para no cometer.
    const cand = [...new Set(pagos
      .filter((p) => p.fecha === datos.fecha && Math.abs(Number(p.importe) - datos.importe) < 0.005)
      .map((p) => p.proveedorId))]
    if (cand.length === 1) return { proveedorId: cand[0], criterio: 'importe+fecha', motivo: `único pago de $${datos.importe} el ${datos.fecha}` }
    if (cand.length > 1) return { proveedorId: null, criterio: null, motivo: `${cand.length} proveedores con ese importe y fecha` }
  }
  return {
    proveedorId: null,
    criterio: null,
    motivo: datos?.cuitDestino ? `CUIT ${datos.cuitDestino} no está en el padrón` : 'sin CUIT legible y sin pago único que cruce',
  }
}

/**
 * LA RUTA DEL OBJETO: `<uid>/<proveedor|sin-proveedor>/<mail>-<nº de comprobante>.<ext>`
 *
 * El uid adelante es parte de la cerradura del bucket (policy de storage), no orden.
 *
 * ═══ EL `attachmentId` DE GMAIL NO SIRVE COMO IDENTIDAD, Y SE MIDIÓ ═══
 *
 * La primera versión ponía el `attachmentId` en la ruta. Dos corridas seguidas del importador
 * dejaron OCHO objetos para CUATRO comprobantes: Gmail devuelve un `attachmentId` distinto para el
 * mismo adjunto en cada lectura del mensaje. Lo estable es el mail y el NÚMERO DEL COMPROBANTE
 * —que es lo que identifica el papel—, así que la ruta se arma con eso y la segunda corrida
 * sobreescribe el mismo objeto en vez de crear otro.
 */
export function rutaObjeto({ uid, proveedorId, messageId, identificador, extension = 'pdf' }) {
  const corto = String(identificador ?? 'sin-numero').replace(/[^A-Za-z0-9]/g, '').slice(0, 32)
  return `${uid}/${proveedorId ?? 'sin-proveedor'}/${messageId}-${corto}.${extension}`
}
