FROM node:18-slim

# Install system dependencies (build-essential, python3, etc. for potential native canvas addons)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set up user with UID 1000 for Hugging Face security guidelines
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

COPY --chown=user package*.json ./

RUN npm install

COPY --chown=user . .

ENV PORT=7860
EXPOSE 7860

CMD ["node", "index.js"]
