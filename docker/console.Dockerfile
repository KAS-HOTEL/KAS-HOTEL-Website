# Used by webdemo (/srv/kas-web) and by the production image build in .gitlab-ci.yml.
# KAS Next.js consoles (/admin, /partner). Build context: the frontend/ folder
# (filtered by console.Dockerfile.dockerignore; the console imports a few files
# from the folder root, e.g. ADMIN_IMAGE_SOURCE_INVENTORY.json, so copy it all).
#
# The runtime image holds only Next.js' standalone output (KAS_NEXT_STANDALONE=1 in
# next.config.ts): the traced server files, .next/static and public/ — not the full
# node_modules with the dev tooling. The API rewrites are baked in at build time,
# so KAS_API_ORIGIN must be passed as a build argument.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
ARG KAS_API_ORIGIN=http://localhost:8080
ENV KAS_API_ORIGIN=$KAS_API_ORIGIN NEXT_TELEMETRY_DISABLED=1 KAS_NEXT_STANDALONE=1
COPY . .
# The traced node_modules goes into its own layer: it changes only with package-lock.json,
# so a code change does not re-upload it.
RUN npm run build && mv .next/standalone/node_modules /app/standalone-node_modules

FROM node:22-alpine
WORKDIR /app
ARG KAS_API_ORIGIN=http://localhost:8080
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 \
    KAS_API_ORIGIN=$KAS_API_ORIGIN
# This image is the staff console host: guest pages built into the app (/en, /vi, ...)
# answer 404 and / opens /admin/login (src/proxy.ts). KAS_API_ORIGIN may also be set
# at run time; src/proxy.ts then proxies /api/v1 to it instead of the build-time value.
ENV KAS_CONSOLE_ONLY=true
COPY --from=build --chown=node:node /app/standalone-node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
