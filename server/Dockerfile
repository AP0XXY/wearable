FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
COPY src/ src/
EXPOSE 3001
ENV PORT=3001
CMD ["bun", "run", "src/index.ts"]
