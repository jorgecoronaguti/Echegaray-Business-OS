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
import { Tabla, THead, Th, Tr, Td, FilaTotal, Vacio, Estado, Nulo, Aviso } from '@/shared/components/ds'
import {
  CabezaCanon, FilaCanon, ListaCanon, PieCanon, RotuloCanon, VacioCanon,
} from '@/shared/components/canon/ListaCanon'
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

  // LOS ANCHOS DEL CANÓNICO. Nombre y familia son fraccionales —son lo que crece con la pantalla—;
  // el resto es fijo, para que la columna de costos siga alineada entre una vista y otra.
  const cols = economia
    ? '76px minmax(0,1.5fr) minmax(0,1fr) 48px 96px 64px 150px 86px'
    : '76px minmax(0,1.5fr) minmax(0,1fr) 48px 64px 150px 86px'

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
        {/* PASTILLAS CON CONTADOR — canónico 18. El corte NO va a la URL: se calcula sobre las
            filas que ya están en el navegador, y su resultado depende de lo que la base diga en este
            momento, así que un enlace compartido prometería una lista que mañana es otra. */}
        {economia && (
          <div data-testid="filtros-precio" className="flex flex-wrap items-center gap-2">
            {(Object.keys(CORTES_PRECIO) as CortePrecio[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setCorte(k)}
                data-testid={`corte-${k}`}
                aria-pressed={corte === k}
                className={`flex items-center gap-[5px] rounded-md border px-[9px] py-[4px] text-[12px] transition-colors ${
                  corte === k
                    ? 'border-accent bg-accent text-white'
                    : 'border-line bg-surface text-ink-soft hover:border-line-strong'
                }`}
              >
                {CORTES_PRECIO[k].rotulo}
                <span className={`font-mono text-[10.5px] tabular-nums ${corte === k ? 'text-[#B9B7B1]' : 'text-faint'}`}>
                  {filas.filter(CORTES_PRECIO[k].cumple).length}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ═══ LA CAJA DEL CANÓNICO 18 ═══
          `background:#FFFFFF;border:1px solid #E7E6E2;borderRadius:10px;overflow:hidden`, encabezado
          de 38px sobre `#FAFAF8`, filas de 44px con divisor `#F1F0EC` y el pie de marcador ADENTRO.

          LAS COLUMNAS NO SON LAS DEL MOCKUP, Y ES DELIBERADO. El canónico dibuja
          `TIPO · RECURSO · UN. · PRECIO · ACTUALIZADO · PROVEEDOR · USOS` sobre UNA lista con todos
          los tipos mezclados. Acá la sub-vista YA separó por tipo —insumos, mano de obra, equipos—,
          así que una columna TIPO diría lo mismo en las 268 filas; y USOS no lo cuenta ninguna
          fuente de este listado (la ficha del recurso sí, por recurso). Lo que sí está y el mockup
          no dibuja —CÓDIGO, FAMILIA, DESPERDICIO— es lo que identifica y lo que altera el costo.
          DESVÍO DECLARADO. */}
      <ListaCanon testid={`tabla-${clase}`}>
        <CabezaCanon cols={cols}>
          <RotuloCanon>CÓD.</RotuloCanon>
          <RotuloCanon>{c.singular.toUpperCase()}</RotuloCanon>
          <RotuloCanon>FAMILIA</RotuloCanon>
          <RotuloCanon>UN.</RotuloCanon>
          {economia && <RotuloCanon alinear="right">COSTO</RotuloCanon>}
          <RotuloCanon alinear="right">DESP.</RotuloCanon>
          <RotuloCanon>FUENTE</RotuloCanon>
          <RotuloCanon alinear="right">ACTUALIZ.</RotuloCanon>
        </CabezaCanon>

        {visibles.length === 0 && (
          <VacioCanon testid={`${clase}-vacio`}>
            {corte !== 'todo' && !consulta
              ? `Ninguno de los ${c.plural} queda en «${CORTES_PRECIO[corte].rotulo}».`
              : vacio(consulta, filas.length, c.plural, 'Se cargan al importar la Planilla para Cotizar.')}{' '}
            {(consulta || corte !== 'todo') && (
              <button
                type="button"
                onClick={() => { setConsulta(''); setCorte('todo') }}
                className="font-medium text-ink underline underline-offset-2"
              >
                Ver todo
              </button>
            )}
          </VacioCanon>
        )}

        {visibles.map((r) => (
          <FilaCanon
            key={r.recurso_id}
            cols={cols}
            alto={44}
            seleccionada={r.recurso_id === seleccionado}
            testid={`${c.testid}-${r.codigo}`}
          >
            <span className="truncate font-mono text-[11px] text-muted">{r.codigo}</span>
            <Link href={href(r.recurso_id)} scroll={false} className="min-w-0 truncate text-[12.5px] text-ink hover:underline">
              {r.nombre}
            </Link>
            <span className="min-w-0 truncate text-[11.5px] text-muted">
              <Texto v={r.familia} falta="sin familia" className="text-[11.5px]" />
            </span>
            <span className="truncate text-[11.5px] text-ink-soft">{r.unidad}</span>
            {economia && (
              <span className="text-right">
                <N v={r.costo_base} decimales={0} falta="sin cargar" />
              </span>
            )}
            {/* 0 % de desperdicio es un DATO (no lleva desperdicio), no una ausencia. */}
            <span className="text-right font-mono text-[11.5px] tabular-nums text-muted">
              {porcentaje(r.desperdicio, 0)}
            </span>
            {/* LA FUENTE SE RECORTA. La ingestión escribe la procedencia entera («Planilla para
                Cotizar (2).xlsm · Recursos!17 · ingesta 2026-08-21») y sin recorte cada fila mide
                cuatro líneas. El valor completo queda en el `title`. */}
            <span className="min-w-0 truncate text-[11.5px]" title={r.fuente ?? r.proveedor ?? undefined}>
              <Texto v={r.fuente ?? r.proveedor} falta="sin cargar" className="text-[11.5px]" />
            </span>
            <span className="text-right">
              <FechaPrecio iso={r.fecha_precio} frescura={r.frescura} />
            </span>
          </FilaCanon>
        ))}

        <PieCanon
          testid="pie-recursos"
          metricas={[
            { rotulo: 'RECURSOS', valor: String(filas.length) },
            ...(economia
              ? [
                  { rotulo: 'SIN PRECIO', valor: String(filas.filter((f) => f.costo_base == null).length), tono: 'warn' as const },
                  { rotulo: 'PRECIO VENCIDO', valor: String(filas.filter((f) => f.frescura === 'vieja').length), tono: 'warn' as const },
                ]
              : []),
          ]}
        />
      </ListaCanon>

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
