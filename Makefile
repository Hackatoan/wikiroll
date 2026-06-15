.PHONY: start deploy build up down logs

start:
	node src/index.js

deploy:
	node src/deploy-commands.js

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f wikiroll
