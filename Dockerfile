FROM node:18-alpine
ENV NODE_ENV=production

ARG APP_ID
ARG DISCORD_TOKEN
ARG PUBLIC_KEY
ARG PORT

ENV APP_ID=${APP_ID}
ENV DISCORD_TOKEN=${DISCORD_TOKEN}
ENV PUBLIC_KEY=${PUBLIC_KEY}
ENV PORT=${PORT}

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

RUN npm install --production

COPY . .

CMD ["node", "index.js"]