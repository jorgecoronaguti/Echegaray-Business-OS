// LOS TRES ESTADOS DE UNA PANTALLA, y la frontera entre ellos.
//
//   CARGANDO  → `@/shared/components/carga` (esqueleto con la forma real de la fila).
//   VACÍO     → `Vacio` de `@/shared/components/ds` (texto `muted`, accionable, sin explicación larga).
//   ERROR     → esto.
//
// Son tres cosas distintas y se ven distinto. Que un listado vacío POR ERROR se dibuje como «no hay
// datos» hace que un sistema caído parezca una empresa sin trabajo.
export { EstadoError } from './EstadoError'
export { EstadoNoEncontrado } from './EstadoNoEncontrado'
export { SelloDatoBueno } from './SelloDatoBueno'
export { diagnosticar, type Diagnostico, type ErrorDeRuta } from './diagnostico'
export { textoDatoBueno, sellarDatoBueno, leerSelloDatoBueno } from './frescura'
export { ubicarPantalla, type Ubicacion } from './ubicacion'
