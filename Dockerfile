# Only needed for hosts that want a container (Koyeb, Fly, Cloud Run, a VPS).
# Render does not need this file — it detects Python and uses render.yaml.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8000
EXPOSE 8000
CMD ["python", "scripts/server.py"]
