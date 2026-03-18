FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# The React dev server listens on 3000 internally.
# docker-compose maps this to host port 3001 to avoid conflicts with the dev service.
EXPOSE 3000

CMD ["npm", "start"]
