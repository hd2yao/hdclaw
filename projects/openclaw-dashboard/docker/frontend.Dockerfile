FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend .
ARG VITE_DASHBOARD_HTTP_URL=/api
ARG VITE_DASHBOARD_WS_URL=/ws
ENV VITE_DASHBOARD_HTTP_URL=${VITE_DASHBOARD_HTTP_URL}
ENV VITE_DASHBOARD_WS_URL=${VITE_DASHBOARD_WS_URL}
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache wget
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
