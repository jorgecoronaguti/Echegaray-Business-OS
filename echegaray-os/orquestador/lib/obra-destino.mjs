// A DÓNDE VA CADA FILA DE COMPRAS Y COBRANZAS — la columna Obra, por encabezado (Compras L / Cobranzas H).
//
// ═══ POR QUÉ EXISTE (dueño, 14/09/2026) ═══
//
// Hasta hoy la obra de una compra se INFERÍA del texto de la columna K y la de un cobro del concepto
// o la OC: 213 compras y 10 cobros de 2026 quedaban «probables» y nadie podía decir a cuál de las
// obras del cliente iba la plata. El dueño autorizó una columna «Obra» con desplegable en las dos
// pestañas: la obra viaja PEGADA A LA FILA, que es lo único estable (los ids de `public.cobranzas`
// cambian en cada sync y el ID de Compras es `=ROW()-4`).
//
// ═══ QUÉ PUEDE DECIR LA CELDA ═══
//
//   «OB-0021 · ME - PLAYÓN DE AZUFRE»       → esa obra. Manda el CÓDIGO, que es inmutable: el nombre
//                                              puede estar viejo y la fila sigue siendo de esa obra.
//   «ES-ADM · Estructura – Administración»  → estructura, no costo de obra de nadie.
//   «ES-TAL · Estructura – Taller»          → ídem.
//   «Sin obra – LA ESTRELLA»                → del cliente, sin sub-obra: el dueño DECIDIÓ que no va a
//                                              ninguna, que no es lo mismo que la celda vacía.
//   vacía                                   → la fila no trae obra: sigue la inferencia de siempre.
//   cualquier otra cosa                     → error nombrado. Nunca se adivina una obra por parecido.
//
// IMP y FIN NO existen (dueño, 14/09: «para todos esos tipos de gastos ya teníamos pestañas en todo el
// sheet»): impuestos, cargas y financieros no van a Compras, así que no tienen destino acá.
//
// El rótulo de obra es el MISMO que el de la app (`src/shared/utils/obra.ts` · `rotuloDeObra`). El
// test lee el .ts y falla si el separador cambia de un lado solo.

import { normAlias } from './jornales-a-registros-hh.mjs'

export const DESTINO = Object.freeze({ OBRA: 'obra', ADMIN: 'estructura_admin', TALLER: 'estructura_taller' })

/** Los destinos que no son obras. Códigos cortos y estables: son lo que el sync parsea. */
export const FIJOS = Object.freeze([
  Object.freeze({ codigo: 'ES-ADM', destino: DESTINO.ADMIN, nombre: 'Estructura – Administración' }),
  Object.freeze({ codigo: 'ES-TAL', destino: DESTINO.TALLER, nombre: 'Estructura – Taller' }),
])

const RE_CODIGO_OBRA = /^\s*((?:OB|ZZ)-\d{4,})(?![\w-])/i
const RE_FIJO = /^\s*(ES-ADM|ES-TAL)(?![\w-])/i
const RE_SIN_OBRA = /^\s*sin\s+obra\s*[–—-]\s*(.+?)\s*$/i

/** Espejo de `rotuloDeObra` de la app. */
export function rotuloDeObra({ nombre, codigo } = {}) {
  const n = String(nombre ?? '').trim()
  const c = String(codigo ?? '').trim()
  if (!c) return n
  if (!n) return c
  return `${c} · ${n}`
}

export const rotuloSinObra = (cliente) => `Sin obra – ${cliente}`

/**
 * ¿ESTE TEXTO ES, LETRA POR LETRA, UNA OPCIÓN DEL DESPLEGABLE DE LA APP? `null` si sí; si no, el motivo.
 *
 * Para lo que se va a ESCRIBIR (la cola de la app), no para lo que se LEE del Sheet: `resolverCeldaObra`
 * tolera un nombre viejo porque la celda ya la escribió el dueño; acá tolerar sería dejar pasar
 * «OB-0002 · X» o «Sin obra – FULANO» a una celda que después el sync lee como imputación válida.
 * El universo es el de `opcionesDeObra` de `src/features/administracion/services/obraDeCompra.ts`
 * (obras vivas con código OB-, fijos, «Sin obra – cliente» con más de una obra viva) y su espejo SQL es
 * `public.obra_celda_resolver` (migraciones 20260915T0700 y T2200 «sin mayúsculas»). Vacío es legítimo: es vaciar la celda.
 *
 * «Sin obra – X»: X se compara con `cliente_texto` SIN distinguir mayúsculas —la MISMA regla que
 * `obra_celda_resolver` desde 20260915T2200: el desplegable dice «Sin obra – SAN FRANCISCO» y la obra
 * «San Francisco»— y, con `clienteAlias`, también con el cliente canónico (`cliente_alias`), que es de
 * donde `opcionesDeObra` saca el rótulo. El 15/09 el worker rechazaba lo que el desplegable ofrecía.
 * @param {string} valor @param {Array<{id:string,codigo:string|null,nombre:string|null,cliente_texto:string|null,fusionada_en:string|null}>} obras
 * @param {Map<string,string>} [clienteAlias] normAlias(rótulo) → cliente canónico
 */
export function validarValorDeObra(valor, obras = [], clienteAlias = new Map()) {
  const t = String(valor ?? '').trim()
  const leida = leerCeldaObra(t)
  if (leida.tipo === 'vacia') return null
  const vivas = obras.filter((o) => !o.fusionada_en)
  if (leida.tipo === 'codigo') {
    const o = vivas.find((x) => /^OB-/i.test(String(x.codigo ?? '')) && String(x.codigo).trim().toUpperCase() === leida.codigo)
    if (!o) return `${leida.codigo} no es una obra viva del desplegable`
    const rotulo = rotuloDeObra(o)
    return t === rotulo ? null : `«${t.slice(0, 60)}» no es el rótulo de ${leida.codigo}: el desplegable dice «${rotulo}»`
  }
  if (leida.tipo === 'fijo') {
    const f = FIJOS.find((x) => x.codigo === leida.codigo)
    const rotulo = rotuloDeObra({ codigo: f.codigo, nombre: f.nombre })
    return t === rotulo ? null : `«${t.slice(0, 60)}» no es «${rotulo}»`
  }
  if (leida.tipo === 'sin_obra') {
    const nombra = (o) => {
      const crudo = String(o.cliente_texto ?? '').trim()
      const canonico = clienteAlias.get(normAlias(crudo)) ?? null
      return rotuloSinObra(crudo).toUpperCase() === t.toUpperCase() || (canonico !== null && rotuloSinObra(canonico) === t)
    }
    const cuantas = vivas.filter(nombra).length
    return cuantas > 1 ? null : `«${t.slice(0, 60)}» no es un cliente con más de una obra viva`
  }
  return `«${t.slice(0, 60)}» no es una opción del desplegable de Obra`
}

/** Lo que la celda DICE, sin catálogo. */
export function leerCeldaObra(valor) {
  const t = String(valor ?? '').trim()
  if (!t) return { tipo: 'vacia' }
  const cod = RE_CODIGO_OBRA.exec(t)
  if (cod) return { tipo: 'codigo', codigo: cod[1].toUpperCase() }
  const fijo = RE_FIJO.exec(t)
  if (fijo) return { tipo: 'fijo', codigo: fijo[1].toUpperCase() }
  const sin = RE_SIN_OBRA.exec(t)
  if (sin) return { tipo: 'sin_obra', cliente: sin[1] }
  return { tipo: 'invalida', texto: t }
}

/**
 * El catálogo, armado UNA vez. `obras`: filas de `obra_canonica` (id, codigo, nombre, cliente_texto,
 * fusionada_en) · `clienteAlias`: Map normAlias(rótulo) → cliente canónico — el MISMO mapa que usa
 * `compras-obra-asignada.mjs`, así «cliente» significa lo mismo en la asignación y acá.
 */
export function catalogoDeDestinos({ obras = [], clienteAlias = new Map() } = {}) {
  const clienteDe = (texto) => (normAlias(texto) ? clienteAlias.get(normAlias(texto)) ?? null : null)
  const porId = new Map(obras.map((o) => [o.id, o]))
  const porCodigo = new Map()
  const vivasPorCliente = new Map()
  for (const o of obras) {
    const viva = porId.get(o.fusionada_en) ?? o
    const cliente = clienteDe(viva.cliente_texto)
    if (o.codigo) porCodigo.set(String(o.codigo).toUpperCase(), { obra_id: viva.id, cliente })
    if (!o.fusionada_en && cliente) vivasPorCliente.set(cliente, [...(vivasPorCliente.get(cliente) ?? []), o])
  }
  const clientePorNombre = new Map([...clienteAlias.values()].map((c) => [normAlias(c), c]))
  for (const [k, c] of clienteAlias) clientePorNombre.set(k, c)
  return { obras, porCodigo, vivasPorCliente, clientePorNombre, clienteDe }
}

const vacio = { destino: null, obra_id: null, cliente: null, celda: null, error: null }

/** La celda contra el catálogo: `{destino, obra_id, cliente, celda, error}`. */
export function resolverCeldaObra(valor, cat) {
  const leida = leerCeldaObra(valor)
  if (leida.tipo === 'vacia') return { ...vacio }
  const celda = String(valor).trim()
  const falla = (error) => ({ ...vacio, celda, error })
  if (leida.tipo === 'codigo') {
    const o = cat.porCodigo.get(leida.codigo)
    if (!o) return falla(`${leida.codigo} no es el código de ninguna obra`)
    return { destino: DESTINO.OBRA, obra_id: o.obra_id, cliente: o.cliente, celda, error: null }
  }
  if (leida.tipo === 'fijo') {
    const f = FIJOS.find((x) => x.codigo === leida.codigo)
    return { destino: f.destino, obra_id: null, cliente: null, celda, error: null }
  }
  if (leida.tipo === 'sin_obra') {
    const cliente = cat.clientePorNombre.get(normAlias(leida.cliente)) ?? null
    if (!cliente) return falla(`«${leida.cliente}» no es un cliente conocido`)
    return { destino: DESTINO.OBRA, obra_id: null, cliente, celda, error: null }
  }
  return falla(`«${celda.slice(0, 60)}» no es una obra del desplegable (se espera OB-####, ES-ADM, ES-TAL o «Sin obra – cliente»)`)
}

/**
 * Las opciones del desplegable. Obras cerradas incluidas: las filas viejas son de obras cerradas.
 * «Sin obra – X» sólo para el cliente con más de una obra viva: con una sola no hay nada que decidir.
 */
export function opcionesDeObra(cat) {
  const fijas = FIJOS.map((f) => rotuloDeObra({ codigo: f.codigo, nombre: f.nombre }))
  const obras = cat.obras
    .filter((o) => !o.fusionada_en && /^OB-/i.test(String(o.codigo ?? '')))
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))
    .map(rotuloDeObra)
  const sinObra = [...cat.vivasPorCliente].filter(([, os]) => os.length > 1).map(([c]) => rotuloSinObra(c)).sort()
  return [...fijas, ...obras, ...sinObra]
}

/**
 * DÓNDE ESTÁ LA COLUMNA «Obra», POR RÓTULO. `null` si no está (antes del backfill).
 *
 * `sync-cobranzas.mjs` lee el resto de la pestaña POR POSICIÓN (A5:AA); la columna nueva no se suma
 * a esa deuda: se encuentra por su encabezado, que es exacto («Obra / Cliente» de la G no es ésta).
 * Dos columnas «Obra» abortan: elegir una es elegir a ciegas.
 */
export function indiceColumnaObra(encabezado = [], pestana = 'la pestaña') {
  const idx = encabezado.flatMap((c, i) => (String(c ?? '').replace(/[\s ]+/g, ' ').trim().toLowerCase() === 'obra' ? [i] : []))
  if (idx.length > 1) throw new Error(`${pestana}: la columna «Obra» aparece ${idx.length} veces — no elijo a ciegas.`)
  return idx.length ? idx[0] : null
}

/**
 * LO QUE LA FILA DE COMPRAS GUARDA EN POSTGRES: `destino`, `obra_id` y la inconsistencia nombrada.
 *
 * Una celda inválida no tiene destino (null) pero SÍ inconsistencia: el dueño escribió algo y hay que
 * decirle que no se entendió. Una obra que contradice la Unidad se guarda como está —la escribió él—
 * y se marca.
 */
export function proyectarObraDeFila(c, cat) {
  const r = resolverCeldaObra(c?.obra_celda, cat)
  return {
    destino: r.destino,
    obra_id: r.obra_id,
    obra_inconsistencia: r.error ?? unidadIncoherente(c?.unidad_negocio, r.destino),
  }
}

/**
 * La celda de Obra, comparable. ESPEJO EXACTO de `normalizarCelda` de `bisturi-compras-obra.mjs` — no se
 * importa de allá porque el bisturí importa de este archivo y sería un ciclo; el test lo compara contra él.
 */
const celdaComparable = (v) => String(v ?? '').trim()

/**
 * LOS CAMBIOS DE LA APP QUE TODAVÍA NO LLEGARON AL SHEET, superpuestos a la lectura.
 *
 * El sync reescribe `compra_sheet` entero cada hora desde el Sheet. Sin esto, una obra elegida en la
 * app a las 10:59 volvería a «vacía» a las 11:00 y reaparecería cuando el worker escriba la columna Obra: la
 * pantalla parpadearía y el dueño creería que no se guardó. Sólo se superpone si la fila sigue siendo
 * el MISMO comprobante (misma clave): si alguien insertó una fila arriba, la fila N es otra compra.
 *
 * ═══ Y SÓLO SI EL SHEET SIGUE DICIENDO LO QUE LA PANTALLA VIO (18/09/2026) ═══
 *
 * Faltaba la otra mitad, la que los pagos sí tenían: comparar contra `valor_anterior`. Si el dueño
 * escribió «OB-0009» en la celda DESPUÉS del pedido, superponer «OB-0001» hacía que la app le mostrara
 * su propia pestaña diciendo algo que su pestaña no dice, hasta diez minutos; y un pedido de «sin obra»
 * (`valor_nuevo` vacío) VACIABA en el espejo una celda que el Sheet trae cargada. El Sheet nunca se
 * tocó, pero la app mentía. Una edición hecha por una persona es la verdad definitiva.
 *
 * Los tres casos, con la MISMA comparación que va a hacer el bisturí cuando el worker tome el pedido
 * (`celda_cambio`), para que la app no prometa nada que el Sheet vaya a rechazar:
 *
 *   · la celda dice lo pedido    → el worker ya escribió: no hay nada que superponer.
 *   · la celda dice `valor_anterior` → el pedido sigue en pie: se superpone.
 *   · la celda dice otra cosa    → alguien la editó: GANA EL SHEET y no se superpone.
 */
export function aplicarCambiosPendientes(compras = [], cambios = []) {
  // SÓLO CAMBIOS DE OBRA. Desde 20260916T1700 la misma cola lleva pagos, cuyo `valor_nuevo` es la
  // acción («total», «parcial», «deshacer»), no una obra: escribirlo acá dejaba la obra del dueño en
  // «total» mientras el pago viajaba al Sheet (18/09/2026). Sin `tipo` = anterior a la migración = obra.
  const deObra = cambios.filter((x) => String(x?.tipo ?? 'obra') === 'obra')
  const porFila = new Map(deObra.map((x) => [Number(x.fila), x]))
  return compras.map((c) => {
    const x = porFila.get(Number(c.fila))
    if (!x || (x.clave ?? null) !== (c.clave ?? null)) return c
    const actual = celdaComparable(c.obra_celda)
    const pedido = celdaComparable(x.valor_nuevo)
    if (actual === pedido) return c
    if (actual !== celdaComparable(x.valor_anterior)) return c
    return { ...c, obra_celda: pedido || null }
  })
}

/**
 * ¿La obra contradice la Unidad de Negocio de la fila? Devuelve el motivo o null. NO corrige: el
 * dueño escribió las dos celdas y cuál de las dos está mal lo decide él.
 */
export function unidadIncoherente(unidad, destino) {
  const u = String(unidad ?? '').trim()
  if (!u || !destino) return null
  const k = normAlias(u)
  if (k === 'civil' || k === 'mantenimiento') {
    return destino === DESTINO.OBRA ? null : `Unidad «${u}» lleva una obra y la columna Obra dice estructura`
  }
  if (k === 'estructura') {
    return destino === DESTINO.OBRA ? `Unidad «${u}» no lleva obra y la columna Obra dice una` : null
  }
  if (k === 'impuestos' || k === 'financiero') return `Unidad «${u}» no va en Compras: corresponde a su pestaña`
  return null
}
