FROM node:16 AS build
WORKDIR /app
COPY . ./
RUN npm install --registry=http://registry.npmmirror.com

FROM golang:alpine AS gobuild
WORKDIR /app
COPY ./neko-status ./
ENV GO111MODULE=on
ENV GOPROXY=https://goproxy.cn
RUN chmod -R 755 /app && go mod download && go get neko-status/stat && go get neko-status  && /app/build.sh

FROM node:16-buster-slim
COPY --from=build /app /app
COPY --from=gobuild /app/build /app/neko-status/build
WORKDIR /app
CMD [ "node", "nekonekostatus.js" ]
