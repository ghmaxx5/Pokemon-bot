FROM node:18-slim

# Install system dependencies (build-essential, python3, etc. for potential native canvas addons)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set user to 'node' which has UID 1000 by default in the node base image
USER node
ENV HOME=/home/node \
    PATH=/home/node/.local/bin:$PATH

WORKDIR $HOME/app

COPY --chown=node package*.json ./

RUN npm install

COPY --chown=node . .

ENV PORT=7860
EXPOSE 7860

CMD ["node", "index.js"]
