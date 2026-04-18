.PHONY: build test lint clean check install dev

# Build TypeScript to dist/
build:
	npm run build

# Run all tests
test:
	npx vitest run

# Run tests in watch mode
dev:
	npx vitest

# Type-check without emitting
lint:
	npx tsc --noEmit

# Build + test (CI gate)
check: lint test

# Remove build artifacts
clean:
	rm -rf dist

# Install dependencies
install:
	npm install
