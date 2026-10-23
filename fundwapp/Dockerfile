FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
# Set AUTO_MIGRATE=true to apply migrations on boot; run `npm run db:seed` once for reference data.
CMD ["node", "src/server.js"]
