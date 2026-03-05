# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
  && rm -rf /var/lib/apt/lists/*

# Install OpenClaw CLI in non-interactive mode.
RUN curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh \
  | bash -s -- --npm --no-onboard --no-prompt \
  && command -v openclaw >/dev/null

RUN mkdir -p /home/node/.openclaw /home/node/workspace \
  && chown -R node:node /home/node

COPY openclaw-container-init.sh /usr/local/bin/openclaw-container-init
RUN chmod +x /usr/local/bin/openclaw-container-init

WORKDIR /home/node/workspace

ENV HOME=/home/node

USER node

CMD ["bash"]
