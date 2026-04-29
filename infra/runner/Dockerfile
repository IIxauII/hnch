# IMPORTANT: the digest below is a placeholder. The image will not build until
# REPLACE_ME_WITH_DIGEST is replaced with the real sha256 digest of
# myoung34/github-runner:2.321.0 (resolved on the Mac mini at deploy time).
# This is intentional: it forces an explicit digest pin before first build.
# See infra/README.md "Bumping the runner base image" for the refresh cadence
# and the exact lookup procedure.
#
# Pinned to an immutable tag + digest. Bump in tandem on a documented schedule.
FROM myoung34/github-runner:2.321.0@sha256:REPLACE_ME_WITH_DIGEST

# Build-time only — RUN steps need root to apt-install. Image returns to
# the base's default user (uid 1000 `runner`) at the end so the runner
# agent (and every job step) executes as non-root.
USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg git unzip jq \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends \
      nodejs xvfb \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
      libcairo2 libasound2 libwayland-client0 libdbus-1-3 libdrm2 \
    && rm -rf /var/lib/apt/lists/*

# Pin pnpm at image build time. Run as runner so corepack writes shims
# under that user's $HOME and the cache dirs we'll mount end up in the
# right XDG locations.
USER runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

ENV PNPM_STORE_DIR=/cache/pnpm-store
ENV PLAYWRIGHT_BROWSERS_PATH=/cache/playwright
