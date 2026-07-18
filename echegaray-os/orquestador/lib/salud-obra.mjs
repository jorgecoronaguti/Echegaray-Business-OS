// SUPER SKILL — capacidad-DECISIÓN: "¿cómo va económicamente esta obra?"
// No devuelve un dato suelto: devuelve la LECTURA del CFO, separando HECHO / CÁLCULO /
// RECOMENDACIÓN (regla de confianza del CLAUDE.md) y siendo HONESTA con los gaps — nunca
// inventa un ingreso o un margen que no tiene respaldo. Compone el eje F0.2 (obra_canonica),
// obra-costos (costo real) y las tablas de presupuesto/certificación. 0 API.
import { query } from './db.mjs'
import { resolverObra } from './obras.mjs'
import { costoRealObra } from './obra-costos.mjs'

const money = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR')

/** CORE PURO (testeable sin DB): arma la lectura del CFO a partir de las piezas ya obtenidas.
 *  piezas = { obra:{nombre,estado,tipo}, costo:{total,n,por_categoria,por_proveedor},
 *             presupuesto:{monto,margen_esperado}|null, ingresoCertificado:number|null } */
export function armarSalud({ obra, costo, presupuesto, ingresoCertificado }) {
  const faltantes = []
  const evidencia = {}

  // HECHO: costo real (del eje, respaldado por comprobantes)
  evidencia.costo_real = { valor: costo.total, n: costo.n, clase: 'HECHO' }

  // Presupuesto (DATO si existe)
  let consumoPct = null
  if (presupuesto?.monto) {
    consumoPct = presupuesto.monto > 0 ? costo.total / presupuesto.monto : null
    evidencia.presupuesto = { valor: presupuesto.monto, clase: 'DATO' }
  } else {
    faltantes.push('presupuesto cargado')
  }

  // Ingreso devengado (certificación): hoy típicamente ausente
  const tieneIngreso = ingresoCertificado != null
  if (tieneIngreso) evidencia.ingreso_certificado = { valor: ingresoCertificado, clase: 'DATO' }
  else faltantes.push('certificación (ingreso devengado)')

  // Margen REAL: solo calculable con ingreso devengado. Nunca se inventa.
  let margen = null
  if (tieneIngreso) {
    margen = { calculable: true, valor: ingresoCertificado - costo.total, pct: ingresoCertificado > 0 ? (ingresoCertificado - costo.total) / ingresoCertificado : null, clase: 'CÁLCULO' }
  } else {
    margen = { calculable: false, motivo: 'falta la certificación (ingreso devengado). Se ve el COSTO real, no el margen — no se inventa.', margen_esperado: presupuesto?.margen_esperado ?? null }
  }

  // Lectura del CFO (situación → qué falta → recomendación → siguiente paso)
  const topCat = costo.por_categoria?.[0]
  let lectura = `${obra.nombre} (${obra.estado}${obra.tipo === 'mantenimiento' ? ', mantenimiento' : ''}): costo real acumulado ${money(costo.total)} en ${costo.n} comprobantes`
  if (topCat) lectura += `, mayor rubro ${topCat.nombre} ${money(topCat.total)}`
  lectura += '. '
  if (consumoPct != null) lectura += `Lleva consumido el ${(consumoPct * 100).toFixed(0)}% del presupuesto (${money(presupuesto.monto)}). `
  if (!margen.calculable) lectura += `⚠ No se puede cerrar el margen: falta ${faltantes.join(' y ')}. `
  else lectura += `Margen real ${money(margen.valor)} (${(margen.pct * 100).toFixed(1)}%). `

  const recomendacion = margen.calculable
    ? (margen.valor < 0 ? 'Margen negativo — revisar sobrecostos por rubro y frenar compras no críticas.' : 'Margen positivo — sostener el control de costos por rubro.')
    : `Para pasar de "veo el costo" a "sé si gana": cargar ${faltantes.join(' y ')}. Con eso el margen se calcula solo.`

  const siguiente_paso = !presupuesto?.monto
    ? `Cargar el presupuesto/contrato de ${obra.nombre} para tener base de comparación.`
    : !tieneIngreso
      ? `Cargar la certificación de ${obra.nombre} (ingreso devengado) — es el gap que bloquea el margen.`
      : 'Revisar el rubro de mayor desvío contra presupuesto.'

  return {
    obra: { nombre: obra.nombre, estado: obra.estado, tipo: obra.tipo },
    costo_real: { total: costo.total, comprobantes: costo.n, por_categoria: costo.por_categoria, por_proveedor: costo.por_proveedor },
    presupuesto: presupuesto?.monto ?? null,
    consumo_presupuesto_pct: consumoPct,
    ingreso_certificado: ingresoCertificado ?? null,
    margen,
    faltantes,
    lectura,
    recomendacion,
    siguiente_paso,
    evidencia,
  }
}

/** Busca un presupuesto para la obra por match de nombre contra public.obras (uuid legacy).
 *  El bridge canónico↔public.obras es un gap conocido → hoy solo match exacto de nombre. */
async function buscarPresupuesto(nombreObra) {
  const exact = (await query(
    `select p.monto_presupuestado monto, p.margen_esperado
       from public.presupuestos p join public.obras o on o.id = p.obra_id
      where lower(o.nombre) = lower($1) limit 1`, [nombreObra])).rows[0]
  return exact ? { monto: Number(exact.monto), margen_esperado: exact.margen_esperado != null ? Number(exact.margen_esperado) : null } : null
}

/** Ingreso certificado real de la obra (hoy certificados=0 → null). */
async function buscarIngresoCertificado(nombreObra) {
  const r = (await query(
    `select coalesce(sum(c.monto_certificado),0) total, count(*) n
       from public.certificados c join public.obras o on o.id = c.obra_id
      where lower(o.nombre) = lower($1)`, [nombreObra])).rows[0]
  return Number(r?.n || 0) > 0 ? Number(r.total) : null
}

/** Capacidad pública: salud económica de una obra por su texto/nombre. 0 API. */
export async function saludObra(texto) {
  const r = await resolverObra(texto)
  if (!r.obra_id) {
    return { error: `"${texto}" no resuelve a una obra (clasificación: ${r.clasificacion}). Obras válidas: La Estrella, San Francisco, Messina, ARCOR, Galpones.` }
  }
  const canon = (await query('select id, nombre, estado, tipo from public.obra_canonica where id=$1', [r.obra_id])).rows[0]
  const costo = await costoRealObra(r.obra_id)
  const presupuesto = await buscarPresupuesto(canon.nombre)
  const ingresoCertificado = await buscarIngresoCertificado(canon.nombre)
  return armarSalud({ obra: canon, costo, presupuesto, ingresoCertificado })
}
