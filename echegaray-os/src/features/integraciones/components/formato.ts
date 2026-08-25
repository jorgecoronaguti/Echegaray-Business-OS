// FORMATO DE LAS CELDAS DE OPERACIÓN — la implementación ya NO vive acá.
//
// `dm`/`dmHora` se mudaron a `shared/utils/fecha.ts` como `diaMesLocal`/`diaMesAnioLocal` (leen el
// instante en el huso del navegador, que es lo correcto para un `timestamptz`), y `cantidad` a
// `shared/utils/format.ts`, fusionada con la copia de Obras: eran la misma regla salvo por la
// unidad opcional y por descartar lo no finito, que es lo que se conservó.
//
// El archivo sobrevive como re-export para no tocar los imports de las tres pantallas que lo usan,
// y porque `formato.test.ts` prueba estos nombres: el mismo test tiene que seguir en verde después
// de la mudanza, y eso es la evidencia de que la salida no cambió.

// La ruta va RELATIVA y con extensión: el alias `@/` lo resuelve el bundler, no `node --test`, y
// estos nombres los ejercita un test.
export { cantidad } from '../../../shared/utils/format.ts'
export { diaMesLocal as dm, diaMesAnioLocal as dmHora } from '../../../shared/utils/fecha.ts'
