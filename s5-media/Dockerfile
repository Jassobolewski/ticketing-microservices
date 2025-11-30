FROM node:20-alpine

WORKDIR /app

# Create uploads directory
RUN mkdir -p /app/uploads

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3005

CMD ["npm", "start"]
