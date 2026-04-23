import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from database.db import init_db
from routers import screener, stocks, financials, portfolio, dcf, news, market

load_dotenv()

app = FastAPI(title="Stock Screener API", version="1.0.0")

# ALLOWED_ORIGINS env var: comma-separated list of allowed origins.
# Falls back to localhost for local dev.
_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
origins = [o.strip() for o in _raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(screener.router)
app.include_router(stocks.router)
app.include_router(financials.router)
app.include_router(portfolio.router)
app.include_router(dcf.router)
app.include_router(news.router)
app.include_router(market.router)


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/health")
async def health():
    return {"status": "ok"}
