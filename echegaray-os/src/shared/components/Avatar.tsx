// LA FOTO, O LAS INICIALES — nunca una silueta genérica.
//
// VIVE EN `shared/` DESDE EL DESIGN DEL 23/08: el canónico lo dibuja en Mi cuenta, en el listado de
// Personal (19), en la ficha de la persona (20) y en el shell del jefe. Cuatro dominios lo usan, y
// el que quedó en `features/mi-cuenta/` ya había producido una segunda copia de iniciales escrita a
// mano en `ShellJefe`. Se mueve entero, sin tocar una línea de su lógica.
//
// El avatar por defecto de casi todo el software es una silueta gris. Acá no: en los partes y en las
// cuadrillas hay que distinguir a Juan Morales de Luis Cabrera de un vistazo, y treinta siluetas
// iguales no distinguen a nadie. Las iniciales sobre la superficie grafito de la marca sí.
//
// SIN `next/image`: la foto viene de un bucket público de Supabase cuyo host cambia por entorno, y
// declarar el dominio en `next.config` para un avatar de 88px es pagar configuración por nada. El
// tamaño está fijado en píxeles, así que no hay reflujo mientras carga.

/* eslint-disable @next/next/no-img-element */

/**
 * EL TINTE DEL AVATAR — canónicos 19 y 20.
 *
 * `19 · Personal Cartera.dc.html` pinta el círculo de iniciales según el estado del día
 * (`avFondo` / `avColor`): verde a quien está en obra, neutro al resto; `20 · Persona Ficha 360`
 * usa el mismo verde en el avatar de 44px del encabezado. Es la ÚNICA señal de color de la fila que
 * no cuesta una columna, y por eso vale.
 *
 * `marca` es el tinte por defecto —grafito con iniciales blancas—, que es el que usan Mi cuenta, el
 * shell del jefe y cualquier avatar que no esté hablando de presencia. El color NUNCA se decide acá:
 * llega decidido por quien conoce el estado.
 */
export type TonoAvatar = 'marca' | 'pos' | 'neutro'

const TINTE: Record<TonoAvatar, string> = {
  marca: 'bg-accent text-white',
  // Medidos del canónico 19: fondo #F1F9F4 sobre tinta #067647 (que es el token `pos`).
  pos: 'bg-[#F1F9F4] text-pos',
  neutro: 'bg-[#EFEEEA] text-ink-soft',
}

export function Avatar({
  nombre,
  url,
  lado = 88,
  tono = 'marca',
}: {
  nombre: string
  url: string | null
  lado?: number
  tono?: TonoAvatar
}) {
  const iniciales = nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    // UN `<span>` Y NO UN `<div>`: desde el Design del 23/08 el avatar aparece DENTRO del `h1` del
    // slab de identidad y dentro del `<a>` de la fila de Personal. Un `div` ahí es contenido de
    // flujo dentro de contenido de frase —HTML inválido—: el navegador lo «arregla» cerrando el
    // padre antes de tiempo y React avisa de una discrepancia de hidratación en producción. Con
    // `inline-flex` y el tamaño en píxeles se ve exactamente igual.
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line align-middle ${TINTE[tono]}`}
      style={{ width: lado, height: lado }}
      data-testid="avatar"
    >
      {url ? (
        <img src={url} alt={`Foto de ${nombre}`} width={lado} height={lado} className="h-full w-full object-cover" />
      ) : (
        // LAS INICIALES TAMBIÉN SALEN DE LA ESCALA. Era `lado * 0,34`, que para el avatar de 88px
        // daba 30px — un tamaño que no está entre los nueve del handoff. Que sea "casi" texto no lo
        // exime: un cálculo que produce cualquier número produce, con el tiempo, todos.
        <span style={{ fontSize: escalon(lado) }} className="font-semibold leading-none" aria-hidden>
          {iniciales || '·'}
        </span>
      )}
    </span>
  )
}

/** El tamaño de las iniciales para un avatar de `lado` px, tomado de la escala del handoff. */
function escalon(lado: number): number {
  if (lado >= 72) return 28
  if (lado >= 48) return 20
  if (lado >= 32) return 14
  return 11
}
