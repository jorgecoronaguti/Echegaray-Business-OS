// EL CONSUMIDOR DE LA COLA DE NOTAS «QUÉ HACER» — la app pide, el Sheet confirma, y si el Sheet cambió gana él.
//
// La app encola con `proveedor_nota_pedir` (20260917T1410). Acá: se toma el pedido más viejo, se
// compara contra TODO lo que pudo cambiar después, se escribe con bisturí, se RELEE en el destino y
// recién entonces cambia `public.proveedor_notas`. La forma es la de `cola-obra.mjs`.
//
// ═══ DÓNDE SE ESCRIBE, Y POR QUÉ NO EN LA FILA DEL PROVEEDOR ═══
//
// La D de Proveedores es `VLOOKUP` sobre la auxiliar oculta `_PROVEEDORES_OS` (A proveedor · C nota).
// Escribir el texto en la D de la fila donde HOY está el proveedor es el defecto que ese archivo pagó
// tres veces: la dinámica se reordena por monto y la nota queda al lado de otro. Se escribe en la C de
// la fila del proveedor en la AUXILIAR, que está anclada al nombre, y la D la muestra sola. Si el
// proveedor no tiene fila en la auxiliar, se usa la primera fila vacía: `proveedores-cuenta-corriente`
// reescribe la auxiliar entera desde la base, y para entonces la base ya tiene la nota.
//
// Si en la D el dueño había pisado la fórmula con un texto (el mismo que la base ya tiene), además se
// repone la fórmula EN ESA CELDA: sin eso, la auxiliar diría la nota nueva y la pestaña seguiría
// mostrando el texto viejo escrito a mano.
//
// ═══ QUÉ ES UN CONFLICTO (gana el Sheet — decisión del dueño) ═══
//
//   · la base ya no dice `nota_anterior`: la sonda trajo una edición del Sheet después del pedido;
//   · la D del proveedor tiene un texto a mano distinto de `nota_anterior`, o está vacía sin fórmula
//     habiendo nota: el dueño la editó o la borró y la sonda todavía no la leyó;
//   · la C de la auxiliar no dice `nota_anterior` y la D no está editada a mano: alguien tocó la
//     auxiliar, y pisarla sería decidir por él.
// Un conflicto se cierra `rechazado` con lo que dice el Sheet adentro del motivo, que es lo que la
// pantalla muestra.
//
// Todo entra inyectado (`port`, `google`): se prueba con dobles, sin Postgres ni Google.
import { claveProv, borrarNotas, guardarNotas } from '../../lib/proveedor-notas.mjs'
import { observarCuadro, RANGO_PROVEEDORES } from '../../lib/proveedores-notas-hoja.mjs'
import { AUX, formulaNota } from '../../lib/proveedores-notas-columna.mjs'
import { COL_PROVEEDOR, colNota, letra } from '../../lib/proveedores-cuadro-a.mjs'

export const LEASE_MIN = 10
export const MAX_INTENTOS = 3
const RANGO_AUX = `'${AUX}'!A1:C600`
const T = (v) => String(v ?? '').trim()

async function idDelCashflow() {
  const { CASHFLOW_ID } = await import('../../lib/cash-briefing.mjs')
  return CASHFLOW_ID
}

/** ¿Está la cola? Sin la migración 20260917T1410 el worker de Compras sigue y esto no hace nada. */
export async function hayCola(port) {
  const r = await port.query("select to_regclass('public.proveedor_nota_cambio') is not null as hay")
  return r?.rows?.[0]?.hay === true
}

export async function reciclarColgados(port) {
  const r = await port.query(
    `update public.proveedor_nota_cambio
        set estado = case when intentos >= $2 then 'error' else 'pendiente' end,
            motivo = case when intentos >= $2 then 'la escritura se cortó a la mitad y ya no quedan reintentos' else motivo end
      where estado = 'procesando' and tomado_at < now() - make_interval(mins => $1::int) returning id`,
    [LEASE_MIN, MAX_INTENTOS])
  return r?.rows?.length ?? 0
}

export async function tomarPedido(port) {
  const r = await port.query(
    `update public.proveedor_nota_cambio c set estado = 'procesando', tomado_at = now(), intentos = c.intentos + 1
      where c.id = (select id from public.proveedor_nota_cambio where estado = 'pendiente'
                     order by creado_at limit 1 for update skip locked)
      returning c.*`)
  return r?.rows?.[0] ?? null
}

async function actorDe(port, pedido) {
  if (pedido?.pedido_por) {
    const r = await port.query('select nombre from public.perfiles where id = $1', [pedido.pedido_por])
    if (T(r?.rows?.[0]?.nombre)) return T(r.rows[0].nombre)
  }
  return T(pedido?.pedido_por_nombre) || null
}

const conflicto = (detalle) => ({ accion: 'rechazar', motivo: 'conflicto', detalle: `gana el Sheet: ${detalle}` })

/** Las filas del cuadro de Proveedores con este proveedor, y qué celdas de la D hay que reponer. */
function mirarProveedores(observacion, pedido) {
  const mias = observacion.filas.filter((f) => f.clave && f.clave === pedido.clave)
  for (const f of mias) {
    if (f.tipo === 'texto' && f.texto !== pedido.nota_anterior) {
      return { error: conflicto(`«Qué hacer» de ${f.proveedor} (fila ${f.fila}) dice «${f.texto}», escrito a mano después del pedido`) }
    }
    if (f.tipo === 'vacia' && pedido.nota_anterior) {
      return { error: conflicto(`«Qué hacer» de ${f.proveedor} (fila ${f.fila}) está vacía sin fórmula: la nota se borró en el Sheet`) }
    }
  }
  const aMano = mias.filter((f) => f.tipo !== 'formula')
  const col = letra(colNota())
  const reponer = aMano.map((f) => ({ celda: `Proveedores!${col}${f.fila}`, escribir: formulaNota(f.fila, letra(COL_PROVEEDOR)), fila: f.fila }))
  return { mias, reponer, editadaAMano: aMano.length > 0 }
}

/**
 * Las filas del proveedor en la auxiliar (base 1) —TODAS sus grafías: el VLOOKUP lee la primera y
 * `filasDeLaAuxiliar` repite la nota en cada una—, o la primera fila vacía para agregarlo.
 */
function mirarAuxiliar(aux, clave) {
  const filas = aux.map((f, k) => ({ fila: k + 1, nombre: f?.[0], actual: T(f?.[2]) }))
    .filter((x) => x.fila > 1 && claveProv(x.nombre) === clave)
  if (filas.length) return { filas, existe: true }
  const libre = aux.findIndex((f, k) => k > 0 && !T(f?.[0]) && !T(f?.[2]))
  return { filas: [{ fila: libre > 0 ? libre + 1 : Math.max(aux.length, 1) + 1, actual: '' }], existe: false }
}

/** LA DECISIÓN, sin efectos: la usan la corrida real y la corrida en seco. */
export async function decidirNota({ port, google, fileId, pedido }) {
  const actor = await actorDe(port, pedido)
  if (!actor) return { accion: 'rechazar', motivo: 'sin_actor', detalle: 'el pedido no tiene una persona identificada y el Sheet no se escribe sin nombre' }
  const r = await port.query('select nota from public.proveedor_notas where clave = $1', [pedido.clave])
  const enBase = T(r?.rows?.[0]?.nota)
  if (enBase !== pedido.nota_anterior) return conflicto(`la nota ya dice «${enBase || '(vacía)'}» (se editó en el Sheet después del pedido)`)

  const [visible, formulas, aux] = await Promise.all([
    google.readSheetValues(fileId, RANGO_PROVEEDORES, { render: 'FORMATTED_VALUE' }),
    google.readSheetValues(fileId, RANGO_PROVEEDORES, { render: 'FORMULA' }),
    google.readSheetValues(fileId, RANGO_AUX, { render: 'FORMATTED_VALUE' }),
  ])
  const observacion = observarCuadro({ visible: visible ?? [], formulas: formulas ?? [] })
  if (observacion.formulas === 0) return { accion: 'diferir', motivo: 'generador', detalle: 'el cuadro de Proveedores no tiene fórmulas en «Qué hacer»: un generador lo está rehaciendo' }
  const prov = mirarProveedores(observacion, pedido)
  if (prov.error) return prov.error

  const enAux = mirarAuxiliar(aux ?? [], pedido.clave)
  const distinta = enAux.existe && enAux.filas.find((x) => x.actual !== pedido.nota_anterior)
  if (distinta && !prov.editadaAMano) {
    return conflicto(`la auxiliar ${AUX} (fila ${distinta.fila}) dice «${distinta.actual || '(vacía)'}» y la app vio «${pedido.nota_anterior || '(vacía)'}»`)
  }
  const celdas = [...prov.reponer.map(({ celda, escribir }) => ({ celda, escribir }))]
  if (enAux.existe) {
    for (const x of enAux.filas) if (x.actual !== pedido.nota_nueva) celdas.push({ celda: `'${AUX}'!C${x.fila}`, escribir: pedido.nota_nueva })
  } else if (pedido.nota_nueva) {
    const { fila } = enAux.filas[0]
    celdas.push({ celda: `'${AUX}'!A${fila}`, escribir: pedido.proveedor }, { celda: `'${AUX}'!C${fila}`, escribir: pedido.nota_nueva })
  }
  return {
    accion: celdas.length ? 'escribir' : 'ya_aplicado', actor, celdas,
    filasAux: enAux.filas.map((x) => x.fila), filasProveedores: prov.mias.map((f) => f.fila),
  }
}

const cerrar = (port, id, { estado, motivo, leido }) => port.query(
  `update public.proveedor_nota_cambio set estado = $2, motivo = $3, leido_de_vuelta = $4,
          aplicado_at = case when $2 = 'aplicado' then now() else aplicado_at end where id = $1`,
  [id, estado, motivo ?? null, leido ?? null])

const diferir = (port, id, motivo) => port.query(
  `update public.proveedor_nota_cambio set estado = 'pendiente', motivo = $2, intentos = greatest(intentos - 1, 0) where id = $1`,
  [id, motivo])

/** La base sigue al Sheet, nunca al revés: esto corre DESPUÉS de releer lo escrito. */
async function asentarEnBase(port, fileId, pedido) {
  if (pedido.nota_nueva) await guardarNotas(fileId, [{ clave: pedido.clave, proveedor: pedido.proveedor, nota: pedido.nota_nueva }], port)
  else await borrarNotas(fileId, [pedido.clave], port)
}

/** Relee la auxiliar y la D del proveedor: la escritura es buena cuando el Sheet MUESTRA la nota. */
async function releer({ google, fileId, plan, pedido }) {
  const enAux = []
  for (const fila of plan.filasAux) {
    const aux = await google.readSheetValues(fileId, `'${AUX}'!A${fila}:C${fila}`, { render: 'FORMATTED_VALUE' })
    enAux.push(T(aux?.[0]?.[2]))
  }
  const vistas = []
  for (const fila of plan.filasProveedores) {
    const v = await google.readSheetValues(fileId, `Proveedores!${letra(colNota())}${fila}`, { render: 'FORMATTED_VALUE' })
    vistas.push(T(v?.[0]?.[0]))
  }
  const ok = [...enAux, ...vistas].every((v) => v === pedido.nota_nueva)
  const auxLeido = plan.filasAux.map((f, i) => `C${f}=«${enAux[i]}»`).join(' ')
  return { ok, leido: `${AUX} ${auxLeido}${vistas.length ? ` · Proveedores D=«${vistas.join('» «')}»` : ''}` }
}

/** APLICA UN PEDIDO. Verificar → escribir → releer → recién ahí la base. */
export async function aplicarNota({ port, google, fileId, pedido }) {
  const plan = await decidirNota({ port, google, fileId, pedido })
  if (plan.accion === 'rechazar') { await cerrar(port, pedido.id, { estado: 'rechazado', motivo: `${plan.motivo}: ${plan.detalle}` }); return 'rechazado' }
  if (plan.accion === 'diferir') { await diferir(port, pedido.id, `${plan.motivo}: ${plan.detalle}`); return 'diferido' }
  if (plan.accion === 'escribir') {
    const r = await google.batchUpdateValues(fileId, plan.celdas.map((c) => ({ range: c.celda, values: [[c.escribir]] })), {
      confirmacion: { actor: plan.actor, motivo: `nota «Qué hacer» de ${pedido.proveedor} editada en la app por ${plan.actor} (pedido ${pedido.id})` },
    })
    if (r?.congelado) { await diferir(port, pedido.id, 'el freno de mano de Sheets está puesto'); return 'diferido' }
    if (r?.protegido) {
      if (r.noBorrar && !pedido.nota_nueva) {
        await cerrar(port, pedido.id, { estado: 'rechazado', motivo: 'no-borrar no deja vaciar la nota desde un worker: se borra a mano en el Sheet' })
        return 'rechazado'
      }
      await diferir(port, pedido.id, `pestaña protegida: ${r.motivo ?? 'candado'}`)
      return 'diferido'
    }
  }
  const vuelta = await releer({ google, fileId, plan, pedido })
  if (!vuelta.ok) {
    await cerrar(port, pedido.id, { estado: 'error', motivo: `relectura distinta: ${vuelta.leido}`, leido: vuelta.leido })
    return 'error'
  }
  await asentarEnBase(port, fileId, pedido)
  await cerrar(port, pedido.id, { estado: 'aplicado', motivo: `${plan.celdas?.length ?? 0} celda(s) escritas por ${plan.actor}`, leido: vuelta.leido })
  return 'aplicado'
}

/** Vacía la cola, o con `dry` sólo dice qué haría (sin tomar ni escribir nada). */
export async function procesarColaNotas({ port, google, fileId = null, max = 20, dry = true } = {}) {
  if (!await hayCola(port)) return { sinCola: true }
  const id = fileId ?? await idDelCashflow()
  if (dry) {
    const r = await port.query("select * from public.proveedor_nota_cambio where estado = 'pendiente' order by creado_at limit $1", [max])
    const plan = []
    for (const pedido of r?.rows ?? []) plan.push({ id: pedido.id, proveedor: pedido.proveedor, ...await decidirNota({ port, google, fileId: id, pedido }) })
    return { dry: true, plan }
  }
  const cuenta = { dry: false, reciclados: await reciclarColgados(port), aplicado: 0, rechazado: 0, diferido: 0, error: 0 }
  for (let i = 0; i < max; i += 1) {
    const pedido = await tomarPedido(port)
    if (!pedido) break
    let estado
    try {
      estado = await aplicarNota({ port, google, fileId: id, pedido })
    } catch (e) {
      estado = 'error'
      const agotado = pedido.intentos >= MAX_INTENTOS
      await port.query('update public.proveedor_nota_cambio set estado = $2, motivo = $3 where id = $1',
        [pedido.id, agotado ? 'error' : 'pendiente', `falla técnica: ${e.message}`])
    }
    cuenta[estado] += 1
    if (estado === 'diferido') break
  }
  return cuenta
}
