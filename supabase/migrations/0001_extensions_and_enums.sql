set lock_timeout = '5s';
set statement_timeout = '120s';

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create type public.usuario_papel as enum ('proprietario', 'membro', 'platform_admin');
create type public.escritorio_status as enum ('onboarding', 'ativo', 'suspenso', 'inadimplente', 'cancelado');
create type public.caso_status as enum ('recebido', 'producao', 'qa', 'entregue');
create type public.caso_formato as enum ('tradicional', 'visual_law');
create type public.documento_tipo as enum ('cnis', 'peticao', 'anexo', 'timbrado', 'modelo');
create type public.qa_status as enum ('pendente', 'aprovado', 'ajustes');
create type public.assinatura_status as enum ('pendente', 'ativa', 'inadimplente', 'cancelada');
create type public.fatura_tipo as enum ('setup', 'mensal', 'addon');
create type public.fatura_status as enum ('pendente', 'paga', 'vencida', 'cancelada');
create type public.tese_status as enum ('rascunho', 'ativa', 'arquivada');
create type public.uso_status as enum ('reservada', 'concluida', 'falhou', 'cancelada');
