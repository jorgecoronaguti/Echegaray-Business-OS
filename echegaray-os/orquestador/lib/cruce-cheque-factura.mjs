// EL CRUCE FORMAL CHEQUE ↔ FACTURA — de qué factura es cada cheque que todavía no debitó.
//
// ═══ EL AGUJERO QUE ESTO CIERRA, MEDIDO EL 06/08/2026 ═══
//
// Doce cheques VIVOS (DEBITADO="No") por $7.585.223 que vencen en agosto eran INVISIBLES para CAJA
// COMPROMETIDA, para la escalera de vencimientos y para la proyección a 30 días. No por un error de
// fórmula: porque su factura en Compras dice "Pagado" con FECHA DE CAJA ANTERIOR AL CORTE del
// extracto, y con esos dos datos `estadoDeEgreso` concluye —bien, con lo que sabe— que la plata ya
// salió y emite REAL. Un REAL no lo mira ninguna vista de proyección, por diseño.
//
//   Compras f633  Diesel Rodriguez   0003-00000460  $2.010.000  caja 03/07  Pagado/Cheque
//     · cheques FISICO 314 y 315 · $1.000.000 · DEBITADOS  → ésos SÍ están en el saldo del banco
//     · cheques FISICO 316 y 316 · $1.010.000 · VIVOS      → ésos NO: vencen el 12/08
//
// La fila entera valía REAL. La mitad de esa fila es un hecho y la otra mitad es un compromiso, y
// **la única fuente que sabe cuál es cuál es el registro de cheques**. Compras no lo puede saber
// sola: su columna "Estado" habla de la OBLIGACIÓN (¿la cancelé?), no del INSTRUMENTO (¿salió la
// plata?). `caja-canales.mjs` ya había cerrado el caso fácil —cheque con fecha de caja POSTERIOR al
// corte— y éste es el difícil: fecha anterior, cheque vivo.
//
// ═══ POR QUÉ EL CRUCE ES UNA CASCADA Y NO UNA REGLA ═══
//
// La llave natural es el N° de comprobante que el registro lleva en su columna H. Existe y sirve —
// pero en el registro vivo de hoy dice "VARIAS" en 8 filas y está vacía en 5, porque un cheque
// redondo de $750.000 no paga una factura: paga un pedazo de la cuenta corriente del corralón. Por
// eso hay tres claves, de la más fuerte a la más débil, y cada cruce viaja con la que lo produjo:
//
//   (a) COMPROBANTE  — cheque.H == compras.H normalizados, y mismo proveedor. Es un HECHO.
//   (b) PROVEEDOR+IMPORTE — sin N°, pero hay UNA factura del mismo proveedor por exactamente esa
//       plata, dentro de la ventana. Es una INFERENCIA, y reusa `inferirRespaldo` —no una copia—
//       porque es la misma pregunta que ya se contesta para el cruce contra ARCA.
//   (c) CONJUNTO — un cheque contra un conjunto acotado (≤4) de facturas del mismo proveedor cuya
//       suma da EXACTAMENTE el importe. Es la traducción de "VARIAS" y es la más débil de las tres.
//
// AMBIGUO NO ES UN CRUCE. Si una clave devuelve dos candidatos, no se elige: se declara. Medido: los
// cheques FISICO 325 y 326 de Diesel dicen los dos "0003-00000468" y en Compras hay DOS filas con ese
// mismo número ($679.999 y $680.000). Elegir una a ojo pondría el compromiso en la fila equivocada y
// nadie lo vería nunca más; el hueco declarado se cierra cargando un dato. Es la misma regla que ya
// gobierna `inferirRespaldo` y la memoria del repo ("no escribir donde el mapeo dice que no").

import { normNombre } from './razon-social.mjs'
import { normComprobante, esLlaveUtil, inferirRespaldo, VENTANA_DIAS_CHEQUE } from './cheques-cobertura.mjs'
import { mismaMarca } from './glifos.mjs'

/** Con qué clave se emparejó cada cheque. Viaja con el cruce: un consumidor puede exigir la fuerte. */
export const CONFIANZA = Object.freeze({
  comprobante: 'comprobante',
  importe: 'proveedor+importe',
  conjunto: 'conjunto de facturas',
})

/** Por qué un cheque vivo NO se cruzó. Cada motivo es una carga distinta del dueño, no un bug. */
export const SIN_CRUCE = Object.freeze({
  ambiguo: 'ambiguo — más de una factura candidata; elegir a ojo pondría el compromiso en la fila equivocada',
  sinFactura: 'su N° de comprobante no está en Compras — falta cargar la factura',
  sinRespaldo: 'sin N° y sin factura ni conjunto de facturas que dé exactamente este importe',
})

/** LAS PUERTAS. Un cheque vivo entra al libro por UNA sola, y `puertaDeCheque` es total sobre ellos. */
export const PUERTA = Object.freeze({
  compras: 'Compras',
  cheques: 'Cheques Emitidos',
  ninguna: 'ninguna — hueco declarado',
})

/**
 * Cuántas facturas puede juntar la clave (c). Cuatro, y el número no es estético: es el techo que
 * separa "este cheque paga estas facturas" de "con suficientes sumandos siempre se llega a cualquier
 * número". Con 40 candidatas, C(40,4)=91.390 combinaciones; con 6 serían 3,8 millones y la mitad
 * serían coincidencias aritméticas sin ningún significado contable.
 */
export const MAX_CONJUNTO = 4

/**
 * TECHO DE CANDIDATAS, Y POR QUÉ PASARSE NO DEVUELVE "SIN CRUCE" SINO "AMBIGUO".
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA, MEDIDO ANTES DE COMMITEAR ═══
 *
 * La primera versión se quedaba con las 40 facturas más grandes del proveedor. Corralón Progreso
 * tiene 62 en la ventana, así que el cheque de $323.000 se buscaba contra un universo RECORTADO — y
 * ahí encontró UN solo conjunto y lo dio por bueno. Con las 62 hay DOS conjuntos distintos que suman
 * lo mismo: era ambiguo y el recorte lo escondía. Una búsqueda truncada no puede probar unicidad; lo
 * único que puede probar es que encontró algo, que es exactamente la clase de resultado que este
 * archivo no debe producir.
 */
export const MAX_CANDIDATAS = 120

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const redondo = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * NÚCLEO PURO: ¿hay un subconjunto de ≤`max` importes que sume EXACTAMENTE el objetivo?
 *
 * Devuelve hasta DOS subconjuntos y para: con dos ya alcanza para declarar ambigüedad, y seguir
 * enumerando los 91.390 restantes no cambia ninguna decisión.
 *
 * SÓLO IMPORTES POSITIVOS. Una nota de crédito entra con signo negativo y, admitiéndola, cualquier
 * objetivo se alcanza combinando una factura de más con un crédito que la compense — el conjunto
 * dejaría de significar "estas facturas se pagaron con este cheque".
 *
 * @param {Array<{fila:number, total:number}>} candidatas
 * @param {number} objetivo el importe del cheque
 * ═══ LA TOLERANCIA ES UN PESO, Y NO PUEDE SER MENOS ═══
 *
 * Es el mismo piso que usa `candidatasPorImporte`, y acá se gana el sueldo: las tres facturas de
 * Con-Sec suman $1.699.999,18 y el echeq que las paga dice $1.700.000 redondos. Con un centavo de
 * tolerancia ese cruce —que es verdadero, y son $1,7M— no existe. Lo que separa a ése de la
 * coincidencia aritmética NO es el margen: es la unicidad (dos conjuntos ⇒ ambiguo) y la guarda de
 * repetición de `cruzar`. Apretar el margen tapaba los dos casos por igual.
 *
 * @param {{max?:number, tolerancia?:number}} opciones tolerancia en pesos
 * @returns {Array<Array<{fila:number,total:number}>>} 0, 1 o 2 subconjuntos. `null` = no se buscó
 *   porque el universo excede `MAX_CANDIDATAS`: no se pudo probar unicidad, y eso NO es "no hay".
 */
export function subconjuntosQueSuman(candidatas = [], objetivo = 0, { max = MAX_CONJUNTO, tolerancia = 1 } = {}) {
  const pos = candidatas.filter((f) => (Number(f.total) || 0) > 0).sort((a, b) => b.total - a.total)
  if (pos.length > MAX_CANDIDATAS) return null
  const meta = redondo(objetivo)
  if (!(meta > 0)) return []
  const halladas = []
  const elegidas = []
  const dfs = (desde, resto) => {
    if (halladas.length >= 2) return
    if (Math.abs(resto) <= tolerancia && elegidas.length) { halladas.push([...elegidas]); return }
    if (elegidas.length >= max || resto < -tolerancia) return
    for (let i = desde; i < pos.length; i++) {
      // Poda: la lista viene de mayor a menor, así que si éste ya no entra ninguno de los que siguen
      // lo hace peor — pero sí puede entrar uno más chico, por eso se sigue en vez de cortar.
      if (pos[i].total > resto + tolerancia) continue
      elegidas.push(pos[i])
      dfs(i + 1, redondo(resto - pos[i].total))
      elegidas.pop()
      if (halladas.length >= 2) return
    }
  }
  dfs(0, meta)
  return halladas
}

/** Un cheque cuenta como VIVO mientras no esté debitado: hasta ahí la plata sigue en la cuenta. */
const vivo = (c) => !c.debitado && (Number(c.importe) || 0) > 0

/** Los cheques por (proveedor, importe al peso). Es la unidad sobre la que se mide la ambigüedad. */
function agrupar(cheques = [], norm) {
  const g = new Map()
  for (const c of cheques) {
    const k = `${norm(c.proveedor)}|${Math.round(Number(c.importe) || 0)}`
    g.set(k, [...(g.get(k) ?? []), c])
  }
  return g
}

/**
 * (a) LA LLAVE NATURAL. Devuelve el índice `${proveedor}|${comprobante}` → filas de Compras.
 * Se indexa CON el proveedor: "1-36" puede ser de dos proveedores distintos, y el N° de comprobante
 * solo no identifica una factura — identifica una factura DE ALGUIEN.
 */
function indicePorComprobante(compras, norm) {
  const idx = new Map()
  for (const f of compras) {
    const k = normComprobante(f.comprobante)
    if (!esLlaveUtil(k)) continue
    const clave = `${norm(f.proveedor)}|${k}`
    idx.set(clave, [...(idx.get(clave) ?? []), f])
  }
  return idx
}

/**
 * NÚCLEO PURO: EL CRUCE. Cada cheque vivo contra las filas de Compras pagadas con cheque o echeq.
 *
 * @param {Array} cheques del registro, ya normalizados: {fila, instrumento, numero, proveedor,
 *   importe, comprobante, fechaPago, debitado, marca}
 * @param {Array} compras filas pagadas con cheque/echeq: {fila, proveedor, comprobante, total,
 *   fecha, rubro, cliente, obra, cuit, instrumento}
 * @param {{norm?:Function, ventanaDias?:number}} opciones
 * @returns {{porCheque:Map, porCompra:Map, ambiguos:Array, sinCruce:Array, resumen:object}}
 */
export function cruzar(cheques = [], compras = [], { norm = normNombre, ventanaDias = VENTANA_DIAS_CHEQUE } = {}) {
  const vivos = cheques.filter(vivo)
  const conProv = compras.map((f) => ({ ...f, prov: norm(f.proveedor), total: Number(f.total) || 0 }))
  const porCheque = new Map()
  const ambiguos = []
  const sinCruce = []
  const consumidas = new Set()
  const anotar = (ch, filas, confianza) => {
    porCheque.set(ch.fila, { cheque: ch, compras: filas, confianza })
    for (const f of filas) consumidas.add(f.fila)
  }

  // ── (a) COMPROBANTE ────────────────────────────────────────────────────────────────────────────
  const idx = indicePorComprobante(conProv, norm)
  const restantes = []
  for (const ch of vivos) {
    const k = normComprobante(ch.comprobante)
    if (!esLlaveUtil(k)) { restantes.push(ch); continue }
    const cand = idx.get(`${norm(ch.proveedor)}|${k}`) ?? []
    if (cand.length === 1) { anotar(ch, cand, CONFIANZA.comprobante); continue }
    if (cand.length > 1) { ambiguos.push({ cheque: ch, porque: SIN_CRUCE.ambiguo, candidatas: cand.map((f) => f.fila) }); continue }
    // El N° existe y NO está en Compras. No se descarta acá: la clave (c) todavía puede explicarlo
    // ("3617 y 3650" es un N° útil que no es el de ninguna factura). Si tampoco, sale como sinFactura.
    restantes.push({ ...ch, comprobante: '', llaveHuerfana: true })
  }

  // ── (b) PROVEEDOR + IMPORTE — la misma función que respalda el cruce contra ARCA, no una copia ──
  const disponibles = () => conProv.filter((f) => !consumidas.has(f.fila))
  const { inferidos, ambiguos: ambB, sinRespaldo } = inferirRespaldo(
    restantes.map((c) => ({ fila: c.fila, proveedor: c.proveedor, monto: c.importe, comprobante: '', fecha: c.fechaPago })),
    disponibles(), { norm, ventanaDias },
  )
  const porFila = new Map(restantes.map((c) => [c.fila, c]))
  for (const [filaCheque, hit] of inferidos) {
    const f = conProv.find((x) => x.fila === hit.filaCompras)
    if (f) anotar(porFila.get(filaCheque), [f], CONFIANZA.importe)
  }
  for (const a of ambB) ambiguos.push({ cheque: porFila.get(a.fila), porque: SIN_CRUCE.ambiguo, candidatas: [] })

  // ── (c) CONJUNTO — la traducción de "VARIAS" ───────────────────────────────────────────────────
  //
  // SE AGRUPA POR (PROVEEDOR, IMPORTE) igual que `inferirRespaldo`, y por el mismo motivo: la
  // ambigüedad es una propiedad del GRUPO. Medido: el registro vivo tiene SEIS cheques de Corralón
  // Progreso por $750.000 clavados, uno el 10 de cada mes. Eso es un plan de pago sobre la cuenta
  // corriente, no seis lotes de facturas que casualmente suman lo mismo — y el único conjunto que la
  // búsqueda encuentra tendría que repartirse entre los seis. Con un cheque repetido no se cruza.
  for (const grupo of agrupar(sinRespaldo.map((s) => porFila.get(s.fila)), norm).values()) {
    const ch = grupo[0]
    const pool = disponibles().filter((f) => f.prov === norm(ch.proveedor)
      && (ventanaDias === null || !f.fecha || !ch.fechaPago || Math.abs(f.fecha - ch.fechaPago) <= ventanaDias))
    const halladas = subconjuntosQueSuman(pool, ch.importe)
    const unico = halladas !== null && halladas.length === 1 && grupo.length === 1
    if (unico) { anotar(ch, halladas[0], CONFIANZA.conjunto); continue }
    for (const c of grupo) {
      // `null` (universo sin explorar) y ">1 conjunto" son lo mismo para el que decide: no se puede
      // afirmar cuál. Cero conjuntos sí es una respuesta, y es la que manda al hueco declarado.
      if (halladas === null || halladas.length > 0) ambiguos.push({ cheque: c, porque: SIN_CRUCE.ambiguo, candidatas: (halladas?.[0] ?? []).map((f) => f.fila) })
      else sinCruce.push({ cheque: c, porque: c.llaveHuerfana ? SIN_CRUCE.sinFactura : SIN_CRUCE.sinRespaldo })
    }
  }

  return { porCheque, porCompra: repartirPorCompra(porCheque, conProv), ambiguos, sinCruce, resumen: resumir(vivos, porCheque, ambiguos, sinCruce) }
}

/**
 * NÚCLEO PURO: DADA VUELTA — cuánta plata de cada fila de Compras todavía viaja en un cheque vivo.
 *
 * Es lo que consume `deCompras`: la fila NO se convierte entera en compromiso, se PARTE. En f633
 * ($2.010.000) hay $1.000.000 ya debitado —que está en el saldo del banco y sigue siendo REAL— y
 * $1.010.000 en dos cheques que vencen el 12/08. Volcar la fila entera a COMPROMETIDO contaría ese
 * millón dos veces: una en el saldo y otra en la escalera.
 *
 * EL TOPE ES EL TOTAL DE LA FACTURA. Si los cheques vivos suman más que la factura, el exceso no se
 * reparte: se declara. Un cheque de más contra una factura chica es un dato mal cargado, y dejarlo
 * pasar restaría del REAL una plata que la factura nunca tuvo.
 *
 * @returns {Map<number, {vivo:number, exceso:number, cuotas:Array}>} por fila de Compras
 */
export function repartirPorCompra(porCheque = new Map(), compras = []) {
  const totalDe = new Map(compras.map((f) => [f.fila, Math.abs(Number(f.total) || 0)]))
  const out = new Map()
  for (const { cheque, compras: filas, confianza } of porCheque.values()) {
    // Un cheque contra un conjunto: cada factura del conjunto se lleva SU total, porque el conjunto
    // suma exactamente el cheque. Contra una sola factura, se lleva el importe del cheque.
    const cuota = (f) => (filas.length === 1 ? Math.abs(cheque.importe) : Math.abs(Number(f.total) || 0))
    for (const f of filas) {
      const a = out.get(f.fila) ?? { vivo: 0, exceso: 0, cuotas: [] }
      const tope = totalDe.get(f.fila) ?? 0
      const pide = redondo(cuota(f))
      const cabe = Math.max(0, Math.min(pide, redondo(tope - a.vivo)))
      a.vivo = redondo(a.vivo + cabe)
      a.exceso = redondo(a.exceso + (pide - cabe))
      if (cabe > 0) {
        a.cuotas.push({
          filaCheque: cheque.fila, numero: cheque.numero, instrumento: cheque.instrumento,
          importe: cabe, fechaPago: cheque.fechaPago, confianza,
        })
      }
      out.set(f.fila, a)
    }
  }
  return out
}

/** El veredicto con la plata de cada clase. Contar cheques no distingue $323.000 de $7,6M. */
function resumir(vivos, porCheque, ambiguos, sinCruce) {
  const suma = (a) => a.reduce((s, x) => s + Math.abs(Number(x.importe ?? x.cheque?.importe) || 0), 0)
  const de = (c) => [...porCheque.values()].filter((x) => x.confianza === c).map((x) => x.cheque)
  const clase = (nombre, arr) => ({ clase: nombre, cheques: arr.length, monto: suma(arr) })
  return {
    vivos: clase('cheques vivos', vivos),
    porComprobante: clase(CONFIANZA.comprobante, de(CONFIANZA.comprobante)),
    porImporte: clase(CONFIANZA.importe, de(CONFIANZA.importe)),
    porConjunto: clase(CONFIANZA.conjunto, de(CONFIANZA.conjunto)),
    ambiguos: clase('ambiguos', ambiguos.map((a) => a.cheque)),
    sinCruce: clase('sin cruce', sinCruce.map((s) => s.cheque)),
  }
}

/**
 * NÚCLEO PURO: LA PARTICIÓN. Por qué puerta entra este cheque vivo al libro — exactamente una.
 *
 * ═══ POR QUÉ HACE FALTA UNA FUNCIÓN Y NO UN `if` EN CADA EXTRACTOR ═══
 *
 * `deCompras` y `deChequesEmitidos` son dos productores del mismo hecho. Si cada uno decide por su
 * cuenta si el cheque le toca, el día que uno cambie el criterio la plata se cuenta dos veces o
 * ninguna — y las dos formas de fallar son silenciosas. Acá la decisión se toma UNA vez y los dos la
 * leen; el test de partición corre esta función sobre el registro vivo y exige que las tres bolsas
 * sean disjuntas y sumen el registro entero.
 *
 * `ninguna` NO es un olvido: es el hueco declarado. Un cheque ambiguo puede tener su factura en
 * Compras (marcada REAL) o no tenerla, y no se sabe cuál. Emitirlo igual sumaría un compromiso encima
 * de un pago que quizá ya está contado; callarlo lo esconde. Se calla EN EL LIBRO y se GRITA en el
 * verificador, que es donde un hueco se puede cerrar cargando un dato.
 *
 * @param {object} cheque del registro
 * @param {{porCheque:Map}} cruce
 * @param {{marcaFalta:string}} opciones el texto de la marca "falta la factura" (MARCAS.falta)
 * @returns {'Compras'|'Cheques Emitidos'|'ninguna — hueco declarado'}
 */
export function puertaDeCheque(cheque = {}, cruce = { porCheque: new Map() }, { marcaFalta = '' } = {}) {
  if (!vivo(cheque)) return PUERTA.ninguna // debitado: ya está en el saldo del banco, no es compromiso
  if (cruce.porCheque?.has(cheque.fila)) return PUERTA.compras
  // ═══ EL RESIDUO YA NO CAE AL VACÍO — REGLA DEL DUEÑO (02/09/2026) ═══
  //
  // «Si no hay algo que avale que se va a hacer dicho egreso… y reflejar que el cheque debe ser
  // cubierto determinado día.» El vivo sin cruce y sin marca caía a NINGUNA puerta y desaparecía
  // del plan: medido hoy, 13 cheques por $12,1M invisibles — con vencimientos a días. Un cheque
  // firmado y entregado ES un egreso avalado por sí mismo: entra por la puerta de Cheques. El
  // riesgo que se acepta es el inverso y es conservador: si su factura siguiera PENDIENTE en
  // Compras (inconsistencia que el dueño pidió corregir allá), el plan pesa esa plata dos veces
  // hasta que Compras se marque — pecar por exceso de necesidad, nunca por esconderla.
  return PUERTA.cheques
}

/**
 * NÚCLEO PURO: LA MARCA QUE EL CRUCE PONDRÍA AL LADO DEL CHEQUE, en la columna M del registro.
 *
 * ═══ ESTÁ ESCRITA Y PROBADA, Y TODAVÍA NO LA ESCRIBE NADIE. ES A PROPÓSITO ═══
 *
 * La marca de la columna M no es decorativa: la fórmula viva de CAJA suma los cheques cuya marca es
 * exactamente `MARCAS.falta` ("Pagos con cheque y tarjeta sin factura registrada"). Cambiar la marca
 * de un cheque cambia un número del cuadro. Y este cruce SÍ empareja cheques que hoy están marcados
 * "FALTA" —encuentra la factura que la marca no encontraba—, así que enchufarla mueve plata en una
 * pestaña congelada. Eso se hace desde el árbol principal, con el dueño mirando, no desde acá.
 *
 * Mientras tanto la capacidad existe, está probada en frío, y `marcaDe` (la de hoy) sigue mandando.
 *
 * @param {object} cheque del registro
 * @param {{porCheque:Map}} cruce
 * @param {string} sinCruceTexto lo que dice hoy `marcaDe` para ese cheque — se respeta tal cual
 * @returns {string}
 */
export function marcaDelCruce(cheque = {}, cruce = { porCheque: new Map() }, sinCruceTexto = '') {
  const hit = cruce.porCheque?.get(cheque.fila)
  if (!hit) return sinCruceTexto
  const filas = hit.compras.map((f) => `fila ${f.fila}`).join(' + ')
  // EL GLIFO DICE LA FUERZA, y eso no es cosmética: la regla de oro nº 2 se rompe en el glifo, no en
  // el texto que nadie lee. Un ✓ sobre una atribución por importe presentaría una inferencia como un
  // hecho — el mismo criterio que ya separa `MARCAS.ok` de `MARCAS.inferido`.
  const glifo = hit.confianza === CONFIANZA.comprobante ? '✓' : '≈'
  return `${glifo} factura ${filas} · cruzado por ${hit.confianza}`
}

/**
 * Del registro crudo de "Cheques Emitidos" a los registros que come `cruzar`. PURO.
 * Las columnas se resuelven por índice porque el llamador ya ubicó el registro con su geometría; los
 * rótulos los valida `deChequesEmitidos`, que lee la misma pestaña y falla cerrado si faltan.
 * @param {Array<Array>} filas la pestaña entera, UNFORMATTED_VALUE
 */
export function chequesDelRegistro(filas = [], { fila0, colMarca = 12 } = {}) {
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[5])
    if (importe === null || importe === 0) continue
    out.push({
      fila: i + 1,
      instrumento: /echeq/i.test(String(f[0] ?? '')) ? 'echeq' : 'cheque',
      numero: String(f[1] ?? '').trim(),
      proveedor: String(f[4] ?? '').trim(),
      importe,
      comprobante: String(f[7] ?? '').trim(),
      fechaPago: num(f[8]),
      debitado: /^si$/i.test(String(f[10] ?? '').trim()),
      marca: String(f[colMarca] ?? '').trim(),
    })
  }
  return out
}
