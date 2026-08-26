// LA LÓGICA DE LA PUERTA — pura, para poder probarla sin base ni navegador.
//
// Queda poco: el 26/08/2026 el dueño retiró el código de un solo uso —«con cargarle el mail en su
// ficha de cliente ya debería poder acceder»— y con él se fueron el hash, el vencimiento y el tope de
// intentos. Lo que sobrevive es lo único que decide algo: cómo se escribe un mail para que el que el
// administrador cargó y el que el cliente tipea sean el MISMO.

/**
 * El mail, como se guarda y se compara.
 *
 * SIEMPRE en minúsculas y sin espacios. `Marta@X.com` y `marta@x.com` son la misma persona para
 * cualquier servidor de correo del mundo; si acá fueran dos, el administrador cargaría uno y el
 * cliente escribiría el otro, y el portal diría «no está habilitado» teniéndolo habilitado.
 */
export function normalizarMail(crudo: string): string {
  return crudo.trim().toLowerCase()
}

/** Forma mínima de un mail. No valida que exista — eso lo dice el código que llega o no llega. */
export function pareceMail(mail: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)
}
