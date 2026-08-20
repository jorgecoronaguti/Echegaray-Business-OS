// LA FOTO, O LAS INICIALES — nunca una silueta genérica.
//
// El avatar por defecto de casi todo el software es una silueta gris. Acá no: en los partes y en las
// cuadrillas hay que distinguir a Juan Morales de Luis Cabrera de un vistazo, y treinta siluetas
// iguales no distinguen a nadie. Las iniciales sobre la superficie grafito de la marca sí.
//
// SIN `next/image`: la foto viene de un bucket público de Supabase cuyo host cambia por entorno, y
// declarar el dominio en `next.config` para un avatar de 88px es pagar configuración por nada. El
// tamaño está fijado en píxeles, así que no hay reflujo mientras carga.

/* eslint-disable @next/next/no-img-element */

export function Avatar({
  nombre,
  url,
  lado = 88,
}: {
  nombre: string
  url: string | null
  lado?: number
}) {
  const iniciales = nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-accent text-white"
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
    </div>
  )
}

/** El tamaño de las iniciales para un avatar de `lado` px, tomado de la escala del handoff. */
function escalon(lado: number): number {
  if (lado >= 72) return 28
  if (lado >= 48) return 20
  if (lado >= 32) return 14
  return 11
}
