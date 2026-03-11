ARG OPENCLAW_OFFICIAL_IMAGE=ghcr.io/openclaw/openclaw:latest
FROM ${OPENCLAW_OFFICIAL_IMAGE}

ARG DEBIAN_FRONTEND=noninteractive

USER root

RUN apt-get update -o Acquire::Retries=3 \
  && apt-get install -y -o Acquire::Retries=3 --no-install-recommends \
    sudo \
    python3 \
    python3-pip \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    libxtst6 \
  && rm -rf /var/lib/apt/lists/*

RUN printf "node ALL=(ALL) NOPASSWD:ALL\n" > /etc/sudoers.d/90-node-nopasswd \
  && chmod 0440 /etc/sudoers.d/90-node-nopasswd

COPY containers/openclaw-fresh/openclaw-container-init.sh /usr/local/bin/openclaw-container-init
COPY scripts/sglang-toolcall-adapter.mjs /usr/local/lib/openclaw/sglang-toolcall-adapter.mjs

RUN chmod +x /usr/local/bin/openclaw-container-init \
  && mkdir -p /home/node/.openclaw /home/node/workspace \
  && chown -R node:node /home/node

WORKDIR /home/node/workspace

ENV HOME=/home/node

USER node

CMD ["bash"]
