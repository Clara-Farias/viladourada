# Base de dados da demonstração

Vila Dourada é uma cidade fictícia. Não há banco de dados: os números estão nos arquivos `js/data*.js` e são ajustados ao porte da cidade em `js/cidade.js`. O que o usuário cria (visões salvas, widgets, gabinetes, cidade escolhida) fica no `localStorage` do navegador, então não passa de um computador para outro.

## O que mudou nesta versão

**Relógio único (`js/relogio.js`).** Os dados foram escritos com "hoje" = 05/11/2026. Antes, coleta, frota e obras usavam essa data fixa e o resto usava a data real, o que gerava "rotas de hoje (quinta)" numa terça. Agora todos perguntam ao relógio:

- `GC.relogio.hoje` é a data real; nos testes, 05/11/2026 (`tests/helpers/carregar.js`), então os testes continuam determinísticos.
- `GC.relogio.data('2026-10-21')` desloca uma data escrita, mantendo a distância até hoje.
- `GC.relogio.diaSemana('qui')` gira os dias das rotas de coleta para que as "rotas de hoje" caiam no dia real.
- `GC.relogio.meses(12)` dá os rótulos dos meses fechados até o mês passado (antes, sempre nov–out).

**Números que acompanham o porte da cidade (`js/cidade.js`).**

- Orçamento das secretarias proporcional à população: cerca de R$ 3,8 mil por habitante nas três cidades (antes, R$ 569,9 mi fixos: R$ 25,8 mil/hab na pequena e R$ 228/hab na grande).
- Resolvidas em 30 dias acompanham os casos de cada secretaria (antes, 87 em qualquer porte).
- Séries de contagem (quedas de energia, alagamentos) crescem junto com o histórico de 30 dias.
- Série de segurança sem degrau: os 6 primeiros meses usam o mesmo fator dos 6 últimos.
- Concessionária de ônibus com o nome da cidade (a grande não herda mais a "Viação Dourada").

**Saúde e Educação da Vila Dourada.** Dotação passou de R$ 115,4 mi e R$ 132,8 mi para R$ 298,6 mi e R$ 331,9 mi (cerca de R$ 1.200 e R$ 1.330 por habitante). É ordem de grandeza, não dado oficial; vale conferir com cidades reais de 250 mil habitantes no Siconfi.

**Um número, uma fonte.** As tendências do Pulso deixaram de ser escritas à mão: saem das séries das secretarias (`js/data-secretarias.js`). O Pulso, o Resumo do dia e o Copiloto mostram o mesmo valor. A coleta continua com dois números de propósito: o mês fechado na série (87%) e os últimos 30 dias no cartão (89%), que aparece como ponto "agora" no indicador.

**Fontes.** Cada secretaria tem `fonte` (aparece ao passar o mouse no cartão do Pulso) e a satisfação tem `satisfacaoFonte`.

**Privacidade.** Casos de violência contra mulheres e crianças por bairro abaixo de 5 aparecem como "menos de 5" no resumo, no widget e no Copiloto. O número exato continua em `GC.data.seguranca.violencia.porBairro` (é o dado interno; com dados reais, a exportação também precisa da regra).

**Mapa.** Por padrão o fundo é liso, sem ruas: as coordenadas ficam sobre Campinas e o mapa de ruas mostrava nomes reais embaixo dos bairros inventados. `?mapa=real` liga o mapa de ruas.

**Detalhes.** "Roubos em sequência" e "Furtos de fios" deixaram de ter 0 afetados; o portal só marca "Seu bairro" quando há bairro escolhido; o título do aviso não repete o bairro; o painel mostra o selo "Demonstração · dados fictícios".

## O que ficou de fora

- As 8 críticas do topo e as 7 do Resumo do dia contam conjuntos diferentes (ocorrências e alertas); isso é lógica de tela, não de dados.
- UTI no hospital da cidade pequena e o número de escolas (18 para 250 mil habitantes) pedem reescrever unidades à mão.
- Banco de dados de verdade: hoje tudo é arquivo + `localStorage`.

## Cruzamento de dados (workshop de 11/11)

`js/data-cruzamento.js` monta 8 indicadores com 12 meses por bairro, região e cidade, sempre amarrados às séries que o painel já mostra. Detalhes e regras de consistência em `WORKSHOP-11-11.md`; os testes estão em `tests/cruzamento.test.js`.
