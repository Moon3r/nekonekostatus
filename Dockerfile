FROM node:16 AS build
WORKDIR /app
COPY . ./
RUN npm install # --registry=https://registry.npm.taobao.org

FROM golang:1.19-alpine AS gobuild
WORKDIR /app
COPY ./neko-status ./
RUN chmod -R 755 /app && go mod download && /app/build.sh

FROM node:16-buster-slim
COPY --from=build /app /app
COPY --from=gobuild /app/build /app/neko-status/build
WORKDIR /app
CMD [ "node", "nekonekostatus.js" ]
