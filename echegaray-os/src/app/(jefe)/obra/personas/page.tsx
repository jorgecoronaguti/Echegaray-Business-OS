import { Aviso } from '@/shared/components/ds'
import { PieDeAccion } from '@/features/jefe/components/ShellJefe'
import { AccionPrimaria, Encabezado, Fila, Metricas, Nada, Panel, Rotulo } from '@/features/jefe/components/Piezas'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getHHDelDia } from '@/features/jefe/services/jefeService'
import { iniciales, motivoSinMarca, porCuadrilla, resumenDelDia } from '@/features/jefe/services/personas'
import { getEsperados, getPresencia } from '@/features/administracion/services/presenciaService'
import { agrupar, lecturaDePunto, mapa } from '@/features/administracion/services/presencia'
import { PuntoActivo, RelojDeJornada } from '@/features/administracion/components/RelojDeJornada'

// J05 · QUIÉN ESTÁ HOY — el personal de esta obra, con el reloj corriendo.
//
// ═══ LO QUE ESTA PANTALLA NO HACE ═══
//
// No acusa a nadie. `design/screens/personal-en-obra.md`: *«Fuera de radio no es una acusación: es
// un aviso con dos salidas.»* Y «sin registrar» no es «ausente»: un operario sin teléfono, uno que
// no le dio permiso al GPS y uno que faltó se ven exactamente igual desde acá. La falta la declara
// una persona, en Administración, donde eso sí es una novedad de liquidación.
//
// ═══ FUERA DE RADIO NO SE PUEDE CALCULAR TODAVÍA ═══
//
// El diseño pide tres resultados —`dentro`, `fuera`, `sin ubicación`— y las dos salidas del caso
// «fuera»: `Ver ubicación` y `Aceptar la marca`. Hoy sólo se pueden dibujar dos de los tres: la
// marca guarda lat/lon/precisión, pero **la obra no tiene obrador ni radio** y **la marca no tiene
// dónde asentar que el jefe la aceptó**. Sin el centro no hay distancia, y una pastilla «fuera de
// radio» calculada contra un centro inventado sería una acusación fabricada — exactamente lo que el
// diseño prohíbe. Se publica lo que sí es un hecho: si hay punto y con qué precisión, con el enlace
// al mapa. El hueco está declarado, no tapado.
//
// LA HORA CANÓNICA ES DEL SERVIDOR. El reloj corre en el cliente desde la marca de entrada, pero el
// cliente no decide cuánto trabajó nadie: sólo dibuja la diferencia contra un instante que ya está
// escrito en la base.

export const dynamic = 'force-dynamic'

export default async function JefePersonasPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>
}) {
  const { obra: pedida } = await searchParams
  const { supabase, obra, error } = await contextoDeObra(pedida)
  if (!obra) return <SinObra error={error} />

  const hoy = hoyEnObra()
  const [presencia, esperados, hh] = await Promise.all([
    getPresencia(supabase, hoy, obra.id),
    getEsperados(supabase, obra.id),
    getHHDelDia(supabase, obra.id, hoy),
  ])

  const grupos = agrupar(presencia.data ?? [], esperados.data ?? [])
  const r = resumenDelDia(grupos, esperados.data ?? [])
  const cuadrillas = porCuadrilla(grupos.enObra, esperados.data ?? [])
  const hhDelDia = (hh.data ?? []).reduce((s, x) => s + x.horas, 0)
  const primerError = error ?? presencia.error ?? esperados.error ?? hh.error ?? null

  return (
    <>
      <Encabezado
        titulo="Quién está hoy"
        sub={
          <span className="inline-flex items-center gap-2">
            {obra.nombre}
            <span className="inline-flex items-center gap-1.5 text-faint">
              <PuntoActivo /> en vivo
            </span>
          </span>
        }
      />

      <div className="flex flex-col gap-3 px-4 pb-6">
        {primerError && (
          <Aviso tono="neg" titulo="No se pudo leer la presencia." testid="jefe-personas-error">
            {primerError}
          </Aviso>
        )}

        <Metricas
          testid="jefe-personas-metricas"
          metricas={[
            { clave: 'En obra', valor: String(r.enObra), sub: r.asignados === 0 ? 'sin plantel asignado' : `de ${r.asignados} asignados` },
            { clave: 'Sin registrar', valor: r.asignados === 0 ? '—' : String(r.sinRegistrar), sub: 'no hay marca suya', tono: r.sinRegistrar > 0 ? 'warn' : 'ink' },
            // HH ES HH Y NO AVANCE. Va con su rótulo y nunca como porcentaje de obra: son dos
            // hechos distintos y confundirlos es el error más caro del control de obra.
            { clave: 'HH del día', valor: hhDelDia === 0 ? '—' : formatearHH(hhDelDia), sub: 'imputadas a tareas' },
          ]}
        />

        {r.sinCerrar > 0 && (
          <Aviso tono="warn" titulo={`${r.sinCerrar} sin cerrar la jornada`} testid="sin-cerrar">
            Marcaron entrada y no marcaron salida. Casi siempre es una salida sin registrar, no
            alguien que sigue trabajando: el reloj queda corriendo hasta que se cierre.
          </Aviso>
        )}

        {cuadrillas.length === 0 ? (
          <Panel testid="jefe-personas-vacio">
            <Nada>
              Todavía no marcó nadie en esta obra hoy. La marca la hace cada persona desde su
              teléfono, en Asistencia; no hay una carga paralela desde acá.
            </Nada>
          </Panel>
        ) : (
          cuadrillas.map((c) => (
            <div key={c.clave}>
              <Rotulo extra={`${c.presentes.length} ${c.presentes.length === 1 ? 'persona' : 'personas'}`}>
                {c.nombre.toUpperCase()}
              </Rotulo>
              <Panel testid="cuadrilla">
                {c.presentes.map((p) => {
                  const punto = lecturaDePunto(p)
                  const enlace = mapa(p.lat, p.lon)
                  return (
                    <Fila
                      key={p.persona_id}
                      testid="persona-en-obra"
                      titulo={p.nombre_completo}
                      detalle={
                        enlace ? (
                          <a href={enlace} target="_blank" rel="noreferrer" className="underline" data-testid="ver-ubicacion">
                            Ver ubicación · {punto.texto}
                          </a>
                        ) : (
                          // NO es una falta: es un dato ausente (permiso de GPS denegado, o el
                          // teléfono no lo mandó).
                          punto.texto
                        )
                      }
                      tonoDetalle={punto.fiable ? 'muted' : 'warn'}
                      icono={
                        <span className="relative flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-accent text-[12.5px] font-semibold text-white">
                          {iniciales(p.nombre_completo)}
                          <span aria-hidden className="absolute -bottom-px -right-px h-[12px] w-[12px] rounded-full border-2 border-surface bg-pos" />
                        </span>
                      }
                      derecha={
                        <span className="shrink-0 text-right">
                          <RelojDeJornada entrada={p.entrada} />
                          <span className="block text-[11px] text-faint">{p.categoria ?? 'sin categoría'}</span>
                        </span>
                      }
                    />
                  )
                })}
              </Panel>
            </div>
          ))
        )}

        {grupos.sinRegistrar.length > 0 && (
          <div>
            <Rotulo tono="warn">SIN REGISTRAR</Rotulo>
            <Panel testid="sin-registrar" filo="warn">
              {grupos.sinRegistrar.map((e) => (
                <Fila
                  key={e.id}
                  testid="persona-sin-marca"
                  titulo={e.nombre_completo}
                  detalle={motivoSinMarca(e)}
                  tonoDetalle="warn"
                  icono={
                    <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[12.5px] font-semibold text-faint">
                      {iniciales(e.nombre_completo)}
                    </span>
                  }
                />
              ))}
              <p className="px-[18px] pb-3.5 pt-1 text-[11.5px] leading-relaxed text-faint">
                No hay marca suya hoy. No dice que faltaron: un teléfono sin batería, un permiso de
                GPS denegado y una falta se ven igual desde acá. La falta se declara en Personal.
              </p>
            </Panel>
          </div>
        )}
      </div>

      <PieDeAccion sobreBarra>
        {/* LA PRIMARIA DEL CONTRATO, DESHABILITADA Y CON EL MOTIVO ESCRITO.
            «Mover gente de frente» necesita un vínculo persona → frente que el modelo no tiene:
            `obra_asignacion` la asigna a la OBRA y `cuadrilla` no cuelga de ninguna actividad. Se
            deja a la vista, apagada, en vez de sacarla: un hueco declarado se resuelve; uno que se
            borró de la pantalla se olvida. */}
        <AccionPrimaria disabled testid="mover-gente">Mover gente de frente</AccionPrimaria>
        <p className="pt-2 text-center text-[11.5px] leading-relaxed text-faint">
          Mover gente entre frentes todavía no se puede: el modelo asigna personas a la obra, no al
          frente. Lo que sí se sabe hoy es quién imputó horas a cada frente.
        </p>
      </PieDeAccion>
    </>
  )
}

/** `78.5` → `78,5`. Las HH son un dato, y van en el separador del país. */
function formatearHH(h: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(h)
}
