import { Aviso, BotonEnlace, Estado } from '@/shared/components/ds'
import type { TonoEstado } from '@/shared/components/ds'
import { PieDeAccion } from '@/features/jefe/components/ShellJefe'
import { SelectorObra } from '@/features/jefe/components/SelectorObra'
import { IconoAlerta } from '@/features/jefe/components/Iconos'
import { IconoBloqueo, IconoCompletar, IconoCuadrilla, IconoFecha, IconoObra } from '@/shared/components/iconos'
import {
  Barra, Encabezado, Fila, Metricas, Nada, Panel, Rotulo, porcentaje,
} from '@/features/jefe/components/Piezas'
import { SinObra } from '@/features/jefe/components/SinObra'
import { ZONA_OBRA, contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol, getHHDelDia, getImpedimentos } from '@/features/jefe/services/jefeService'
import {
  estadoDelFrente, frentesAbiertos, frentesDelDia, problemasDelDia, resumenDeFrentes,
} from '@/features/jefe/services/dia'
import type { FrenteDelDia } from '@/features/jefe/services/dia'
import { conObra } from '@/features/jefe/services/navegacion'
import { getEsperados, getPresencia } from '@/features/administracion/services/presenciaService'
import { agrupar } from '@/features/administracion/services/presencia'

// J01 · HOY — abro el teléfono parado en la obra y sé qué tengo que resolver antes del mediodía.
//
// ═══ EL ORDEN ES LA JERARQUÍA ═══
//
// Cómo va la obra → qué la frena → cómo va cada frente → a dónde ir. Lo que decide primero va
// primero, y lo que no se usa en obra no viaja: acá no hay contratado, ni costo, ni certificado, ni
// margen. No porque estén escondidos —`ve_economia()` se los niega a este rol en la base— sino
// porque parado frente a un encofrado ninguno de los cuatro cambia lo que hay que hacer hoy.
//
// ═══ EL PANEL QUE NO TIENE NADA QUE DECIR NO SE DIBUJA ═══
//
// «Resolver hoy» aparece cuando hay algo que resolver. Un bloque que siempre dice algo deja de
// decir, y en 390px cada bloque que sobra empuja al siguiente fuera de la pantalla.

export const dynamic = 'force-dynamic'

export default async function JefeHoyPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>
}) {
  const { obra: pedida } = await searchParams
  const { supabase, obras, obra, error } = await contextoDeObra(pedida)
  if (!obra) return <SinObra error={error} />

  const hoy = hoyEnObra()
  const [actividades, arbol, impedimentos, hh, presencia, esperados] = await Promise.all([
    getActividades(supabase, obra.id),
    getArbol(supabase, obra.id),
    getImpedimentos(supabase, obra.id),
    getHHDelDia(supabase, obra.id, hoy),
    getPresencia(supabase, hoy, obra.id),
    getEsperados(supabase, obra.id),
  ])

  const grupos = agrupar(presencia.data ?? [], esperados.data ?? [])
  const problemas = problemasDelDia({
    actividades: actividades.data ?? [],
    impedimentos: impedimentos.data ?? [],
    sinRegistrar: grupos.sinRegistrar.length,
    hoy,
  })
  const frentes = frentesAbiertos(frentesDelDia(arbol.data ?? [], actividades.data ?? [], hh.data ?? [], hoy))
  const resumen = resumenDeFrentes(frentes)
  const asignados = (esperados.data ?? []).length
  const enObra = grupos.enObra.length

  const primerError = error ?? actividades.error ?? arbol.error ?? impedimentos.error
    ?? presencia.error ?? esperados.error ?? hh.error ?? null

  return (
    <>
      {/* EL TÍTULO ES «HOY», NO LA OBRA. J01 dibuja la obra como contexto chico arriba —con su `▾`
          para cambiarla— y el título grande es el día: lo que cambia entre dos visitas es la fecha,
          no en qué obra está parado el jefe. La etapa y el avance de la obra se fueron con el mismo
          criterio: los compara J03, que es su pantalla. */}
      <Encabezado
        sobre={<SelectorObra obras={obras} actual={obra} compacto />}
        titulo="Hoy"
        sub={fechaLarga(hoy)}
      />

      <div className="flex flex-col gap-3 px-4 pb-6">
        {primerError && (
          <Aviso tono="neg" titulo="No se pudo leer todo lo de esta pantalla." testid="jefe-hoy-error">
            {primerError}
          </Aviso>
        )}

        {/* LAS TRES DE J01 SON LAS TRES DEL DÍA, no las de la obra. El avance de la obra y su fin de
            plan se mudaron a J03, que es la pantalla que los compara contra el plan: acá ocupaban
            dos tercios del encabezado para contestar una pregunta que nadie hace parado en el
            frente a las siete y media de la mañana. */}
        <Metricas
          testid="jefe-hoy-metricas"
          metricas={[
            {
              clave: 'En obra',
              // NUNCA «0 de 14» cuando nadie marcó: sin plantel asignado el número no existe.
              valor: asignados === 0 ? '—' : String(enObra),
              sub: asignados === 0 ? 'sin plantel asignado' : `de ${asignados} asignados`,
            },
            {
              clave: 'Partes',
              valor: resumen.abiertos === 0 ? '—' : `${resumen.conParte}/${resumen.abiertos}`,
              sub: resumen.abiertos === 0 ? 'sin frentes abiertos' : 'frentes con parte hoy',
              tono: resumen.abiertos > 0 && resumen.conParte < resumen.abiertos ? 'warn' : 'ink',
            },
            {
              clave: 'Parados',
              valor: String(resumen.parados),
              sub: resumen.parados === 1 ? 'frente detenido' : 'frentes detenidos',
              tono: resumen.parados > 0 ? 'neg' : 'ink',
            },
          ]}
        />

        {problemas.length > 0 && (
          // La regla interior de 3px marca la excepción: `neg` cuando algo FRENA trabajo (un
          // impedimento abierto), `warn` cuando falta un dato o una decisión. El tono lo decide el
          // problema más grave de la lista, no el primero que llegó.
          <Panel
            titulo="Resolver ahora"
            icono={<IconoBloqueo className="h-[17px] w-[17px]" />}
            contador={String(problemas.length)}
            testid="jefe-hoy-problemas"
            filo={problemas.some((p) => p.tono === 'neg') ? 'neg' : 'warn'}
          >
            {problemas.map((p) => (
              <Fila
                key={p.clave}
                testid="problema"
                href={p.actividadId
                  ? conObra('/obra/avance', obra.id, { actividad: p.actividadId })
                  : conObra('/obra/personas', obra.id)}
                titulo={p.titulo}
                detalle={p.detalle}
                tonoDetalle={p.tono}
                icono={
                  <span
                    className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] ${
                      p.tono === 'neg' ? 'bg-neg-soft text-neg' : 'bg-warn-soft text-warn'
                    }`}
                  >
                    <IconoAlerta className="h-[19px] w-[19px]" />
                  </span>
                }
              />
            ))}
          </Panel>
        )}

        <div>
          <Rotulo
            icono={<IconoObra className="h-[16px] w-[16px]" />}
            extra={frentes.length > 0
              ? `${frentes.length} ${frentes.length === 1 ? 'frente' : 'frentes'}`
              : undefined}
          >
            Frentes de hoy
          </Rotulo>
          <Panel testid="jefe-hoy-frentes">
            {frentes.length === 0 ? (
              <Nada testid="sin-frentes">
                Ningún frente con trabajo abierto. Se arman desde la planificación de la obra.
              </Nada>
            ) : (
              frentes.map((f) => (
                <a
                  key={f.frente.id}
                  data-testid="frente"
                  href={conObra('/obra/frente', obra.id, { frente: f.frente.id })}
                  className="block min-h-[60px] border-t border-surface-sunken px-[18px] py-3 first:border-t-0 active:bg-surface-quiet"
                >
                  {/* NOMBRE Y ESTADO EN EL PRIMER RENGLÓN, el porcentaje al lado de su barra en el
                      último: es la composición de la tarjeta de J01. El número pegado al nombre
                      competía con él por el mismo renglón y obligaba a leer dos datos para
                      encontrar uno; sobre la barra, el número es la etiqueta de lo que ya se ve. */}
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-medium text-ink">
                      {f.frente.nombre}
                    </span>
                    <Estado tono={tonoDeEstado(f)} clave={estadoDelFrente(f).palabra} testid="estado-frente">
                      {estadoDelFrente(f).palabra}
                    </Estado>
                  </div>
                  {/* DOTACIÓN Y PARTE, con su icono cada uno. Son las dos cosas que el jefe mira sin
                      abrir el frente: quién está trabajando ahí, y si ya está dicho hasta dónde se
                      llegó hoy. El parte que falta se enciende: es una tarea suya, no un dato gris. */}
                  <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
                    <span className="flex items-center gap-1.5 text-muted">
                      <IconoCuadrilla className="h-[13px] w-[13px] shrink-0" />
                      {detalleDelFrente(f)}
                    </span>
                    <span aria-hidden className="text-faint">·</span>
                    <span className={`flex items-center gap-1.5 ${f.parteHoy ? 'text-pos' : 'text-warn'}`}>
                      {f.parteHoy
                        ? <IconoCompletar className="h-[13px] w-[13px] shrink-0" />
                        : <IconoFecha className="h-[13px] w-[13px] shrink-0" />}
                      {f.parteHoy ? 'parte cargado' : 'sin parte hoy'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <Barra pct={f.pct} tono={f.atrasoDias ? 'warn' : 'ink'} />
                    </span>
                    <span className="shrink-0 font-mono text-[14.5px] font-semibold tabular-nums text-ink">
                      {porcentaje(f.pct)}
                    </span>
                  </div>
                </a>
              ))
            )}
          </Panel>
        </div>
      </div>

      <PieDeAccion sobreBarra>
        <BotonEnlace
          href={conObra('/obra/avance-masivo', obra.id)}
          variante="primaria"
          tamano="bloque"
          data-testid="cargar-avance-del-dia"
        >
          Cargar avance del día
        </BotonEnlace>
      </PieDeAccion>
    </>
  )
}

/** El estado del frente, traducido al vocabulario de puntos del sistema (`ds/Estado`). */
function tonoDeEstado(f: FrenteDelDia): TonoEstado {
  const t = estadoDelFrente(f).tono
  return t === 'neg' ? 'neg' : t === 'warn' ? 'warn' : t === 'ink' ? 'curso' : 'nulo'
}

function detalleDelFrente(f: FrenteDelDia): string {
  // LA AUSENCIA DE HORAS NO SE REPITE DOCE VECES. Cuando nadie imputó en ninguno —que es lo
  // normal a media mañana— el renglón se llenaba del mismo texto y dejaba de decir algo. Lo que
  // siempre se dice es cuánto trabajo queda abierto; las horas, sólo cuando las hay.
  const partes = [`${f.abiertas} ${f.abiertas === 1 ? 'tarea abierta' : 'tareas abiertas'}`]
  if (f.personasHoy > 0) {
    partes.unshift(`${f.personasHoy} ${f.personasHoy === 1 ? 'persona' : 'personas'} con horas hoy`)
  }
  if (f.atrasoDias) partes.push(`${f.atrasoDias} d de atraso`)
  if (f.medidas < f.total) partes.push(`${f.medidas} de ${f.total} medidas`)
  return partes.join(' · ')
}

/**
 * `2026-08-23` → `Sáb 23/08`. El encabezado de J01 escribe el día, no la hora: la pantalla se
 * renderiza por pedido, así que un reloj impreso en el servidor queda viejo apenas el jefe deja el
 * teléfono en el bolsillo — y un reloj que miente es peor que no tenerlo.
 */
function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const texto = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short', day: '2-digit', month: '2-digit', timeZone: ZONA_OBRA,
  }).format(new Date(Date.UTC(a, m - 1, d, 12)))
  const limpio = texto.replace(',', '')
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}
