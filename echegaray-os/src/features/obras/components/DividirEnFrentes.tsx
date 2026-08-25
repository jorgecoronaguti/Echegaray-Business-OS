// DIVIDIR UNA ACTIVIDAD EN FRENTES — el gesto que convierte «Mampostería» en «Mampostería · Eje
// 1–4» y «Mampostería · Eje 5–8», repartiendo la cantidad.
//
// ═══ EL MOTIVO SE MUESTRA ANTES, NO DESPUÉS ═══
//
// Los portazos que la acción hace cumplir (ya tiene hijas, viene de una partida, tiene avance
// registrado, se mide por pasos) se pueden ver con lo que el panel YA leyó. Un botón que siempre
// contesta que no se puede es un botón que enseña a no apretar botones. La acción los vuelve a
// chequear igual: la pantalla evita el gesto, el servidor es la última palabra.
//
// ═══ NO HAY UN CAMPO «CUÁNTOS FRENTES» ═══
//
// Un número pediría después nombrarlos de a uno, o los dejaría llamándose «Frente 1». Los nombres
// SON el dato: «Eje 1–4» ubica en la obra y «Frente 2» no. De los nombres sale la cantidad de
// frentes, y de la cantidad sale el reparto.

import { FormAccion } from '@/shared/components/ui'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'

export function DividirEnFrentes({ nombre, cantidad, unidad, motivo, dividir }: {
  nombre: string
  cantidad: number | null
  unidad: string | null
  /** Por qué NO se puede, con lo que el panel ya sabe. `null` = se puede. */
  motivo: string | null
  dividir: AccionFormulario
}) {
  if (motivo) {
    return (
      <p className="text-[11.5px] leading-relaxed text-muted" data-testid="dividir-bloqueado">
        <strong className="font-medium text-ink-soft">No se puede dividir en frentes:</strong> {motivo}
      </p>
    )
  }
  return (
    <details data-testid="dividir-en-frentes">
      <summary className="cursor-pointer text-[12.5px] font-medium text-ink hover:underline">
        Dividir en frentes
      </summary>
      <div className="mt-2">
        <FormAccion accion={dividir} testid="form-dividir-frentes" enviar="Dividir" limpiarAlOk
          mensajeOk="La actividad quedó dividida en frentes.">
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-faint">
              Nombres de los frentes, separados por coma
            </span>
            <input name="nombres" placeholder="Eje 1–4, Eje 5–8" maxLength={600}
              data-testid="campo-nombres-frentes"
              className="h-control w-full rounded-control border border-line-strong px-2.5 text-[12.5px] text-ink placeholder:text-faint" />
          </label>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            {cantidad == null
              ? <>«{nombre}» no tiene cantidad objetivo, así que los frentes nacen sin cantidad: no en cero.</>
              : <>
                  Los {cantidad.toLocaleString('es-AR')} {unidad ?? ''} de «{nombre}» se reparten en
                  partes iguales entre los frentes y la suma se conserva. Si no cerrara, no se
                  genera nada.
                </>}
            {' '}La actividad pasa a ser un contenedor: su avance va a salir de sus frentes.
          </p>
        </FormAccion>
      </div>
    </details>
  )
}
