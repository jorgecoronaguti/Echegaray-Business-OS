'use client'

// PANTALLA 18 · LAS TABLAS DE RECURSOS — una por sub-vista.
//
// De cliente por el mismo motivo que la 17: el buscador filtra mientras se escribe sobre filas que
// ya vinieron del servidor. La sub-vista y la consulta viven en la URL.
//
// ═══ LAS COLUMNAS ECONÓMICAS NO SE ESCONDEN: NO SE RENDERIZAN ═══
//
// `economia === false` no pinta la columna con guiones — la saca del `grid`. Una columna de guiones
// sigue diciendo cuántos insumos hay con precio y cuál es la fila más cara por el ancho del hueco.

import { useState } from 'react'
import Link from 'next/link'
import { Tabla, THead, Th, Tr, Td, FilaTotal, Vacio, Estado, Nulo, Aviso, Filtros } from '@/shared/components/ds'
import type { CargaSocialFila, CategoriaManoObra, Plantilla, RecursoFila, VersionPrecio } from '../types'
import { filtrar, numero, pesosCierran, porcentaje, sumaDePesos } from '../services/reglas'
import { BuscadorVivo } from './BuscadorVivo'
import { FechaPrecio, N, Texto } from './celdas'

// ═══ INSUMOS Y EQUIPOS — LA MISMA TABLA ════════════════════════════════════════════════════════
//
// Eran dos componentes copiados con tres palabras cambiadas. Un insumo y un equipo son la misma fila
// de `recurso_costo` —código, nombre, familia, unidad, costo, procedencia, frescura— y mantener dos
// copias significaba que cualquier arreglo entraba en una sola: la de equipos no tenía la columna de
// desperdicio, y la de insumos no declaraba la deuda de la flota.
//
// Lo único distinto de verdad es la deuda declarada de equipos, que es de MODELO y no de formato.

type Clase = 'insumos' | 'equipos'

const CLASE: Record<Clase, { singular: string; plural: string; testid: string }> = {
  insumos: { singular: 'Insumo', plural: 'insumos', testid: 'insumo' },
  equipos: { singular: 'Equipo', plural: 'equipos', testid: 'equipo' },
}

// LOS DOS CORTES DE PRECIO SÓLO EXISTEN CON PERMISO ECONÓMICO, Y NO ES UNA CUESTIÓN DE PUDOR: sin
// permiso `costo_base` llega en null para TODOS los recursos, así que «sin precio» seleccionaría la
// base entera y «vencido», ninguno. Dos filtros que mienten es peor que ningún filtro.
const CORTES_PRECIO = {
  todo: { rotulo: 'Todo', cumple: () => true },
  sinPrecio: { rotulo: 'Sin precio', cumple: (r: RecursoFila) => r.costo_base == null },
  vencido: { rotulo: 'Precio vencido', cumple: (r: RecursoFila) => r.frescura === 'vieja' },
} as const
type CortePrecio = keyof typeof CORTES_PRECIO

export function TablaRecursos({
  filas, q, economia, clase, seleccionado, ruta, otros,
}: {
  filas: RecursoFila[]
  q: string
  economia: boolean
  clase: Clase
  seleccionado: string | null
  /** LO QUE CRUZA LA FRONTERA SON DATOS, NO FUNCIONES. Una función serializada del servidor al
   *  cliente rompe el árbol y deja la pantalla clavada en el esqueleto con un 200 en los registros:
   *  está documentado en `TareasTipo.tsx` y costó media hora encontrarlo. */
  ruta: string
  otros: Record<string, string | undefined>
}) {
  const [consulta, setConsulta] = useState(q)
  const [corte, setCorte] = useState<CortePrecio>('todo')
  const c = CLASE[clase]
  const visibles = filtrar(filas, consulta, (r) => [r.codigo, r.nombre, r.familia, r.unidad])
    .filter(economia ? CORTES_PRECIO[corte].cumple : () => true)

  const href = (recursoId: string | null) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...otros, q: consulta || undefined, r: recursoId ?? undefined })) {
      if (v) p.set(k, v)
    }
    const qs = p.toString()
    return qs ? `${ruta}?${qs}` : ruta
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <BuscadorVivo
          valor={consulta} onCambio={setConsulta} placeholder={`Buscar ${c.singular.toLowerCase()}, código o familia`}
          resultados={visibles.length} total={filas.length} testid={`buscador-${clase}`}
        />
        {economia && (
          <Filtros
            testid="filtros-precio"
            opciones={(Object.keys(CORTES_PRECIO) as CortePrecio[]).map((k) => ({
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {CORTES_PRECIO[k].rotulo}
                  <span className="font-mono text-[11px] tabular-nums text-faint">
                    {filas.filter(CORTES_PRECIO[k].cumple).length}
                  </span>
                </span>
              ),
              onClick: () => setCorte(k),
              activo: corte === k,
              testid: `corte-${k}`,
            }))}
          />
        )}
      </div>

      {visibles.length === 0 ? (
        <Vacio
          accion={
            consulta || corte !== 'todo' ? (
              <button
                type="button"
                onClick={() => { setConsulta(''); setCorte('todo') }}
                className="text-[13px] font-medium text-ink underline"
              >
                Ver todo
              </button>
            ) : undefined
          }
        >
          {corte !== 'todo' && !consulta
            ? `Ninguno de los ${c.plural} queda en «${CORTES_PRECIO[corte].rotulo}».`
            : vacio(consulta, filas.length, c.plural, 'Se cargan al importar la Planilla para Cotizar.')}
        </Vacio>
      ) : (
        <Tabla testid={`tabla-${clase}`} minWidth={economia ? 860 : 740}>
          <THead>
            <Th className="w-[76px]">Código</Th>
            <Th>{c.singular}</Th>
            <Th className="w-[132px]">Familia</Th>
            <Th className="w-[54px]">Un.</Th>
            {economia && <Th num className="w-[96px]">Costo</Th>}
            <Th num className="w-[64px]">Desp.</Th>
            <Th className="w-[150px]">Fuente</Th>
            <Th num className="w-[86px]">Actualiz.</Th>
          </THead>
          <tbody>
            {visibles.map((r) => (
              <Tr
                key={r.recurso_id}
                seleccionada={r.recurso_id === seleccionado}
                data-testid={`${c.testid}-${r.codigo}`}
              >
                <Td className="font-mono text-[11px] text-muted">{r.codigo}</Td>
                <Td fuerte>
                  <Link href={href(r.recurso_id)} scroll={false} className="block truncate hover:underline">
                    {r.nombre}
                  </Link>
                </Td>
                <Td className="text-[11.5px] text-muted"><Texto v={r.familia} falta="sin familia" /></Td>
                <Td className="text-[12px]">{r.unidad}</Td>
                {economia && <Td num><N v={r.costo_base} decimales={0} falta="sin cargar" /></Td>}
                <Td num>
                  {/* 0 % de desperdicio es un DATO (no lleva desperdicio), no una ausencia. */}
                  <span className="font-mono text-[11.5px] tabular-nums text-muted">{porcentaje(r.desperdicio, 0)}</span>
                </Td>
                {/* LA FUENTE SE RECORTA. La ingestión escribe la procedencia entera («Planilla para
                    Cotizar (2).xlsm · Recursos!17 · ingesta 2026-08-21») y sin recorte cada fila
                    mide cuatro líneas: la tabla deja de poder barrerse de un vistazo, que es lo
                    único para lo que existe. El valor completo queda en el `title`. */}
                <Td className="text-[11.5px]">
                  <span className="block max-w-[150px] truncate" title={r.fuente ?? r.proveedor ?? undefined}>
                    <Texto v={r.fuente ?? r.proveedor} falta="sin cargar" />
                  </span>
                </Td>
                <Td num><FechaPrecio iso={r.fecha_precio} frescura={r.frescura} /></Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {clase === 'equipos' && (
        <div className="mt-4">
          {/* LA DEUDA ES DE MODELO Y SE DECLARA. La base maestra guarda el equipo y su costo horario;
              de quién es cada unidad, dónde está y en qué estado se encuentra vive en la flota, otra
              tabla sin costo ni ubicación. Hasta que se unan, esas columnas no se muestran vacías. */}
          <Aviso tono="info" titulo="De la flota todavía no se sabe acá">
            Tipo, rendimiento, ubicación y estado viven en la flota, no en la base maestra. No se
            dibujan cuatro columnas vacías para que parezca que están.
          </Aviso>
        </div>
      )}
      <Pie todas={filas} visibles={visibles.length} economia={economia} />
    </>
  )
}

// ═══ MANO DE OBRA ══════════════════════════════════════════════════════════════════════════════

export function TablaManoDeObra({
  categorias, cargas, cargasTotal, jornada, q, economia,
}: {
  categorias: CategoriaManoObra[]
  cargas: CargaSocialFila[]
  cargasTotal: number | null
  jornada: number
  q: string
  economia: boolean
}) {
  const [consulta, setConsulta] = useState(q)
  const visibles = filtrar(categorias, consulta, (c) => [c.nombre, c.nombre_convenio, c.clave])
  return (
    <>
      <Barra
        valor={consulta} onCambio={setConsulta} placeholder="Buscar categoría"
        resultados={visibles.length} total={categorias.length} testid="buscador-mo"
      />
      {visibles.length === 0 ? (
        <Vacio>{vacio(consulta, categorias.length, 'categorías', 'La escala del convenio no tiene filas vigentes.')}</Vacio>
      ) : (
        <Tabla testid="tabla-mano-obra" minWidth={economia ? 780 : 460}>
          <THead>
            <Th>Categoría</Th>
            {economia && <Th num className="w-[96px]">Jornal</Th>}
            {economia && <Th num className="w-[104px]">Valor hora</Th>}
            {economia && <Th num className="w-[92px]">Cargas</Th>}
            {economia && <Th num className="w-[128px]">Costo empresa/h</Th>}
            <Th num className="w-[92px]">Cap. pond.</Th>
            <Th num className="w-[84px]">Personas</Th>
          </THead>
          <tbody>
            {visibles.map((c) => (
              <Tr key={c.clave} data-testid={`categoria-${c.clave}`}>
                <Td fuerte className="font-medium">
                  {c.nombre}
                  {c.nombre_convenio && c.nombre_convenio !== c.nombre && (
                    <span className="mt-0.5 block text-[10px] text-faint">convenio: {c.nombre_convenio}</span>
                  )}
                </Td>
                {economia && (
                  <Td num>
                    {/* El sereno se paga por MES: no tiene jornal por día y no se le inventa uno. */}
                    {c.jornal == null && c.mensual != null
                      ? <span className="text-[11px] text-faint">$ {numero(c.mensual, 0)}/mes</span>
                      : <N v={c.jornal} decimales={0} falta="sin cargar" />}
                  </Td>
                )}
                {economia && <Td num><N v={c.valor_hora} decimales={0} falta="sin cargar" /></Td>}
                {economia && <Td num><span className="text-muted"><N v={c.cargas_hora} decimales={2} falta="sin cargar" /></span></Td>}
                {economia && (
                  <Td num>
                    <span className="font-mono text-[12.5px] font-semibold tabular-nums text-ink">
                      {c.costo_empresa_hora == null ? <Nulo>sin cargar</Nulo> : numero(c.costo_empresa_hora, 0)}
                    </span>
                  </Td>
                )}
                <Td num><N v={c.capacidad} decimales={1} falta="—" /></Td>
                <Td num>
                  <span className="font-mono text-[12px] tabular-nums text-ink-soft">{c.personas}</span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {/* PERSONAS NO SIGNIFICA LO MISMO PARA TODOS Y HAY QUE DECIRLO. `personas` está acotada por
          obra: Dirección cuenta 20 oficiales y un jefe de obra cuenta los 8 de la suya. Las dos
          cifras son ciertas y distintas, y un número que cambia según quién mira sin avisar es
          exactamente lo que hace que después nadie le crea a la pantalla. */}
      {visibles.length > 0 && (
        <p className="mt-3 text-[11px] text-faint" data-testid="nota-personas">
          PERSONAS cuenta el plantel que llega a esta pantalla: la base lo acota por obra, así que
          Dirección ve el total de la empresa y un jefe de obra, el de la suya.
        </p>
      )}

      {economia && (
        <section className="mt-8" data-testid="cargas-sociales">
          <h2 className="mb-1 text-[13px] font-semibold text-ink">Cargas sociales</h2>
          <p className="mb-3 text-[11.5px] text-faint">
            El costo empresa por hora es el valor hora más estas cargas. La jornada de{' '}
            <span className="font-mono tabular-nums">{jornada}</span> hs sólo afecta al jornal diario.
          </p>
          <Tabla testid="tabla-cargas" minWidth={420}>
            <THead>
              <Th>Concepto</Th>
              <Th num className="w-[108px]">% s/ MO</Th>
              <Th num className="w-[128px]">Vigente desde</Th>
            </THead>
            <tbody>
              {cargas.map((c) => (
                <Tr key={c.concepto} compacta data-testid={`carga-${c.concepto}`}>
                  <Td>{c.concepto}</Td>
                  <Td num>{porcentaje(c.porcentaje, 2)}</Td>
                  <Td num><FechaPrecio iso={c.vigencia_desde} frescura="ok" /></Td>
                </Tr>
              ))}
              <FilaTotal>
                <Td fuerte className="font-semibold">Total sobre mano de obra</Td>
                <Td num>
                  <span className="font-mono text-[12.5px] font-semibold tabular-nums">
                    {cargasTotal == null ? <Nulo>sin cargar</Nulo> : porcentaje(cargasTotal, 2)}
                  </span>
                </Td>
                <Td />
              </FilaTotal>
            </tbody>
          </Tabla>
          {cargas.some((c) => (c.fuente ?? '').includes('A VERIFICAR')) && (
            <div className="mt-3">
              <Aviso tono="warn" titulo="Estos porcentajes no están verificados">
                Salieron de la hoja «MO Lu-Vi 8 a 16» de la Planilla para Cotizar y su propia fuente dice
                A VERIFICAR contra normativa vigente. Antes de cotizar con ellos hay que confirmarlos.
              </Aviso>
            </div>
          )}
        </section>
      )}
    </>
  )
}

// ═══ PLANTILLAS DE SECUENCIA ═══════════════════════════════════════════════════════════════════

export function TablaPlantillas({ plantillas, q }: { plantillas: Plantilla[]; q: string }) {
  const [consulta, setConsulta] = useState(q)
  const visibles = filtrar(plantillas, consulta, (p) => [p.nombre, p.descripcion, ...p.pasos.map((x) => x.nombre)])
  return (
    <>
      <Barra
        valor={consulta} onCambio={setConsulta} placeholder="Buscar plantilla o paso"
        resultados={visibles.length} total={plantillas.length} testid="buscador-plantillas"
      />
      {visibles.length === 0 ? (
        <Vacio>{vacio(consulta, plantillas.length, 'plantillas', 'Las tres del contrato se siembran con la migración.')}</Vacio>
      ) : (
        <div className="space-y-7" data-testid="lista-plantillas">
          {visibles.map((p) => {
            const suma = sumaDePesos(p.pasos)
            const cierra = pesosCierran(p.pasos)
            return (
              <section key={p.id} data-testid={`plantilla-${p.id}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="text-[13.5px] font-semibold text-ink">{p.nombre}</h2>
                  <span className="text-[11.5px] text-faint">
                    {p.pasos.length} pasos · se repite por {p.se_repite_por?.join(' · ') ?? 'sin definir'}
                  </span>
                </div>
                {p.descripcion && <p className="mt-0.5 text-[12px] text-muted">{p.descripcion}</p>}
                <Tabla testid={`pasos-${p.id}`} minWidth={420} className="mt-2">
                  <THead>
                    <Th className="w-[44px]">#</Th>
                    <Th>Paso</Th>
                    <Th className="w-[150px]">Tiempo técnico</Th>
                    <Th num className="w-[72px]">Peso</Th>
                  </THead>
                  <tbody>
                    {p.pasos.map((paso) => (
                      <Tr key={paso.orden} compacta>
                        <Td className="font-mono text-[11px] text-faint">{paso.orden}</Td>
                        <Td fuerte>{paso.nombre}</Td>
                        <Td>
                          {paso.tiempo_tecnico ? (
                            <Estado tono="warn" clave="tiempo-tecnico">
                              no comprimible{paso.dias_tecnicos != null ? ` · ${numero(paso.dias_tecnicos, 0)} d` : ''}
                            </Estado>
                          ) : (
                            <Nulo>—</Nulo>
                          )}
                        </Td>
                        <Td num>{porcentaje(paso.peso / 100, 0)}</Td>
                      </Tr>
                    ))}
                    <FilaTotal>
                      <Td />
                      <Td fuerte className="font-semibold">Suma</Td>
                      <Td />
                      <Td num>
                        <span className={`font-mono text-[12.5px] font-semibold tabular-nums ${cierra ? 'text-pos' : 'text-neg'}`}>
                          {numero(suma, 0)} %
                        </span>
                      </Td>
                    </FilaTotal>
                  </tbody>
                </Tabla>
                {!cierra && (
                  <div className="mt-2">
                    <Aviso tono="neg" titulo="Los pesos no cierran en 100">
                      Marcar todos los pasos daría {numero(suma, 0)} % de avance, no 100 %.
                    </Aviso>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

// ═══ VERSIONES DE PRECIO ═══════════════════════════════════════════════════════════════════════

export function TablaVersiones({ filas, q }: { filas: VersionPrecio[]; q: string }) {
  const [consulta, setConsulta] = useState(q)
  const visibles = filtrar(filas, consulta, (v) => [v.fuente, v.proveedor, v.fecha])
  return (
    <>
      <Barra
        valor={consulta} onCambio={setConsulta} placeholder="Buscar versión o motivo"
        resultados={visibles.length} total={filas.length} testid="buscador-versiones"
      />
      {visibles.length === 0 ? (
        <Vacio>{vacio(consulta, filas.length, 'versiones de precio', 'Cada precio cargado con su fecha y su fuente arma una versión.')}</Vacio>
      ) : (
        <Tabla testid="tabla-versiones" minWidth={720}>
          <THead>
            <Th className="w-[100px]">Versión</Th>
            <Th>Motivo</Th>
            <Th num className="w-[92px]">Recursos</Th>
            <Th num className="w-[92px]">Vigentes</Th>
            <Th className="w-[120px]">Estado</Th>
          </THead>
          <tbody>
            {visibles.map((v) => (
              <Tr key={`${v.fecha}-${v.fuente}`} data-testid={`version-${v.fecha ?? 'sin-fecha'}`}>
                <Td><FechaPrecio iso={v.fecha} frescura={v.frescura} /></Td>
                <Td fuerte><Texto v={v.fuente ?? v.proveedor} falta="sin motivo declarado" /></Td>
                <Td num><span className="font-mono text-[12px] tabular-nums text-ink-soft">{v.n_recursos}</span></Td>
                <Td num><span className="font-mono text-[12px] tabular-nums text-ink-soft">{v.vigentes}</span></Td>
                <Td>
                  {v.vigentes > 0
                    ? <Estado tono="pos" clave="vigente">Vigente</Estado>
                    : <Estado tono="pendiente" clave="historica">Histórica</Estado>}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  )
}

// ═══ PIEZAS COMPARTIDAS ════════════════════════════════════════════════════════════════════════

function Barra(props: React.ComponentProps<typeof BuscadorVivo>) {
  return <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3"><BuscadorVivo {...props} /></div>
}

function vacio(consulta: string, total: number, que: string, comoSeCargan: string): string {
  if (consulta) return `Nada coincide con «${consulta}».`
  if (total === 0) return `La base maestra todavía no tiene ${que} cargados. ${comoSeCargan}`
  return `No hay ${que} que mostrar.`
}

/**
 * EL MARCADOR DE LA DEUDA DE PRECIO, y sólo para quien PUEDE ver precios: sin permiso todos los
 * costos llegan en null y las dos cifras dirían que la base entera está sin cargar.
 *
 * Se cuenta sobre el TOTAL, no sobre lo visible: es el estado de la base maestra, no el de la
 * búsqueda de este momento.
 */
function Pie({ todas, visibles, economia }: { todas: RecursoFila[]; visibles: number; economia: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1" data-testid="pie-recursos">
      {visibles !== todas.length && (
        <span className="mr-auto text-[11px] text-faint">
          <span className="font-mono tabular-nums">{visibles}</span> de{' '}
          <span className="font-mono tabular-nums">{todas.length}</span> en pantalla
        </span>
      )}
      <Cifra rotulo="Recursos" n={todas.length} />
      {economia && <Cifra rotulo="Sin precio" n={todas.filter((f) => f.costo_base == null).length} alerta />}
      {economia && <Cifra rotulo="Precio vencido" n={todas.filter((f) => f.frescura === 'vieja').length} alerta />}
    </div>
  )
}

function Cifra({ rotulo, n, alerta }: { rotulo: string; n: number; alerta?: boolean }) {
  return (
    <span className="text-[11px] text-faint">
      {rotulo}{' '}
      <span className={`font-mono text-[12px] tabular-nums ${n === 0 || !alerta ? 'text-ink' : 'text-warn'}`}>{n}</span>
    </span>
  )
}
