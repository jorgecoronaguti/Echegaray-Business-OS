import { AvisoError, TopBarDetalle, Vacio } from '@/shared/components/movil/Piezas'

// SIN NINGUNA OBRA NO HAY PANTALLA, Y SE DICE POR QUÉ.
//
// Cero obras y «no pude leer las obras» se ven exactamente igual desde afuera: una pantalla vacía.
// Son dos cosas muy distintas —una es un vínculo que falta, la otra es la base que no contestó— y
// sin distinguirlas el jefe reinicia el teléfono creyendo que se rompió algo suyo.

export function SinObra({ error }: { error: string | null }) {
  return (
    <>
      <TopBarDetalle titulo="Obra" sub="Todavía no hay ninguna para mostrar" />
      <div style={{ padding: '16px 16px 24px' }}>
        {error ? (
          <AvisoError testid="jefe-sin-obra-error">{error}</AvisoError>
        ) : (
          <Vacio testid="jefe-sin-obra">
            No hay ninguna obra a tu nombre. El alcance lo decide la base: una obra es tuya si
            Administración te la asignó en Personal, o si tu usuario la tiene cargada. Hasta
            entonces el OS no sabe qué obra mostrarte, y no elige una por su cuenta.
          </Vacio>
        )}
      </div>
    </>
  )
}
