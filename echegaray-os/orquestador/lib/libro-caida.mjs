// EL LIBRO QUE SE CAE DE GOLPE NO SE PUBLICA.
//
// ═══ POR QUÉ EXISTE (17/09/2026) ═══
//
// La corrida de las 11:07 publicó en `public.flujo_corrida` 435 movimientos y neto +$419.749.338. Las
// anteriores tenían 1.306 movimientos y neto ≈ −$8M. La causa estaba aguas arriba —un valor pegado en
// `Compras!AE962` dejó a 967 compras sin «Fecha de caja» y el libro las salteó—, pero el efecto llegó
// hasta el saldo de cierre del Cash Flow Mensual y la web sin que nada frenara: el libro se escribió,
// CAJA y las vistas lo leyeron, y `sync-flujo-fondos` lo marcó vigente.
//
// El freno de derrames (`compras-derrames.mjs`) ataja ESA causa. Éste ataja el EFECTO, venga de donde
// venga: una fuente que deja de leerse, un rótulo que se movió, un filtro que vacía una pestaña.
//
// ═══ LA REGLA ═══
//
// Contra la última corrida VIGENTE:
//   · CAÍDA: menos movimientos que (1 − 10%) de la vigente → frena.
//   · SALTO: el neto se mueve más de $200.000.000 → frena. UNA sola excepción: los movimientos SUBEN
//     más de 10% Y la corrida vigente VIENE DE UNA CAÍDA contra la previa (cayó más de 10%). Es la
//     corrida que REPARA: hoy la vigente es la rota (435, +$419M, cayó desde 1.306) y la buena vuelve
//     con ~1.316 y ≈ −$8M. Sin la excepción, el sistema quedaría congelado en el estado roto.
//
//     La excepción se acotó el 17/09 por auditoría: con sólo «subieron los movimientos», una fuente
//     DUPLICADA (1.306 → 1.450 y −$300M) pasaba sin frenar. Una suba grande sobre una vigente sana no
//     repara nada: es exactamente la forma que tiene un doble conteo.
//
// Por qué $200M, MEDIDO sobre las 91 corridas de `flujo_corrida` al 17/09/2026: el salto del neto entre
// corridas consecutivas tiene mediana $370.709 y p95 $70.878.951; los dos mayores fuera del defecto
// fueron +$143.120.201 (04/09) y −$103.435.338 (07/09), sin caída de movimientos — no se verificó si
// eran legítimos, y un freno a $100M los habría parado. El defecto del 17/09 movió $427.607.681. $200M
// queda por encima de todo lo observado y a menos de la mitad del defecto. Es un parámetro declarado:
// moverlo es una decisión con esta tabla a la vista.
//
// ═══ CUANDO LA CAÍDA ES LEGÍTIMA ═══
//
// (Se retiró una fuente entera, se depuró un año.) `ORQ_LIBRO_CAIDA_ACEPTADA="motivo con sustancia"`
// deja pasar UNA corrida y el motivo queda en el log. Sin motivo no hay excepción: una variable vacía
// es exactamente el atajo que convierte un freno en decoración.

/** Qué fracción de movimientos puede perder el libro contra la vigente antes de frenar. */
export const UMBRAL_CAIDA = 0.10
/** Cuánto puede moverse el neto contra la vigente antes de frenar. En pesos. */
export const SALTO_NETO = 200_000_000
/** Largo mínimo del motivo para aceptar una caída a mano. */
export const MOTIVO_MINIMO = 15

const pesos = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')

/**
 * @param {{movimientos:number, neto:number}} actual   el libro que se está por publicar
 * @param {{movimientos:number, neto:number, previa?:{movimientos:number, neto:number}|null}|null} vigente
 *        la corrida vigente (null: no hay contra qué), con la corrida que la precedió en `previa`
 * @param {{umbral?:number, salto?:number, aceptada?:string}} o
 * @returns {{frena:boolean, motivos:string[], aceptada:string|null}}
 */
export function evaluarContraVigente(actual, vigente, { umbral = UMBRAL_CAIDA, salto = SALTO_NETO, aceptada } = {}) {
  if (!vigente || !(Number(vigente.movimientos) > 0)) return { frena: false, motivos: [], aceptada: null }
  const n = Number(actual?.movimientos) || 0
  const nv = Number(vigente.movimientos)
  const neto = Number(actual?.neto) || 0
  const netoV = Number(vigente.neto) || 0
  const motivos = []
  if (n < nv * (1 - umbral)) {
    motivos.push(`el libro cae de ${nv} a ${n} movimiento(s) (${Math.round((1 - n / nv) * 100)}% menos; el tope es ${Math.round(umbral * 100)}%)`)
  }
  if (Math.abs(neto - netoV) > salto && !reparaUnaCaida({ n, nv, previa: vigente.previa, umbral })) {
    motivos.push(`el neto salta de ${pesos(netoV)} a ${pesos(neto)} (${pesos(neto - netoV)}; el tope es ${pesos(salto)})`
      + (n > nv * (1 + umbral)
        ? ` y el libro gana movimientos (${nv} → ${n}) sobre una vigente que NO vino de una caída: forma de fuente duplicada`
        : ' sin que el libro gane movimientos'))
  }
  if (!motivos.length) return { frena: false, motivos, aceptada: null }
  const motivo = String(aceptada ?? '').trim()
  if (motivo.length >= MOTIVO_MINIMO) return { frena: false, motivos, aceptada: motivo }
  return { frena: true, motivos, aceptada: null }
}

/** ¿Este libro repara una caída? Sube más del umbral Y la vigente cayó más del umbral contra su previa. PURA. */
export function reparaUnaCaida({ n, nv, previa, umbral = UMBRAL_CAIDA }) {
  const np = Number(previa?.movimientos)
  const vigenteVinoDeCaida = np > 0 && nv < np * (1 - umbral)
  return n > nv * (1 + umbral) && vigenteVinoDeCaida
}

/**
 * La corrida vigente, o null si la tabla no existe o no hay ninguna. Un error de la base NO se traga:
 * sin la vigente no se puede decir que el libro no se cayó, y el que llama decide fallar cerrado.
 * @param {(sql:string, params?:any[]) => Promise<{rows:any[]}>} query
 */
export async function corridaVigente(query) {
  const { rows: t } = await query("select to_regclass('public.flujo_corrida') as t")
  if (!t[0]?.t) return null
  const { rows } = await query(
    'select movimientos, neto::float8 as neto, corrida_en from public.flujo_corrida where vigente limit 1')
  if (!rows[0]) return null
  // LA PREVIA: la última corrida ANTERIOR a la vigente. Sin ella no se puede afirmar que la vigente vino
  // de una caída, y entonces la excepción de reparación no aplica (falla cerrado).
  const { rows: previas } = await query(
    'select movimientos, neto::float8 as neto from public.flujo_corrida where corrida_en < $1 order by corrida_en desc limit 1',
    [rows[0].corrida_en])
  return {
    movimientos: Number(rows[0].movimientos), neto: Number(rows[0].neto), corrida_en: rows[0].corrida_en,
    previa: previas[0] ? { movimientos: Number(previas[0].movimientos), neto: Number(previas[0].neto) } : null,
  }
}

/** Las líneas del aviso, con el `⛔` que el pipeline levanta. */
export function avisoDeCaida(evaluacion, { donde }) {
  if (evaluacion.aceptada) {
    return evaluacion.motivos.map((m) => `⚠ ${donde}: ${m} — ACEPTADO a mano: «${evaluacion.aceptada}»`)
  }
  if (!evaluacion.frena) return []
  return [
    ...evaluacion.motivos.map((m) => `✗✗ ${donde}: ${m}`),
    `⛔ FRENO: ${donde} no publica. Se busca la causa aguas arriba (una fuente que dejó de leerse). Si la caída es legítima: ORQ_LIBRO_CAIDA_ACEPTADA="motivo".`,
  ]
}
