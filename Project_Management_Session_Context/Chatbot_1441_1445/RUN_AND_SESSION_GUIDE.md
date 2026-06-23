# Run the chatbot and use session context

## Requirements

Install:

- Python 3.11 or 3.12
- Node.js 18 or newer
- Ollama

## 1. Start Ollama

```powershell
ollama pull qwen:1.8b
ollama serve
```

If `ollama serve` says the port is already in use, Ollama is already running.

## 2. Start the backend

Open PowerShell in `Chatbot_1441_1445\backend`:

```powershell
py -3.12 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Check:

- API: http://127.0.0.1:8000/api/health
- Swagger: http://127.0.0.1:8000/docs

## 3. Start the frontend

Open another PowerShell in `Chatbot_1441_1445\frontend`:

```powershell
npm install
npm run dev
```

Open the Vite URL, normally http://localhost:5173.

## How session context works

- `New Chat` creates a row in `chat_sessions`.
- Every user/assistant exchange is saved in `conversations` with the selected `session_id`.
- When a new message is sent, the backend loads the latest 20 exchanges from that same session.
- It sends those exchanges plus the new message to Ollama.
- Other sessions and other users are not included.
- Selecting an old session reloads its saved history from SQLite.

The context window size is controlled by this constant in `backend/app/chat.py`:

```python
MAX_CONTEXT_EXCHANGES = 20
```

Increase it for more history, or reduce it if responses become slow.

## Test context retention

In one chat session, send:

1. `My project codename is Bluebird.`
2. `What is my project codename?`

The bot should answer `Bluebird`.

Create a new chat and ask the second question again. It should not know the codename, because contexts are separated by session.

## Common errors

### Cannot reach backend

Make sure the backend is running on port 8000 and open `/api/health` in the browser.

### LLM error / connection refused

Start Ollama and verify:

```powershell
ollama list
ollama run qwen:1.8b
```

### Model not found

```powershell
ollama pull qwen:1.8b
```

### PowerShell blocks venv activation

Run once in the current PowerShell window:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
venv\Scripts\activate
```
