// EL CONTROL DE CUADRE ENTRE LAS DOS VISTAS — que coincidan no puede depender de que alguien mire.
//
// ═══ POR QUÉ EXISTE (13/08/2026) ═══
//
// El Semanal y el Mensual dieron resultados del año distintos durante semanas y nadie lo vio: hay que
// abrir las dos pestañas, scrollear cada una hasta su columna TOTAL —la BC y la N— y restar de cabeza.
// El desvío era $13.073.317 de egresos de enero de 2027 metidos en el ejercicio 2026 (la causa está
// en cash-flow-borde-anio.mjs). Arreglar la causa sin dejar un control es confiar en que la próxima
// vez alguien mire.
//
// ═══ QUÉ PRUEBA ESTE CONTROL, Y POR QUÉ NO ES CIRCULAR ═══
//
// El Semanal y el Mensual son DOS CÁLCULOS INDEPENDIENTES DEL MISMO HECHO: 53 ventanas semanales y 12
// mensuales sobre el mismo libro `_MOVIMIENTOS`, sumadas por fórmulas distintas en pestañas distintas.
// Que las dos den lo mismo en cada fila es evidencia real; que dieran lo mismo porque una copia a la
// otra no probaría nada — y es exactamente por eso que el TOTAL del Semanal tiene que seguir siendo la
// suma de sus columnas y no un filtro directo al libro. Un control no se valida contra la misma
// información que produce.
//
// SE COMPARAN TODAS LAS FILAS QUE LLEVAN TOTAL, no sólo el resultado del año: las cuatro medidas, cada
// rubro de su apertura, "Otros", y las cinco líneas de cada cliente. Son ~60 comparaciones por corrida.
// Comparar sólo el resultado dejaría pasar dos errores que se compensan — y en un cuadro donde
// "Otros" se despeja por diferencia, compensarse es lo que hacen naturalmente.
//
// ═══ FALLA CERRADO ═══
//
// Cualquier cosa que impida comparar —una fila que no se puede leer, un rótulo que no es el que el
// generador declaró, un valor que no es número— es un PROBLEMA, no un "no aplica". Un control que se
// saltea lo que no entiende es un control que dice "ok" cuando más falta hace que grite.

import { conceptosDe, filaDeConcepto, particionExacta } from './cash-flow-matriz.mjs'

/**
 * LA TOLERANCIA: UN PESO.
 *
 * No es cero por el punto flotante de Sheets: dos sumas de los mismos ~4.000 términos en distinto
 * orden pueden diferir en centavos. Un peso absorbe eso y nada más — el desvío que motivó el control
 * era de trece millones, y cualquier error de ventana real es de la magnitud de un movimiento.
 */
export const TOLERANCIA = 1

/**
 * LAS FILAS QUE TIENEN QUE COINCIDIR. PURA.
 *
 * Sale de `CONCEPTOS` (`total: true`), no de una lista tipeada acá: el día que se agregue un rubro o
 * un cliente, el control lo compara solo. Una lista paralela se olvidaría de actualizar y el agujero
 * quedaría justo en lo nuevo, que es lo menos probado.
 *
 * Los saldos quedan afuera porque no llevan TOTAL: un saldo es un stock y sumar doce stocks no
 * significa nada. Se comparan igual, por otra vía: el saldo final del año es el de la última columna
 * de cada vista, y sale del mismo encadenamiento que estas filas alimentan.
 */
export function filasDeCuadre(tipo) {
  return conceptosDe(tipo)
    .filter((c) => c.total)
    .map((c) => ({ clave: c.clave, rotulo: c.rotulo, fila: filaDeConcepto(tipo, c.clave) }))
}

/**
 * DOS RÓTULOS SON EL MISMO SI DICEN LO MISMO. PURA.
 *
 * Las sub-líneas van sangradas ("    · Cobranzas") y la sangría es presentación, no identidad: un
 * `trim()` de un solo lado hacía que NINGUNA sub-línea coincidiera y el control declaraba rota la
 * pestaña entera. Es la misma trampa que el neteo de obras pagó esta semana con los espacios de más.
 */
const mismoRotulo = (a, b) => String(a ?? '').replace(/\s+/g, ' ').trim() === String(b ?? '').replace(/\s+/g, ' ').trim()

/** Un número de una celda leída con UNFORMATTED_VALUE, o `null` si no lo es. PURA. */
function numeroDe(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!s) return null
  // Sin des-formatear a mano: si llegó un texto con puntos y comas es que se leyó con el render
  // equivocado, y adivinar el separador decimal de un importe es la forma más cara de equivocarse.
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * LOS TOTALES DE UNA VISTA, LEÍDOS DE SU PESTAÑA. PURA — recibe el rectángulo ya leído.
 *
 * LA FILA SE CALCULA Y EL RÓTULO SE VERIFICA. La posición sale de `filaDeConcepto` —el mismo código
 * que escribió la pestaña— y además se contrasta contra la columna A. Anclar sólo en la posición ya
 * rompió controles de este archivo en silencio; anclar sólo en el rótulo es imposible acá, porque
 * "· Otros" y "Ingresos reales" se repiten en cada bloque y en cada cliente.
 *
 * @param {any[][]} valores el rectángulo A1:<total>, con UNFORMATTED_VALUE
 * @param {{tipo:string, cab:{colTotal:number}, pestana:string}} meta
 * @returns {{pestana:string, totales:Map<string,number>, problemas:string[]}}
 */
export function totalesDeVista(valores = [], meta) {
  const totales = new Map()
  const problemas = []
  for (const f of filasDeCuadre(meta.tipo)) {
    const fila = valores[f.fila - 1] || []
    const rotulo = String(fila[0] ?? '').trim()
    if (!mismoRotulo(rotulo, f.rotulo)) {
      problemas.push(`${meta.pestana}!A${f.fila} dice "${rotulo || '(vacío)'}" y el generador escribió "${f.rotulo}": la pestaña no tiene la forma que este control sabe leer`)
      continue
    }
    const n = numeroDe(fila[meta.cab.colTotal])
    if (n === null) {
      problemas.push(`${meta.pestana} · ${f.rotulo}: el TOTAL no es un número ("${String(fila[meta.cab.colTotal] ?? '').slice(0, 20)}")`)
      continue
    }
    totales.set(f.clave, n)
  }
  return { pestana: meta.pestana, tipo: meta.tipo, totales, problemas }
}

/**
 * ¿CUADRAN? PURA.
 *
 * Devuelve la comparación entera —no sólo el veredicto— porque un control que dice "no cuadra" sin
 * decir qué fila y por cuánto obliga a rehacer a mano el trabajo que acaba de hacer.
 *
 * @returns {{ok:boolean, comparadas:number, lineas:Array, peor:object|null, problemas:string[]}}
 */
export function cuadre(a, b, { tolerancia = TOLERANCIA } = {}) {
  const problemas = [...a.problemas, ...b.problemas]
  // LAS DOS VISTAS TIENEN QUE LLEVAR LAS MISMAS FILAS CON TOTAL. Si una tuviera una que la otra no,
  // la comparación la saltearía en silencio y el agujero quedaría justo en lo recién agregado.
  const claves = (t) => filasDeCuadre(t).map((f) => f.clave).join('|')
  if (claves(a.tipo) !== claves(b.tipo)) {
    problemas.push(`${a.pestana} y ${b.pestana} no declaran las mismas filas totalizables: no son comparables fila por fila`)
  }
  const lineas = []
  for (const f of filasDeCuadre(a.tipo)) {
    const x = a.totales.get(f.clave)
    const y = b.totales.get(f.clave)
    if (x === undefined || y === undefined) continue // ya está reportado como problema
    const delta = x - y
    lineas.push({ clave: f.clave, rotulo: f.rotulo, [a.pestana]: x, [b.pestana]: y, delta, ok: Math.abs(delta) <= tolerancia })
  }
  const fuera = lineas.filter((l) => !l.ok)
  const peor = fuera.slice().sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta))[0] ?? null
  return { ok: problemas.length === 0 && fuera.length === 0, comparadas: lineas.length, lineas, fuera, peor, problemas }
}

/**
 * LA GUARDA BARATA, ANTES DE ESCRIBIR UNA SOLA CELDA. PURA.
 *
 * El cuadre de arriba lee la pestaña ya escrita: es la evidencia del efecto, pero llega tarde. Esto
 * mira la GEOMETRÍA de las dos grillas antes de tocar el archivo y falla si las vistas no cubren
 * exactamente el mismo intervalo, o si las columnas de una de ellas dejan un hueco o se pisan. Es la
 * condición que `cash-flow-matriz` declara como la que hace que las dos vistas no puedan discrepar —
 * acá se verifica en vez de suponerse.
 *
 * @param {Array<object>} metas las de las dos grillas
 * @returns {{ok:boolean, motivos:string[]}}
 */
export function guardaDeCobertura(metas = []) {
  const motivos = []
  const iso = (d) => new Date(d).toISOString().slice(0, 10)
  for (const m of metas) {
    if (!m?.cubre || !m?.efectivas?.length) { motivos.push(`${m?.pestana ?? '(sin nombre)'} no declara qué período cubre`); continue }
    const p = particionExacta(m.efectivas, m.cubre.inicio, m.cubre.fin)
    if (!p.ok) motivos.push(`${m.pestana}: sus columnas no cubren ${iso(m.cubre.inicio)} a ${iso(m.cubre.fin)} sin huecos ni solapamientos (${p.huecos.join('; ')})`)
  }
  const [a, b] = metas
  if (a?.cubre && b?.cubre) {
    const igual = a.cubre.inicio.getTime() === b.cubre.inicio.getTime() && a.cubre.fin.getTime() === b.cubre.fin.getTime()
    if (!igual) motivos.push(`${a.pestana} cubre ${iso(a.cubre.inicio)}–${iso(a.cubre.fin)} y ${b.pestana} cubre ${iso(b.cubre.inicio)}–${iso(b.cubre.fin)}: comparar sus totales no significaría nada`)
  }
  return { ok: motivos.length === 0, motivos }
}

/** El renglón de log de una línea que no cuadra. PURA. */
export const linea = (l, a, b) => `${l.rotulo}: ${a} ${Math.round(l[a]).toLocaleString('es-AR')} · ${b} ${Math.round(l[b]).toLocaleString('es-AR')} · Δ ${Math.round(l.delta).toLocaleString('es-AR')}`
