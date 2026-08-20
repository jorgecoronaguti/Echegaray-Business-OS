// MI LEGAJO — la ficha limpia de lo que la empresa tiene cargado sobre mí.
//
// ═══ SÓLO LECTURA, Y SE DICE ═══
//
// El legajo lo administra Administración. Una pantalla que dejara al empleado corregir su categoría
// o su fecha de alta convertiría el legajo en una declaración jurada del interesado; lo que sí
// resuelve es que el interesado VEA lo que dice su legajo y pueda avisar si está mal.
//
// ═══ LA OBRA ACTUAL NO ES UNA COLUMNA ═══
//
// Se DERIVA de la asignación vigente (`mi_asignacion.vigente`, resuelto en la base). Guardarla como
// campo sería la segunda verdad que el módulo de cuadrillas ya decidió no tener: el día que alguien
// se mueve de obra, la columna y las asignaciones dirían cosas distintas sin que nada avise.
//
// SIN DNI, SIN CUIL, SIN SUELDO. La vista `mi_legajo` no los publica —ninguna pantalla los muestra y
// una columna que viaja sin dibujarse es una fuga sin beneficio—.

import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getAsignacionesPropias, getLegajoPropio, getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { MiCuentaShell, Dato } from '@/features/mi-cuenta/components/MiCuentaShell'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado, Nulo, Num, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import { fecha } from '@/features/obras/components/formato'

export const dynamic = 'force-dynamic'

export default async function MiLegajoPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) return <MiCuentaShell titulo="Mi legajo"><Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso></MiCuentaShell>

  const perfil = await getPerfilPropio(supabase, user.id)
  if (!perfil.data?.persona_id) {
    return (
      <MiCuentaShell titulo="Mi legajo">
        <SinVinculo que="tu legajo" disponible={perfil.data?.vinculoDisponible ?? true} />
      </MiCuentaShell>
    )
  }

  const [legajo, asignaciones] = await Promise.all([
    getLegajoPropio(supabase),
    getAsignacionesPropias(supabase),
  ])

  const filas = asignaciones.data ?? []
  const vigente = filas.find((a) => a.vigente) ?? null
  const l = legajo.data

  return (
    <MiCuentaShell
      titulo="Mi legajo"
      descripcion="Lo que Administración tiene cargado sobre vos. Es de lectura: si algo no coincide, se corrige en Administración."
      campos={[
        { rotulo: 'Categoría', valor: l?.categoria ?? null, falta: 'sin categoría cargada' },
        { rotulo: 'Cuadrilla', valor: vigente?.cuadrilla ?? null, falta: 'sin cuadrilla' },
        { rotulo: 'Obra actual', valor: vigente?.obra ?? null, falta: 'sin obra asignada' },
        { rotulo: 'Alta', valor: l?.fecha_ingreso ? fecha(l.fecha_ingreso) : null, falta: 'sin fecha de alta', num: true },
      ]}
    >
      {legajo.error && <Aviso tono="warn" titulo="No pude leer tu legajo">{legajo.error}</Aviso>}

      {l && (
        <section className="max-w-[560px]" data-testid="ficha-legajo">
          <h2 className="mb-2 text-[11px] font-medium tracking-[0.04em] text-faint">Ficha</h2>
          <div className="border-t border-line">
            <Dato rotulo="Nombre">{l.nombre_completo}</Dato>
            <Dato rotulo="Número de legajo">{l.legajo ? <Num>{l.legajo}</Num> : <Nulo>sin número asignado</Nulo>}</Dato>
            <Dato rotulo="Categoría">{l.categoria ?? <Nulo>sin categoría cargada</Nulo>}</Dato>
            <Dato rotulo="Especialidad">{l.especialidad ?? <Nulo>sin especialidad cargada</Nulo>}</Dato>
            <Dato rotulo="Puesto">{l.puesto ?? <Nulo>sin puesto cargado</Nulo>}</Dato>
            <Dato rotulo="Convenio">{l.convenio_colectivo ?? <Nulo>sin convenio declarado</Nulo>}</Dato>
            <Dato rotulo="Alta">{l.fecha_ingreso ? <Num>{fecha(l.fecha_ingreso)}</Num> : <Nulo>sin fecha de alta</Nulo>}</Dato>
            {/* LA BAJA SÓLO SE DIBUJA SI EXISTE. Un renglón «Egreso: sin fecha» en el legajo de
                alguien que trabaja hoy es una pregunta que nadie hizo. */}
            {!l.en_la_empresa && (
              <Dato rotulo="Egreso">
                {l.fecha_egreso ? <Num>{fecha(l.fecha_egreso)}</Num> : <Nulo>sin fecha registrada</Nulo>}
              </Dato>
            )}
            <Dato rotulo="Situación">
              <Estado tono={l.en_la_empresa ? 'pos' : 'nulo'}>{l.en_la_empresa ? 'En la empresa' : 'Fuera de la empresa'}</Estado>
            </Dato>
          </div>
        </section>
      )}

      <section className="mt-9">
        <h2 className="mb-3 flex items-baseline gap-2 text-[13px] font-semibold text-ink">
          Asignaciones
          <span className="font-mono text-[11.5px] font-normal tabular-nums text-faint">{filas.length}</span>
        </h2>
        {asignaciones.error && <Aviso tono="warn">{asignaciones.error}</Aviso>}
        {!asignaciones.error && filas.length === 0 ? (
          <Vacio>Todavía no tenés ninguna asignación a una obra. Se asignan desde la solapa Personal de la obra.</Vacio>
        ) : (
          <Tabla testid="tabla-asignaciones" minWidth={620}>
            <THead>
              <Th>Obra</Th>
              <Th className="w-[130px]">Rol</Th>
              <Th className="w-[130px]">Cuadrilla</Th>
              <Th num className="w-[100px]">Desde</Th>
              <Th num className="w-[100px]">Hasta</Th>
              <Th className="w-[110px]">Estado</Th>
            </THead>
            <tbody>
              {filas.map((a) => (
                <Tr key={a.id}>
                  <Td fuerte>{a.obra ?? <Nulo>obra sin nombre</Nulo>}</Td>
                  <Td>{a.rol === 'responsable' ? 'Responsable' : 'Integrante'}</Td>
                  <Td>{a.cuadrilla ?? <Nulo>sin cuadrilla</Nulo>}</Td>
                  <Td num>{a.desde ? fecha(a.desde) : <Nulo>sin fecha</Nulo>}</Td>
                  {/* SIN «HASTA» NO SE ESCRIBE «HOY»: una asignación abierta no tiene fin, y poner
                      la fecha de hoy la cerraría con un dato que nadie cargó. */}
                  <Td num>{a.hasta ? fecha(a.hasta) : <Nulo>abierta</Nulo>}</Td>
                  <Td>
                    {a.vigente
                      ? <Estado tono="curso">Vigente</Estado>
                      : <span className="text-[12.5px] text-faint">terminada</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          La obra actual sale de la asignación vigente: no hay un campo «obra actual» que pueda quedar
          desactualizado. Si falta una asignación, la carga el jefe de obra desde la obra.
        </p>
      </section>
    </MiCuentaShell>
  )
}
