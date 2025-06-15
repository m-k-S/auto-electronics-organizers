```
```

### Frontend
```bash
cd /home/ubuntu/rf-board-organizer-frontend
npm install
pnpm run dev --host
# Access at http://localhost:5173
```

### Backend (Optional)
```bash
cd /home/ubuntu/rf-board-organizer
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
python src/main.py
# Runs on http://localhost:5004
```