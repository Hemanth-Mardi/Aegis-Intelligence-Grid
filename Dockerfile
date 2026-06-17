# Use lightweight Python base image
FROM python:3.10-slim

# Set working directory inside root (temporary build stage)
WORKDIR /code

# Copy requirements and install
COPY requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Create a non-root user with UID 1000 (required by Hugging Face)
RUN useradd -m -u 1000 user

# Switch to the new user
USER user

# Configure environment paths for the user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Set working directory to the user's home app directory
WORKDIR $HOME/app

# Copy application files and set ownership to the 'user' user
COPY --chown=user . $HOME/app

# Hugging Face runs on port 7860
EXPOSE 7860

# Start FastAPI server
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
