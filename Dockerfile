# Base image: Node.js 20 dengan OS Debian (sudah include apt-get)
FROM node:20-slim

# Install Python 3 dan dependencies untuk Prophet
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Buat virtual environment Python (recommended untuk Debian 12+)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python packages untuk forecasting
RUN pip install --no-cache-dir \
    flask \
    prophet \
    pandas \
    numpy \
    holidays \
    cmdstanpy

# Copy package.json dulu untuk caching layer
COPY package*.json ./

# Install Node.js dependencies (production only)
RUN npm ci --omit=dev

# Copy semua source code
COPY . .

# Expose port (Render akan inject PORT env var)
EXPOSE 5000

# Start server
CMD ["node", "server.js"]
