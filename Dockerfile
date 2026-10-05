FROM node:22-alpine

WORKDIR /app

COPY package.json server.js index.html script.js style.css ./
COPY js ./js

# Tasks are stored in /app/data/tasks.json - mount a volume here to keep them.
RUN mkdir -p /app/data
VOLUME /app/data

ENV PORT=80 HOST=0.0.0.0 DATA_FILE=/app/data/tasks.json
EXPOSE 80

CMD ["node", "server.js"]
