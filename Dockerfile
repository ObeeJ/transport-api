# syntax=docker/dockerfile:1
# --- Build stage --------------------------------------------------------
FROM golang:1.24-alpine AS build

WORKDIR /src
RUN apk add --no-cache git ca-certificates && update-ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Static, stripped binary. Embedded migration files travel inside the binary.
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags "-s -w" \
    -o /out/api ./cmd/api

# --- Runtime stage ------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot

# Distroless ships with CA roots; copy our binary in.
COPY --from=build /out/api /api

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/api"]
