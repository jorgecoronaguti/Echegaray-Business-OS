import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { inicialesDe } from '@/features/empleado/components/shell-logica'
import { SelectorObra } from '@/features/jefe/components/SelectorObra'
import { RelojDeObra } from '@/features/jefe/components/RelojDeObra'
import { SinObra } from '@/features/jefe/components/SinObra'
import { C, R, pct } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import {
  AvisoError, Azulejo, BarraAvance, RotuloSeccion, TopBarMarca, Vacio, mono,
} from '@/shared/components/movil/Piezas'
import { ZONA_OBRA, contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol, getHHDelDia, getImpedimentos } from '@/features/jefe/services/jefeService'
import {
  frentesAbiertos, frentesDelDia, problemasDelDia, resumenDeFrentes,
} from '@/features/jefe/services/dia'
import { aspectoDeFrente, dotacionDeFrente, parteDeFrente } from '@/features/jefe/services/aspecto'
import { conObra } from '@/features/jefe/services/navegacion'
import { getEsperados, getPresencia } from '@/features/administracion/services/presenciaService'
import { agrupar } from '@/features/administracion/services/presencia'

// J01 · JEFE HOY — porte literal de `J01 · Jefe Hoy.dc.html`.
//
// El orden, los tamaños y los colores son los del mockup: topbar de marca, «Hoy» en 22/600 con la
// fecha y la hora en monoespaciada, tres azulejos de cifra, «Resolver ahora» sobre fondo `#FEF6F5`,
// las tarjetas de frente con su pastilla de estado y su barra de 7px, y los tres accesos de 88px.
//
// ═══ LO QUE NO SE INVENTA ═══
//
// El mockup pone «13 de 18» en EN OBRA y «6 de 8» en cada frente. El primero SÍ existe (marcas de
// hoy sobre plantel asignado); el segundo no —no hay tope por frente en el modelo— y el porqué del
// reemplazo está escrito en `aspecto.ts`, no acá.
//
// El panel «Resolver ahora» no se dibuja cuando no hay nada que resolver. Un bloque que siempre
// dice algo deja de decir, y en 390px cada bloque que sobra empuja al siguiente fuera de pantalla.

export const dynamic = 'force-dynamic'

export default async function JefeHoyPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>
}) {
  const { obra: pedida } = await searchParams
  const { supabase, obras, obra, error } = await contextoDeObra(pedida)
  const auth = await createClient()
  const user = await getUsuarioActual(auth)
  const perfil = user ? await getPerfilActual(auth, user.id) : null
  const iniciales = inicialesDe(perfil?.data?.nombre, user?.email)

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
      <TopBarMarca
        iniciales={iniciales}
        contexto={<SelectorObra obras={obras} actual={obra} />}
      />

      <div style={{ padding: '16px 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: C.ink }}>Hoy</div>
          <span style={{ ...mono, fontSize: 13, color: C.muted }}>
            {fechaCorta(hoy)}
            <RelojDeObra />
          </span>
        </div>

        {primerError && <div style={{ marginTop: 14 }}><AvisoError testid="jefe-hoy-error">{primerError}</AvisoError></div>}

        {/* LOS TRES DEL DÍA, no los de la obra. El avance y el fin de plan viven en J03, que es la
            pantalla que los compara contra el plan. */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }} data-testid="jefe-hoy-metricas">
          <Azulejo
            icono="cuadrilla"
            rotulo="EN OBRA"
            // NUNCA «0 de 14» cuando nadie marcó: sin plantel asignado el número no existe.
            valor={asignados === 0 ? '—' : String(enObra)}
            detalle={asignados === 0 ? 'sin plantel' : `de ${asignados}`}
          />
          <Azulejo
            icono="avance"
            rotulo="PARTES"
            valor={resumen.abiertos === 0 ? '—' : `${resumen.conParte}/${resumen.abiertos}`}
            colorValor={resumen.abiertos > 0 && resumen.conParte < resumen.abiertos ? C.warn : C.ink}
            detalle={resumen.abiertos === 0 ? 'sin frentes' : 'frentes cargados'}
          />
          <Azulejo
            icono="bloqueo"
            rotulo="PARADOS"
            valor={String(resumen.parados)}
            colorValor={resumen.parados > 0 ? C.neg : C.ink}
            colorIcono={resumen.parados > 0 ? C.neg : C.muted}
            borde={resumen.parados > 0 ? C.negBorde : C.linea}
            detalle={resumen.parados === 1 ? 'frente detenido' : 'frentes detenidos'}
          />
        </div>

        {problemas.length > 0 && (
          <div
            data-testid="jefe-hoy-problemas"
            style={{
              marginTop: 16, background: C.negFondo, border: `1px solid ${C.negBorde}`,
              borderRadius: R.tarjeta, overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px',
              borderBottom: `1px solid ${C.negDivisor}`,
            }}>
              <span style={{ display: 'flex', color: C.neg }}><Icono nombre="bloqueo" tamano={18} /></span>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Resolver ahora</div>
              <span style={{ ...mono, marginLeft: 'auto', fontSize: 12.5, color: C.neg }}>{problemas.length}</span>
            </div>
            {problemas.map((p) => (
              <Link
                key={p.clave}
                data-testid="problema"
                href={p.actividadId
                  ? conObra('/obra/avance', obra.id, { actividad: p.actividadId })
                  : conObra('/obra/personas', obra.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
                  borderBottom: `1px solid ${C.negDivisor}`, minHeight: 56, color: C.ink,
                }}
              >
                <span style={{ display: 'flex', color: p.tono === 'neg' ? C.neg : C.warn, flexShrink: 0 }}>
                  <Icono nombre={p.tono === 'neg' ? 'bloqueo' : 'alerta'} tamano={20} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.titulo}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.detalle}
                  </div>
                </div>
                <span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}>
                  <Icono nombre="siguiente" tamano={18} />
                </span>
              </Link>
            ))}
          </div>
        )}

        <RotuloSeccion
          icono="obra"
          extra={frentes.length > 0 ? `${frentes.length} ${frentes.length === 1 ? 'frente' : 'frentes'}` : undefined}
        >
          Frentes de hoy
        </RotuloSeccion>

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="jefe-hoy-frentes">
          {frentes.length === 0 ? (
            <Vacio testid="sin-frentes">
              Ningún frente con trabajo abierto. Se arman desde la planificación de la obra.
            </Vacio>
          ) : frentes.map((f) => {
            const a = aspectoDeFrente(f)
            const dot = dotacionDeFrente(f)
            const parte = parteDeFrente(f)
            return (
              <Link
                key={f.frente.id}
                data-testid="frente"
                href={conObra('/obra/frente', obra.id, { frente: f.frente.id })}
                style={{
                  background: C.surface, border: `1px solid ${a.bordeTarjeta}`, borderRadius: R.tarjeta,
                  padding: 14, display: 'block', color: C.ink,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>
                      {f.frente.nombre}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: dot.color }}>
                        <Icono nombre="cuadrilla" tamano={13} />
                        {dot.texto}
                      </span>
                      <span style={{ color: C.lineaFuerte }}>·</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: parte.color }}>
                        <Icono nombre={parte.icono} tamano={13} />
                        {parte.texto}
                      </span>
                    </div>
                  </div>
                  <span
                    data-testid="estado-frente"
                    style={{
                      fontSize: 11, fontWeight: 500, color: a.paleta.texto, background: a.paleta.fondo,
                      border: `1px solid ${a.paleta.borde}`, borderRadius: 11, padding: '2px 9px',
                      flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    {a.palabra}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <BarraAvance pct={f.pct} color={a.barra} />
                  </div>
                  <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: C.ink }}>{pct(f.pct)}</span>
                </div>
              </Link>
            )
          })}
        </div>

        {/* LOS TRES ACCESOS DEL MOCKUP, con la geometría medida y la verdad puesta al lado.
            «Avance masivo» existe y escribe. «Pedir material» y «Subir foto» NO tienen dónde
            escribir en este OS —los pedidos viven en la app de AppSheet y las fotos cuelgan de un
            avance como enlace de Drive, no como carga— así que van apagados y con el motivo escrito
            debajo. Un acceso que no lleva a ningún lado enseña que la pantalla miente. */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }} data-testid="accesos-jefe">
          <Acceso href={conObra('/obra/avance-masivo', obra.id)} icono="masivo" texto="Avance masivo" />
          <Acceso icono="pedido" texto="Pedir material" />
          <Acceso icono="foto" texto="Subir foto" />
        </div>
        <p style={{ marginTop: 8, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
          Pedir material y subir foto todavía no tienen dónde escribir: los pedidos se cargan en la
          app de materiales y la foto viaja como enlace al registrar un avance.
        </p>
      </div>
    </>
  )
}

/** Uno de los tres accesos de 88px. Sin `href` queda apagado: el motivo se escribe debajo del bloque. */
function Acceso({ href, icono, texto }: { href?: string; icono: 'masivo' | 'pedido' | 'foto'; texto: string }) {
  const estilo = {
    flex: 1, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta,
    padding: '14px 8px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    gap: 7, minHeight: 88, justifyContent: 'center', color: href ? C.ink : C.faint,
  }
  const cuerpo = (
    <>
      <span style={{ display: 'flex', color: href ? C.muted : C.tenue }}><Icono nombre={icono} tamano={24} /></span>
      <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'center' }}>{texto}</span>
    </>
  )
  return href
    ? <Link href={href} data-testid="acceso-jefe" style={estilo}>{cuerpo}</Link>
    : <span data-testid="acceso-apagado" aria-disabled style={{ ...estilo, cursor: 'not-allowed' }}>{cuerpo}</span>
}

/**
 * `2026-08-23` → `Sáb 23/08`, como lo escribe el encabezado de J01. La hora la pone `RelojDeObra`
 * en el cliente: impresa en el servidor queda congelada en el instante de la respuesta.
 */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const texto = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short', day: '2-digit', month: '2-digit', timeZone: ZONA_OBRA,
  }).format(new Date(Date.UTC(a, m - 1, d, 12)))
  const limpio = texto.replace(',', '')
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}
