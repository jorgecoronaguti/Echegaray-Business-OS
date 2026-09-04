// EL COSTO REAL DE UNA OBRA, CARGADO CON LA GRANULARIDAD QUE LA EVIDENCIA SOSTIENE.
//
// ═══ EL AGUJERO MEDIDO (03/09/2026) ═══
//
// `public.obra_partida_costo_real` tenía CERO filas con 18 obras cargadas: el costo real nunca se
// capturaba, así que plan vs real sólo se podía mirar a nivel de obra entera y una obra terminada no
// le enseñaba nada al cotizador.
//
// ═══ POR QUÉ NINGUNA FILA LLEVA PARTIDA, Y POR QUÉ NO SE PRORRATEA ═══
//
// Se buscó una fuente que ate un PESO a una PARTIDA y no existe hoy:
//   · `compra_sheet` (946 filas, la pestaña Compras entera) imputa a la OBRA por texto. Su propia
//     historia lo dice: la columna K ni siquiera alcanzaba para la obra y hubo que PREGUNTARLE al
//     dueño (`scripts/compras-imputar-obra.mjs`), porque la deducción "elegante" mandaba $1.831.905
//     a la obra equivocada.
//   · JORNALES imputa a CLIENTE y OBRA, persona por persona y quincena por quincena. No tiene
//     columna de tarea ni de partida.
//   · `pedidos_materiales` sí tiene `actividad_id` (17 filas) y la actividad sí puede apuntar a una
//     partida — pero un pedido NO tiene precio. Cruzarlo contra un comprobante por parecido sería
//     inventar la imputación con aspecto de dato.
//   · `registros_hh` tiene `actividad_id` (25 filas) pero en HORAS, y ya lo consume `ejecucion-real`.
//     Valuarlas acá daría dos números de mano de obra para la misma obra.
//
// Entonces se carga lo que la evidencia sostiene —OBRA, y FRENTE cuando una persona escribió el
// frente en su columna— con `cotizacion_partida_id` en NULL y `granularidad` DECLARADA. Un prorrateo
// entre partidas se vería más completo y sería una mentira: el desvío por partida saldría de una
// división, no de una medición, y ese número termina adentro de una cotización.
//
// TODO ACÁ ES PURO. Entra una fila de la fuente y un mapa de alias; sale la fila a insertar o el
// motivo por el que no entra. La normalización de los rótulos NO se reimplementa: se inyecta, y en
// producción la hace `public.norm_obra` — que es la que ya usan `obra_costo_real` y el resto del OS.

import { detectarBloques, trabajadoresDeBloque, columnaPorRotulo } from './jornales-estructura.mjs'
import { costoPorObra, testigoTotalMo } from './jornales-por-obra.mjs'

/** Los tipos que acepta la tabla. Espejo de `cotizacion_partida_composicion.tipo`, que es contra
 *  quien se compara: material / mano_obra / equipo (y carga_social, que acá no existe — ver abajo). */
export const TIPO = Object.freeze({
  MATERIAL: 'MATERIAL',
  SUBCONTRATO: 'SUBCONTRATO',
  EQUIPO: 'EQUIPO',
  MANO_DE_OBRA: 'MANO_DE_OBRA',
  OTRO: 'OTRO',
})

/** Con qué precisión se conoce a qué se imputó el gasto. No es un adorno: es lo que impide que una
 *  fila que sólo sabe la obra se lea como si supiera la partida. */
export const GRANULARIDAD = Object.freeze({ OBRA: 'OBRA', FRENTE: 'FRENTE', PARTIDA: 'PARTIDA' })

/** Por qué una fila de la fuente NO se carga. Cada motivo se cuenta y se informa con su monto: un
 *  gasto que no entra y tampoco figura en ningún lado hace que la obra parezca más barata. */
export const EXCLUSION = Object.freeze({
  ANULADA: 'ANULADA',
  SIN_NETO_DECLARADO: 'SIN_NETO_DECLARADO',
  NOMINA_EN_COMPRAS: 'NOMINA_EN_COMPRAS',
  SIN_OBRA_CANONICA: 'SIN_OBRA_CANONICA',
  NO_ES_OBRA: 'NO_ES_OBRA',
  SIN_VALUAR: 'SIN_VALUAR',
  SIN_MONTO: 'SIN_MONTO',
})

/**
 * FAMILIA DE MATERIAL → TIPO. Mapa EXPLÍCITO y cerrado: lo que no está mapeado sale OTRO, nunca
 * MATERIAL por descarte. Poner MATERIAL por default haría que 391 filas sin clasificar ($94,7 M)
 * entraran como materiales y el precio comprado se compararía contra el cotizado sobre una mezcla.
 *
 * Dos decisiones que no son obvias, escritas acá para poder discutirlas:
 *   · COMBUSTIBLE → EQUIPO. En un análisis de precios el gasoil viaja dentro del costo horario de la
 *     máquina, no como material incorporado a la obra.
 *   · EPP y consumibles → MATERIAL. Son bienes comprados con precio y cantidad; que en la cotización
 *     suelan ir como indirecto es una decisión del análisis, no de la naturaleza del comprobante.
 */
const FAMILIA_A_TIPO = new Map([
  ['alquiler y traslado de equipos', TIPO.EQUIPO],
  ['combustible de obra', TIPO.EQUIPO],
  ['subcontratos y mano de obra', TIPO.SUBCONTRATO],
  ['servicios de obra (baño, contenedor, agua)', TIPO.OTRO],
  ['sin clasificar', TIPO.OTRO],
  ['cemento, cal y áridos', TIPO.MATERIAL],
  ['plomería, agua y cloacas', TIPO.MATERIAL],
  ['ferretería y consumibles', TIPO.MATERIAL],
  ['revoques, pintura y terminación', TIPO.MATERIAL],
  ['pisos y revestimientos', TIPO.MATERIAL],
  ['chapa, perfiles y estructura metálica', TIPO.MATERIAL],
  ['electricidad', TIPO.MATERIAL],
  ['hierro y malla', TIPO.MATERIAL],
  ['seguridad e higiene / epp', TIPO.MATERIAL],
  ['aberturas, portones y herrería', TIPO.MATERIAL],
  ['hormigón y premoldeados', TIPO.MATERIAL],
  ['mampostería y ladrillos', TIPO.MATERIAL],
])

const texto = (v) => (v == null ? '' : String(v).trim())

/** Fecha ISO (YYYY-MM-DD) venga como venga. `String(new Date())` da «Mon Jan 05 2026 …» y Postgres
 *  lo rechaza: el driver devuelve Date para las columnas de fecha y el corte de 10 caracteres se
 *  veía bien en los tests, donde la fecha siempre entraba como texto. */
const fechaIso = (v) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const t = texto(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''
}

/** El tipo de una compra sale de la familia que la propia pestaña escribió. Sin familia, OTRO. */
export function tipoDeCompra({ familiaMaterial } = {}) {
  const f = texto(familiaMaterial).toLowerCase()
  return FAMILIA_A_TIPO.get(f) ?? TIPO.OTRO
}

/** Un número o null. `''` y `NaN` no son cero: son ausencia. */
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * UNA FILA DE LA PESTAÑA COMPRAS → UNA FILA DE COSTO REAL, o el motivo por el que no entra.
 *
 * `monto` es el NETO (columna M = Total − IVA). Cuando el neto está en 0 la fila NO se carga: el
 * total con IVA adentro inflaría el costo hasta un 21% y una obra entera parecería desviada. Se
 * midieron 186 filas así, y una buena parte son el PAGO de un comprobante que ya está cargado más
 * arriba (Alumetal fila 60 con neto $9.441.250 y fila 378 con neto 0 por casi el mismo total):
 * cargarlas sería además contar dos veces.
 *
 * Una nota de crédito entra con su signo NEGATIVO. Filtrar por `> 0` dejaría el costo inflado por el
 * importe de las devoluciones — hay 8 filas así.
 */
export function evaluarCompra(c, { obraId = null, clasificacion = null } = {}) {
  const monto = num(c.importe)
  // LOS DOS MONTOS SON MAGNITUDES DISTINTAS Y NO SE SUMAN ENTRE SÍ. `monto` es el NETO —lo mismo
  // que se carga, y por eso es lo único que puede cuadrar contra el total de la fuente—. `bruto` es
  // el total con IVA, y viaja aparte porque en una fila sin neto declarado es el ÚNICO tamaño que
  // tiene: sin él, 145 filas por $178,9 M se informarían como «$0 excluidos» y parecerían nada.
  const bruto = num(c.total) ?? 0
  if (c.anulada) return { excluida: EXCLUSION.ANULADA, monto: monto ?? 0, bruto }
  if (texto(c.proveedor).toLowerCase() === 'sueldos') {
    // Es la MISMA plata que JORNALES, registrada global y a la mitad (se midió: $27.408.067 en
    // Compras contra $59.833.631 en JORNALES para La Estrella 2026). Cargar las dos la duplica.
    return { excluida: EXCLUSION.NOMINA_EN_COMPRAS, monto: monto ?? 0, bruto }
  }
  if (monto === null || monto === 0) return { excluida: EXCLUSION.SIN_NETO_DECLARADO, monto: 0, bruto }
  if (clasificacion != null && clasificacion !== 'obra' && clasificacion !== 'mantenimiento') {
    return { excluida: EXCLUSION.NO_ES_OBRA, monto, bruto }
  }
  if (!obraId) return { excluida: EXCLUSION.SIN_OBRA_CANONICA, monto, bruto }
  return {
    fila: {
      obraId,
      cotizacionPartidaId: null,
      granularidad: GRANULARIDAD.OBRA,
      frenteTexto: null,
      // La fila viene de Postgres en snake_case: pasarle `c` entero dejaba `familiaMaterial`
      // en undefined y TODA la carga salía OTRO. Se vio recién en la corrida real: 531 filas
      // clasificadas y ni una sola con tipo.
      tipo: tipoDeCompra({ familiaMaterial: c.familia_material }),
      recursoNombre: texto(c.concepto) || texto(c.detalle_obra) || texto(c.proveedor) || 'sin detalle',
      // NULL a propósito: la pestaña no discrimina cantidad ni precio unitario por línea. Un 1 de
      // relleno convertiría el total del comprobante en «precio unitario» y arruinaría la
      // comparación contra el precio cotizado.
      unidad: null,
      cantidad: null,
      precioUnitario: null,
      monto,
      moneda: 'ARS',
      fecha: fechaIso(c.fecha),
      proveedor: texto(c.proveedor) || null,
      comprobante: texto(c.comprobante) || null,
      fuente: 'compra_sheet',
      fuenteId: String(c.fila),
      nota: `familia=${texto(c.familia_material) || '—'} · obra_texto=${texto(c.obra_texto)}`,
    },
  }
}

/**
 * A QUÉ OBRA CANÓNICA VA UNA FILA DE JORNALES. Reglas ORDENADAS, y ninguna resuelve por parecido.
 *
 *   1. el rótulo de OBRA es un alias conocido       → esa obra           (regla `obra`)
 *   2. «cliente obra» junto es un alias conocido    → esa obra           (regla `cliente_obra`)
 *   3. el rótulo de CLIENTE es un alias conocido    → esa obra, y el rótulo de obra queda como
 *                                                     FRENTE declarado   (regla `cliente`)
 *   4. nada coincide                                → null, y la fila NO se carga
 *
 * La 4 es la importante: «GALPON 9» y «LE GALPON 9» difieren en dos letras y en una obra distinta.
 * Elegir la más parecida es exactamente el error que costó $1.831.905 en Compras.
 */
export function resolverObraDeJornal({ cliente, obra }, { alias, norm } = {}) {
  const buscar = (t) => {
    const k = norm(t)
    return k && alias.has(k) ? { clave: k, obraId: alias.get(k) } : null
  }
  const porObra = texto(obra) ? buscar(obra) : null
  if (porObra) return { obraId: porObra.obraId, regla: 'obra', frente: null, clave: porObra.clave }
  // La clave compuesta se arma con las partes YA NORMALIZADAS y no normalizando la concatenación:
  // el resultado es el mismo (norm colapsa espacios y trabaja palabra por palabra) y así el
  // normalizador —que en producción es una consulta a Postgres— sólo ve rótulos que existen en la
  // planilla, sin tener que adivinar de antemano todas las combinaciones posibles.
  const compuesta = [norm(cliente), norm(obra)].filter(Boolean).join(' ')
  const porAmbos = compuesta && alias.has(compuesta) ? { clave: compuesta, obraId: alias.get(compuesta) } : null
  if (porAmbos) return { obraId: porAmbos.obraId, regla: 'cliente_obra', frente: null, clave: porAmbos.clave }
  const porCliente = texto(cliente) ? buscar(cliente) : null
  if (porCliente) {
    return { obraId: porCliente.obraId, regla: 'cliente', frente: texto(obra) || null, clave: porCliente.clave }
  }
  return { obraId: null, regla: 'sin_alias', frente: texto(obra) || null, clave: null }
}

/**
 * UNA PERSONA EN UNA QUINCENA → UNA FILA DE COSTO REAL.
 *
 * `monto` es el JORNAL BRUTO que cobró la persona (banco + efectivo). NO incluye cargas sociales: la
 * planilla no las tiene y multiplicar por un factor inventado sería fabricar el número que después
 * entra a una cotización. Quien compare contra un costo cotizado CON cargas tiene que saberlo — por
 * eso viaja escrito en `nota`, no sólo en la documentación.
 */
export function filaDeJornal(f, { pestana, hasta, obraId, regla, frente, horas = null, valorHora = null }) {
  // EL MONTO ES HORAS × $ HORA, LAS DOS COLUMNAS QUE LA PLANILLA DECLARA POR RÓTULO.
  //
  // NO es «TOTAL SEMANA», y esto se midió antes de decidirlo. En «JORNALES 25» esa columna es
  // `=ADELANTO + TOTAL RECIBO`: NO incluye lo pagado por BANCO. En el bloque de la fila 445 suma
  // $710.904 contra $2.284.800 que la propia planilla escribe como TOTAL MO — un tercio. En
  // «Obreros 26» sí es el bruto, porque ahí la columna se arma distinto. Una misma etiqueta que
  // cambia de significado entre generaciones no puede ser la definición del costo.
  //
  // Contra el TOTAL MO de la planilla, sobre los 69 bloques que lo tienen escrito:
  //   HORAS × $ HORA      49 bloques exactos · $285,5 M contra $285,6 M del testigo
  //   TOTAL SEMANA        50 bloques exactos · $279,8 M  (−$5,8 M: le falta el BANCO de 2025)
  //   BANCO+ADEL+RECIBO   44 bloques exactos · pero en 2026 los rótulos son otros y falla feo
  // Y además es el concepto correcto: el costo de la mano de obra son horas por tarifa. BANCO,
  // ADELANTO y EFECTIVO son CÓMO se pagó —percibido—, no cuánto costó.
  const producto = horas != null && valorHora != null ? horas * valorHora : null
  const monto = producto != null ? producto : f.jornal
  if (monto == null) return { excluida: EXCLUSION.SIN_VALUAR, monto: 0 }
  if (monto === 0) return { excluida: EXCLUSION.SIN_MONTO, monto: 0 }
  if (!obraId) return { excluida: EXCLUSION.SIN_OBRA_CANONICA, monto }
  return {
    fila: {
      obraId,
      cotizacionPartidaId: null,
      granularidad: frente ? GRANULARIDAD.FRENTE : GRANULARIDAD.OBRA,
      frenteTexto: frente,
      tipo: TIPO.MANO_DE_OBRA,
      recursoNombre: f.persona,
      unidad: 'HH',
      // Las tres son coherentes entre sí: cantidad × precioUnitario = monto. Es lo que permite
      // comparar contra la cotización, que también es HH × costo horario.
      cantidad: horas ?? f.horas,
      precioUnitario: valorHora ?? f.valorHora,
      monto,
      moneda: 'ARS',
      fecha: hasta,
      proveedor: null,
      comprobante: null,
      fuente: 'jornales',
      // Identidad ESTRUCTURAL (pestaña + bloque + fila de la hoja). El nombre no identifica: hay
      // homónimos en esta planilla y la misma persona cambia de fila en cada quincena.
      fuenteId: `${pestana}|${f.ref}`,
      nota: `horas × $ hora de JORNALES, bruto y SIN cargas sociales · regla=${regla}`
        + ` · rotulo=${f.rotuloCliente || '—'}`
        + (frente ? ` · frente=${frente}` : ''),
    },
  }
}

/**
 * EL CUADRE DE UNA CARGA: cada peso de la fuente está cargado o está excluido con nombre.
 *
 * Es una función aparte y exportada para poder probar que PUEDE dar rojo. Suma lo que se PUBLICA
 * —las filas cargadas y las listas de exclusión— y lo compara contra el total leído de la fuente:
 * si aparece una exclusión nueva sin lista, su plata no cae en ninguna suma y el residuo la delata.
 */
export function cuadreDeCarga({ totalFuente, filas = [], excluidas = [] }) {
  const cargado = filas.reduce((a, f) => a + (Number(f.monto) || 0), 0)
  const porMotivo = new Map()
  for (const e of excluidas) {
    const a = porMotivo.get(e.excluida) ?? { motivo: e.excluida, n: 0, monto: 0, bruto: 0 }
    a.n++
    a.monto += Number(e.monto) || 0
    a.bruto += Number(e.bruto) || 0
    porMotivo.set(e.excluida, a)
  }
  const excluido = [...porMotivo.values()].reduce((a, e) => a + e.monto, 0)
  const residuo = (Number(totalFuente) || 0) - cargado - excluido
  return {
    total: Number(totalFuente) || 0,
    cargado,
    excluido,
    porMotivo: [...porMotivo.values()].sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto)),
    residuo,
    // Un centavo de tolerancia: horas × valor hora en punto flotante no cierra al bit.
    cuadra: Math.abs(residuo) < 0.01,
  }
}

/** El número de una celda, o null. `gi` puede ser undefined si la fila no se pudo ubicar: eso NO es
 *  cero, es que no se pudo leer, y quien recibe null decide qué hacer. */
function celdaNumero(grid, gi, col) {
  if (gi == null || col == null) return null
  const c = grid.filas?.[gi]?.[col]
  const n = c?.numero
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * DÓNDE ESTÁ LA PLATA DE ESTE BLOQUE, POR RÓTULO Y NO POR LETRA.
 *
 * «DIAS / HORAS» está en K (2025), V (Obreros 26) y U (Oficina 26); «$ HORA» en L, W y V — el mismo
 * concepto en tres letras distintas, y ninguna se puede clavar. Se busca el rótulo en la fila del
 * bloque y si no en la fila 1, igual que `resolverColumnas`.
 *
 * EL RÓTULO ES «TOTAL SEMANA» COMPLETO, NUNCA «TOTAL» A SECAS: en JORNALES 25 la columna O se llama
 * «TOTAL RECIBO» y está ANTES; un `/^total/` la encontraría primero y cargaría el neto de adelanto
 * en lugar del bruto, sin que nada lo delate.
 */
function columnasDePlata(grid, bloque) {
  const buscar = (re) => columnaPorRotulo(grid, bloque.fila, re) ?? columnaPorRotulo(grid, 0, re)
  return { horas: buscar(/^d[ií]as\s*\/\s*horas\b/i), valorHora: buscar(/^\$\s*hora\b/i) }
}

/**
 * JORNALES ENTERO → FILAS DE COSTO REAL, BLOQUE POR BLOQUE.
 *
 * LA VENTANA ES EL BLOQUE, Y NO EL AÑO. `costoPorObra` marca `ventanaConsistente = false` cuando una
 * persona tiene horas en dos bloques de la misma ventana — que es AMBIGÜEDAD si la ventana es una
 * quincena y es LO NORMAL si la ventana es un año. Pidiendo el año entero, el único control de
 * solapes que existe quedaría en rojo siempre y por lo tanto no diría nada.
 *
 * Y aun con la ventana del bloque, sólo se toman las filas DE ESE BLOQUE (`f.bloque === b.fila1`):
 * si dos bloques comparten fechas, la ventana los trae a los dos y la misma persona entraría dos
 * veces. La superposición se informa en `bloques[].fechasDuplicadas`, no se resuelve en silencio.
 *
 * EL CONTROL QUE NO SE PRODUCE ACÁ: el «TOTAL MO» que la planilla ya tiene escrito en el bloque.
 * Es otra fórmula, mantenida por otra persona. Si coincide con lo que se va a cargar, el número está
 * probado contra algo que el OS no calculó.
 */
export function filasDeJornales(grid, { pestana, anio, mapa, alias, norm }) {
  const bloques = detectarBloques(grid, { anio })
  const filas = []
  const excluidas = []
  const informe = []
  for (let k = 0; k < bloques.length; k++) {
    const b = bloques[k]
    const fechas = b.fechas || []
    if (!fechas.length) continue
    const desde = fechas[0].iso
    const hasta = fechas[fechas.length - 1].iso
    const hastaFila = bloques[k + 1]?.fila ?? (grid.filas?.length ?? 0)
    const r = costoPorObra(grid, { desde, hasta, mapa, anio })
    const propias = r.filas.filter((f) => f.bloque === b.fila1)
    // La fila de la GRILLA de cada persona, sin aritmética sobre el offset del rango: el `ref` es la
    // misma identidad estructural que arma `costoPorObra`.
    const porRef = new Map(trabajadoresDeBloque(grid, b, { hastaFila }).map((t) => [t.ref, t.fila]))
    const cols = columnasDePlata(grid, b)
    const testigo = testigoTotalMo(grid, b.fila + 1, hastaFila)
    let leido = 0
    for (const f of propias) {
      const gi = porRef.get(f.ref)
      const horas = celdaNumero(grid, gi, cols.horas)
      const valorHora = celdaNumero(grid, gi, cols.valorHora)
      leido += horas != null && valorHora != null ? horas * valorHora : (f.jornal ?? 0)
      const { obraId, regla, frente } = resolverObraDeJornal({ cliente: f.rotuloCliente, obra: f.obra }, { alias, norm })
      const r2 = filaDeJornal(f, { pestana, hasta, obraId, regla, frente, horas, valorHora })
      if (r2.fila) filas.push(r2.fila)
      else excluidas.push({ ...r2, pestana, bloque: b.fila1, persona: f.persona, rotulo: f.rotuloCliente })
    }
    informe.push({
      bloque: b.fila1,
      desde,
      hasta,
      personas: propias.length,
      leido,
      testigo: testigo ? testigo.valor : null,
      celda: testigo ? testigo.celda : null,
      // null NO es cero: un bloque sin «TOTAL MO» escrito no tiene contra qué contrastarse, y eso
      // es distinto de un bloque que contrasta bien.
      diferencia: testigo ? leido - testigo.valor : null,
      concuerda: testigo ? Math.abs(leido - testigo.valor) < 1 : null,
      fechasDuplicadas: r.fechasDuplicadas.length,
    })
  }
  return { filas, excluidas, bloques: informe }
}
