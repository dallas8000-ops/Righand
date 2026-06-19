# syntax=docker/dockerfile:1

FROM node:18-alpine AS frontend
WORKDIR /app/frontend
ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY --from=frontend /app/frontend/build /app/frontend/build

RUN python3 manage.py collectstatic --noinput
RUN chmod +x /app/backend/railway_start.sh

EXPOSE 8000
CMD ["/app/backend/railway_start.sh"]
