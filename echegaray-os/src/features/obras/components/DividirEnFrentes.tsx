'use client'

// DIVIDIR UNA ACTIVIDAD EN FRENTES — el gesto que convierte «Mampostería» en «Mampostería · Eje
// 1–4» y «Mampostería · Eje 5–8», repartiendo la cantidad.
//
// LENGUAJE ERP OBRAS (24/09/2026): el mismo campo que dibuja MC8 / C07 («Nombres de los frentes,
// separados por coma», control mono de 32) dentro del plegable del panel de la tarea. La pantalla
// completa de frentes con vista previa es `items/crear/PanelFrentes`; ésta es la puerta corta que el
// panel ya tenía y no se retira.
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
import { C } from './canon/tokens'
import { estiloControl } from './items/crear/Piezas'
import { Nota, Plegado } from './panel/PanelPiezas'

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
      <Nota testid="dividir-bloqueado">
        <span style={{ fontWeight: 500, color: C.tintaMedia }}>No se puede dividir en frentes:</span> {motivo}
      </Nota>
    )
  }
  return (
    <Plegado rotulo="Dividir en frentes" testid="dividir-en-frentes" fuerte>
      <FormAccion accion={dividir} testid="form-dividir-frentes" enviar="Dividir" limpiarAlOk
        mensajeOk="La actividad quedó dividida en frentes.">
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', color: C.tintaSuave }}>Nombres de los frentes, separados por coma</span>
          <input name="nombres" placeholder="Eje 1–4, Eje 5–8" maxLength={600}
            data-testid="campo-nombres-frentes" style={estiloControl(32, true)} />
        </label>
        <div style={{ marginTop: '8px' }}>
          <Nota>
            {cantidad == null
              ? <>«{nombre}» no tiene cantidad objetivo, así que los frentes nacen sin cantidad: no en cero.</>
              : <>
                  Los {cantidad.toLocaleString('es-AR')} {unidad ?? ''} de «{nombre}» se reparten en partes iguales
                  y la suma se conserva; si no cerrara, no se genera nada.
                </>}
            {' '}La actividad pasa a contenedor: su avance sale de sus frentes.
          </Nota>
        </div>
      </FormAccion>
    </Plegado>
  )
}
