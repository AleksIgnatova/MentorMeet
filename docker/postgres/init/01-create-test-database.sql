-- Runs once, when the Postgres volume is first initialised.
-- Integration tests use this database so they can never touch development data.
CREATE DATABASE mentormeet_test;
