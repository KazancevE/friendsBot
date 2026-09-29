FROM node:22-bookworm-slim

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg \
  && install -d /usr/share/keyrings \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update -y \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npx tsx src/index.ts"]
