\getenv app_password KAS_DB_PASSWORD
CREATE ROLE kas_web_app LOGIN PASSWORD :'app_password';
CREATE DATABASE kas_web_dev OWNER kas_web_app;
