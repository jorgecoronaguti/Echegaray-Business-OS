// EL PLAN DE EGRESOS DE UNA OBRA: DE LAS CELDAS DEL SHEET A FILAS DE `public.obra_egreso_proyectado`.
//
// POR QUÉ EXISTE (05/09/2026). Los 24 números pegados de los cuadros 4 y 5 de la pestaña OBRAS son
// el plan de gasto que el dueño declaró obra por obra. Hoy viven en las constantes de
// `lib/obras-datos.mjs` y en las celdas que él edita: nadie fuera del generador del Sheet los puede
// consultar. Este módulo es el paso de traducción —y NADA MÁS que la traducción— entre lo que dice
// la pestaña y lo que se guarda en Postgres.
//
// PURO. Sin red, sin Google, sin Postgres. Recibe las filas crudas de la pestaña (UNFORMATTED_VALUE)
// y devuelve estructuras. Todo lo que decide algo se puede probar con `node --test`.
//
// ═══ LA CUENTA QUE HACE, Y POR QUÉ ES UNA VERIFICACIÓN Y NO UN SUPUESTO ═══
//
// El costo proyectado de una obra (cuadro 4, columna C) es la suma de sus materiales previstos
// (cuadro 5, columna E) más su mano de obra con cargas. La mano de obra NO tiene celda propia en el
// Sheet: se deduce restando. Esa resta se cruza contra `moCargasPesos` de `obras-datos.mjs`, que es
// un camino INDEPENDIENTE hacia el mismo número — si los dos no coinciden, no se carga nada y se
// reporta. Un control validado contra la misma información que produce no controla nada.

// LA IDENTIDAD DE UN ÍTEM SE DEFINE UNA SOLA VEZ. `claveDeItem` ya empareja el ítem con su fila del
// Sheet en la fusión del cuadro 5; una segunda normalización acá se desincronizaría en silencio.
import { claveDeItem } from './materiales-fusion.mjs'
import { totalEgresos } from './obras-datos.mjs'
// El serial de Sheets se convierte a ISO con la MISMA época que usa el libro de movimientos. Una
// segunda conversión propia se desincroniza por un día y nadie lo ve hasta que un egreso cae en el
// mes que no era.
import { isoDeSerial } from './libro-extractores-fechas.mjs'

export const PESTANA_ORIGEN = 'OBRAS'
/** El rótulo con el que el cuadro 4 declara su columna de plata. Es el ancla: el NÚMERO de sección
 *  cambia cuando se agrega o saca un cuadro, y anclar en él dejaría de encontrar el cuadro sin dar
 *  error — el defecto de rango fosilizado que este repo ya pagó dos veces. */
export const ROTULO_COSTO_PROYECTADO = 'Costo proyectado'
export const ROTULO_OBRA = 'Obra'
export const PREFIJO_TOTAL = '⇒ TOTAL'
/** El separador que la pestaña pone entre la obra y el concepto en la columna A del cuadro 5. */
export const SEPARADOR_OBRA_CONCEPTO = ' — '
/** Hasta cuánta diferencia se acepta entre los dos caminos hacia la mano de obra. Un peso: los dos
 *  lados son montos enteros declarados, no un promedio. */
export const TOLERANCIA_PESOS = 1

const txt = (v) => String(v ?? '').trim()
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const r2 = (v) => Math.round(v * 100) / 100

/**
 * NÚCLEO PURO: dónde está el cuadro del costo proyectado dentro de las filas de la pestaña.
 *
 * Se ancla en la FILA DE ENCABEZADO (`Obra` en la A y `Costo proyectado` en la C) y no en el título
 * numerado, por lo dicho arriba.
 *
 * @param {Array<Array>} filas la pestaña entera, cruda
 * @returns {{encabezado:number, primera:number, ultima:number}|null} índices 0-based
 */
export function ubicarCuadroCosto(filas = []) {
  const i = (filas ?? []).findIndex((f) => txt(f?.[0]) === ROTULO_OBRA && txt(f?.[2]) === ROTULO_COSTO_PROYECTADO)
  if (i < 0) return null
  const primera = i + 1
  let j = primera
  for (; j < filas.length; j++) {
    const a = txt(filas[j]?.[0])
    if (!a || a.startsWith(PREFIJO_TOTAL)) break
  }
  return j > primera ? { encabezado: i, primera, ultima: j - 1 } : null
}

/**
 * NÚCLEO PURO: las filas del cuadro de costo, tal cual están.
 * @returns {Array<{fila:number, rotulo:string, proyectado:number|null}>} `fila` es 1-based
 */
export function costosDeCuadro(filas = []) {
  const u = ubicarCuadroCosto(filas)
  if (!u) return []
  const out = []
  for (let i = u.primera; i <= u.ultima; i++) {
    out.push({ fila: i + 1, rotulo: txt(filas[i]?.[0]), proyectado: num(filas[i]?.[2]) })
  }
  return out
}

/** La letra de la columna del costo proyectado y la del previsto. El orden de columnas del cuadro
 *  es contrato de `obras-grilla.mjs`; se nombra acá para que la celda de origen no sea un literal
 *  repetido en tres lugares. */
export const COL_COSTO = 'C'
export const COL_PREVISTO = 'E'

/**
 * NÚCLEO PURO: la obra a la que pertenece un rótulo del cuadro 5.
 *
 * «PISOS INDUSTRIALES — Gasoil» → «PISOS INDUSTRIALES». Se corta en el PRIMER separador, igual que
 * `materiales-previstos.mjs`: un concepto que contenga « — » se queda entero del lado del concepto,
 * que es donde no hace daño.
 */
export function partirRotulo(rotulo) {
  const s = txt(rotulo)
  const c = s.indexOf(SEPARADOR_OBRA_CONCEPTO)
  return c > 0
    ? { obra: s.slice(0, c).trim(), concepto: s.slice(c + SEPARADOR_OBRA_CONCEPTO.length).trim() }
    : { obra: s, concepto: '' }
}

/** ¿La fila del cuadro de costo habla de esta obra? El rótulo es «4.1 · Cliente — OBRA · 05/08 →
 *  30/09»: se exige que CONTENGA el nombre de la obra. Emparejar sólo por posición dejaría que un
 *  cuadro reordenado cargue el costo de una obra en otra sin un solo error. */
export const filaEsDeObra = (rotuloFila, obra) => txt(rotuloFila).includes(txt(obra))

/**
 * LA TRADUCCIÓN: celdas del Sheet → filas de `public.obra_egreso_proyectado`.
 *
 * @param {object} ctx
 *   · `items` los del cuadro 5 (`itemsCrudosDeCuadro5`), con su `fila` en la pestaña
 *   · `costos` los del cuadro de costo (`costosDeCuadro`), con su `fila`
 *   · `obras` las de `obras-datos.mjs` — aportan la clave interna y el camino independiente a la MO
 *   · `leidoEn` ISO del momento en que se leyó el Sheet
 * @returns {{filas:Array, hallazgos:Array<string>}} `hallazgos` VACÍO es la única condición para
 *   cargar: cualquier cosa que no cierre corta la carga en vez de guardar una versión inventada.
 */
export function egresosDesdeSheet({ items = [], costos = [], obras = [], leidoEn = null, pestana = PESTANA_ORIGEN } = {}) {
  const hallazgos = []
  const filas = []
  const porObra = new Map()
  for (const o of obras) porObra.set(txt(o.obra ?? o.clave), o)

  // ── 1. LOS MATERIALES, UNO POR FILA DEL CUADRO 5 ──
  const sumaPorObra = new Map()
  for (const it of items) {
    const { obra, concepto } = partirRotulo(it.rotulo)
    const monto = num(it.previsto)
    if (monto === null || monto <= 0) {
      hallazgos.push(`${pestana}!${COL_PREVISTO}${it.fila} «${it.rotulo}»: el Previsto no es un número positivo (${JSON.stringify(it.previsto ?? null)})`)
      continue
    }
    if (!porObra.has(obra)) {
      hallazgos.push(`${pestana}!${COL_PREVISTO}${it.fila} «${it.rotulo}»: no reconozco la obra «${obra}» — no está en obras-datos.mjs`)
      continue
    }
    const o = porObra.get(obra)
    const proveedor = txt(it.proveedor) || 'sin proveedor'
    const fecha = num(it.fecha)
    filas.push({
      clave: claveDeItem(it.rotulo, proveedor),
      obra_rotulo: obra,
      obra_clave: o.clave ?? null,
      tipo: 'material',
      concepto,
      familia: txt(it.familia) || null,
      proveedor,
      // Un serial de Sheets es UNA fecha; un texto de cuotas viaja como texto. No se reinterpreta.
      fecha_estimada: fecha !== null && fecha > 0 ? isoDeSerial(fecha) : null,
      fecha_texto: fecha === null && txt(it.fecha) ? txt(it.fecha) : null,
      monto: r2(monto),
      nota: txt(it.nota) || null,
      origen_pestana: pestana,
      origen_celda: `${COL_PREVISTO}${it.fila}`,
      origen_fuente: `${pestana}!${COL_PREVISTO}${it.fila} — plan de materiales declarado por el dueño`,
      origen_leido_en: leidoEn,
    })
    sumaPorObra.set(obra, r2((sumaPorObra.get(obra) ?? 0) + monto))
  }

  // ── 2. LA MANO DE OBRA, DEDUCIDA Y CRUZADA CONTRA UN CAMINO INDEPENDIENTE ──
  //
  // El cuadro de costo se recorre EN ORDEN contra `obras`, pero cada paso EXIGE que el rótulo de la
  // fila nombre la obra: si el cuadro se reordenó, esto rompe en vez de cargar el costo cambiado.
  if (costos.length !== obras.length) {
    hallazgos.push(`el cuadro de costo tiene ${costos.length} fila(s) y obras-datos declara ${obras.length} obra(s): no puedo emparejarlas`)
    return { filas, hallazgos }
  }
  costos.forEach((c, i) => {
    const o = obras[i]
    const obra = txt(o.obra ?? o.clave)
    if (!filaEsDeObra(c.rotulo, obra)) {
      hallazgos.push(`${pestana}!${COL_COSTO}${c.fila}: la fila dice «${c.rotulo}» y esperaba la obra «${obra}»`)
      return
    }
    if (c.proyectado === null) {
      hallazgos.push(`${pestana}!${COL_COSTO}${c.fila} «${obra}»: el Costo proyectado no es un número`)
      return
    }
    // EL CONTROL: el costo proyectado del Sheet tiene que ser lo que declara obras-datos.
    const esperado = totalEgresos(o)
    if (Math.abs(c.proyectado - esperado) > TOLERANCIA_PESOS) {
      hallazgos.push(`${pestana}!${COL_COSTO}${c.fila} «${obra}»: el Sheet dice ${c.proyectado} y obras-datos.mjs ${esperado}`)
      return
    }
    const mo = r2(c.proyectado - (sumaPorObra.get(obra) ?? 0))
    const moDeclarada = Number(o.moCargasPesos) || 0
    if (Math.abs(mo - moDeclarada) > TOLERANCIA_PESOS) {
      hallazgos.push(`«${obra}»: la mano de obra deducida del Sheet da ${mo} y obras-datos.mjs declara ${moDeclarada}`)
      return
    }
    if (mo <= 0) return // Una obra sin mano de obra proyectada no genera fila: cero no es un plan.
    filas.push({
      clave: claveDeItem(`${obra}${SEPARADOR_OBRA_CONCEPTO}Mano de obra con cargas`, 'propia'),
      obra_rotulo: obra,
      obra_clave: o.clave ?? null,
      tipo: 'mano_de_obra',
      concepto: 'Mano de obra con cargas',
      familia: 'Mano de obra',
      proveedor: 'propia',
      fecha_estimada: null,
      fecha_texto: null,
      monto: mo,
      nota: null,
      origen_pestana: pestana,
      origen_celda: null,
      origen_fuente: `${pestana}!${COL_COSTO}${c.fila} menos los materiales del cuadro 5; cruzado contra obras-datos.mjs#moCargasPesos`,
      origen_leido_en: leidoEn,
    })
  })
  return { filas, hallazgos }
}

/**
 * LA VERIFICACIÓN DEL EFECTO: lo que se quiso guardar contra lo que la base devuelve.
 *
 * No compara «se ve parecido»: compara CAMPO POR CAMPO de cada fila, por clave. Un 204 de PostgREST
 * o un `INSERT` que no falló no prueban que el dato quedó — lo prueba volver a leerlo.
 *
 * @param {Array} esperadas las filas producidas por `egresosDesdeSheet`
 * @param {Array} guardadas lo que devolvió `select` sobre la tabla
 * @returns {Array<string>} las diferencias. Vacío = idénticas.
 */
export function compararConLoGuardado(esperadas = [], guardadas = []) {
  const dif = []
  const porClave = new Map(guardadas.map((g) => [String(g.clave), g]))
  for (const e of esperadas) {
    const g = porClave.get(String(e.clave))
    if (!g) { dif.push(`falta en la base: ${e.clave}`); continue }
    porClave.delete(String(e.clave))
    const campos = ['obra_rotulo', 'obra_clave', 'tipo', 'concepto', 'familia', 'proveedor', 'fecha_estimada', 'fecha_texto', 'nota', 'origen_pestana', 'origen_celda', 'origen_fuente']
    for (const c of campos) {
      const a = e[c] ?? null
      const b = g[c] ?? null
      if (String(a ?? '') !== String(b ?? '')) dif.push(`${e.clave} · ${c}: esperaba ${JSON.stringify(a)} y la base tiene ${JSON.stringify(b)}`)
    }
    // El monto se compara como NÚMERO: la base devuelve `numeric` como string ("377740.00") y
    // compararlo como texto denunciaría una diferencia que no existe.
    if (Math.abs(Number(g.monto) - Number(e.monto)) > 0.005) {
      dif.push(`${e.clave} · monto: esperaba ${e.monto} y la base tiene ${g.monto}`)
    }
  }
  for (const sobra of porClave.keys()) dif.push(`sobra en la base: ${sobra}`)
  return dif
}
