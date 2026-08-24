// EL CANON DE ADMINISTRACIÓN — porte literal de `echegaray-design/*.dc.html`.
//
// Una sola puerta de entrada, como `components/ds`. Lo que NO está acá y sí en `ds/` se usa desde
// `ds/`: `Estado` (la pastilla de tabla) y `Filtros` (el chip) ya fueron medidos contra este mismo
// zip el 24/08 y coinciden. Duplicarlos sería tener dos definiciones del mismo objeto, que es
// justamente el defecto que un sistema de componentes existe para evitar.

export { C, ALTO, RADIO_TARJETA, TARJETA, PIE_TOTALES, PAGINA, PANEL, MIN_COLUMNA_FICHA, rotuloColumna } from './estilos'
export { TarjetaTabla, EncabezadoCanon, FilaCanon, CeldaTexto, PieCanon, VacioCanon } from './Tabla'
export type { ColumnaCanon } from './Tabla'
export { BotonMarca, BotonPlano, BotonIcono, BuscadorCaja, ChipAtencion, CuentaChip } from './Controles'
export { FranjaKpis, TarjetaBloque, FilaDato, BarraAvance, PastillaTitulo, TONO, LineaCampos, SolapasFicha } from './Bloques'
export type { ClaveTono } from './Bloques'
export { FranjaCartera, BandaDetalle, BandaFicha, iniciales } from './Cabeceras'
export * from './iconos'
