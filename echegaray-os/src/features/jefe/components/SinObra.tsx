import { Encabezado, Nada, Panel } from './Piezas'
import { Aviso } from '@/shared/components/ds'

// SIN NINGUNA OBRA NO HAY PANTALLA, Y SE DICE POR QUÉ.
//
// Cero obras y «no pude leer las obras» se ven exactamente igual desde afuera: una pantalla vacía.
// Son dos cosas muy distintas —una es un vínculo que falta, la otra es la base que no contestó— y
// sin distinguirlas el jefe reinicia el teléfono creyendo que se rompió algo suyo.

export function SinObra({ error }: { error: string | null }) {
  return (
    <>
      <Encabezado titulo="Obra" sub="Todavía no hay ninguna para mostrar" />
      <div className="px-4 pb-6">
        {error ? (
          <Aviso tono="neg" titulo="No se pudieron leer las obras." testid="jefe-sin-obra-error">
            {error}
          </Aviso>
        ) : (
          <Panel testid="jefe-sin-obra">
            <Nada>
              No hay ninguna obra a tu nombre. El alcance lo decide la base: una obra es tuya si
              Administración te la asignó en Personal, o si tu usuario la tiene cargada. Hasta
              entonces el OS no sabe qué obra mostrarte, y no elige una por su cuenta.
            </Nada>
          </Panel>
        )}
      </div>
    </>
  )
}
