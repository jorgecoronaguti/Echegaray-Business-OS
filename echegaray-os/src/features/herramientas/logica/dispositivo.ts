// ¿El QR se abrió desde un teléfono? Por el user-agent: la cámara del teléfono abre el navegador del
// teléfono. Una tablet cuenta como teléfono (se usa en obra, parada). Ante la duda, escritorio: la
// ficha de escritorio también funciona en una pantalla chica; la de campo en una grande se ve vacía.

export function esTelefono(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini|IEMobile/i.test(ua)
}
