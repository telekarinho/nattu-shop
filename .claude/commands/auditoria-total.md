---
description: "Auditoria total do projeto usando TODOS os agents e skills disponíveis. Gera relatório completo de melhorias."
---

# Auditoria Total do Projeto

Você tem acesso a **260 skills** em `~/.claude/skills/` e **155 agents** em `~/.claude/agents/`. Use TODOS os recursos relevantes para fazer uma auditoria completa deste projeto.

## Fase 1: Descoberta (leia o projeto)

1. Leia o README, CLAUDE.md, package.json, composer.json, ou qualquer arquivo de config na raiz
2. Identifique: stack técnica, tipo de projeto, público-alvo, modelo de negócio
3. Liste todos os diretórios e arquivos principais

## Fase 2: Selecione os melhores agents e skills

Com base no tipo de projeto, selecione os mais relevantes de cada categoria:

### Skills disponíveis (~/.claude/skills/):
**Marketing/SEO**: seo-content-audit, seo-opportunity-finder, seo-domain-analyzer, serp-feature-sniper, programmatic-seo-planner, topical-authority-mapper, aeo, landing-page-intel, content-brief-factory, brand-voice-extractor
**Ads**: ad-campaign-analyzer, ad-spend-allocator, ad-creative-intelligence, ad-angle-miner, ad-to-landing-page-auditor, google-search-ads-builder, paid-channel-prioritizer
**Competição**: competitor-intel, competitor-ad-teardown, competitor-content-tracker, competitive-pricing-intel, competitive-strategy-tracker
**Conversão**: messaging-ab-tester, review-scraper, cold-email-outreach
**Código**: agent-code-analyzer, agent-analyze-code-quality, agent-architecture, agent-code-review-swarm, agent-security-architect
**Infra**: agent-dev-backend-api, agent-automation-smart-agent, agent-benchmark-suite

### Agents disponíveis (~/.claude/agents/):
**Engineering**: engineering-frontend-developer, engineering-backend-architect, engineering-ai-engineer, engineering-devops-automator, engineering-security-engineer, engineering-code-reviewer, engineering-database-optimizer, engineering-sre
**Design**: design-ux-architect, design-ui-designer, design-brand-guardian, design-visual-storyteller
**Marketing**: marketing-growth-hacker, marketing-seo-specialist, marketing-content-creator
**Sales**: sales-discovery-coach, sales-proposal-strategist
**Product**: product-manager, product-analyst
**Testing**: testing-qa-engineer

## Fase 3: Execute a auditoria em paralelo

Lance subagents em paralelo (use Agent tool), cada um focado numa área:

### Agente 1: Qualidade de Código
- Leia os arquivos de código principal
- Analise: segurança, performance, boas práticas, code smells, bugs potenciais
- Use conhecimento de: engineering-code-reviewer, engineering-security-engineer, agent-code-analyzer

### Agente 2: SEO & Presença Online
- Analise meta tags, Schema.org, sitemaps, robots.txt, headings, internal linking
- Use conhecimento de: marketing-seo-specialist, seo-content-audit, seo-opportunity-finder
- Identifique: keywords faltando, content gaps, technical SEO issues

### Agente 3: UX/UI & Frontend
- Analise CSS, HTML, responsividade, acessibilidade, performance visual
- Use conhecimento de: design-ux-architect, design-ui-designer, engineering-frontend-developer
- Identifique: problemas de usabilidade, melhorias visuais, Core Web Vitals

### Agente 4: Conversão & Negócio
- Analise funil de vendas, CTAs, social proof, pricing, formulários
- Use conhecimento de: marketing-growth-hacker, sales-discovery-coach
- Identifique: friction points, oportunidades de conversão, quick wins

### Agente 5: Arquitetura & Infraestrutura
- Analise estrutura de diretórios, banco de dados, APIs, deploy, segurança
- Use conhecimento de: engineering-backend-architect, engineering-devops-automator, engineering-sre
- Identifique: problemas de escalabilidade, segurança, performance

### Agente 6: Conteúdo & Marketing
- Analise blog, copy, landing pages, social media, email
- Use conhecimento de: marketing-content-creator, brand-voice-extractor, content-brief-factory
- Identifique: gaps de conteúdo, oportunidades de crescimento orgânico

## Fase 4: Relatório Consolidado

Após TODOS os agentes terminarem, gere um relatório único salvo em `auditoria-total.md` na raiz do projeto:

```markdown
# Auditoria Total — [Nome do Projeto]
**Data:** [data]
**Skills utilizadas:** [lista]
**Agents consultados:** [lista]

## Score Geral: X/100

## Resumo Executivo (3-5 frases)

## Top 10 Problemas Críticos (resolver AGORA)
| # | Problema | Área | Impacto | Arquivo |
|---|---------|------|---------|---------|

## Top 10 Quick Wins (fácil de fazer, alto impacto)
| # | Melhoria | Área | Impacto | Esforço |
|---|---------|------|---------|---------|

## Top 10 Melhorias de Médio Prazo
| # | Melhoria | Área | Impacto | Esforço |
|---|---------|------|---------|---------|

## Detalhamento por Área

### Código (Score: X/100)
- [issues e recomendações]

### SEO (Score: X/100)
- [issues e recomendações]

### UX/UI (Score: X/100)
- [issues e recomendações]

### Conversão (Score: X/100)
- [issues e recomendações]

### Arquitetura (Score: X/100)
- [issues e recomendações]

### Conteúdo (Score: X/100)
- [issues e recomendações]

## Plano de Ação (próximos 30 dias)
- Semana 1: [ações]
- Semana 2: [ações]
- Semana 3: [ações]
- Semana 4: [ações]

## Quer que eu implemente as correções? (S/N)
```

## Regras
- Sempre leia o código ANTES de opinar
- Seja ESPECÍFICO — cite arquivos, linhas, o que mudar
- Priorize por IMPACTO no negócio (vendas > estética)
- Comunique em Português (Brasil)
- Use Agent tool para rodar análises em paralelo
- Pergunte ao usuário se quer implementar as correções ao final
