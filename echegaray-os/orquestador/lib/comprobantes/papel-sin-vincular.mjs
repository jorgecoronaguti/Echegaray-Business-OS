// ¿DE QUÉ GASTO ES ESTE PAPEL QUE NO CUELGA DE NINGUNA FILA? — clasificación con evidencia. Puro.
//
// Los 35 archivos del canal que quedaron sueltos no son un solo problema, y por eso un único
// «faltan 35» manda a cargar 35 gastos que en su mayoría ya están cargados. Son tres cosas
// distintas y cada una tiene un dueño distinto:
//
//   COPIA       el mismo comprobante que otro papel que YA cuelga de su fila (el fajo se reenvió
//               tres veces). No falta nada: cargarlo otra vez DUPLICARÍA el gasto.
//   OTRA_CLAVE  hay una fila en Compras con el MISMO NÚMERO de comprobante, pero la identidad no
//               coincide (otro punto de venta, otro CUIT) — el caso de la fila 932 (Lliteras). No se
//               vincula solo: si el punto de venta difiere, o el papel o la fila están mal escritos,
//               y decidir cuál sin ver el papel es inventar. Va con su fila candidata al dueño.
//   NO_ESTA     ninguna fila de Compras tiene ese número. Es el único que puede ser un gasto sin
//               cargar, y lo carga una persona.
//   SIN_LECTURA nadie leyó el papel (o se leyó y no dice número ni CUIT): no se puede clasificar sin
//               mirarlo. Declarar «no está» sobre algo que no se pudo leer sería afirmar de más.
//
// LA EVIDENCIA QUE SE USA YA ESTÁ GUARDADA: la lectura del bot (`comprobante_fajos.items`) o la del
// repaso con visión (`compra_adjunto.lectura`). Acá no se lee nada nuevo ni se gasta un crédito.
//
// EL TOTAL ES LA CORROBORACIÓN, NO EL CRUCE. Dos comprobantes distintos pueden compartir número, así
// que un candidato cuyo importe además coincide es mucho más fuerte que uno que sólo comparte el
// número — pero el importe solo nunca alcanza para vincular, y por eso se informa, no se decide.

import { mismoComprobante, numeroNormalizado, partesDeClave, normalizar } from './clave-conciliada.mjs'

export const CLASE = Object.freeze({
  COPIA: 'copia',
  OTRA_CLAVE: 'otra_clave',
  NO_ESTA: 'no_esta',
  SIN_LECTURA: 'sin_lectura',
})

export const ORDEN = Object.freeze([CLASE.COPIA, CLASE.OTRA_CLAVE, CLASE.NO_ESTA, CLASE.SIN_LECTURA])

export const QUE_HACER = Object.freeze({
  [CLASE.COPIA]: 'nada: el papel ya está a la vista en su fila — cargarlo sería duplicar el gasto',
  [CLASE.OTRA_CLAVE]: 'el dueño mira el papel y decide si la fila candidata es ese gasto',
  [CLASE.NO_ESTA]: 'el dueño decide si se carga a Compras (el papel ya está guardado)',
  [CLASE.SIN_LECTURA]: 'leer el papel (leer-adjuntos-sin-lectura.mjs) antes de afirmar nada',
})

/** ¿Los dos importes son el mismo? Tolerancia de un centavo: los totales vienen de dos redondeos. */
const mismoImporte = (a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b))
  && Math.abs(Number(a) - Number(b)) <= 0.01

/**
 * LAS FILAS DE COMPRAS QUE COMPARTEN EL NÚMERO DE COMPROBANTE. Puro.
 *
 * El número es lo que identifica al comprobante dentro de un proveedor, así que compartirlo es la
 * única pista objetiva cuando la identidad no coincide. El tipo también tiene que coincidir: una NC
 * y una factura con el mismo número son documentos opuestos y confundirlos invierte el signo.
 */
export function candidatasPorNumero(clave, espejo = [], { total = null } = {}) {
  const p = partesDeClave(clave)
  if (!p?.numero) return []
  return espejo
    .filter((f) => {
      const q = partesDeClave(f.clave)
      return q?.numero === p.numero && q.tipo === p.tipo
    })
    .map((f) => ({
      fila: f.fila, clave: f.clave, proveedor: f.proveedor ?? null, total: f.total ?? null,
      coincideTotal: mismoImporte(total, f.total),
      coincideProveedor: Boolean(normalizar(f.proveedor)) && normalizar(f.proveedor) === normalizar(p.identidad),
    }))
}

/**
 * LAS FILAS QUE COMPARTEN IMPORTE Y PROVEEDOR CON EL PAPEL. Puro.
 *
 * Es la red de abajo, para cuando el número no sirve porque uno de los dos lados lo escribió mal.
 * Se exigen LAS DOS cosas: el importe solo repite (dos cargas de combustible del mismo monto) y el
 * proveedor solo repite todavía más. Y se descarta si hay más de una fila: un empate no se adivina.
 */
function porImporteYProveedor(papel = {}, espejo = []) {
  const total = Number(papel.total)
  const prov = normalizar(papel.proveedor) || normalizar(partesDeClave(papel.clave)?.identidad)
  if (!Number.isFinite(total) || total === 0 || !prov) return []
  const cerca = espejo.filter((f) => {
    if (!mismoImporte(total, f.total)) return false
    const p = normalizar(f.proveedor)
    return Boolean(p) && (p === prov || p.startsWith(prov) || prov.startsWith(p))
  })
  if (cerca.length !== 1) return []
  return [{
    fila: cerca[0].fila, clave: cerca[0].clave, proveedor: cerca[0].proveedor ?? null, total: cerca[0].total ?? null,
    coincideTotal: true, coincideProveedor: true, porImporte: true,
  }]
}

/**
 * DE QUÉ GASTO ES ESTE PAPEL SUELTO. Puro.
 *
 * @param {{file_id:string, nombre?:string|null, clave:string|null, proveedor?:string|null, total?:number|null}} papel
 * @param {{vinculados:Array<{compra_clave:string, fila_compras?:number|null, proveedor?:string|null}>,
 *          espejo:Array<{fila:number, clave:string|null, proveedor?:string|null, total?:number|null}>}} ctx
 */
export function clasificarPapel(papel = {}, { vinculados = [], espejo = [] } = {}) {
  const base = { ...papel, candidatas: [], original: null }
  if (!papel.clave) {
    return { ...base, clase: CLASE.SIN_LECTURA, motivo: papel.motivoSinLectura ?? 'nadie leyó el papel' }
  }
  const original = vinculados.find((v) => v.compra_clave
    && mismoComprobante(papel.clave, v.compra_clave, { proveedorA: papel.proveedor ?? null, proveedorB: v.proveedor ?? null }))
  if (original) {
    return {
      ...base, clase: CLASE.COPIA, original: { clave: original.compra_clave, fila: original.fila_compras ?? null },
      motivo: `mismo comprobante que un papel ya vinculado a la fila ${original.fila_compras ?? '?'}`,
    }
  }
  const porNumero = candidatasPorNumero(papel.clave, espejo, { total: papel.total ?? null })
    // EL PUNTO DE VENTA MAL LEÍDO ROMPE EL NÚMERO ENTERO. Medido: el papel de VILLA DEL PINO se leyó
    // `0015-00015751` y la fila dice `0001-00015751` — mismo importe ($99.998,98), mismo proveedor,
    // números que no empatan. Sin esta pasada ese papel sale «no está en Compras» y el dueño carga
    // un gasto que ya está: un duplicado de $99.998,98. Con ella sale como candidata para mirar.
    // NUNCA vincula sola: exige proveedor E importe, y aun así la decide una persona.
  const candidatas = porNumero.length ? porNumero : porImporteYProveedor(papel, espejo)
  if (candidatas.length) {
    const fuerte = candidatas.filter((c) => c.coincideTotal).length
    return {
      ...base, clase: CLASE.OTRA_CLAVE, candidatas,
      motivo: candidatas.every((c) => c.porImporte)
        ? 'el número no empata con ninguna fila, pero una fila tiene el mismo importe Y el mismo proveedor'
        : `${candidatas.length} fila(s) con el número ${numeroNormalizado(partesDeClave(papel.clave).numero)}`
          + `${fuerte ? `, ${fuerte} con el mismo importe` : ', ninguna con el mismo importe'}`,
    }
  }
  return { ...base, clase: CLASE.NO_ESTA, motivo: 'ninguna fila de Compras tiene ese número de comprobante' }
}

/** Todos los sueltos, clasificados y agrupados. Puro. */
export function clasificarSueltos({ papeles = [], vinculados = [], espejo = [] } = {}) {
  const filas = papeles.map((p) => clasificarPapel(p, { vinculados, espejo }))
  // Dos archivos del mismo comprobante que nadie vinculó son UN gasto, no dos: si no se agrupan, la
  // lista «para cargar» le pide al dueño cargar dos veces el mismo papel.
  const gastos = new Map()
  for (const f of filas.filter((x) => x.clase === CLASE.NO_ESTA || x.clase === CLASE.OTRA_CLAVE)) {
    const l = gastos.get(f.clave) ?? []
    l.push(f)
    gastos.set(f.clave, l)
  }
  const porGasto = [...gastos.entries()].map(([clave, copias]) => ({
    clave,
    // LA CLASE DEL GASTO ES LA DE SU MEJOR COPIA. De cinco reenvíos del mismo papel el bot leyó uno
    // solo, así que las otras cuatro salen `no_esta` por falta de importe, no por falta de fila:
    // etiquetar el gasto con la primera copia lo mandaba a «cargar» teniendo una fila candidata.
    clase: copias.some((c) => c.candidatas.length) ? CLASE.OTRA_CLAVE : CLASE.NO_ESTA,
    // El proveedor y el importe no están en TODAS las copias: el bot leyó una y las demás entraron
    // como reenvío sin lectura propia. Se toma el primero que exista, que es un dato leído, no una
    // media inventada entre copias.
    proveedor: copias.find((c) => c.proveedor)?.proveedor ?? null,
    total: copias.find((c) => Number(c.total))?.total ?? null,
    copias: copias.length,
    candidatas: copias.find((c) => c.candidatas.length)?.candidatas ?? [],
  }))
  const resumen = Object.fromEntries(ORDEN.map((c) => [c, filas.filter((f) => f.clase === c).length]))
  return { filas, resumen, total: filas.length, gastosDistintos: gastos.size, porGasto }
}
