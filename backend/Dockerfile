FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY . .
RUN npm run build || true
EXPOSE 4000
CMD ["npm", "run", "start"]
