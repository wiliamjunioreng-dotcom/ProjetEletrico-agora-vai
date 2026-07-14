# AS_BUILT.md — Motor Vivo do ProjetEletrico

**Status:** verificado item a item contra o código-fonte real em `d5f18b8..4dca35a` (12 commits desta auditoria)
**Testes:** 743/743 passando · **Build:** limpo
**Metodologia:** cada afirmação abaixo foi confirmada por leitura direta do código no momento da escrita — não por resumo de terceiros. Onde a confiança na fonte normativa é menor que 100% (número de tabela não verificado em documento físico, valor citado por terceiro sem quote direto), isso está marcado explicitamente.

---

## Como ler este documento

- ✅ **Confirmado e conectado** — a função existe, é chamada pelos dois motores de cálculo (`engine.ts` e `pipeline.ts`), e o resultado é idêntico nos dois para a mesma entrada
- 🟡 **Confirmado, uma ressalva** — funciona, mas com uma limitação ou zona cinzenta documentada
- ⚫ **Não implementado** — lacuna real, sem cálculo

---

## 1. Previsão de Cargas (NBR 5410 §9.5.2)

| Item | Fórmula | Status |
|---|---|---|
| Iluminação mínima | `área≤6m²→100VA`; `área>6m²→100+floor((área-6)/4)×60VA` | ✅ |
| TUG banheiro | fixo 600VA, 1 tomada | ✅ |
| TUG cozinha/lavanderia | `ceil(perímetro/3,5)` tomadas; 3 primeiras 600VA, excedentes 100VA | ✅ |
| TUG demais ambientes | área≤6m²→1 tomada; senão `ceil(perímetro/5)`×100VA | ✅ |
| TUE circuito dedicado | obrigatório para carga ≥1500VA, com lista de palavras-chave (chuveiro, forno, ar-cond, etc.) | ✅ |

## 2. Volumes de Banheiro — §9.1

Abordagem declarativa (distância numérica, não seletor de zona) — reescrita após feedback direto sobre usabilidade nesta sessão.

| Tipo de carga | Regra |
|---|---|
| TUG/GERAL a <0,60m da banheira/box | **Erro bloqueante** |
| TUE a qualquer distância | Sem bloqueio — é o equipamento esperado ali (chuveiro/aquecedor); só nota sobre IP |
| ILUM a <0,60m | Aviso (não erro) — depende de altura (>2,25m exime), não pedida ao usuário para manter a UI simples |
| Qualquer tipo, 0,60m–3,00m | Informativo — IDR 30mA já garantido pela regra geral de área molhada |

🟡 Distâncias de referência (0,60m / 2,25m / 3,00m) citadas por terceiro nesta sessão, convergente com IEC 60364-7-701 — não é verificação de primeira mão do PDF físico da NBR 5410.

## 3. Dimensionamento de Cabos — sequência completa

Implementada de forma **idêntica** nos dois motores (`engine.ts→dimensionarCircuito()`, `pipeline.ts→resolverCircuito()`), com testes de consistência cruzada cobrindo todos os fatores abaixo:

1. **Tensão do circuito** por combinação de fases (mono/bi/trifásico)
2. **Ib** = potência/tensão
3. **Ft** — Tabela 40, interpolação linear por temperatura/isolação — ✅
4. **Fa** — Tabela 42, degraus exatos por nº de circuitos agrupados — ✅
5. **Fsolo** — Tabela 41, resistividade térmica do solo, só D1/D2 — ✅ **conectado nos dois motores** (achado desta sessão: só estava em `engine.ts`)
6. **Fator harmônico 0,86** — §6.2.5.6.1, 3ª harmônica >15% em trifásico com neutro — ✅ **conectado nos dois motores** (mesmo achado)
7. **Fa por Tabela 45** — dutos enterrados separados, alternativa à Tabela 42 quando declarado — ✅ **conectado nos dois motores** (mesmo achado)
8. **Seção mínima (Tabela 47)** — Cobre: 1,5mm² ILUM / 2,5mm² força; **Alumínio: piso único 16mm²** — ✅
9. **Escalonamento por ΔU** — iterativo, sobe seção até `≤(du_max-du_ramal)` — ✅
10. **Escalonamento por tripartida** — `In≤Iz'`, evitado proativamente — ✅

🟡 Circuitos de sinalização/controle (0,5mm² Cobre, citados na Tabela 47) não modelados — o sistema não tem `CircuitType` para esse tipo de circuito.

🟡 `rules/sizing.ts→secaoMinima()` (camada de validação, não de cálculo) ainda usa uma cópia própria de `SECAO_MIN` sem diferenciação de material — decisão deliberada de não corrigir: como o cálculo real já aplica o piso certo a montante, essa validação nunca produz falso positivo, só teria mensagem menos precisa para Alumínio. Custo de estender `CircuitoContext` não compensou o ganho.

## 4. Dimensionamento de Proteção

| Item | Status |
|---|---|
| Tripartida `Ib≤In≤Iz'` | ✅ evitada proativamente por escalonamento |
| Sobrecarga `In≤1,45×Iz'` | ✅ usa Iz **efetiva** (pós todos os fatores), não nominal |
| IDR 30mA área molhada | ✅ locais + equipamentos (chuveiro/ducha/banheira/torneira/boiler), acentos normalizados |
| Curva do disjuntor (B/C/D) | ✅ por tipo de carga com justificativa textual |
| Integral de Joule `I²t≤K²S²` | ✅ **K=115 Cu/PVC, K=143 Cu/XLPE** (corrigido nesta sessão — antes 143 fixo para todo cobre, superestimava capacidade em ~54%) |
| Curto-circuito IEC 60909 | ✅ `Z_rede` usa tensão de referência fixa do ponto de entrega, não a do circuito terminal |
| Pior caso (IEC 60364-4-41) | ✅ cabo quente + comprimento máximo + tensão mínima -10% |
| Condutores em paralelo (Anexo D) | ✅ módulo próprio, `Ib≤In≤ΣIzk` somando capacidade individual por condutor |
| Mistura ILUM+TUG | ✅ bloqueia se `Ib>16A` |

## 5. DPS — Tabela 49

✅ **Uc mínimo calculado por esquema de aterramento e ponto de ligação**, não mais texto fixo genérico. Validado contra exemplo de referência: TN-S 127/220V → fase-neutro=140V, fase-PE=140V, neutro-PE=127V.

🟡 TN-C-S tratado como TN-S por interpretação prática (não citação literal da fonte para esse esquema específico).
⚫ Dimensionamento de Up/In do DPS (capacidade de descarga) continua fixo de referência, não calculado por projeto.

## 6. Condutor de Proteção e Neutro

- **PE (Tabela 58* — número corrigido de 54 para 58 nesta sessão):** `S≤16→PE=S`, `16<S≤35→PE=16`, `S>35→PE=S/2` — ✅ consolidado, chamado pela mesma função nos dois motores (antes `pipeline.ts` duplicava a fórmula inline)

## 7. Infraestrutura de Eletroduto

✅ Ocupação por número de CONDUTORES (não circuitos) — §6.2.11.1.6: 1→53% / 2→31% / 3+→40%. Conectada ao caminho vivo nesta sessão (existia corrigida em módulo órfão `eletroduto.ts` desde auditoria anterior, nunca importado por nenhuma página até agora).

✅ Regra das 3 curvas/270° (§6.2.11.3) — declarada pelo engenheiro por trecho, não detectada por geometria.

## 8. Topologia e Validação Estrutural

✅ `solver.ts→verificarInvariantes()`: exatamente 1 QD, sem nós órfãos, sem ciclos no grafo.
🟡 O resultado completo de `solve()` (que roda os dois motores + invariantes a cada edição) não é lido por nenhuma página hoje — computação real, mas output não exibido.

## 9. Exportação

- **Unifilar SVG** — ✅ confirmado funcional, lê `circuitos_calc` diretamente, layout técnico com barra + derivações
- **Manual do Usuário (§6.1.8.3)** — ✅ potência máxima por circuito, aviso contra troca de disjuntor, aviso contra desativar DR
- **Memorial, Prancha, QDFL** — ✅ branding, tabela consolidada
- **Materiais/SINAPI** — ✅ composição real de condutores por tipo de circuito, quantitativo por trecho

## 10. Override Manual

✅ Exposto na tela Circuitos (não só via sugestões de 1-clique da Auditoria) — seção/disjuntor/curva sobrepostos manualmente com justificativa obrigatória, sempre igual ou acima do piso calculado automaticamente.

---

## Lacunas confirmadas — sem implementação

1. **SPDA (NBR 5419)** — cálculo de nível de proteção, zona, R1, captores/descidas. Existe só como citação textual fixa. Decisão consciente de não abrir esse flanco (mudança de domínio, não de escopo incremental).
2. **UGR (ofuscamento luminotécnico)** — exigiria arquivo fotométrico IES do fabricante da luminária, que o sistema não tem.
3. **BIM/IFC, roteamento automático de eletrodutos, modelagem 3D** — mudanças de arquitetura fundamentais, fora do escopo desta auditoria.
4. **33 módulos "arquitetura v4"** — grafo espacial completo, propagação elétrica nó-a-nó, sistema transacional. Escritos, funcionais isoladamente, nunca conectados a nenhuma página. Decisão: quarentena, não big-bang rewrite.
5. **Segregação energia/dados no mesmo eletroduto** — o modelo de `TipoCondutor` só cobre tipos de energia; não implementado por falta de referência normativa exata verificada.
6. **Tabela 44** (cabos diretamente enterrados sem eletroduto) — texto não disponibilizado nesta sessão; não implementado.
7. **Tabela do método de instalação (nomeada como "33" numa fonte)** — usada só como rótulo textual na UI, não como estrutura de dados própria.

---

## Achados de consistência corrigidos nesta auditoria (histórico)

Registro de bugs reais encontrados e corrigidos, para quem for dar manutenção:

- Tripartida com agrupamento divergindo entre motores
- IDR não detectava acentos / equipamentos molhados sem menção ao cômodo
- Auditoria.tsx nunca calculava nada (`pipelineMap` buscava propriedade inexistente)
- §5.1.3.2 usava Iz nominal em vez de efetiva
- Demanda trifásica com divisor errado (~50% superdimensionado)
- ΔU bifásico usando √3 em vez de fator 2
- Fator K fixo em 143 para todo cobre (correto: 115 para PVC)
- Ocupação de eletroduto com limite fixo 30/35% em vez de por condutor
- Tabela 42 interpolada em vez de degraus exatos
- Seção mínima sem piso de Alumínio
- **Fsolo, fator harmônico e Tabela 45 conectados só em `engine.ts`, ausentes em `pipeline.ts`** (achado mais recente, corrigido no mesmo ciclo em que este documento foi escrito)

---

*Documento gerado por verificação ativa do código-fonte, incluindo teste de consistência cruzada entre os dois motores de cálculo para cada fator citado como "✅ conectado nos dois motores". Não reflete resumos ou catálogos anteriores desta mesma sessão sem re-confirmação — pelo menos um deles (Tabela 45) estava descrevendo um estado que ainda não existia no código no momento em que foi escrito.*
