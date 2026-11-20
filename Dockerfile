# ============================================================
# Stage 1: Build du Frontend React avec Vite
# ============================================================
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Dépendances Node
COPY package*.json ./
RUN npm ci

# Code source et compilation du frontend
COPY . .
RUN npm run build

# ============================================================
# Stage 2: Image de Production (Node.js + Python 3)
# ============================================================
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Installation de Python 3 et de la librairie requests pour les scripts Unicaen
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-requests \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Installation globale de tsx pour exécuter le serveur TypeScript
RUN npm install -g tsx

# Installation des dépendances applicatives
COPY package*.json ./
RUN npm ci --omit=dev

# Copie des fichiers compilés frontend et du code backend/scripts
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY scripts ./scripts
COPY tsconfig.json ./

# Initialisation du répertoire de données persistantes
RUN mkdir -p /app/data

# Port exposé pour le Cartable Numérique
EXPOSE 3001

# Volume persistant pour les données (comptes, notes, devoirs, sessions)
VOLUME ["/app/data"]

# Commande de démarrage du serveur
CMD ["tsx", "server/index.ts"]
