# -*- coding: utf-8 -*-
"""
Gera o Tutorial PDF completo do sistema Clube do Natural.
Versao 2.0 — com Firebase Auth, Firestore e fluxo de login.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import datetime
import os

# Colors
GREEN_DARK = HexColor('#1B4332')
GREEN_MED = HexColor('#2D6A4F')
GREEN_LT = HexColor('#52B788')
GREEN_BG = HexColor('#d8f3dc')
GOLD = HexColor('#C4972A')
BEIGE = HexColor('#F5F0E8')
RED = HexColor('#E63946')
GRAY = HexColor('#555555')
GRAY_LT = HexColor('#888888')
WHITE = HexColor('#FFFFFF')
BG_TABLE = HexColor('#f8f8f8')
BLUE = HexColor('#2563EB')

OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'RELATORIO-SISTEMA-CLUBE-DO-NATURAL.pdf')


def make_table(data, col_widths, header_bg=GREEN_DARK):
    """Helper to create styled tables consistently."""
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), header_bg),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, BG_TABLE]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, GREEN_LT),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return t


def make_info_table(data, col_widths):
    """Helper for property/value tables."""
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN_MED),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BACKGROUND', (0, 1), (0, -1), GREEN_BG),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, GREEN_LT),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return t


def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        topMargin=2*cm, bottomMargin=2*cm,
        leftMargin=2*cm, rightMargin=2*cm,
        title='Tutorial Completo - Clube do Natural',
        author='Clube do Natural',
        subject='Tutorial do Usuario - Como Usar o Sistema'
    )

    styles = getSampleStyleSheet()

    # Custom styles
    s_cover_title = ParagraphStyle('CoverTitle', parent=styles['Title'],
        fontSize=28, leading=34, textColor=GREEN_DARK, alignment=TA_CENTER, spaceAfter=8)
    s_cover_sub = ParagraphStyle('CoverSub', parent=styles['Normal'],
        fontSize=14, leading=18, textColor=GREEN_MED, alignment=TA_CENTER, spaceAfter=4)
    s_cover_date = ParagraphStyle('CoverDate', parent=styles['Normal'],
        fontSize=11, leading=14, textColor=GRAY, alignment=TA_CENTER, spaceBefore=20)

    s_h1 = ParagraphStyle('H1', parent=styles['Heading1'],
        fontSize=20, leading=24, textColor=GREEN_DARK, spaceBefore=20, spaceAfter=10,
        borderWidth=0, borderPadding=0)
    s_h2 = ParagraphStyle('H2', parent=styles['Heading2'],
        fontSize=15, leading=19, textColor=GREEN_MED, spaceBefore=14, spaceAfter=6)
    s_h3 = ParagraphStyle('H3', parent=styles['Heading3'],
        fontSize=12, leading=15, textColor=GOLD, spaceBefore=10, spaceAfter=4)
    s_body = ParagraphStyle('Body', parent=styles['Normal'],
        fontSize=10, leading=14, textColor=black, spaceAfter=6, alignment=TA_JUSTIFY)
    s_bullet = ParagraphStyle('Bullet', parent=s_body,
        leftIndent=16, bulletIndent=6, spaceBefore=2, spaceAfter=2)
    s_small = ParagraphStyle('Small', parent=styles['Normal'],
        fontSize=8, leading=10, textColor=GRAY_LT)
    s_code = ParagraphStyle('Code', parent=styles['Normal'],
        fontSize=9, leading=12, textColor=GREEN_DARK, backColor=GREEN_BG,
        leftIndent=10, rightIndent=10, spaceBefore=4, spaceAfter=4,
        borderWidth=0.5, borderColor=GREEN_LT, borderPadding=6)
    s_alert = ParagraphStyle('Alert', parent=s_body,
        fontSize=10, textColor=RED, backColor=HexColor('#FFF0F0'),
        borderWidth=0.5, borderColor=RED, borderPadding=8, spaceBefore=6, spaceAfter=6)
    s_tip = ParagraphStyle('Tip', parent=s_body,
        fontSize=10, textColor=GREEN_DARK, backColor=GREEN_BG,
        borderWidth=0.5, borderColor=GREEN_LT, borderPadding=8, spaceBefore=6, spaceAfter=6)
    s_info = ParagraphStyle('Info', parent=s_body,
        fontSize=10, textColor=BLUE, backColor=HexColor('#EFF6FF'),
        borderWidth=0.5, borderColor=BLUE, borderPadding=8, spaceBefore=6, spaceAfter=6)
    s_footer = ParagraphStyle('Footer', parent=styles['Normal'],
        fontSize=8, textColor=GRAY_LT, alignment=TA_CENTER)
    s_step = ParagraphStyle('Step', parent=s_body,
        fontSize=10, leading=14, leftIndent=20, bulletIndent=4, spaceBefore=3, spaceAfter=3)

    story = []

    # ============ CAPA ============
    story.append(Spacer(1, 50))
    story.append(Paragraph("CLUBE DO NATURAL", s_cover_title))
    story.append(Paragraph("Rede de Lojas de Produtos Naturais", s_cover_sub))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="60%", thickness=2, color=GREEN_LT, spaceAfter=10, spaceBefore=10))
    story.append(Spacer(1, 10))
    story.append(Paragraph("TUTORIAL COMPLETO DO SISTEMA",
        ParagraphStyle('x', parent=s_cover_sub, fontSize=18, textColor=GREEN_DARK)))
    story.append(Paragraph("Guia Passo a Passo para Usar Todas as Funcionalidades", s_cover_sub))
    story.append(Spacer(1, 20))
    story.append(Paragraph(f"Versao 2.0 | Data: {datetime.now().strftime('%d/%m/%Y')}", s_cover_date))
    story.append(Paragraph("Documento para o dono, gerentes e equipe", s_cover_date))
    story.append(Spacer(1, 30))

    # Summary box
    summary_data = [
        ['RESUMO DO SISTEMA', ''],
        ['Total de Paginas', '10+ paginas HTML'],
        ['Autenticacao', 'Google Sign-In (conta Google)'],
        ['Banco de Dados', 'Firebase Firestore (nuvem + offline)'],
        ['Controle de Acesso', 'Por cargo (dono, gerente, atendente, etc.)'],
        ['IA Integrada', 'Google Gemini 2.0 Flash (gratis)'],
        ['Video IA', 'D-ID Avatar + LTX Studio'],
        ['PWA', 'Instalavel + Funciona Offline'],
        ['Deploy', 'Vercel (automatico via Git)'],
        ['Regiao Servidor', 'Sao Paulo (southamerica-east1)'],
    ]
    t = Table(summary_data, colWidths=[140, 300])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN_DARK),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('SPAN', (0, 0), (-1, 0)),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('BACKGROUND', (0, 1), (0, -1), GREEN_BG),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, GREEN_LT),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t)

    story.append(PageBreak())

    # ============ INDICE ============
    story.append(Paragraph("INDICE", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    indice = [
        "1. Como Comecar (Primeiro Acesso)",
        "   1.1 Fazer Login com Google",
        "   1.2 Primeiro usuario = Dono (voce!)",
        "   1.3 Aprovar novos usuarios",
        "2. Cargos e Permissoes",
        "3. Paginas do Sistema",
        "   3.1 Tela de Login (login.html)",
        "   3.2 Landing Page (index.html)",
        "   3.3 Catalogo Inteligente (catalogo.html)",
        "   3.4 Checkout (checkout.html)",
        "   3.5 Acompanhamento de Pedido (pedido.html)",
        "4. PDV - Frente de Caixa (pdv/index.html)",
        "5. Painel Administrativo",
        "   5.1 Dashboard (admin/index.html)",
        "   5.2 Gestao de Usuarios (admin/usuarios.html)",
        "   5.3 Cadastro Inteligente com IA (admin/cadastro-produto.html)",
        "   5.4 Configuracao Firebase (admin/setup.html)",
        "6. Arquitetura e Tecnologias",
        "7. APIs e Integracoes (Gemini, D-ID, LTX)",
        "8. Configuracao de API Keys",
        "9. Fluxo de Teste Completo",
        "10. Deploy e Ambiente",
        "11. Seguranca e Regras do Firestore",
        "12. Perguntas Frequentes (FAQ)",
    ]
    for item in indice:
        indent = 20 if item.startswith("   ") else 0
        story.append(Paragraph(item.strip(), ParagraphStyle('idx', parent=s_body,
            leftIndent=indent, spaceBefore=2, spaceAfter=2)))

    story.append(PageBreak())

    # ============ 1. COMO COMECAR ============
    story.append(Paragraph("1. COMO COMECAR (PRIMEIRO ACESSO)", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(Paragraph(
        "O Clube do Natural usa login com conta Google. Nao precisa criar conta nova — "
        "basta ter uma conta Google (Gmail) e clicar em um botao. Simples assim!", s_body))

    # 1.1 Login
    story.append(Paragraph("1.1 Fazer Login com Google", s_h2))
    story.append(Paragraph(
        "Todas as paginas do sistema exigem login. Quando voce acessar qualquer pagina "
        "sem estar logado, sera redirecionado automaticamente para a tela de login.", s_body))

    story.append(Paragraph("Passo a passo:", s_h3))
    for i, item in enumerate([
        "Abra o site do Clube do Natural no navegador",
        "Voce sera redirecionado para a tela de login",
        "Clique no botao 'Entrar com Google'",
        "Uma janela popup vai abrir pedindo para escolher sua conta Google",
        "Escolha sua conta Google (Gmail)",
        "Pronto! Voce esta logado e sera redirecionado para o sistema",
    ], 1):
        story.append(Paragraph(f"<bullet>{i}.</bullet> {item}", s_step))

    story.append(Paragraph(
        "DICA: Use o navegador Chrome para melhor compatibilidade. O login funciona "
        "em qualquer dispositivo — celular, tablet ou computador.", s_tip))

    # 1.2 Primeiro usuario
    story.append(Paragraph("1.2 Primeiro Usuario = Dono (Voce!)", s_h2))
    story.append(Paragraph(
        "O PRIMEIRO usuario a fazer login no sistema se torna automaticamente o DONO. "
        "Isso significa que voce tera acesso total a tudo — e so voce pode aprovar "
        "outros usuarios.", s_body))

    story.append(Paragraph(
        "IMPORTANTE: A primeira pessoa a fazer login vira o dono do sistema. Certifique-se "
        "de que VOCE faca o primeiro login antes de compartilhar o link com funcionarios!", s_alert))

    what_happens = [
        ['O que acontece', 'Detalhes'],
        ['Primeiro login', 'Voce e registrado automaticamente como "dono" com acesso total'],
        ['Seus dados ficam salvos', 'Nome, email e foto do Google ficam no banco de dados'],
        ['Pode aprovar outros', 'Novos usuarios precisam da SUA aprovacao para entrar'],
        ['Pode mudar cargos', 'Voce define quem e gerente, atendente, caixa, etc.'],
    ]
    story.append(make_table(what_happens, [120, 320]))

    # 1.3 Aprovar usuarios
    story.append(Paragraph("1.3 Aprovar Novos Usuarios", s_h2))
    story.append(Paragraph(
        "Quando um funcionario ou colaborador faz login pela primeira vez, ele entra com "
        "status 'pendente'. Isso significa que ele NAO consegue usar o sistema ate voce aprovar.", s_body))

    story.append(Paragraph("Como aprovar:", s_h3))
    for i, item in enumerate([
        "Faca login como dono (sua conta Google)",
        "Va em Painel Admin > Usuarios (ou acesse /admin/usuarios.html)",
        "Voce vera a lista de usuarios pendentes (com fundo amarelo)",
        "Clique em 'Aprovar' no usuario que deseja liberar",
        "Escolha o cargo dele (gerente, atendente, caixa, etc.)",
        "Pronto! O usuario ja pode usar o sistema",
    ], 1):
        story.append(Paragraph(f"<bullet>{i}.</bullet> {item}", s_step))

    story.append(Paragraph(
        "Voce tambem pode REVOGAR o acesso de qualquer usuario a qualquer momento "
        "na mesma tela de gestao de usuarios.", s_tip))

    story.append(PageBreak())

    # ============ 2. CARGOS E PERMISSOES ============
    story.append(Paragraph("2. CARGOS E PERMISSOES", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(Paragraph(
        "Cada pessoa que usa o sistema tem um cargo. O cargo define o que ela pode ver e fazer. "
        "Isso protege o sistema — um atendente nao acessa o financeiro, por exemplo.", s_body))

    cargos = [
        ['Cargo', 'O que pode fazer', 'Quem e'],
        ['Dono', 'TUDO — acesso total ao sistema inteiro', 'Voce (proprietario)'],
        ['Gerente', 'Pedidos + Estoque + Caixa + Relatorios da loja', 'Responsavel pela filial'],
        ['Atendente', 'Ver pedidos e mudar status (Novo > Preparando > Pronto)', 'Quem atende o balcao'],
        ['Caixa', 'Pedidos + PDV (frente de caixa)', 'Quem opera o caixa'],
        ['Estoquista', 'Controle de estoque (entradas, saidas, transferencias)', 'Responsavel pelo estoque'],
        ['Motoboy', 'Lista de entregas pendentes', 'Entregador'],
        ['Pendente', 'NADA — so ve tela de "aguardando aprovacao"', 'Quem acabou de se cadastrar'],
    ]
    story.append(make_table(cargos, [70, 230, 140]))

    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Como dono, voce pode mudar o cargo de qualquer usuario a qualquer momento. "
        "Para isso, va em Admin > Usuarios e clique em 'Alterar Cargo'.", s_tip))

    story.append(Paragraph("Fluxo de acesso resumido:", s_h3))
    flow_data = [
        ['Passo', 'O que acontece'],
        ['1. Login', 'Funcionario clica "Entrar com Google"'],
        ['2. Registro', 'Sistema cria registro com status "pendente"'],
        ['3. Espera', 'Funcionario ve tela: "Aguardando aprovacao do administrador"'],
        ['4. Aprovacao', 'Dono acessa admin/usuarios e clica "Aprovar"'],
        ['5. Cargo', 'Dono define cargo (gerente, atendente, etc.)'],
        ['6. Acesso', 'Funcionario faz login novamente e ja pode usar o sistema'],
    ]
    story.append(make_table(flow_data, [60, 380]))

    story.append(PageBreak())

    # ============ 3. PAGINAS DO SISTEMA ============
    story.append(Paragraph("3. PAGINAS DO SISTEMA", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    # 3.1 Login
    story.append(Paragraph("3.1 Tela de Login", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'login.html'],
        ['URL', '/login'],
        ['Funcao', 'Autenticacao com conta Google'],
        ['Requer login?', 'Nao (e a propria tela de login)'],
    ], [100, 340]))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Esta e a primeira tela que qualquer usuario ve. Tem um unico botao grande: "
        "'Entrar com Google'. Apos o login, o usuario e redirecionado para a pagina "
        "que tentou acessar originalmente.", s_body))

    story.append(Paragraph("O que a tela mostra:", s_h3))
    for item in [
        "Logo do Clube do Natural",
        "Botao 'Entrar com Google' (verde, grande, facil de achar)",
        "Se o usuario esta pendente: mensagem 'Aguardando aprovacao do administrador'",
        "Se o Firebase nao esta configurado: link para /admin/setup.html",
    ]:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", s_bullet))

    story.append(Spacer(1, 8))

    # 3.2 Landing
    story.append(Paragraph("3.2 Landing Page (Pagina Inicial)", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'index.html'],
        ['URL', '/ (raiz do site)'],
        ['Funcao', 'Pagina de marketing — vitrine da loja'],
        ['Requer login?', 'Sim (redireciona para /login se nao logado)'],
    ], [100, 340]))
    story.append(Spacer(1, 6))

    for item in [
        "Hero section com chamada para acao e botao 'Ver Catalogo'",
        "Secao de beneficios dos produtos naturais com icones",
        "Categorias de produtos com navegacao",
        "Prova social (depoimentos e badges de confianca)",
        "Botao flutuante WhatsApp para contato direto",
        "Design viral — visual bonito para compartilhar",
    ]:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", s_bullet))

    story.append(Spacer(1, 8))

    # 3.3 Catalogo
    story.append(Paragraph("3.3 Catalogo Inteligente", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'catalogo.html'],
        ['URL', '/catalogo'],
        ['Funcao', 'Vitrine de produtos com busca, filtros e info inteligente'],
        ['Requer login?', 'Sim'],
    ], [100, 340]))
    story.append(Spacer(1, 6))

    for item in [
        "Cards de produtos com foto, nome, preco e selos (organico, vegano, sem gluten)",
        "Barra de busca inteligente (por nome, categoria ou descricao)",
        "Filtros por categoria e por selos",
        "Detalhe do produto: beneficios, como usar, info nutricional, curiosidade",
        "Secao 'Combina Com' — sugestao cruzada (cross-sell)",
        "Botao 'Compartilhar no WhatsApp' em cada produto",
        "Carrinho lateral com resumo e total",
    ]:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", s_bullet))

    story.append(PageBreak())

    # 3.4 Checkout
    story.append(Paragraph("3.4 Checkout (Finalizar Compra)", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'checkout.html'],
        ['URL', '/checkout'],
        ['Funcao', 'Finalizacao de compra em 4 etapas'],
        ['Requer login?', 'Sim'],
    ], [100, 340]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("As 4 etapas do checkout:", s_h3))
    for i, item in enumerate([
        "Dados pessoais (nome, celular, email)",
        "Endereco de entrega",
        "Forma de pagamento (Pix, Cartao, Dinheiro)",
        "Confirmacao e resumo do pedido",
    ], 1):
        story.append(Paragraph(f"<bullet>{i}.</bullet> {item}", s_step))

    # 3.5 Pedido
    story.append(Paragraph("3.5 Acompanhamento de Pedido", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'pedido.html'],
        ['URL', '/pedido'],
        ['Funcao', 'Confirmacao e acompanhamento apos checkout'],
        ['Requer login?', 'Sim'],
    ], [100, 340]))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Exibe numero do pedido, status atual, itens comprados e valor total. "
        "Permite enviar confirmacao por WhatsApp.", s_body))

    story.append(PageBreak())

    # ============ 4. PDV ============
    story.append(Paragraph("4. PDV - FRENTE DE CAIXA", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'pdv/index.html'],
        ['URL', '/pdv'],
        ['Funcao', 'Sistema de Ponto de Venda completo e offline'],
        ['Requer login?', 'Sim (cargo: caixa, gerente ou dono)'],
        ['Funciona offline?', 'SIM - funciona 100% sem internet (IndexedDB)'],
    ], [120, 320]))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "O PDV e a tela que o caixa usa no dia a dia. Funciona como um app de caixa "
        "registradora digital. Mesmo sem internet, as vendas sao salvas e sincronizadas "
        "depois automaticamente.", s_body))

    story.append(Paragraph("O que o PDV faz:", s_h3))
    for item in [
        "Busca de produtos por nome ou codigo de barras",
        "Scanner de codigo de barras e QR Code via camera do celular/tablet",
        "Venda a granel por peso — digita o peso e calcula automaticamente",
        "Carrinho com quantidade editavel e remocao de itens",
        "Multiplas formas de pagamento: Dinheiro, Debito, Credito, Pix",
        "Calculo automatico de troco (pagamento em dinheiro)",
        "Geracao de QR Code e impressao de etiquetas",
        "Fila de sincronizacao — vendas offline sincronizam quando voltar a internet",
    ]:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", s_bullet))

    story.append(Paragraph("Como usar o PDV (passo a passo):", s_h3))
    for i, item in enumerate([
        "Faca login e acesse /pdv",
        "Busque o produto digitando o nome ou escaneie o codigo de barras",
        "Clique no produto para adicionar ao carrinho",
        "Para produto a granel: clique no produto e digite o peso (ex: 0.350 kg)",
        "Ajuste quantidades no carrinho se necessario (+/-)",
        "Selecione a forma de pagamento",
        "Para dinheiro: informe o valor recebido e confira o troco",
        "Clique 'Finalizar Venda'",
    ], 1):
        story.append(Paragraph(f"<bullet>{i}.</bullet> {item}", s_step))

    story.append(Paragraph("Atalhos do PDV:", s_h3))
    atalhos = [
        ['Acao', 'Como Fazer'],
        ['Buscar produto', 'Digitar na barra de busca'],
        ['Escanear codigo', 'Clicar icone de camera'],
        ['Alterar quantidade', 'Clicar +/- no carrinho'],
        ['Remover item', 'Clicar X no item do carrinho'],
        ['Venda a granel', 'Selecionar produto, digitar peso'],
        ['Gerar QR Code', 'Clicar icone QR no produto'],
        ['Imprimir etiqueta', 'Clicar icone impressora'],
    ]
    story.append(make_table(atalhos, [140, 300]))

    story.append(PageBreak())

    # ============ 5. ADMIN ============
    story.append(Paragraph("5. PAINEL ADMINISTRATIVO", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(Paragraph(
        "O painel admin e o cerebro do negocio. Apenas usuarios com cargo de dono ou "
        "gerente tem acesso completo. Cada cargo ve apenas as funcoes liberadas para ele.", s_body))

    # 5.1 Dashboard
    story.append(Paragraph("5.1 Dashboard (Painel Principal)", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'admin/index.html'],
        ['URL', '/admin'],
        ['Funcao', 'Painel central com KPIs, graficos e navegacao'],
        ['Acesso', 'Dono e Gerente'],
    ], [100, 340]))
    story.append(Spacer(1, 6))

    for item in [
        "Cards KPI: Vendas hoje (R$), Pedidos hoje, Ticket medio, Estoque baixo",
        "Sidebar (menu lateral) com navegacao para todas as areas",
        "Link rapido 'Cadastro IA' para cadastrar produto por foto",
        "Link rapido 'Usuarios' para gerenciar equipe",
        "Graficos de vendas e desempenho",
        "Alertas de estoque baixo",
    ]:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", s_bullet))

    story.append(Paragraph("Menu lateral do Admin:", s_h3))
    sidebar = [
        ['Link', 'URL', 'Funcao'],
        ['Dashboard', '/admin', 'Painel principal com KPIs'],
        ['Usuarios', '/admin/usuarios', 'Aprovar, revogar e gerenciar equipe'],
        ['Cadastro IA', '/admin/cadastro-produto', 'Cadastrar produto tirando foto'],
        ['Pedidos', '/admin (secao)', 'Central de pedidos'],
        ['Estoque', '/admin (secao)', 'Controle de estoque'],
        ['Caixa', '/admin (secao)', 'Livro caixa'],
        ['PDV', '/pdv', 'Frente de caixa'],
        ['Config Firebase', '/admin/setup', 'Configurar conexao com banco'],
    ]
    story.append(make_table(sidebar, [100, 130, 210]))

    story.append(Spacer(1, 10))

    # 5.2 Usuarios
    story.append(Paragraph("5.2 Gestao de Usuarios", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'admin/usuarios.html'],
        ['URL', '/admin/usuarios'],
        ['Funcao', 'Gerenciar equipe — aprovar, alterar cargo, revogar acesso'],
        ['Acesso', 'Apenas DONO'],
    ], [100, 340]))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Esta e uma das paginas mais importantes do sistema. Aqui voce controla QUEM pode "
        "acessar o sistema e O QUE cada pessoa pode fazer.", s_body))

    story.append(Paragraph("O que voce pode fazer nessa tela:", s_h3))
    for item in [
        "Ver lista de todos os usuarios (com foto, nome, email e cargo)",
        "Usuarios pendentes aparecem com fundo amarelo no topo",
        "Aprovar um usuario pendente (definir cargo dele)",
        "Alterar o cargo de um usuario ja aprovado",
        "Revogar acesso de um usuario (ele nao consegue mais entrar)",
        "Ver quando o usuario foi criado no sistema",
    ]:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", s_bullet))

    story.append(Paragraph(
        "SEGURANCA: Apenas o dono pode acessar esta pagina. Nem gerentes tem acesso "
        "a gestao de usuarios. Isso garante que ninguem mude permissoes sem sua autorizacao.", s_alert))

    story.append(PageBreak())

    # 5.3 Cadastro IA
    story.append(Paragraph("5.3 Cadastro Inteligente de Produtos com IA", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'admin/cadastro-produto.html'],
        ['URL', '/admin/cadastro-produto'],
        ['Funcao', 'Cadastrar produto tirando uma foto — a IA preenche tudo'],
        ['IA', 'Google Gemini 2.0 Flash (gratis)'],
        ['Acesso', 'Dono e Gerente'],
    ], [100, 340]))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Esta e a pagina mais avancada do sistema. Voce tira uma foto do produto e a "
        "Inteligencia Artificial preenche automaticamente TODOS os campos: nome, descricao, "
        "beneficios, como usar, info nutricional, curiosidade e muito mais.", s_body))

    story.append(Paragraph("Fluxo das 5 Etapas:", s_h3))
    etapas_data = [
        ['Etapa', 'Nome', 'O que acontece'],
        ['1', 'Foto', 'Tire foto com camera, selecione da galeria ou arraste a imagem'],
        ['2', 'IA Analisa', 'Gemini analisa a foto e extrai todas as informacoes do produto'],
        ['3', 'Formulario', '29 campos preenchidos pela IA — voce confere e ajusta o preco'],
        ['4', 'Preview', 'Ve como o produto vai aparecer no catalogo'],
        ['5', 'Salvar', 'Salva o produto. Opcao de gerar video com avatar ou cinematografico'],
    ]
    story.append(make_table(etapas_data, [40, 60, 340]))

    story.append(Paragraph("Como usar (passo a passo):", s_h3))
    for i, item in enumerate([
        "Abra /admin/cadastro-produto",
        "PRIMEIRO: configure a chave Gemini (secao 'Configuracao de IA') - veja capitulo 8",
        "Tire foto de um produto natural (ou selecione da galeria do celular)",
        "Clique 'Analisar com Gemini AI' e aguarde a barra de progresso",
        "Confira os campos preenchidos automaticamente e ajuste o preco",
        "Avance para Preview e veja como vai ficar no catalogo",
        "Clique Salvar. Pronto! Produto cadastrado.",
        "Opcional: gere um video de apresentacao com D-ID ou LTX Studio",
    ], 1):
        story.append(Paragraph(f"<bullet>{i}.</bullet> {item}", s_step))

    story.append(Spacer(1, 8))

    # 5.4 Setup Firebase
    story.append(Paragraph("5.4 Configuracao Firebase (Setup)", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Arquivo', 'admin/setup.html'],
        ['URL', '/admin/setup'],
        ['Funcao', 'Configurar conexao com Firebase (banco de dados)'],
        ['Acesso', 'Publico (nao exige login — usado na configuracao inicial)'],
    ], [100, 340]))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Esta pagina serve para configurar o Firebase caso precise alterar as credenciais. "
        "Na maioria dos casos, o Firebase ja vem configurado e voce NAO precisa mexer aqui.", s_body))

    story.append(Paragraph(
        "ATENCAO: Esta pagina ja vem com o Firebase configurado. Voce so precisa acessar "
        "aqui se for mudar o projeto Firebase (situacao rara). No uso normal, IGNORE esta pagina.", s_info))

    story.append(PageBreak())

    # ============ 6. ARQUITETURA ============
    story.append(Paragraph("6. ARQUITETURA E TECNOLOGIAS", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(Paragraph(
        "Para quem tem curiosidade tecnica, aqui esta como o sistema funciona por dentro. "
        "Se voce so quer usar o sistema, pode pular este capitulo.", s_body))

    arch_data = [
        ['Camada', 'Tecnologia', 'Para que serve'],
        ['Frontend', 'HTML5 + CSS3 + JS', 'As paginas que voce ve e usa'],
        ['Autenticacao', 'Firebase Auth (Google)', 'Login com conta Google'],
        ['Banco de Dados', 'Firebase Firestore', 'Armazena tudo na nuvem (com backup offline)'],
        ['Regiao', 'southamerica-east1', 'Servidor em Sao Paulo (rapido no Brasil)'],
        ['Dados Offline', 'IndexedDB + Firestore Cache', 'Funciona sem internet'],
        ['PWA', 'Service Worker + Manifest', 'Instala como app no celular'],
        ['IA - Produto', 'Google Gemini 2.0 Flash', 'Analisa foto e preenche cadastro'],
        ['IA - OCR', 'Tesseract.js v5', 'Le texto de fotos (fallback)'],
        ['IA - Video', 'D-ID + LTX Studio', 'Gera videos de apresentacao'],
        ['Scanner', 'Camera API + ZXing', 'Le codigo de barras e QR Code'],
        ['Deploy', 'Vercel', 'Publica o site automaticamente'],
    ]
    story.append(make_table(arch_data, [80, 140, 220]))

    story.append(Paragraph("Estrutura de Arquivos Principais:", s_h3))
    files = [
        "login.html .............. Tela de login Google",
        "index.html .............. Landing page (pagina inicial)",
        "catalogo.html ........... Catalogo de produtos",
        "checkout.html ........... Finalizar compra",
        "pedido.html ............. Acompanhamento de pedido",
        "pdv/index.html .......... Frente de caixa (PDV)",
        "admin/index.html ........ Dashboard administrativo",
        "admin/usuarios.html ..... Gestao de usuarios/equipe",
        "admin/cadastro-produto.html  Cadastro com IA",
        "admin/setup.html ........ Config Firebase (avancado)",
        "js/core/firebase-config.js .. Conexao com Firebase",
        "js/core/firebase-auth.js .... Sistema de login e cargos",
        "js/admin/usuarios.js ........ Logica de gestao de usuarios",
        "sw.js ................... Service Worker (offline)",
        "manifest.json ........... Config PWA",
    ]
    for f in files:
        story.append(Paragraph(f, s_code))

    story.append(PageBreak())

    # ============ 7. APIs ============
    story.append(Paragraph("7. APIs E INTEGRACOES", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(Paragraph(
        "O sistema usa servicos externos para funcoes avancadas. Todas sao opcionais "
        "exceto o Firebase (que ja vem configurado).", s_body))

    # Firebase
    story.append(Paragraph("7.1 Firebase (Banco de Dados + Login)", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Servico', 'Firebase Authentication + Firestore'],
        ['Provedor de Login', 'Google (conta Gmail)'],
        ['Banco de Dados', 'Cloud Firestore (NoSQL)'],
        ['Regiao', 'southamerica-east1 (Sao Paulo)'],
        ['Preco', 'Gratis para uso normal (plano Spark)'],
        ['Projeto', 'clube-do-natural'],
        ['Status', 'JA CONFIGURADO — nao precisa mexer'],
    ], [120, 320]))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "O Firebase e o coracao do sistema. Ele cuida de duas coisas: (1) o login com Google "
        "e (2) o banco de dados onde ficam salvos usuarios, produtos, pedidos e tudo mais. "
        "Ele ja vem configurado — voce nao precisa fazer nada.", s_body))

    # Gemini
    story.append(Paragraph("7.2 Google Gemini AI (Cadastro por Foto)", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['Modelo', 'gemini-2.0-flash'],
        ['Tipo', 'IA Multimodal (entende fotos + texto)'],
        ['Preco', 'Gratis (com limite generoso)'],
        ['Uso no sistema', 'Voce tira foto do produto e a IA preenche tudo'],
        ['Precisa configurar?', 'SIM — precisa de uma chave API (veja capitulo 8)'],
    ], [120, 320]))

    # D-ID
    story.append(Paragraph("7.3 D-ID (Video com Avatar Falante)", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['O que faz', 'Cria um video com uma pessoa virtual apresentando seu produto'],
        ['Voz', 'Portugues brasileiro (voz feminina natural)'],
        ['Preco', '5 minutos gratis / depois ~$5.90/mes'],
        ['Precisa configurar?', 'SIM — precisa de chave API (veja capitulo 8)'],
        ['Obrigatorio?', 'NAO — e um extra. O sistema funciona sem isso'],
    ], [120, 320]))

    # LTX
    story.append(Paragraph("7.4 LTX Studio (Video Cinematografico)", s_h2))
    story.append(make_info_table([
        ['Propriedade', 'Valor'],
        ['O que faz', 'Cria um video profissional do produto (tipo comercial de TV)'],
        ['Resolucoes', 'Horizontal (16:9), Vertical (9:16), Quadrado (1:1)'],
        ['Preco', '800 creditos gratis / depois $15/mes'],
        ['Precisa configurar?', 'SIM — precisa de chave API (veja capitulo 8)'],
        ['Obrigatorio?', 'NAO — e um extra. O sistema funciona sem isso'],
    ], [120, 320]))

    story.append(PageBreak())

    # ============ 8. CONFIG API KEYS ============
    story.append(Paragraph("8. CONFIGURACAO DE API KEYS (CHAVES)", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(Paragraph(
        "Chaves de API sao como senhas que permitem o sistema usar servicos externos. "
        "Voce precisa configurar apenas UMA VEZ por navegador. As chaves ficam salvas "
        "no seu navegador.", s_body))

    story.append(Paragraph(
        "IMPORTANTE: O Firebase ja vem configurado. Voce NAO precisa configurar chave "
        "nenhuma para o login e banco de dados funcionarem. As chaves abaixo sao apenas "
        "para funcoes EXTRAS (cadastro por foto e video).", s_info))

    # Gemini key
    story.append(Paragraph("8.1 Chave do Google Gemini (para cadastro por foto)", s_h2))
    story.append(Paragraph("Essa e a unica chave recomendada configurar. E gratis!", s_body))
    for i, item in enumerate([
        "Acesse: aistudio.google.com/apikey (no navegador)",
        "Faca login com sua conta Google",
        "Clique em 'Create API Key' (Criar Chave)",
        "Selecione um projeto (ou crie um novo)",
        "Copie a chave gerada (comeca com 'AIza...')",
        "No sistema: abra /admin/cadastro-produto",
        "Cole a chave no campo 'Configuracao de IA' e clique Salvar",
    ], 1):
        story.append(Paragraph(f"<bullet>{i}.</bullet> {item}", s_step))

    story.append(Paragraph(
        "DICA: O Gemini e gratis com um limite generoso. Para uma loja normal, "
        "voce nao vai precisar pagar nada.", s_tip))

    # D-ID key
    story.append(Paragraph("8.2 Chave do D-ID (opcional — video com avatar)", s_h2))
    for i, item in enumerate([
        "Acesse: studio.d-id.com",
        "Crie uma conta gratuita",
        "Va em Settings > API Keys",
        "Clique 'Generate' para criar uma chave",
        "Cole no sistema: na secao de video (etapa 5 do cadastro), aba D-ID",
    ], 1):
        story.append(Paragraph(f"<bullet>{i}.</bullet> {item}", s_step))

    # LTX key
    story.append(Paragraph("8.3 Chave do LTX Studio (opcional — video cinematografico)", s_h2))
    for i, item in enumerate([
        "Acesse: console.ltx.video",
        "Crie uma conta gratuita",
        "Va em Developer Console > Create API Key",
        "Cole no sistema: na secao de video (etapa 5 do cadastro), aba LTX",
    ], 1):
        story.append(Paragraph(f"<bullet>{i}.</bullet> {item}", s_step))

    story.append(Paragraph("Resumo das chaves:", s_h3))
    keys_data = [
        ['Chave', 'Obrigatoria?', 'Preco', 'Onde configurar'],
        ['Firebase', 'Sim (ja vem pronta)', 'Gratis', 'Ja configurado!'],
        ['Gemini AI', 'Recomendada', 'Gratis', '/admin/cadastro-produto'],
        ['D-ID', 'Opcional', '5 min gratis', '/admin/cadastro-produto (video)'],
        ['LTX Studio', 'Opcional', '800 cred. gratis', '/admin/cadastro-produto (video)'],
    ]
    story.append(make_table(keys_data, [70, 100, 90, 180]))

    story.append(Paragraph(
        "ATENCAO: As chaves ficam salvas apenas no navegador onde foram configuradas. "
        "Se trocar de navegador ou limpar os dados, precisa configurar novamente.", s_alert))

    story.append(PageBreak())

    # ============ 9. FLUXO DE TESTE ============
    story.append(Paragraph("9. FLUXO DE TESTE COMPLETO", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(Paragraph(
        "Siga este roteiro na ordem para testar todas as funcionalidades:", s_body))

    testes = [
        ("Teste 1: Primeiro Login (DONO)", [
            "Abra o site no navegador Chrome",
            "Voce sera redirecionado para /login",
            "Clique 'Entrar com Google'",
            "Escolha SUA conta Google (a do dono)",
            "Voce sera aprovado automaticamente como DONO",
            "Confirme que foi redirecionado para a pagina principal",
        ]),
        ("Teste 2: Aprovar um Funcionario", [
            "Peca para um funcionario acessar o site",
            "Ele faz login com o Google dele",
            "Ele vera mensagem: 'Aguardando aprovacao'",
            "Voce (dono) acessa /admin/usuarios",
            "Encontre o funcionario na lista de pendentes (fundo amarelo)",
            "Clique 'Aprovar' e escolha o cargo",
            "Peca para o funcionario recarregar a pagina — ele ja tem acesso",
        ]),
        ("Teste 3: Landing Page", [
            "Abrir a URL raiz do site (estando logado)",
            "Verificar visual verde/bege com logo",
            "Testar em celular (375px) e tablet (768px)",
            "Clicar 'Ver Catalogo'",
            "Clicar botao WhatsApp",
        ]),
        ("Teste 4: Catalogo", [
            "Navegar pelos produtos",
            "Buscar 'chia' na barra de busca",
            "Filtrar por categoria",
            "Abrir detalhes de um produto",
            "Verificar beneficios, como usar, curiosidade",
            "Adicionar 2-3 produtos ao carrinho",
        ]),
        ("Teste 5: Checkout", [
            "Ir para checkout com itens no carrinho",
            "Preencher dados pessoais, endereco e pagamento",
            "Confirmar pedido",
            "Verificar pagina de confirmacao",
        ]),
        ("Teste 6: PDV (Frente de Caixa)", [
            "Abrir /pdv (precisa estar logado como caixa, gerente ou dono)",
            "Buscar produto pelo nome",
            "Adicionar ao carrinho",
            "Testar produto a granel (digitar peso 0.350 kg)",
            "Selecionar pagamento e finalizar venda",
            "Testar scanner de codigo de barras (icone camera)",
        ]),
        ("Teste 7: PDV Offline", [
            "Desconectar a internet do dispositivo",
            "Fazer uma venda no PDV",
            "Verificar que funciona normalmente",
            "Reconectar e verificar sincronizacao",
        ]),
        ("Teste 8: Cadastro com IA (se tiver chave Gemini)", [
            "Abrir /admin/cadastro-produto",
            "Configurar chave Gemini se ainda nao configurou",
            "Tirar foto de um produto natural",
            "Clicar 'Analisar com Gemini AI'",
            "Verificar campos preenchidos automaticamente",
            "Salvar produto",
        ]),
        ("Teste 9: PWA (Instalar como App)", [
            "Abrir o site no Chrome do celular",
            "Verificar se aparece banner 'Instalar app'",
            "Instalar e abrir pelo icone na tela inicial",
        ]),
    ]

    for titulo, itens in testes:
        story.append(Paragraph(titulo, s_h3))
        for item in itens:
            story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", s_bullet))
        story.append(Spacer(1, 4))

    story.append(PageBreak())

    # ============ 10. DEPLOY ============
    story.append(Paragraph("10. DEPLOY E AMBIENTE", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(Paragraph(
        "O deploy (publicacao) do site e automatico. Toda vez que o codigo e atualizado "
        "no GitHub, o Vercel publica automaticamente a nova versao em segundos.", s_body))

    story.append(Paragraph("Servidor Local (para desenvolvimento):", s_h2))
    story.append(Paragraph("cd clubedonatural && npx serve . -p 3000", s_code))
    story.append(Paragraph("Abrir: http://localhost:3000", s_code))

    story.append(Paragraph("Deploy em Producao (Vercel):", s_h2))
    story.append(Paragraph(
        "Cada 'git push' para a branch main publica automaticamente. Nao precisa fazer "
        "nada manualmente.", s_body))

    story.append(Paragraph("Configuracoes do Vercel:", s_h3))
    for item in [
        "Clean URLs ativadas (sem .html na URL — /catalogo em vez de /catalogo.html)",
        "Service Worker sempre atualizado",
        "Headers de seguranca configurados",
        "CORS habilitado para APIs",
    ]:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", s_bullet))

    story.append(Spacer(1, 16))

    # ============ 11. SEGURANCA ============
    story.append(Paragraph("11. SEGURANCA E REGRAS DO FIRESTORE", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    story.append(Paragraph(
        "O sistema tem varias camadas de seguranca para proteger seus dados:", s_body))

    seg_data = [
        ['Protecao', 'Como funciona'],
        ['Login obrigatorio', 'Ninguem acessa nada sem fazer login com Google'],
        ['Aprovacao manual', 'Novos usuarios precisam ser aprovados pelo dono'],
        ['Cargos/Permissoes', 'Cada cargo so ve o que precisa (atendente nao ve financeiro)'],
        ['Regras Firestore', 'O banco de dados rejeita qualquer acesso nao autorizado'],
        ['Dados por usuario', 'Cada usuario so le seu proprio perfil'],
        ['Admin protegido', 'Apenas o dono pode aprovar usuarios e mudar cargos'],
        ['Offline seguro', 'Dados offline ficam criptografados no dispositivo'],
    ]
    story.append(make_table(seg_data, [120, 320]))

    story.append(Paragraph("Regras do banco de dados (Firestore):", s_h3))
    story.append(Paragraph(
        "O Firestore tem regras de seguranca que funcionam assim:", s_body))
    for item in [
        "Usuarios: cada pessoa so pode ler seus proprios dados. Apenas o dono pode editar dados de outros.",
        "Colecoes gerais (produtos, pedidos, etc.): qualquer usuario APROVADO pode ler. Apenas o dono pode escrever.",
        "Usuarios nao aprovados (pendentes) nao conseguem ler nenhum dado do sistema.",
        "Usuarios nao logados nao conseguem acessar absolutamente nada.",
    ]:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {item}", s_bullet))

    story.append(PageBreak())

    # ============ 12. FAQ ============
    story.append(Paragraph("12. PERGUNTAS FREQUENTES (FAQ)", s_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN_LT, spaceAfter=10))

    faqs = [
        ("Preciso pagar alguma coisa?",
         "Nao! O sistema e 100% gratuito para uso normal. Firebase tem plano gratis generoso, "
         "Gemini e gratis, e o Vercel tambem. So paga se quiser gerar MUITOS videos (D-ID/LTX)."),

        ("E se eu perder a internet na loja?",
         "O PDV (frente de caixa) funciona 100% offline. As vendas sao salvas no dispositivo "
         "e sincronizadas automaticamente quando a internet voltar."),

        ("Posso usar no celular?",
         "Sim! O sistema e uma PWA — voce pode instalar no celular como um app. Funciona "
         "em Android e iPhone."),

        ("Como adiciono um novo funcionario?",
         "1) Envie o link do site para ele. 2) Ele faz login com o Google dele. 3) Voce "
         "acessa /admin/usuarios e aprova com o cargo certo."),

        ("E se eu quiser remover um funcionario?",
         "Acesse /admin/usuarios, encontre o funcionario e clique 'Revogar Acesso'. Ele "
         "nao conseguira mais entrar no sistema."),

        ("Preciso configurar o Firebase?",
         "NAO! O Firebase ja vem configurado. Voce so precisa fazer login com Google na "
         "primeira vez — o resto e automatico."),

        ("A chave do Gemini e obrigatoria?",
         "So se voce quiser usar o cadastro por foto (IA). O resto do sistema funciona "
         "perfeitamente sem ela. Mas e gratis e recomendamos configurar."),

        ("Quem pode ver o painel admin?",
         "Apenas usuarios com cargo de dono ou gerente. Outros cargos so veem as funcoes "
         "especificas do cargo deles."),

        ("Os dados ficam seguros?",
         "Sim! Os dados ficam no Firebase (Google Cloud), que e o mesmo servico usado por "
         "grandes empresas. Tem backup automatico, criptografia e servidores no Brasil."),

        ("Posso ter mais de uma loja?",
         "Sim! O sistema suporta multiplas lojas (filiais). Cada loja pode ter seu proprio "
         "estoque e equipe."),
    ]

    for pergunta, resposta in faqs:
        story.append(Paragraph(f"P: {pergunta}", ParagraphStyle('faq_q', parent=s_body,
            fontSize=10, textColor=GREEN_DARK, spaceBefore=10, spaceAfter=2)))
        story.append(Paragraph(f"R: {resposta}", ParagraphStyle('faq_a', parent=s_body,
            fontSize=10, textColor=GRAY, leftIndent=10, spaceAfter=6)))

    story.append(Spacer(1, 20))

    # ============ RODAPE FINAL ============
    story.append(HRFlowable(width="100%", thickness=2, color=GREEN_LT, spaceAfter=10))
    story.append(Paragraph(
        "Esse tutorial cobre tudo que voce precisa saber para usar o sistema. "
        "Se tiver duvidas, entre em contato pelo WhatsApp da loja.", s_body))
    story.append(Spacer(1, 20))
    story.append(Paragraph(f"Tutorial gerado em {datetime.now().strftime('%d/%m/%Y as %H:%M')}", s_footer))
    story.append(Paragraph("Clube do Natural — Todos os direitos reservados", s_footer))

    # Build
    doc.build(story)
    print(f"PDF gerado: {OUTPUT}")

if __name__ == '__main__':
    build()
