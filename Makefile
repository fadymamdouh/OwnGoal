.PHONY: validate export build test-py test-js test sim check help

help: ## Print each target with a one-line description
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

validate: ## Validate rules.json (must be 0 errors)
	@echo "── validate ──"
	python scripts/validate_rules.py

export: ## Regenerate rules.js and cards.js from rules.json
	@echo "── export rules.js ──"
	python scripts/export_rules_js.py
	@echo "── export cards.js ──"
	python scripts/export_web.py

build: export ## Export + rebuild offline HTML
	@echo "── build offline ──"
	python scripts/build_offline.py

test-py: ## Run Python engine tests
	@echo "── test-py ──"
	python scripts/test_engine.py

test-js: ## Run JS engine + rulebook tests
	@echo "── test-js: engine ──"
	node web/test-engine.mjs
	@echo "── test-js: rulebook ──"
	node web/test-rulebook.mjs

test: test-py test-js ## Run all tests

sim: ## Simulate 10k matches and print balance report
	@echo "── sim ──"
	python scripts/simulate.py

check: validate build test ## Full check: validate + build + test
