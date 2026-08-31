# XSAS — DEFINITION OF DONE

**FAIL** · cumplidos **12/24** · en rojo 2 · sin medir 10

| | criterio | | evidencia |
|---|---|---|---|
| ✖ | #1 entiende proyectos heterogéneos | NO_CUMPLE | `{"distintos":4,"formatos":2}` |
| ✔ | #2 reconstruye alcance | CUMPLE | `{"partidasConEstado":26,"sinDecidir":0}` |
| ? | #3 computa con evidencia | NO_VERIFICABLE | no se juntó evidencia de «computo» |
| ? | #4 selecciona partidas defendiblemente | NO_VERIFICABLE | no se juntó evidencia de «mapeo» |
| ✔ | #5 usa composiciones | CUMPLE | `{"resueltas":26,"incompletasQueCostaronCero":0}` |
| ? | #6 explota recursos | NO_VERIFICABLE | no se juntó evidencia de «explosion» |
| ✔ | #7 estima HH/productividad | CUMPLE | `{"horas":3697.6909}` |
| ✖ | #8 gestiona precios autónomamente | NO_CUMPLE | `{"resueltosAutonomamente":0,"yaEstabanVigentes":49,"sinPrecioValorizadoEnCero":0,"necesitanHumano":56,"sobreRecursos":107}` |
| ? | #9 maneja subcontratos | NO_VERIFICABLE | no se juntó evidencia de «subcontratos» |
| ✔ | #10 calcula costo directo | CUMPLE | `{"afirmadoEnCasos":2}` |
| ? | #11 calcula indirectos | NO_VERIFICABLE | no se juntó evidencia de «indirectos» |
| ? | #12 aplica política comercial versionada | NO_VERIFICABLE | no se juntó evidencia de «comercial» |
| ✔ | #13 deriva precio | CUMPLE | `{"coeficienteDerivado":true,"coeficienteEscribible":false}` |
| ✔ | #14 declara incertidumbre | CUMPLE | `{"noDeclarada":0}` |
| ✔ | #15 genera cotización versionada | CUMPLE | `{"congeladaEsInmutable":true,"ofertaDerivaDeCongelada":true}` |
| ✔ | #16 pasa presupuesto a obra | CUMPLE | `{"obrasConGenealogia":1}` |
| ✔ | #17 captura real | CUMPLE | `{"relacionesEstablecidas":25}` |
| ✔ | #18 compara Plan vs Real | CUMPLE | `{"comparaciones":2,"causasInventadas":0}` |
| ✔ | #19 genera aprendizaje candidato | CUMPLE | `{"generados":5}` |
| ✔ | #20 valida/promueve con governance | CUMPLE | `{"promovidos":0,"rechazadosPorGobernanza":5}` |
| ? | #21 reutiliza aprendizaje | NO_VERIFICABLE | no se juntó evidencia de «reuso» |
| ? | #22 funciona sin Claude | NO_VERIFICABLE | no se juntó evidencia de «claudeZero» |
| ? | #23 generaliza a varios proyectos | NO_VERIFICABLE | no se juntó evidencia de «generalizacion» |
| ? | #24 auditor independiente PASS | NO_VERIFICABLE | no se juntó evidencia de «auditoria» |

## Lo que bloquea el cierre

- #1 entiende proyectos heterogéneos
- #8 gestiona precios autónomamente

## Lo que no se pudo medir

- #3 computa con evidencia — no se juntó evidencia de «computo»
- #4 selecciona partidas defendiblemente — no se juntó evidencia de «mapeo»
- #6 explota recursos — no se juntó evidencia de «explosion»
- #9 maneja subcontratos — no se juntó evidencia de «subcontratos»
- #11 calcula indirectos — no se juntó evidencia de «indirectos»
- #12 aplica política comercial versionada — no se juntó evidencia de «comercial»
- #21 reutiliza aprendizaje — no se juntó evidencia de «reuso»
- #22 funciona sin Claude — no se juntó evidencia de «claudeZero»
- #23 generaliza a varios proyectos — no se juntó evidencia de «generalizacion»
- #24 auditor independiente PASS — no se juntó evidencia de «auditoria»

## Por qué falta esa evidencia

- **proyectosEntendidos**: la ingesta abre PDF, DWG, DXF, imagen, planilla, DOC y DOCX sobre archivos reales (57/57 de ARCOR, 0 llamadas al modelo), pero a las corridas de cotización sólo les llegan planillas y Word: las partidas de Quattropani vienen cargadas de la base, no reconstruidas de sus planos
- **computo**: las 26 partidas de la corrida traen cantidad pero ninguna trae evidencia, fuente ni nota: vienen cargadas en la cotización, no reconstruidas de un documento. La genealogía completa la prueba `plano/genealogia.mjs` sobre el pipeline de planos, no este cuadro
- **claudeZero**: el cero de `llamadas_llm` es ESTRUCTURAL: `correr()` cablea `llamadasLLM: []`, así que el término no puede decir que no. La prueba real del §13 es `orquestador/lib/cotizador/sin-llm.test.mjs` + `orquestador/scripts/xsas-sin-llm.mjs`, que borran las llaves del entorno antes de importar nada, cablean resolvedores que tiran ECONNREFUSED y saldo cero, y auditan que ninguno de los 26 módulos del cotizador importe un cliente de IA
- **generalizacion**: los 5 casos corren de punta a punta, pero «nadie aflojó un umbral para que cierren» no lo puede contestar una consulta: lo sostienen el diff auditado y las mutaciones corridas. El término va en nulo y el criterio queda sin medir, en vez de darse por bueno con un cero escrito a mano
- **indirectos**: hay 14 conceptos catalogados y ninguna cotización los usa: el indirecto sigue entrando por el porcentaje de la política
- **comercial**: las versiones de política existen y ninguna cotización las referencia todavía: hoy la cascada sigue tomando la vigente
- **auditoria**: todavía no hay firma de auditoría independiente: falta `docs/engineering/xsas-auditoria.json`
