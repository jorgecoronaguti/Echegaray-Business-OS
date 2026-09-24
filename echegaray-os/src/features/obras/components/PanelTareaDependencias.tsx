'use client'

// 04 · SOLAPA DEPENDENCIAS — qué habilita a esta actividad, a quién habilita ella, y cómo se cambia.
//
// LENGUAJE ERP OBRAS (24/09/2026): el zip no dibuja esta solapa. Se arma con las piezas del 04 —dos
// eyebrows mono («Antes de esto» / «Después de esto») como «Lo que la traba», filas con `bordeLista`,
// el editor plegado con chevron y la secundaria blanca «Vincular otra actividad» (ESTILO_SECUNDARIA,
// que tokens.ts ya anota como «04 · Vincular actividad»).
//
// ═══ LA SIGLA NO SE MUESTRA: SE EDITA ═══
//
// La frase («empieza cuando termina Replanteo») la arma la base en `obra_dependencia_legible`, y es
// lo único que se lee. FS/SS/FF/SF aparece SÓLO adentro del desplegable de «Cambiar relación»,
// porque ahí hay que elegir una y no hay forma de elegir sin nombrarla. El desplegable arranca en la
// relación que la dependencia TIENE hoy: si arrancara siempre en FS, cambiar la demora de una SS la
// convertiría en FS sin que nadie lo pida.
//
// ═══ QUITAR ES DESTRUCTIVO Y SE DICE, NO SE PREGUNTA ═══
//
// Sin `window.confirm` —no se lee con guantes puestos—: el botón dice qué hace y queda escrito al
// lado. Quitar una precedencia no borra trabajo, pero suelta el arrastre del cronograma.

import Link from 'next/link'
import { FormAccion } from '@/shared/components/ui'
import type { RelacionLegible } from '../services/tareasService'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'
import { C, ESTILO_SECUNDARIA } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { Falta, estiloControl } from './items/crear/Piezas'
import { Eyebrow, Nota, Plegado } from './panel/PanelPiezas'

const RELACIONES: [string, string][] = [
  ['FS', 'FS · empieza cuando la otra termina'],
  ['SS', 'SS · empiezan juntas'],
  ['FF', 'FF · terminan juntas'],
  ['SF', 'SF · no termina hasta que la otra empiece'],
]

export function PanelTareaDependencias({
  antes, despues, hrefVincular, puedeEditar, cambiarRelacion, quitarRelacion,
}: {
  antes: RelacionLegible[]
  despues: RelacionLegible[]
  hrefVincular: string
  /** Cambiar el plan de la obra es de Administración y de la jefatura. La guarda de verdad vive en
   *  la acción; esto evita ofrecer un gesto que el servidor va a rechazar. */
  puedeEditar: boolean
  /** Ya atadas a la obra. El id de la dependencia se ata acá con `.bind`, NUNCA con una arrow: una
   *  arrow escrita en el servidor es una función nueva, no la acción, y React la rechaza en tiempo
   *  de ejecución. Ni el typecheck ni el build lo ven — sólo el navegador. */
  cambiarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
  quitarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
}) {
  return (
    <section data-testid="panel-dependencias" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <Eyebrow derecha={antes.length > 0 ? antes.length : undefined}>Antes de esto</Eyebrow>
        {antes.length === 0
          ? <div style={{ fontSize: '12.5px', padding: '4px 0' }}><Falta>Nadie declaró qué tiene que pasar antes.</Falta></div>
          : antes.map((r) => (
            <Fila key={r.id} relacion={r} otra={r.origen} puedeEditar={puedeEditar}
              cambiar={cambiarRelacion.bind(null, r.id)} quitar={quitarRelacion.bind(null, r.id)} />
          ))}
      </div>

      <div>
        <Eyebrow derecha={despues.length > 0 ? despues.length : undefined}>Después de esto</Eyebrow>
        {despues.length === 0
          ? <div style={{ fontSize: '12.5px', padding: '4px 0' }}><Falta>Nada depende de esta actividad todavía.</Falta></div>
          : despues.map((r) => (
            <Fila key={r.id} relacion={r} otra={r.destino} puedeEditar={puedeEditar}
              cambiar={cambiarRelacion.bind(null, r.id)} quitar={quitarRelacion.bind(null, r.id)} />
          ))}
      </div>

      {/* SIN PRECEDENCIAS NO HAY CAMINO CRÍTICO. Deducirlo de las fechas sería inventar una
          secuencia: dos actividades consecutivas pueden serlo sólo porque comparten cuadrilla. */}
      {antes.length === 0 && despues.length === 0 && (
        <Nota>Sin precedencias declaradas no hay camino crítico que calcular: ninguna actividad se marca crítica.</Nota>
      )}

      {/* DECLARAR UNA PRECEDENCIA NUEVA ES EL CRONOGRAMA, y no este cajón de 400 px: elegir contra
          qué actividad se ata exige ver la lista entera de la obra y las fechas de cada una. Acá se
          cambia y se quita lo que YA está declarado. */}
      <Link href={hrefVincular} prefetch={false} data-testid="ir-vincular"
        style={{ ...ESTILO_SECUNDARIA, width: 'fit-content', textDecoration: 'none' }}>
        <Ico d={P.dep} s={14} />Vincular otra actividad
      </Link>
    </section>
  )
}

/** Una precedencia: la frase de la base, y debajo el editor plegado. El editor NO reemplaza a la
 *  frase — la frase es lo que se lee; el editor es lo que se toca. */
function Fila({ relacion, otra, puedeEditar, cambiar, quitar }: {
  relacion: RelacionLegible
  otra: string
  puedeEditar: boolean
  cambiar: AccionFormulario
  quitar: AccionFormulario
}) {
  return (
    <div style={{ padding: '9px 0', borderBottom: `1px solid ${C.bordeLista}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
        <span style={{ display: 'flex', color: C.tenue, marginTop: '2px', flexShrink: 0 }}><Ico d={P.dep} s={14} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13px', color: C.tinta }}>{otra}</div>
          <div style={{ fontSize: '12px', color: C.tintaSuave, marginTop: '1px' }}>{relacion.relacion}</div>
        </div>
      </div>
      {puedeEditar && (
        <div style={{ marginTop: '6px', paddingLeft: '23px' }}>
          <Plegado rotulo="Cambiar relación" testid={`cambiar-relacion-${relacion.id}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <FormAccion accion={cambiar} enviar="Guardar la relación" mensajeOk="Relación cambiada.">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '12px', color: C.tintaSuave }}>Relación</span>
                    <select name="tipo" defaultValue={relacion.tipo} style={{ ...estiloControl(32), fontSize: '12.5px' }}>
                      {RELACIONES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '84px', flexShrink: 0 }}>
                    <span style={{ fontSize: '12px', color: C.tintaSuave }}>Demora (d)</span>
                    <input type="number" name="lag_dias" min={-365} max={365} step={1}
                      defaultValue={relacion.lag_dias} style={estiloControl(32, true)} />
                  </label>
                </div>
              </FormAccion>
              <FormAccion accion={quitar} enviar="Quitar la precedencia" mensajeOk="Precedencia quitada.">
                <Nota>
                  Quitarla no borra trabajo: suelta el arrastre. Esta actividad deja de esperar a «{otra}» y
                  el cronograma deja de moverla cuando la otra se mueve.
                </Nota>
              </FormAccion>
            </div>
          </Plegado>
        </div>
      )}
    </div>
  )
}
