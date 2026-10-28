FROM node:22-bookworm-slim AS node
FROM python:3.12-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY cloud-requirements.txt .
RUN pip install --no-cache-dir -r cloud-requirements.txt
COPY cloud.py .
COPY public ./public
RUN useradd -m studio && mkdir cloud-data && chown -R studio:studio /app
USER studio
CMD ["sh","-c","uvicorn cloud:app --host 0.0.0.0 --port ${PORT:-10000} --limit-concurrency 30"]
