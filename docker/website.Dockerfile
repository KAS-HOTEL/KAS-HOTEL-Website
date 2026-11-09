# Used by webdemo (/srv/kas-web) and by the production image build in .gitlab-ci.yml.
# KAS HTML website (server.js, Express). Build context: the frontend/ folder.
# The folder holds two package manifests: package.json is the Next.js console,
# "package (2).json" is this website. Same convention as render.yaml.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY ["package (2).json", "./package.json"]
COPY ["package-lock (2).json", "./package-lock.json"]
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js api-boundary.js site-image-slots.json ./
COPY *.html ./
COPY css ./css
COPY js ./js
COPY assets ./assets
# Website photographs (hotels, homepage, heroes, Guidebook); the console decides which is shown.
COPY img ./img
USER node
EXPOSE 3000
CMD ["node", "server.js"]
