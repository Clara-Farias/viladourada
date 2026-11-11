(function (GC) {
  // Por que cada alerta existe: regra que disparou (por tipo), evidências, impacto,
  // ação recomendada (por ocorrência) e quem pode ser responsável (por área).

  const responsaveis = {
    infraestrutura: ['Coord. de Manutenção Elétrica', 'Coord. de Obras Viárias'],
    defesa_civil: ['Coord. de Defesa Civil', 'Chefe de Plantão da Defesa Civil'],
    saude: ['Coord. de Atenção Básica', 'Diretor do Hospital Municipal'],
    educacao: ['Coord. de Infraestrutura Escolar', 'Coord. de Transporte Escolar'],
    seguranca: ['Comandante da Guarda Municipal', 'Coord. de Videomonitoramento'],
    mobilidade: ['Coord. da Central de Tráfego', 'Coord. de Transporte Público'],
    limpeza: ['Coord. de Coleta', 'Coord. de Limpeza Urbana'],
  };

  const r = (expressao, fontes, disparos30d) => ({ expressao, fontes, disparos30d });
  const regras = {
    'alagamento': r('chuva_mm_h > 30 E chamados_156 >= 5 na mesma área', ['Sensores pluviométricos', 'Central 156'], 6),
    'deslizamento': r('chuva_acumulada_72h > 80 mm E área de risco mapeada', ['INMET', 'Defesa Civil'], 2),
    'queda de árvore': r('chamados_156 >= 3 sobre árvore caída em 1 h', ['Central 156', 'Defesa Civil'], 3),
    'queda de energia': r('imoveis_sem_energia > 200 por mais de 20 min', ['Concessionária de energia', 'Central 156'], 7),
    'iluminação pública': r('pontos_apagados >= 5 na mesma via por 24 h', ['App Cidadão', 'Infraestrutura'], 3),
    'buraco': r('relatos_app >= 10 no mesmo trecho', ['App Cidadão', 'Infraestrutura'], 3),
    'vazamento de água': r('pressao_rede < 60% E relatos >= 3', ['Companhia de saneamento', 'Central 156'], 2),
    'lotação': r('ocupacao_ubs > 90% por 2 h OU ocupacao_uti > 90%', ['Regulação da Saúde', 'Central de leitos'], 8),
    'falta de médico': r('escala_plantao.vagas_descobertas >= 1', ['Escala da Saúde'], 4),
    'falta de água': r('escola.sem_abastecimento E turno em andamento', ['Diretorias escolares', 'Companhia de saneamento'], 2),
    'transporte escolar': r('atraso_rota > 30 min', ['GPS da frota escolar'], 3),
    'roubo': r('ocorrencias > 1,3 × média móvel de 4 semanas', ['Guarda Municipal', 'Boletins de ocorrência'], 6),
    'câmeras': r('cameras_offline >= 3 por mais de 1 h', ['Central de videomonitoramento'], 4),
    'semáforo': r('semaforo.sem_sinal > 15 min', ['Central de tráfego'], 8),
    'congestionamento': r('velocidade_media < 15 km/h E fila > 2 km', ['Central de tráfego', 'GPS da frota de ônibus'], 7),
    'transporte público': r('atraso_linha > 20 min em 3 viagens seguidas', ['GPS da frota de ônibus'], 5),
    'coleta de lixo': r('rota_coleta.atraso > 48 h', ['Rastreamento da coleta', 'Central 156'], 5),
    'entulho': r('denuncia com foto georreferenciada', ['App Cidadão'], 4),
    'bueiro': r('bueiro_obstruido E chuva_prevista > 20 mm', ['Equipes de varrição', 'INMET'], 3),
    'surto': r('casos_suspeitos > 2 × média sazonal', ['Vigilância epidemiológica', 'Regulação da Saúde'], 1),
    'acidente': r('via_bloqueada E veiculos_envolvidos >= 2', ['Central de tráfego', 'Guarda Municipal'], 3),
  };

  // A mesma regra em linguagem de gente (é o que o prefeito lê; a expressão fica em "ver regra técnica").
  const TEXTOS = {
    'alagamento': 'Choveu mais de 30 mm por hora e houve 5 ou mais chamados no 156 na mesma área',
    'deslizamento': 'Mais de 80 mm de chuva em 3 dias numa área de risco já mapeada',
    'queda de árvore': '3 ou mais chamados no 156 sobre árvore caída em 1 hora',
    'queda de energia': 'Mais de 200 imóveis sem energia por mais de 20 minutos',
    'iluminação pública': '5 ou mais postes apagados na mesma via por 24 horas',
    'buraco': '10 ou mais relatos no app sobre o mesmo trecho',
    'vazamento de água': 'Pressão da rede abaixo de 60% e 3 ou mais relatos de vazamento',
    'lotação': 'Unidade de saúde acima de 90% de ocupação por 2 horas, ou UTI acima de 90%',
    'falta de médico': 'Plantão médico sem profissional escalado',
    'falta de água': 'Escola sem abastecimento de água durante as aulas',
    'transporte escolar': 'Rota do transporte escolar com mais de 30 minutos de atraso',
    'roubo': 'Ocorrências 30% acima da média das últimas 4 semanas',
    'câmeras': '3 ou mais câmeras fora do ar por mais de 1 hora',
    'semáforo': 'Semáforo sem sinal há mais de 15 minutos',
    'congestionamento': 'Trânsito abaixo de 15 km/h com fila de mais de 2 km',
    'transporte público': 'Linha de ônibus com mais de 20 minutos de atraso em 3 viagens seguidas',
    'coleta de lixo': 'Rota de coleta com mais de 2 dias de atraso',
    'entulho': 'Denúncia de entulho com foto e localização',
    'bueiro': 'Bueiro entupido com mais de 20 mm de chuva prevista',
    'surto': 'Casos suspeitos acima do dobro do normal para a época',
    'acidente': 'Via bloqueada por acidente com 2 ou mais veículos',
  };
  Object.entries(TEXTOS).forEach(([tipo, texto]) => { if (regras[tipo]) regras[tipo].texto = texto; });

  // Regra em palavras: o texto escrito à mão ou, para regras novas (criadas pela IA), uma tradução simples.
  GC.regraEmPalavras = function (regra) {
    if (!regra) return '';
    if (regra.texto) return regra.texto;
    const t = String(regra.expressao || '')
      .replace(/\s+E\s+/g, ' e ').replace(/\s+OU\s+/g, ' ou ')
      .replace(/>=/g, 'pelo menos').replace(/<=/g, 'no máximo').replace(/>/g, 'acima de').replace(/</g, 'abaixo de')
      .replace(/[._]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  };

  const d = (evidencias, impacto, acaoRecomendada) => ({ evidencias, impacto, acaoRecomendada });
  const detalhes = {
    'oc-01': d(['Sensor pluviométrico marca 48 mm/h na região', '18 chamados no 156 na última hora'], '~1.200 moradores · 2 escolas no entorno', 'Desobstruir as bocas de lobo da Rua XV e interditar o trecho alagado'),
    'oc-02': d(['Câmera mostra lâmina d’água de 40 cm na pista', '9 chamados no 156 em 30 min'], '~850 moradores · desvio de 3 linhas de ônibus', 'Interditar a Av. Brasil e enviar caminhão de sucção'),
    'oc-03': d(['Sensor de nível da lagoa 35 cm acima do normal', 'Previsão de mais 20 mm nas próximas 6 h'], '~400 moradores na margem', 'Abrir as comportas de vazão e alertar as famílias da margem'),
    'oc-04': d(['Chuva acumulada de 92 mm em 72 h', 'Vistoria encontrou trincas novas na encosta'], '~160 moradores em 38 casas', 'Remover preventivamente as famílias das 12 casas mais próximas'),
    'oc-05': d(['4 chamados no 156 em 20 min', 'Árvore de grande porte sobre a calçada'], '~60 pedestres/h desviados para a pista', 'Equipe de poda com motosserra e isolamento da calçada'),
    'oc-06': d(['Concessionária confirma 3.100 imóveis sem energia', 'Transformador sem sinal há 80 min'], '~3.100 moradores · 1 UBS e 2 escolas', 'Cobrar da concessionária prioridade para a UBS e gerador móvel'),
    'oc-07': d(['22 chamados no 156 em 35 min', 'Rede da Rua das Palmeiras sem leitura'], '~640 moradores', 'Acionar a concessionária para o trecho e informar previsão aos moradores'),
    'oc-08': d(['Oscilações de tensão registradas em 6 indústrias', 'Concessionária abriu ordem de serviço'], '~300 trabalhadores · produção parada', 'Acompanhar a concessionária e avisar a associação industrial'),
    'oc-09': d(['14 pontos apagados na praça', 'Relatos no App Cidadão há 5 h'], '~900 frequentadores à noite', 'Trocar as luminárias e reforçar a ronda da Guarda à noite'),
    'oc-10': d(['31 fotos enviadas pelo App Cidadão', 'Buraco com cerca de 1,2 m de diâmetro'], '~500 veículos/dia no trecho', 'Tapa-buraco emergencial e sinalização até o recapeamento'),
    'oc-11': d(['Pressão da rede caiu para 52%', '3 relatos de água na pista'], '~220 moradores com baixa pressão', 'Isolar o trecho da adutora e enviar equipe da companhia'),
    'oc-12': d(['Ocupação de 94% há mais de 2 h', 'Espera média de 2h11 na unidade'], '~180 pacientes aguardando', 'Remanejar 1 médico da UBS Bela Vista para o turno da tarde'),
    'oc-13': d(['UTI adulto com 19 de 20 leitos ocupados', 'Fila de 4 h no pronto atendimento'], '~260 pacientes', 'Transferir pacientes de UTI para o Hospital Regional (2 vagas) e abrir a sala de apoio'),
    'oc-14': d(['Escala com 1 plantão descoberto', 'Última consulta médica às 13h'], '~90 pacientes do turno', 'Convocar o médico de sobreaviso da rede'),
    'oc-15': d(['Caixa d’água da escola vazia desde 7h', '420 alunos dispensados'], '~420 alunos sem aula', 'Enviar caminhão-pipa e acionar a companhia de saneamento'),
    'oc-16': d(['GPS mostra 40 min de atraso na rota', '3 ônibus parados na serra'], '~75 alunos', 'Liberar ônibus reserva para a rota da serra'),
    'oc-17': d(['6 boletins em 90 min na mesma praça', 'Ocorrências 38% acima da média de 4 semanas'], 'Comércio e frequentadores da Praça Central', 'Reforçar o patrulhamento da Guarda e ligar as câmeras da praça à central'),
    'oc-18': d(['12 câmeras sem sinal há 3 h', 'Último sinal às 11h'], 'Área industrial sem monitoramento', 'Enviar equipe técnica e cobrir com ronda até o retorno'),
    'oc-19': d(['Semáforo sem sinal há 22 min', 'Velocidade média no cruzamento: 9 km/h'], '~5.000 motoristas na hora', 'Enviar agente de trânsito e equipe de manutenção'),
    'oc-20': d(['Fila de 3 km na Av. Dourada', 'Velocidade média de 11 km/h'], '~4.200 motoristas · 4 linhas de ônibus', 'Abrir faixa reversível e orientar desvio pela Rua Aurora'),
    'oc-21': d(['3 viagens seguidas com 25 min de atraso', 'Ônibus quebrado no ponto final'], '~1.300 passageiros', 'Colocar ônibus reserva na linha 102'),
    'oc-22': d(['Rota sem coleta há 3 dias', '37 chamados no 156'], '~2.100 moradores', 'Mutirão de coleta hoje e caminhão extra na rota'),
    'oc-23': d(['Denúncia com foto georreferenciada', 'Entulho ocupa metade da calçada'], '~150 moradores da rua', 'Recolher o entulho e notificar o responsável pela obra'),
    'oc-24': d(['Bueiro obstruído por folhas e lixo', 'Chuva de 25 mm prevista para a noite'], '~300 moradores · agrava o alagamento próximo', 'Desobstruir o bueiro antes da chuva'),
    'oc-25': d(['Concessionária registra falta de energia em 700 imóveis', '12 chamados no 156 em 10 min'], '~700 moradores sem energia', 'Isolar a área e acionar a concessionária com a poda'),
    'oc-26': d(['Shopping sem energia desde agora', 'Concessionária confirma falha no alimentador'], '~1.500 pessoas no shopping', 'Coordenar com a concessionária e orientar a evacuação segura'),
    'oc-27': d(['48 casos suspeitos de dengue na semana', '2,4× a média para o período'], '~2.400 moradores na área de risco', 'Mutirão de combate ao mosquito e reforço de atendimento na UBS'),
    'oc-28': d(['Ponte bloqueada nos dois sentidos', '2 veículos envolvidos, sem vítimas graves'], '~6.000 motoristas na hora', 'Desviar o trânsito pela Av. Central e enviar guincho'),
  };

  // Gerada a partir do histórico para nunca contradizer o resto do painel.
  function linhaHistorico(o) {
    const h = GC.data.historico30d[o.area] || {};
    const n = h[o.bairroId] || 0;
    const m = Math.round(Object.values(h).reduce((s, v) => s + v, 0) / GC.data.bairros.length);
    const nome = GC.data.areas.find((a) => a.id === o.area).nome;
    return `${n} casos de ${nome} no bairro em 30 dias (média por bairro: ${m})`;
  }

  GC.detalharOcorrencia = function (o) {
    const det = detalhes[o.id] || d(['Detectada pela integração da secretaria', `Fonte: ${o.fonte}`], o.afetados ? `~${o.afetados} pessoas` : 'Em avaliação', 'Acompanhar o atendimento da secretaria responsável');
    return {
      regra: regras[o.tipo] || r('regra da secretaria', [o.fonte], 1),
      evidencias: [...det.evidencias, linhaHistorico(o)],
      impacto: det.impacto,
      acaoRecomendada: det.acaoRecomendada,
      responsaveis: responsaveis[o.area] || ['Secretário(a) da pasta'],
    };
  };

  // Prazo de atendimento por gravidade, em minutos (conta desde que a ocorrência nasce).
  const prazoMin = { critica: 120, alta: 1440, media: 4320 };

  // Alertas disparados pelas regras nos 11 meses anteriores (nov/2025 a set/2026).
  // O 12º mês (out) é calculado: a soma dos disparos de 30 dias das regras.
  const alertasMensaisAnteriores = [78, 82, 95, 88, 80, 74, 71, 76, 79, 84, 86];

  Object.assign(GC.data, { responsaveis, regras, detalhes, prazoMin, alertasMensaisAnteriores });

  GC.alertas30d = () => Object.values(GC.data.regras).reduce((s, x) => s + x.disparos30d, 0);
  GC.alertasPorMes = () => [...GC.data.alertasMensaisAnteriores, GC.alertas30d()];

  // Tipo de ocorrência → área (pelas ocorrências dos dados); tipo desconhecido → null.
  GC.areaDoTipo = function (tipo) {
    const o = [...GC.data.ocorrencias, ...GC.data.ocorrenciasExtras].find((x) => x.tipo === tipo);
    return o ? o.area : null;
  };
})(window.GC = window.GC || {});
