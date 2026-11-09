# Used by webdemo (/srv/kas-web) and by the production image build in .gitlab-ci.yml.
# KAS Next.js consoles (/admin, /partner). Build context: the frontend/ folder
# (filtered by console.Dockerfile.dockerignore; the console imports a few files
# from the folder root, e.g. ADMIN_IMAGE_SOURCE_INVENTORY.json, so copy it all).
# next.config.ts reads KAS_API_ORIGIN when the rewrites are built, so it is a
# build argument as well as a runtime variable.
FROM node:22-alpine AS build
WORKDIR /app
ARG KAS_API_ORIGIN=http://localhost:8080
ENV KAS_API_ORIGIN=$KAS_API_ORIGIN NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# This image is the staff console host: guest pages built into the app (/en, /vi, ...)
# answer 404 and / opens /admin/login (src/proxy.ts). KAS_API_ORIGIN may also be set
# at run time; src/proxy.ts then proxies /api/v1 to it instead of the build-time value.
ENV KAS_CONSOLE_ONLY=true
# Full node_modules is kept: `next start` loads next.config.ts at runtime.
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
