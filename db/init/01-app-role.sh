#!/bin/sh
# Cria a role de runtime da aplicação (não-superuser). Roda só em volume novo
# (docker-entrypoint-initdb.d). Em cluster existente, executar o DO $$ abaixo à mão.
# A migration Phase-0 (ADR-0025) faz os GRANTs e o REVOKE de audit_logs para esta role.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pdv_app') THEN
    CREATE ROLE pdv_app LOGIN PASSWORD '${PDV_APP_PASSWORD:-pdv_app}';
  END IF;
END
\$\$;
SQL
