// FORMATO DEL MÓDULO DE OBRAS — la implementación ya NO vive acá.
//
// Estas nueve funciones se mudaron a `shared/utils` (21/08/2026): las de números a
// `shared/utils/format.ts`, junto a `money`/`pct` —que son otra regla, no la misma, y ahora la
// diferencia está escrita al lado—, y las de fecha a `shared/utils/fecha.ts`, donde quedaron
// nombradas por CÓMO leen el instante (`ISO` = día calendario, `Local` = huso del navegador).
//
// El archivo sobrevive como re-export para no tocar los ~50 imports que ya apuntan acá: mover la
// regla y mover los llamadores son dos cambios distintos, y hacerlos juntos deja el riesgo de los
// dos en el mismo commit. Los nombres locales (`fecha`, `fechaCorta`) se conservan porque son los
// que leen las pantallas de Obras.

// La ruta va RELATIVA y con extensión: el alias `@/` lo resuelve el bundler, no `node --test`, y
// desde acá cuelga código que los tests importan.
export { cantidad, desvio, hh, horas, plata, plataCorta, porcentaje } from '../../../shared/utils/format.ts'
export { diaMesAnioISO as fecha, diaMesISO as fechaCorta } from '../../../shared/utils/fecha.ts'
