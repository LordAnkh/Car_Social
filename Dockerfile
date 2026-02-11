# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy server code and public files
COPY server/ ./server/
COPY public/ ./public/
COPY .env ./

# Expose port 5000
EXPOSE 5000

# Start the server
CMD ["node", "server/index.js"]
