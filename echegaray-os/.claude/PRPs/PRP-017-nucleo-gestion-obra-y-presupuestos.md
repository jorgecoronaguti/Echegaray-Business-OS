# PRP-017: Núcleo de gestión de obra + habilidad completa de armar presupuestos

> **Estado**: EN CONSTRUCCIÓN — 2026-07-14
> **Proyecto**: Echegaray Business OS — el CORE del negocio (constructora)
> **Subordinado a**: `CLAUDE.md` raíz (motor económico de la obra, cotización, HH, adicionales, control económico, aprendizaje). Skills: `costos-presupuestacion`, `direccion-obra`, `planificacion-produccion`, `derecho-laboral-construccion` (UOCRA), `ingenieria-civil-construccion`, `compras-abastecimiento-subcontratacion`.

---

## Objetivo

Que el OS domine el lazo económico de obra `presupuesto → costo real → avance → HH → adicionales → desvío → acción` sobre los datos REALES de Echegaray, **y sepa armar un presupuesto de cero en el método propio de la empresa** (no un genérico). No cuatro módulos sueltos: una columna vertebral por obra sobre la que se encienden las capacidades en orden que compone.

## Estado real verificado (auditoría Drive 2026-07-14 — NO reconstruir, REUSAR)

Existe método de presupuestación real y sofisticado en `.xlsm` plantilla (copiada por obra: "Presupuesto Nave Industrial V2", "PRESUPUESTO PISO - INTERNO"):
- **Mano de obra UOCRA** (pestaña "MO Lu-Vi 8 a 16" + "ManoObra"): CCT 76/75, jornal básico por categoría (Ayudante/Medio Oficial/Oficial/Of. Especializado), horas normales + extras 50%/100%, asistencia perfecta, adicional Art. 56 (hormigonado, 15% jornal), EPP, ropa, exámenes médicos, prorrateo mensual.
- **Cadena**: `ManoObra → Análisis (APU) → Rubros → Recursos → Presupuesto → OFERTA` (ofertas versionadas por cliente: OFERTA ARCOR, OFERTA SG). **GG** (Gastos Generales) y "DIAGRAMACION"/"Costo MO" propios.
- Avance: Google Sheet "Avances de Obra" + "Curva de Avance Físico.xlsx".
- Adicionales: "ADICIONALES.xlsm" + "POSIBLES ADICIONALES.xlsm" + carpeta ADICIONALES.
- Certificación: carpeta CERTIFICADOS + "CERTIFICADOS N°3 - YUMO.xlsx".
- **OBRAS PERDIDAS** (carpeta): insumo de aprendizaje (qué no cotizar / por qué se perdió).

### Gaps reales identificados
1. **Jornales UOCRA desactualizados** (CCT 76/75 jun-2024 vs hoy jul-2026) → requiere actualización verificada (internet/fuente oficial UOCRA/Cámara). Nunca afirmar una escala sin verificar (regla del `CLAUDE.md`).
2. **Precios de materiales** cargados a mano → fuente de internet + histórico de la empresa.
3. **Costo real por obra vive en PDF** ("COSTO OBRA.pdf"), no estructurado → sin esto no cierra presupuesto↔real; hay que estructurarlo.
4. **Datos fragmentados** (presupuesto en xlsm, avance en Sheet, adicionales en otro xlsm, costo en PDF): no hay clave por obra que los cruce → la columna vertebral es el trabajo central.

## Fases (orden que compone)

- **F0 — Columna vertebral por obra**: mapear la estructura exacta de las plantillas (Presupuesto, ManoObra/UOCRA, Análisis/APU, Rubros, Avance, Adicionales) y definir la **clave por obra** + un índice de obras. Entregable: modelo de datos por obra (qué existe, dónde, cómo se conecta, qué falta). Sin efecto de escritura.
- **F1 — Armar presupuestos (habilidad completa)**: el OS genera un presupuesto en el método Echegaray a partir del cómputo (partidas + cantidades): aplica APU/rendimientos, mano de obra UOCRA (con jornales **verificados y actualizados**), precios de material (internet + histórico), GG y margen → produce Presupuesto + Oferta. Como es plantilla copiada por obra y la SA no crea archivos nativos desde cero, el flujo es: el dueño duplica la plantilla y la comparte (o el OS trabaja sobre una copia compartida) → el OS **completa/edita** las pestañas (super-editor estructurado, no celda por celda) → queda en Pendientes para aprobar.
- **F2 — Control de desvíos**: presupuesto vs costo real + alerta temprana HH/materiales. Requiere estructurar el costo real (gap 3).
- **F3 — Adicionales**: detección→cotización→aprobación→facturación→**cobranza**, sobre ADICIONALES.xlsm + POSIBLES ADICIONALES. Métrica: % adicionales cobrados / ejecutados.
- **F4 — Avance físico vs económico**: sobre "Avances de Obra" + Curva; alimenta F2/F3.
- **F5 — Cotización que aprende**: cierra el lazo — el real acumulado (F2–F4) recalibra rendimientos y precios para el próximo presupuesto (F1). Interés compuesto.

Transversal: **búsqueda en internet** (precios material, jornales UOCRA, normativa San Juan) como tool acotada; **autonomía** (vigilancia apuntada a obras: detecta desvíos y adicionales sin gestionar y los trae sola, Nivel D); **skills** de costos/laboral/dirección se enriquecen con los patrones reales (vía PRP-016).

## Criterios de éxito
- [ ] F0: modelo por obra documentado y clave que cruza presupuesto/avance/adicionales/costo, con gaps explícitos.
- [ ] F1: dado un cómputo, el OS produce un presupuesto completo en el formato Echegaray (MO UOCRA verificada + APU + GG + margen + Oferta), editando una copia compartida, pendiente de aprobación.
- [ ] Jornales UOCRA y precios se declaran con fuente y fecha; nunca inventados.
- [ ] F2–F5 por fase, cada una verificada en vivo antes de la siguiente.
- [ ] Nada rompe la confiabilidad ni la velocidad del canal.

## Gotchas
- **Verificar antes de afirmar** jornales/normativa (cambian; regla del CLAUDE.md).
- **SA sin almacenamiento propio**: no crea el .xlsx nativo; edita copias compartidas. El dueño duplica la plantilla.
- **No fabricar estructura**: F0 manda; diseñar sobre lo real, no sobre un presupuesto "ideal".
- **Realidad única**: el objetivo es conectar, no crear un quinto lugar donde vive el dato de obra.
