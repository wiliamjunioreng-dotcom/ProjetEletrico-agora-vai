# ProjetEletrico — Arquitetura do Domínio Elétrico

## Hierarquia de entidades (soberana → derivada)

```
RedeEletrica  ← entidade central. Tudo deriva dela.
  ├── NoTopologico     (ponto físico: QD, caixa, tomada, luminária)
  ├── SegmentoEletroduto (condutor físico entre dois nós)
  │     └── ConductorEmSegmento  (fio específico: FASE_A, NEUTRO, PE, RETORNO)
  └── CircuitoLogico   (rótulo sobre um caminho — NÃO é a entidade central)
        └── Carga       (ponto de consumo: ILUM, TUG, TUE)
```

## Ordem de cálculo (invariante — nunca inverter)

1. **Topologia** — definir nós e segmentos (físico)
2. **Cargas** — associar potência aos nós folha
3. **Propagação** — `domain.propagarFluxo()` — DFS pós-ordem, folha → raiz
4. **Corrente** — resultado da propagação, nunca entrada direta
5. **Dimensionamento** — bitola, disjuntor, IDR por segmento
6. **Validação** — `rules.aplicarTodasRegras()` — fonte única de normas
7. **Exportação** — QDFL, memorial, unifilar, quantitativos

## Axiomas que não podem ser violados

- **Corrente é resultado, não entrada.** Nunca calcule corrente sem saber a topologia.
- **Potência flui da folha para a raiz.** Um segmento carrega a soma de tudo abaixo dele.
- **Depois de uma derivação, a corrente diminui.** O segmento QD→caixa carrega C1+C2+C3. O segmento caixa→sala carrega só C1.
- **Circuito é um rótulo.** Ele não existe fisicamente — é um caminho na rede com um nome.
- **Toda regra normativa passa por `rules.ts`.** Zero referências à NBR fora desse arquivo.

## Arquivos do domínio

| Arquivo | Responsabilidade |
|---|---|
| `types/electrical.ts` | Tipos TypeScript — estrutura de dados |
| `core/domain.ts` | Modelo mental — propagação, invariantes, fluxo |
| `core/rules.ts` | Motor de regras — NBR 5410, CEMIG, IEC |
| `core/engine.ts` | Cálculos numéricos — Iz, Ft, Fa, dU, Icc |
| `core/topologia.ts` | Algoritmos de grafo — BFS, análise de segmento |
| `data/nbr5410tables.ts` | Tabelas normativas — imutáveis, nunca calculadas |

## O que ainda NÃO está implementado (roadmap honesto)

### Etapa 2 — Propagação real
- Corrente dinâmica após derivação (atualmente Ib é global, não por segmento)
- Balanço de correntes nos nós (lei de Kirchhoff)
- Neutro compartilhado entre circuitos de mesma fase

### Etapa 3 — Motor gráfico
- Canvas 2D para desenho da topologia
- Snapping de nós
- Roteamento assistido (não automático ainda)

### Etapa 4 — Automação pesada
- Roteamento automático (grafo + heurística de menor custo)
- Auto-derivação baseada em posição 2D
- Integração DXF/DWG

### O muro técnico real
Derivação automática exige: coordenadas 2D dos nós + algoritmo de roteamento + propagação
de condutores por subárvore. Isso é plataforma, não feature. Estimar 3-6 meses de engenharia.
