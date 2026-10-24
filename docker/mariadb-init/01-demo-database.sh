#!/bin/bash
# Runs once, when the MariaDB volume is first created. The demo profile seeds a separate
# database, so its public keys never land in the database used for real traffic.
set -euo pipefail
mariadb -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS ai_unit_economics_demo;
GRANT ALL PRIVILEGES ON ai_unit_economics_demo.* TO '${MARIADB_USER}'@'%';
SQL
