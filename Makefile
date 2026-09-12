.PHONY: help dev build clean update

help:
	@echo "Usage:"
	@echo "  make dev           # 启动开发服务器"
	@echo "  make build         # 构建生产版本"
	@echo "  make clean         # 清理构建产物"
	@echo "  make update VERSION=x.y.z  # 更新版本号"

dev:
	pnpm tauri dev

build:
	pnpm tauri build

clean:
	rm -rf src-tauri/target

update:
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make update VERSION=0.1.0"; \
		exit 1; \
	fi
	@NEW_VERSION=$$(printf "%s" "$(VERSION)" | sed 's/^v//'); \
	OLD_VERSION=$$(sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*/\1/p' package.json | head -n 1); \
	if [ -z "$$OLD_VERSION" ]; then \
		echo "Error: failed to detect current version from package.json"; \
		exit 1; \
	fi; \
	echo "Updating version $$OLD_VERSION -> $$NEW_VERSION"; \
	sed -i '' "s/$$OLD_VERSION/$$NEW_VERSION/g" package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src/components/SettingsPage.tsx README.md; \
	perl -0777 -i -pe 's/name = "Asumi Agent"\nversion = "[^"]+"/name = "Asumi Agent"\nversion = "'"$$NEW_VERSION"'"/' src-tauri/Cargo.lock; \
	echo "Update finished."