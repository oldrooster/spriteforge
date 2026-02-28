FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download rembg u2net model so first use is instant
RUN python -c "from rembg import remove; from PIL import Image; remove(Image.new('RGBA', (10, 10)))"

COPY app/ ./app/

ENV FLASK_APP=app.main:app
ENV PYTHONUNBUFFERED=1

EXPOSE 5000

CMD ["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=5000", "--debug"]
