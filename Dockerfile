# IMPORTANT: This Dockerfile has been provided for the sake of convenience.
# Currently, functionality of the containers built based on this file
# is not a part of our continuous testing. Although, patches to keep it
# up to date are always welcome.
#
# See ‘Earthfile’ for the recipes used in official builds.

FROM golang:alpine AS build

RUN apk update && apk add --no-cache git gcc build-base linux-headers

WORKDIR /build
COPY . /build

ARG VERSION=dev
ENV VERSION=${VERSION}
ARG GIT_COMMIT
ENV GIT_COMMIT=${GIT_COMMIT}
ARG NAME=docker
ENV NAME=${NAME}

RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -ldflags "-extldflags \"-static\" -s -w -X github.com/aoiasakawa/aoitube/config.GitCommit=$GIT_COMMIT -X github.com/aoiasakawa/aoitube/config.VersionNumber=$VERSION -X github.com/aoiasakawa/aoitube/config.BuildPlatform=$NAME" -o aoitube .

# Create the image by copying the result of the build into a new alpine image
FROM alpine:3.18.0
RUN apk update && apk add --no-cache ffmpeg ffmpeg-libs ca-certificates && update-ca-certificates

RUN addgroup -g 101 -S aoitube && adduser -u 101 -S aoitube -G aoitube

# Copy aoitube assets
WORKDIR /app
COPY --from=build /build/aoitube /app/aoitube
RUN mkdir /app/data
RUN chown -R aoitube:aoitube /app
USER aoitube
ENTRYPOINT ["/app/aoitube"]
EXPOSE 8080 1935
