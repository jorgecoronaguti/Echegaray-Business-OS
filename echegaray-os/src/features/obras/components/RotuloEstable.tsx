// UNA SOLAPA NO CORRE A SUS VECINAS AL ACTIVARSE (dueño, 23/09/2026: «se mueven»).
//
// La activa va en 500/600 y la negrita es más ancha: sin reservar ese ancho, cada clic corre las
// solapas de al lado unos px. La copia invisible en negrita ocupa la misma celda de la grilla y fija
// el ancho de la más ancha de las dos; no se lee (aria-hidden) ni suma alto.
export function RotuloEstable({ texto, peso }: { texto: string; peso: number }) {
  return (
    <span style={{ display: 'inline-grid' }}>
      <span style={{ gridArea: '1 / 1' }}>{texto}</span>
      <span aria-hidden="true" style={{ gridArea: '1 / 1', fontWeight: peso, visibility: 'hidden', height: 0, overflow: 'hidden' }}>{texto}</span>
    </span>
  )
}
