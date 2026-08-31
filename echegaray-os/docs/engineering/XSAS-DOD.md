# XSAS — DEFINITION OF DONE

**FAIL** · cumplidos **20/24** · en rojo 1 · sin medir 3

| | criterio | | evidencia |
|---|---|---|---|
| ✖ | #1 entiende proyectos heterogéneos | NO_CUMPLE | `{"distintos":3,"formatos":2}` |
| ✔ | #2 reconstruye alcance | CUMPLE | `{"partidasConEstado":26,"sinDecidir":0}` |
| ✔ | #3 computa con evidencia | CUMPLE | `{"cantidades":26,"conGenealogiaCompleta":26}` |
| ✔ | #4 selecciona partidas defendiblemente | CUMPLE | `{"mapeadas":26,"porParecidoTextualSinAtributos":0}` |
| ✔ | #5 usa composiciones | CUMPLE | `{"resueltas":26,"incompletasQueCostaronCero":0}` |
| ✔ | #6 explota recursos | CUMPLE | `{"recursos":110,"reconcilia":true}` |
| ✔ | #7 estima HH/productividad | CUMPLE | `{"horas":3697.6909,"confundeHhConDuracion":false}` |
| ✔ | #8 gestiona precios autónomamente | CUMPLE | `{"resueltosAutonomamente":19,"sinPrecioValorizadoEnCero":0}` |
| ? | #9 maneja subcontratos | NO_VERIFICABLE | no se juntó evidencia de «subcontratos» |
| ✔ | #10 calcula costo directo | CUMPLE | `{"afirmadoEnCasos":1}` |
| ✔ | #11 calcula indirectos | CUMPLE | `{"conceptos":14,"separaCalculadoDeAplicado":true}` |
| ✔ | #12 aplica política comercial versionada | CUMPLE | `{"versionCitada":1,"congeladaNoCambiaConLaPolitica":true}` |
| ✔ | #13 deriva precio | CUMPLE | `{"coeficienteDerivado":true,"coeficienteEscribible":false}` |
| ✔ | #14 declara incertidumbre | CUMPLE | `{"noDeclarada":0}` |
| ✔ | #15 genera cotización versionada | CUMPLE | `{"congeladaEsInmutable":true,"ofertaDerivaDeCongelada":true}` |
| ✔ | #16 pasa presupuesto a obra | CUMPLE | `{"obrasConGenealogia":1}` |
| ✔ | #17 captura real | CUMPLE | `{"relacionesEstablecidas":25}` |
| ✔ | #18 compara Plan vs Real | CUMPLE | `{"comparaciones":2,"causasInventadas":0}` |
| ✔ | #19 genera aprendizaje candidato | CUMPLE | `{"generados":5}` |
| ✔ | #20 valida/promueve con governance | CUMPLE | `{"promovidos":0,"rechazadosPorGobernanza":5}` |
| ? | #21 reutiliza aprendizaje | NO_VERIFICABLE | no se juntó evidencia de «reuso» |
| ✔ | #22 funciona sin Claude | CUMPLE | `{"llamadasLlm":0,"llegoAlFinal":true}` |
| ✔ | #23 generaliza a varios proyectos | CUMPLE | `{"casosPass":4,"reglasTocadasParaQueCierren":0}` |
| ? | #24 auditor independiente PASS | NO_VERIFICABLE | no se juntó evidencia de «auditoria» |

## Lo que bloquea el cierre

- #1 entiende proyectos heterogéneos

## Lo que no se pudo medir

- #9 maneja subcontratos — no se juntó evidencia de «subcontratos»
- #21 reutiliza aprendizaje — no se juntó evidencia de «reuso»
- #24 auditor independiente PASS — no se juntó evidencia de «auditoria»

## Por qué falta esa evidencia

- **reuso**: no hay ningún aprendizaje ACTIVADO que reutilizar: la gobernanza rechazó los candidatos que había, y el consumo está cableado y probado sin material real que aplicar
