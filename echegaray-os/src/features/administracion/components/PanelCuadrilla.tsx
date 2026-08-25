// LA CUADRILLA ABIERTA — sus integrantes, su capataz, y a qué obra mandarla.
//
// ═══ LA OBRA DE LA CUADRILLA NO SE GUARDA ═══
//
// Mandarla a una obra NO escribe un campo `obra_id` en la cuadrilla: crea una asignación por cada
// integrante vigente, todas con `cuadrilla_id`. Por eso la obra puede sacar a uno sin desarmar la
// cuadrilla, y por eso «obra vigente» no puede quedar desactualizada — se deriva de esas mismas
// asignaciones cada vez que se lee. Lo mismo con los integrantes: son PERÍODOS con desde/hasta.
// Nada se copia, así que nada puede quedar viejo.

import Link from 'next/link'
import {
  BotonAccion, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import { Eyebrow, Nulo, Num } from '@/shared/components/ds'
import type { Cuadrilla, Integrante } from '../types'
import type { CapacidadCuadrilla } from '../services/cuadrillasService'
import type { CategoriaCapacidad } from '@/features/obras/services/cronogramaObraService'

interface Plantel { id: string; nombre_completo: string }
interface Obra { id: string; nombre: string }

const unDecimal = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * EL PESO DE UN INTEGRANTE — de `categoria_obra`, nunca de una tabla escrita a mano acá.
 *
 * Los factores del diseño (1,2 · 1,0 · 0,8 · 0,6) son los que hoy tiene la base, pero son un DATO
 * con vigencia: el día que cambien, esta pantalla tiene que cambiar sola. Una persona sin categoría
 * cargada devuelve `null` y la pantalla escribe «sin categoría» — la vista la cuenta como 1,0 y ese
 * supuesto se dice, no se dibuja como si fuera un dato.
 */
function Peso({ categoria, factores }: { categoria: string | null; factores: CategoriaCapacidad[] }) {
  const f = categoria ? factores.find((x) => x.clave === categoria) : undefined
  if (!f) {
    return <span className="shrink-0 text-[11px] text-faint" title="Pesa 1,0 por defecto">sin categoría</span>
  }
  return (
    <span className="shrink-0 text-[11px] text-muted" title={f.nombre} data-testid="peso-integrante">
      {f.nombre} <Num className="text-[11px] text-faint">{unDecimal(f.factor)}</Num>
    </span>
  )
}

function Propiedad({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[12px] text-muted">{k}</span>
      <span className="min-w-0 truncate text-right text-[12.5px] text-ink">{children}</span>
    </div>
  )
}

function CamposCuadrilla({ cuadrilla, plantel }: { cuadrilla: Cuadrilla | null; plantel: Plantel[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Nombre" ancho="col-span-2">
        <input
          name="nombre" required maxLength={120} className={CTRL}
          defaultValue={cuadrilla?.nombre ?? ''} data-testid="cuadrilla-nombre"
        />
      </Campo>
      <Campo label="Responsable / capataz" ancho="col-span-2" ayuda="Una persona del legajo, no un texto.">
        <select name="responsable_id" defaultValue={cuadrilla?.responsable_id ?? ''} className={CTRL}>
          <option value="">sin responsable</option>
          {plantel.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
        </select>
      </Campo>
      <Campo label="Notas" ancho="col-span-2">
        <input name="notas" maxLength={300} className={CTRL} defaultValue={cuadrilla?.notas ?? ''} />
      </Campo>
    </div>
  )
}

export function PanelCuadrilla({
  cuadrilla, integrantes, plantel, obras, hh, ventana, capacidad, factores,
  editar, archivar, agregar, quitar, asignarAObra, cerrarHref,
}: {
  cuadrilla: Cuadrilla
  integrantes: Integrante[]
  plantel: Plantel[]
  obras: Obra[]
  /** De la vista `cuadrilla_capacidad`. `null` = no se pudo leer; nunca 0. */
  capacidad: CapacidadCuadrilla | null
  factores: CategoriaCapacidad[]
  /** HH trabajadas del período por los integrantes vigentes. `null` = no hay a quién sumarle o no
   *  se pudo leer. Nunca 0: «0,00 HH» afirma que no trabajaron. */
  hh: number | null
  ventana: string
  editar: AccionFormulario
  archivar: (activa: boolean) => Promise<ResultadoAccion>
  agregar: AccionFormulario
  quitar: (integranteId: string) => Promise<ResultadoAccion>
  asignarAObra: AccionFormulario
  cerrarHref: string
}) {
  const vigentes = integrantes.filter((i) => !i.hasta)
  const salidos = integrantes.filter((i) => i.hasta)

  return (
    <aside
      data-testid="panel-cuadrilla"
      className="w-full shrink-0 border-t border-line pt-4 lg:w-[392px] lg:border-l lg:border-t-0 lg:py-1 lg:pl-6 lg:pt-0"
    >
      <div className="flex items-baseline gap-2.5">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{cuadrilla.nombre}</h2>
        <Link
          href={cerrarHref} data-testid="cerrar-panel" aria-label="Cerrar el panel"
          className="shrink-0 text-[12px] leading-none text-faint transition-colors hover:text-ink"
        >✕</Link>
      </div>

      <div className="mt-4 space-y-2.5">
        <Propiedad k="Responsable">{cuadrilla.responsable ?? <Nulo>sin responsable</Nulo>}</Propiedad>
        <Propiedad k="Obra vigente">{cuadrilla.obras_actuales ?? <Nulo>sin obra vigente</Nulo>}</Propiedad>
        <Propiedad k={`HH ${ventana}`}>
          {hh === null
            ? <Nulo>{vigentes.length === 0 ? 'sin integrantes' : 'sin registrar'}</Nulo>
            : (
                <span data-testid="hh-cuadrilla">
                  <Num>{hh.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Num>
                </span>
              )}
        </Propiedad>
        <Propiedad k="Cap. ponderada">
          {capacidad === null
            ? <Nulo>sin dato</Nulo>
            : (
                <span data-testid="cap-pond-panel">
                  <Num>{unDecimal(capacidad.capacidad_ponderada)}</Num>
                  <span className="ml-1 text-[11px] text-faint">
                    {capacidad.personas} {capacidad.personas === 1 ? 'persona' : 'personas'}
                    {capacidad.personas_sin_categoria > 0 && ` · ${capacidad.personas_sin_categoria} sin categoría`}
                  </span>
                </span>
              )}
        </Propiedad>
        <Propiedad k="Estado">{cuadrilla.activa ? 'activa' : <Nulo>archivada</Nulo>}</Propiedad>
      </div>

      <section className="mt-6">
        <Eyebrow className="mb-2.5">Integrantes · {vigentes.length}</Eyebrow>
        {vigentes.length === 0
          ? <Nulo>sin integrantes vigentes</Nulo>
          : (
              <ul data-testid="integrantes" className="space-y-2">
                {vigentes.map((i) => (
                  <li key={i.id} className="flex items-baseline gap-2.5 text-[12.5px]">
                    <Link href={`/administracion/personas/${i.persona_id}`} className="min-w-0 flex-1 truncate text-ink hover:underline">
                      {i.nombre_completo ?? i.persona_id}
                    </Link>
                    <Peso categoria={i.categoria} factores={factores} />
                    {/* EL PERÍODO, NO UNA MARCA DE PERTENENCIA: desde cuándo está es lo que hace que
                        las HH de marzo se le puedan atribuir a esta cuadrilla y no a la de ahora. */}
                    <Num className="shrink-0 text-[11px] text-faint">desde {i.desde}</Num>
                    <BotonAccion accion={quitar} args={[i.id]} testid="quitar-integrante">quitar</BotonAccion>
                  </li>
                ))}
              </ul>
            )}

        {/* UNA PRIMARIA POR CONTEXTO: la de este panel es «Asignar a obra». Sumar a alguien a la
            cuadrilla es frecuente pero secundario, y dos botones amarillos en la misma columna no
            son dos acciones importantes: son ninguna. */}
        <div className="mt-3">
          <FormAccion
            accion={agregar} testid="form-integrante" enviar="Agregar del plantel" limpiarAlOk
            mensajeOk="Sumado."
          >
            <div className="grid grid-cols-2 gap-2.5">
              <Campo
                label="Sumar a la cuadrilla" ancho="col-span-2"
                ayuda="Si venía de otra cuadrilla, ese período se cierra el día anterior."
              >
                <select name="persona_id" required defaultValue="" className={CTRL}>
                  <option value="" disabled>elegir del plantel</option>
                  {plantel.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
                </select>
              </Campo>
              <Campo label="Desde"><input type="date" name="desde" className={CTRL} /></Campo>
            </div>
          </FormAccion>
        </div>

        {salidos.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-faint">Ya no están · {salidos.length}</summary>
            <ul className="mt-2 space-y-1" data-testid="integrantes-historial">
              {salidos.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3 text-[11px] text-faint">
                  <span className="min-w-0 truncate">{i.nombre_completo ?? i.persona_id}</span>
                  <Num className="shrink-0 text-[11px] text-faint">{i.desde} → {i.hasta}</Num>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="mt-6 border-t border-line pt-4">
        <Eyebrow className="mb-2.5">Mandar a una obra</Eyebrow>
        {vigentes.length === 0
          ? <p className="text-[12.5px] text-muted">Sin integrantes vigentes no hay a quién asignar.</p>
          : (
              <FormAccion accion={asignarAObra} testid="form-cuadrilla-obra" enviar="Asignar a obra">
                <input type="hidden" name="cuadrilla_id" value={cuadrilla.id} />
                <div className="grid grid-cols-2 gap-2.5">
                  <Campo label="Obra" ancho="col-span-2">
                    <select name="obra_id" required defaultValue="" className={CTRL}>
                      <option value="" disabled>elegir obra</option>
                      {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Desde"><input type="date" name="desde" className={CTRL} /></Campo>
                </div>
              </FormAccion>
            )}
      </section>

      <section className="mt-6 border-t border-line pt-4">
        <Eyebrow className="mb-2.5">Datos de la cuadrilla</Eyebrow>
        <FormAccion accion={editar} testid="form-cuadrilla-editar" enviar="Guardar">
          <CamposCuadrilla cuadrilla={cuadrilla} plantel={plantel} />
        </FormAccion>
        <p className="mt-4 mb-2 text-[12px] text-muted">
          {cuadrilla.activa
            ? 'Archivar la saca de las listas operativas. No borra nada: las asignaciones a obra ya cargadas la siguen referenciando.'
            : 'Está archivada: no aparece para asignar.'}
        </p>
        <BotonAccion
          accion={archivar} args={[!cuadrilla.activa]}
          testid={cuadrilla.activa ? 'archivar-cuadrilla' : 'reactivar-cuadrilla'}
          tono={cuadrilla.activa ? 'peligro' : 'neutral'}
        >{cuadrilla.activa ? 'Archivar' : 'Reactivar'}</BotonAccion>
      </section>

      <p className="mt-5 text-[11px] leading-relaxed text-faint">
        Los integrantes son períodos con desde/hasta: nada se copia, así que nada puede quedar
        desactualizado.
      </p>
    </aside>
  )
}
