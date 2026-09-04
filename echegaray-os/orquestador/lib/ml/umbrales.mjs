// LOS UMBRALES DE CADA ENTIDAD, LEÍDOS DE UN ARCHIVO VERSIONADO. NO HAY NÚMEROS EN EL CÓDIGO.
//
// Salen de `orquestador/datos/ml/umbrales.json`, que guarda además CÓMO se midió cada uno y con
// qué ground truth. Un umbral sin procedencia es un número inventado con dos decimales, y cambiar
// uno sin volver a medir es exactamente cómo vuelve un falso positivo.
//
// Sólo `proveedor` está calibrado con datos reales (19 positivos y 400 negativos verificados por
// CUIT). Las demás entidades declaran `calibrado: false` y heredan valores conservadores: su
// comportamiento NO se puede presentar como medido.

import { readFileSync } from 'node:fs'

const RUTA = new URL('../../datos/ml/umbrales.json', import.meta.url)
let _cfg = null

function cfg() {
  if (!_cfg) _cfg = JSON.parse(readFileSync(RUTA, 'utf8'))
  return _cfg
}

/** Los umbrales de una entidad. Una entidad desconocida NO cae en un default cómodo: usa los más
 *  estrictos que haya, porque una fusión incorrecta es peor que una sugerencia de más. */
export function umbralesDe(entidad) {
  const c = cfg()
  const u = c.entidades[String(entidad ?? '').toLowerCase()]
  if (u) return { ...u, entidad, version: c.version }
  const estricto = Object.values(c.entidades).reduce((a, b) => (b.auto > a.auto ? b : a))
  return { ...estricto, entidad, version: c.version, calibrado: false, porQue: `«${entidad}» no está declarada: usa los umbrales más estrictos del archivo` }
}

export function configUmbrales() { return cfg() }
export function entidadesCalibradas() {
  return Object.entries(cfg().entidades).filter(([, v]) => v.calibrado).map(([k]) => k)
}
