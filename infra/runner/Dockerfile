# hnch self-hosted GitHub Actions runner image.
# See ADR-0032 (architecture) and ADR-0033 (image base). Runbook in infra/README.md.
#
# Bumping: edit RUNNER_VERSION + RUNNER_SHA256 below. Look up the sha256 with:
#   gh release view --repo actions/runner v<VERSION> --json body \
#     --jq .body | grep -A1 "linux.*arm64"
# (the sha is in the release body between BEGIN/END SHA markers).

FROM debian:bookworm-slim

ARG RUNNER_VERSION=2.336.0
ARG RUNNER_SHA256=58b758e420b87093fbd4bfddd368074960053e2f1388f01848c82624b90f27d1

# System deps: actions/runner needs libicu + bash + ca-certs + git.
# Playwright Chromium needs the libnss/libatk/etc. set.
# Node 22 from NodeSource APT (signed repo).
# `gh` CLI is consumed by per-package semantic-release publishCmd
# (`gh workflow run deploy-*.yml --ref <tag>`) — see release.yml. Without
# it, release.yml exits 127 on the self-hosted pool. Hosted ubuntu-latest
# bakes gh in by default; we replicate that here from cli.github.com's
# signed apt repo.
# `openssh-client` provides ssh, scp, and ssh-keyscan. Unused since
# ADR-0054 removed the VPS deploys; drop it with the post-switch cleanup
# (docs/plans/cloudflare-hosting.md, Phase 3).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git unzip jq sudo zstd \
      openssh-client \
      bash libicu72 \
      xvfb \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
      libcairo2 libasound2 libwayland-client0 libdbus-1-3 libdrm2; \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; \
    apt-get install -y --no-install-recommends nodejs; \
    install -d -m 0755 /etc/apt/keyrings; \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
    chmod 0644 /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends gh; \
    rm -rf /var/lib/apt/lists/*

# Non-root runner user (uid 1000) so --userns=keep-id maps to host xau.
RUN useradd -m -u 1000 -s /bin/bash runner

# corepack enable writes pnpm/yarn shims into /usr/bin — needs root.
# The activation step (which downloads + caches the pinned pnpm version)
# runs as the runner user below so the cache lives under its $HOME.
RUN corepack enable

USER runner
WORKDIR /home/runner

# Download + verify + extract actions/runner.
RUN set -eux; \
    cd /home/runner; \
    curl -fsSL -o runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz"; \
    echo "${RUNNER_SHA256}  runner.tar.gz" | sha256sum -c -; \
    tar xzf runner.tar.gz; \
    rm runner.tar.gz

# Pin pnpm via corepack (runs as the runner user so the cache lives under $HOME).
RUN corepack prepare pnpm@9.15.0 --activate

# pnpm reads npm_config_* env vars as if they were .npmrc settings.
# PNPM_STORE_DIR (uppercase) is NOT honored by pnpm 9 — verified empirically:
# `pnpm config get store-dir` returned `undefined` and the store landed at
# /home/runner/.local/share/pnpm/store/v3, leaving the bind-mounted /cache/pnpm-store empty.
ENV npm_config_store_dir=/cache/pnpm-store
ENV PLAYWRIGHT_BROWSERS_PATH=/cache/playwright

COPY --chown=runner:runner entrypoint.sh /home/runner/entrypoint.sh
ENTRYPOINT ["/home/runner/entrypoint.sh"]
