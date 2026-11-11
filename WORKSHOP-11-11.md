# Workshop de 11/11: o que foi feito

Cada decisão da reunião e onde ela está no projeto.

| Decisão | O que foi feito | Onde |
| --- | --- | --- |
| Nome próprio para o copiloto | A assistente se chama **Áurea** (nome padrão, trocável). Todos os textos do painel, do chat, do tour, dos widgets e do PDF usam `GC.agente()`. | `js/marca.js` |
| Identidade visual padrão "Golden" | Paleta Golden (grafite + ouro) aplicada por variáveis CSS; produto "Golden Gov" com selo "GG" no menu. | `js/marca.js`, `css/golden.css` |
| Tela de personalização | Menu ⋯ → **Personalizar** (só gestor geral): nome do produto, nome da assistente, 6 paletas prontas (Golden, azul institucional, verde saúde, azul educação, vinho, terracota), 4 cores livres, envio de logo (até 400 KB) e prévia ao vivo. Salvo no navegador. | `js/tela-personalizar.js` |
| Cruzamento de informações (manual e pela IA) | Nova tela **Cruzamento de dados** no menu: escolhe 2 indicadores, período (3, 6 ou 12 meses) e recorte (cidade ou região); mostra gráfico de dois eixos, força da relação, leitura em texto, tabela por região e CSV. A mesma conta responde à Áurea ("cruze ocupação hospitalar com chuva dos últimos 3 meses por região"). | `js/data-cruzamento.js`, `js/cruzamento.js`, `js/tela-cruzamento.js` |
| Telas acessórias (login) | `login.html`: e-mail, senha, "acessar como" (gabinete ou cada secretaria, que é como o produto se vende por módulo) e cidade da demonstração. Menu ⋯ mostra quem está conectado e tem **Sair**. Qualquer senha entra; `?sem-login` pula a tela. | `login.html`, `js/login.js`, `js/sessao.js` |
| Ações pré-definidas na IA | Botões acima do campo do chat: Gerar relatório, Cruzar dados, O que fazer primeiro, Bairro mais crítico, Resumo da semana. Mudam com o perfil (o secretário vê os da pasta). | `js/ia-acoes.js` |

Ajustes visuais pequenos (como os marcadores do mapa) ficaram de fora, como combinado.

## Dados do cruzamento

Oito indicadores com 12 meses por bairro, por região e da cidade, nas três cidades: chuva, ocupação hospitalar, dengue, espera nas UBS, alagamentos, quedas de energia, B.O.s e coleta no prazo. As regiões (Central, Norte, Sul, Leste, Oeste) saem da posição de cada bairro.

Os números batem com o resto do painel, e os testes (`tests/cruzamento.test.js`) conferem isso nas três cidades:

- Alagamentos, quedas de energia e B.O.s: a soma dos bairros é, mês a mês, a série da secretaria (a mesma do Pulso e da página da secretaria).
- B.O.s do último mês por bairro são os B.O.s de 30 dias do mapa de segurança.
- Ocupação do último mês é a ocupação atual da central de leitos.
- Espera e coleta: a média das regiões, ponderada pela população, é o valor da cidade.

A força da relação compara cada região com ela mesma mês a mês (assim uma região grande não mascara as outras) e toda leitura termina lembrando que correlação não prova causa. A ocupação hospitalar só existe nas regiões com hospital; as outras aparecem como "sem dado".

## Pendências

- **Base da Clara:** quando chegar, entra nos arquivos `js/data*.js`; o cruzamento lê as séries das secretarias, então se adapta sozinho. Se ela trouxer séries mensais por bairro, elas substituem as repartidas em `data-cruzamento.js`.
- **Ambiente de testes (Saí):** o projeto é estático; basta publicar a pasta. `login.html` é a porta de entrada.
- **IA real:** `GC.ia.perguntar` continua sendo o ponto de troca. A sugestão do Felipe (views do banco limitando o que o modelo enxerga) casa com os perfis: o secretário já só cruza os indicadores da pasta.
- **Módulos por secretaria:** hoje o "acessar como" demonstra a venda por módulo; ligar e desligar módulos por contrato ainda não existe.
- **Alertas por SMS e controle de prazos:** citados como ferramentas futuras.

## Personalização: o que muda com as cores

As quatro cores escolhidas (principal, principal escura, destaque e assistente de IA) viram a paleta inteira do sistema: menu, cabeçalhos, botões, abas, gráficos (dos widgets, do chat e das secretarias), bairros e realces no mapa, tela de carregamento, login, portal do cidadão (inclusive no modo escuro), cabeçalho dos PDFs, cor da barra do navegador e ícone da aba. Uma varredura automática nas telas com outra paleta não encontrou nenhuma cor antiga sobrando.

- **Ao vivo:** as cores mudam o painel inteiro enquanto você edita; sair sem salvar devolve as salvas.
- **Leitura garantida:** o texto sobre cada cor fica branco ou escuro conforme o contraste, e o texto "na cor da marca" escurece só o necessário para ler. Cada cor mostra a leitura (ex.: "boa leitura 7,5:1") e um botão Corrigir quando fica fraca.
- **Principal escura automática:** acompanha a principal, a menos que você a ajuste à mão.
- **8 paletas prontas** e campo hexadecimal para colar a cor exata do manual da marca.
- **Levar para outro computador:** Exportar/Importar marca (.json) e "Baixar como marca da instalação", que gera o `js/marca-config.js`: substituído na cópia hospedada, vale para todos que abrirem o sistema.
- Vermelho, laranja e verde de gravidade e prazo não mudam com a marca, de propósito.

## Rodada de 12/11: base de dados, logo, funcionalidades novas e layout

### Base de dados (tudo o que o sistema usa)

- **Proporções por habitante iguais nos três portes.** Casos registrados em 30 dias passaram a ~120 por 100 mil nas três cidades (antes 425 na pequena e 57 na grande). Leitos ficaram entre 2,5 e 2,8 por mil (antes 5,4 na pequena e 0,9 na grande): a cidade pequena tem menos leitos, a grande é polo regional, e a Vila Dourada ganhou dois hospitais clínicos na periferia (Zona Norte e Zona Sul) sem mexer no miolo da demonstração. Escolas: todo bairro novo da Vila Dourada tem escola, e a rede municipal atende ~7% da população nas três cidades.
- **Resumo do dia:** "7 das 8 críticas abertas", em vez de um número que parecia contradizer o topo.
- O verificador de consistência (abaixo) roda nos testes das três cidades: qualquer mudança na base que quebre um número aparece na hora.

### Logo

O monograma VD (do canvas "Vila Dourada — Sala de Situação") é o logo inicial: menu, login, portal do cidadão, prévia e ícone da aba. Em Personalizar dá para enviar outro, voltar ao VD ou usar as iniciais do produto, e marcar "fundo branco" para logos sem fundo. Há também a paleta "Vila Dourada (logo)", com as cores do manual (Azul Vila, Noite e Ouro).

### Funcionalidades novas (menu ⋯ → Administração, só gestor geral)

- **Consistência dos dados:** 14 verificações entre telas (o mesmo número em todo lugar) e 6 proporções por habitante com faixa de referência; exporta CSV.
- **Módulos contratados:** liga e desliga secretarias. Desligada, ela sai do mapa, dos alertas, do Pulso, do ranking, do cruzamento e da tela de login.
- **Prazos e avisos:** por secretaria, prazo de resposta, responsável, telefone e canais (SMS, WhatsApp, e-mail). Cada "Cobrar" mostra na tela para quem e por onde o aviso saiu e entra na lista de cobranças como aguardando, vencida ou respondida. O envio real fica com o integrador de SMS/WhatsApp da prefeitura.
- **Registro de ações:** entradas e saídas, cobranças, priorizações, gabinetes, mudanças de marca, módulos e prazos, com autor e horário; filtro e CSV.

### Layout

- Pulso com seta ▲▼ e "melhorou/piorou" para leitores de tela, além da cor.
- Resumo do dia em duas linhas em vez de reticências (o "quando" do risco não some).
- Gabinete de crise: só a primeira decisão tem o botão cheio; as outras ficam em contorno.
- Celular: números do topo quebram linha em vez de cortar, a doca não fica embaixo do botão do menu e o chip "Escolha seu bairro" não cobre o nome da cidade no portal.
- Aviso na tela depois de cada cobrança.
