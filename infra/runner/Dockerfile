# hnch self-hosted GitHub Actions runner image.
# See ADR-0032 (architecture) and ADR-0033 (image base). Runbook in infra/README.md.
#
# Bumping: edit RUNNER_VERSION + RUNNER_SHA256 below. Look up the sha256 with:
#   gh release view --repo actions/runner v<VERSION> --json body \
#     --jq .body | grep -A1 "linux.*arm64"
# (the sha is in the release body between BEGIN/END SHA markers).

FROM debian:bookworm-slim

ARG RUNNER_VERSION=2.334.0
ARG RUNNER_SHA256=f44255bd3e80160eb25f71bc83d06ea025f6908748807a584687b3184759f7e4

# System deps: actions/runner needs libicu + bash + ca-certs + git.
# Playwright Chromium needs the libnss/libatk/etc. set.
# Node 22 from NodeSource APT (signed repo).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git unzip jq sudo \
      bash libicu72 \
      xvfb \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
      libcairo2 libasound2 libwayland-client0 libdbus-1-3 libdrm2; \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; \
    apt-get install -y --no-install-recommends nodejs; \
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

ENV PNPM_STORE_DIR=/cache/pnpm-store
ENV PLAYWRIGHT_BROWSERS_PATH=/cache/playwright

COPY --chown=runner:runner entrypoint.sh /home/runner/entrypoint.sh
ENTRYPOINT ["/home/runner/entrypoint.sh"]
