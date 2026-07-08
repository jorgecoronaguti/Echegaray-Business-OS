---
name: continuidad-operacional-datos
description: Descubrimiento exhaustivo de la carpeta administracion de Drive (universo documental real de Echegaray) + registro vivo fuentes_datos con frescura/cobertura, conectado al Motor de Decisiones. Dependencia transversal resuelta antes de OLA 3.
metadata:
  type: project
---

Fecha: 2026-07-08. Ejecutado antes de OLA 3 por pedido explícito del usuario ("dependencia transversal crítica").

## Qué se descubrió (recorrido real, no lista cerrada)

Carpeta raíz `administracion` (Drive, id `1a_3sIbioAQm0EcuJTbu3L6q_hy_LHUXs`) es efectivamente el universo documental inicial tal como dijo Jorge -- sin parent visible, es la raíz compartida. 31 items directos recorridos + subcarpetas clave abiertas (VEHICULOS, FONDO DE CESE, TELEGRAMAS, IVA 2026, COMPROBANTES DE TRANSFERENCIAS, Estrategia).

**Hallazgos nuevos más importantes** (no estaban en [[arquitectura-cobertura-integral]] ni en discovery-drive-echegaray):

- **IVA 2026**: Libro IVA Ventas mensual real, PDF por mes (nov-2025 a may-2026). Confirmado con contenido real: mayo 2026 factura a IMOTOR SRL (cliente de Pisos) por $20.000.000 neto gravado, IVA débito $4.200.000. Primer dato real para Fiscal (1→2).
- **VEHICULOS**: padrón real de 6 vehículos (RTO/cédula/título vigentes) -- primer dato real para Equipos y Vehículos (0→2). Sembrado en tabla `equipos`.
- **TELEGRAMAS**: cartas documento de desvinculación laboral reales (validadas RENAPER), Art. 245 LCT. Confirmado leyendo 1 caso real. Dato sensible -- catalogado como fuente, **no** estructurado en una tabla (decisión deliberada, requiere diseño explícito de acceso antes de tabular datos de desvinculación).
- **FONDO DE CESE**: confirma la procedencia real de la obligación "Fondo de Cese Laboral / UOCRA / IERIC" ya cargada en `obligaciones` desde antes.
- **COMPROBANTES DE TRANSFERENCIAS**: comprobantes de pago de sueldos -- solo 2 archivos, ambos de marzo/abril 2025. Sin actividad hace más de un año: gap verificable, no se asumió abandono ni vigencia.
- **Flujo de Caja - Cash Flow (Form)**: existe un Form homónimo al Sheet ya confirmado como fuente de verdad -- candidato a fuente abandonada, ya advertido por Jorge en PR0 que no es la fuente real.
- **Reporte Economico Echeg Const SAS.xlsm** y **carga-masiva.xlsx**: no se pudieron clasificar del todo (macro-enabled sin preview / posible duplicación con el proceso de echeqs de PR1-B) -- backlog, no inventado.

## Qué se construyó

- **`fuentes_datos`** (23 filas reales): catálogo vivo con proceso, área, responsable probable, frecuencia, vigencia, primaria/derivada, naturaleza del dato, cobertura temporal, destino en Supabase, capability dependiente, criticidad, mecanismo de integración, duplicaciones/conflictos conocidos, y estado de frescura (6 estados pedidos). Página `/fuentes`.
- **`equipos`** (6 vehículos reales): primer dato estructurado del dominio Equipos y Vehículos.
- **Motor de Decisiones conectado a frescura**: `/motor-decisiones` ahora muestra una advertencia cuando alguna fuente crítica está atrasada/con error (2 casos reales: IVA 2026, TELEGRAMAS) -- una recomendación ya no se presenta como si toda su base fuera igualmente confiable.

## Decisiones de alcance (no sobreingeniería)

- **No se construyó scheduling real** (cron/webhook) para que las fuentes se actualicen solas -- mismo bloqueante ya identificado en Rutinas Proactivas (OLA 2): requiere decisión de infraestructura, no solo código.
- **No se tabularon los datos de TELEGRAMAS** (desvinculaciones) pese a ser un hallazgo real y valioso -- es información sensible de personas, amerita una decisión de diseño explícita (quién puede verlo, con qué RLS) antes de estructurarlo, no una carga automática de este pase.
- **No se leyó Reporte Economico Echeg Const SAS.xlsm** en profundidad (archivo macro sin preview soportado) -- mismo método que JORNALES/avance_obra (descarga+parseo local) queda como próximo paso si se prioriza.

## Efecto colateral real detectado

Se reasignó el rol de la cuenta de prueba compartida (`jorge.o.corona+direccion-test-...@gmail.com`) a `direccion` para que Jorge pudiera navegar el OS sin restricciones de escritura. Esto rompió un test de la suite (`auth-roles.spec.ts`, caso "jefe_obra no puede escribir movimiento de caja") porque esa cuenta ya no está en el rol que el test espera en ese punto de la secuencia. **No se revirtió** el rol para no interrumpir la sesión de Jorge -- registrado en backlog, no oculto.

## Scorecard actualizado en esta ola

Fiscal 1→2, Equipos y Vehículos 0→2, Datos 6→7 (fuentes_datos conectado al Motor de Decisiones). Personas/Laboral/Legal y Contractual: evidencia reforzada, nivel sin cambio (fuentes reales confirmadas pero sin tabla nueva estructurada).

## Próximo paso natural

OLA 3 puede arrancar directamente sobre 2 de sus dominios objetivo ya con evidencia real fresca: profundizar Fiscal (extraer montos de IVA a una tabla) y Equipos (vincular a costos). Sigue pendiente la única pregunta que no se puede inferir: si Pipeline Comercial es hoy el cuello de botella real (ya planteada en el backlog de OLA 2, sin respuesta de Jorge todavía).

## Continuidad real de fuentes (2026-07-08, tras marco definitivo de producto)

Jorge marcó explícitamente que esta ola fue "descubrimiento y arquitectura inicial", no continuidad terminada -- correcto: nada corría solo todavía. Primera pieza de continuidad *real* implementada:

- **`recalcular_frescura_fuentes()`** (función SQL) + **`pg_cron`** (job `recalcular_frescura_fuentes_diario`, 11:00 UTC diario): escala automáticamente `fuentes_datos.estado` de `actualizado` a `atrasado` cuando una fuente periódica (diaria/semanal/quincenal/mensual) supera su umbral esperado, sin que nadie tenga que correr SQL a mano. Deliberadamente unidireccional (solo escala urgencia, nunca la baja sola) para evitar un bug de flip-flop -- bajarla requiere evidencia real de una sincronización nueva. No toca fuentes en error/conflicto/cobertura_parcial (juicio humano ya aplicado) ni por_evento/esporadica (el tiempo no es señal de atraso ahí). Verificado con un caso simulado real (rollback, sin tocar datos reales) y con un test Playwright real (`recalculo-frescura-fuentes.spec.ts`) que llama al RPC vía `@supabase/supabase-js` directamente -- primer test del proyecto que habla con Supabase sin pasar por la UI, necesario porque no hay pantalla que dispare este RPC.
- **Corrección de scorecard**: "Datos" estaba en 7/10, sobreestimado (detectar automáticamente es N4, no N7 -- convertir en acción con seguimiento sería N6-7 y no existe todavía). Corregido a 4/10 con evidencia real.
- **Bug real encontrado por este mismo trabajo**: al correr la suite completa, `auth-roles.spec.ts` (con la cuenta de prueba ya reasignada a `direccion`) insertó dos veces un movimiento de caja real ("Prueba E2E denegada") en `movimientos_caja` porque el test que esperaba que RLS lo denegara ya no puede fallar con ese rol. Limpiado (2 filas borradas) y el test deshabilitado con la razón documentada -- sigue abierto en `backlog_autonomo` crear una cuenta de prueba dedicada con rol `jefe_obra` real.
- **Backlog reabierto**: "Rutinas proactivas diarias/semanales" estaba marcado `resuelto` por tener `/rutinas` on-demand -- Jorge aclaró que on-demand no es autonomía real. Reabierto. La razón de fondo por la que las rutinas de *negocio* (caja, HH, margen) no pueden replicar este mismo mecanismo todavía: esa lógica vive en TypeScript (no en SQL) para no duplicar reglas de negocio en dos lugares; `pg_net` podría invocarla vía HTTP, pero mientras el OS corre solo en `localhost`, Supabase (cloud) no tiene forma de alcanzar la máquina de Jorge. Queda como ítem de backlog explícito: esperar hosting real (preferido, cero duplicación) vs. duplicar lógica a SQL ahora (no recomendado).
- **Nueva skill**: `web-ux-deploy-operacion-producto` (Bloque 12-B del marco definitivo) -- UX por rol, confianza/frescura visible en pantalla, estrategia de deploy sin ejecutar sin autorización. Incorporada a la matriz de activación multidisciplinaria del `CLAUDE.md` raíz.
