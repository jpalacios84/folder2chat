from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from api import endpoints

app = FastAPI()

# Mount static files (JS, CSS, etc.)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include our API endpoints (including the home route)
app.include_router(endpoints.router)
