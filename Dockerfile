FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "start"]
