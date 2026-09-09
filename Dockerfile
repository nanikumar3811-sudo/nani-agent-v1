FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY AGENTS.md README.md CHATGPT_INSTRUCTIONS.md ./
RUN npm run build
ENV NODE_ENV=production
EXPOSE 8088
CMD ["node","dist/server.js"]
